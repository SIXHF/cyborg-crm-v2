import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db, rawSql } from "@/lib/db";
import { importJobs, binCache } from "@/lib/db/schema";
import { readFile } from "fs/promises";
import { createReadStream } from "fs";
import { sql } from "drizzle-orm";
import { parseLine } from "../route";
import { randomBytes } from "crypto";

export const maxDuration = 300;

const CHUNK_SIZE = 50000;
const BATCH_SIZE = 10000;

// ── Module-level BIN cache (loaded once, reused across chunks) ──
let binLookupCache: Map<string, { brand: string | null; type: string | null; issuer: string | null; country: string | null }> | null = null;
let binCacheLoadedAt = 0;
const BIN_CACHE_TTL = 600000; // 10 minutes

async function loadBinCache() {
  if (binLookupCache && Date.now() - binCacheLoadedAt < BIN_CACHE_TTL) return binLookupCache;
  const rows = await db.select({
    bin6: binCache.bin6,
    brand: binCache.brand,
    type: binCache.type,
    issuer: binCache.issuer,
    country: binCache.country,
  }).from(binCache).limit(500000);
  binLookupCache = new Map(rows.map(r => [r.bin6, r]));
  binCacheLoadedAt = Date.now();
  return binLookupCache;
}

// ── Parse DOB to YYYY-MM-DD format ──
function parseDob(raw: string): string | null {
  if (!raw || raw.trim() === "") return null;
  const s = raw.trim();

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    return null;
  }

  const mdyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdyMatch) {
    const [, mm, dd, yyyy] = mdyMatch.map(Number);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 1900 && yyyy <= 2100) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
    return null;
  }

  const mdyShort = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (mdyShort) {
    const [, mm, dd, yy] = mdyShort.map(Number);
    const yyyy = yy > 50 ? 1900 + yy : 2000 + yy;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
    return null;
  }

  const ymdSlash = s.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/);
  if (ymdSlash) {
    const [, yyyy, mm, dd] = ymdSlash.map(Number);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 1900 && yyyy <= 2100) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
    return null;
  }

  if (/^\d{8}$/.test(s)) {
    const mm = parseInt(s.slice(0, 2));
    const dd = parseInt(s.slice(2, 4));
    const yyyy = parseInt(s.slice(4, 8));
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 1900 && yyyy <= 2100) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }

  return null;
}

function generateRef(): string {
  return "CC-" + randomBytes(4).toString("hex").toUpperCase();
}

// ── Read specific byte range from file ──
async function readFileRange(filePath: string, startByte: number, endByte: number | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const opts: any = { encoding: "utf-8", start: startByte };
    if (endByte !== null) opts.end = endByte;
    const chunks: string[] = [];
    const stream = createReadStream(filePath, opts);
    stream.on("data", (chunk: any) => chunks.push(chunk.toString()));
    stream.on("end", () => resolve(chunks.join("")));
    stream.on("error", reject);
  });
}

// ── Escape a value for raw SQL ──
function esc(val: string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "NULL";
  return "'" + val.replace(/'/g, "''") + "'";
}

// POST /api/leads/import/chunk — Process one chunk of rows (high-performance)
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { jobId, chunkIndex } = body;

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    // Load import job
    const [job] = await db.select().from(importJobs).where(sql`id = ${jobId}`).limit(1);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (job.status === "done") {
      return NextResponse.json({
        processed: job.processed,
        imported: job.imported,
        failed: job.failed,
        total: job.totalRows,
        done: true,
        status: "done",
      });
    }
    if (job.status === "cancelled") {
      return NextResponse.json({ error: "Job was cancelled", status: "cancelled" }, { status: 400 });
    }

    const chunkStart = performance.now();

    // Mark as running on first chunk
    if (job.status === "pending") {
      await db.update(importJobs).set({ status: "running" }).where(sql`id = ${jobId}`);
    }

    const filePath = job.filePath;
    if (!filePath) {
      return NextResponse.json({ error: "No file path stored for this job" }, { status: 500 });
    }

    // ── Read only the chunk we need using byte offsets ──
    const chunkOffsets = (job.validationRules as any)?.chunkOffsets as number[] | undefined;
    const delimiter = job.delimiter || ",";
    const mapping = (job.mapping || {}) as Record<string, string>;
    const importRef = job.importRef || "";
    const totalRows = job.totalRows || 0;

    // Determine which chunk to process
    const effectiveChunkIndex = chunkIndex !== undefined ? chunkIndex : Math.floor((job.processed || 0) / CHUNK_SIZE);
    const startRow = effectiveChunkIndex * CHUNK_SIZE;
    const endRow = Math.min(startRow + CHUNK_SIZE, totalRows);

    if (startRow >= totalRows) {
      return NextResponse.json({
        processed: totalRows,
        imported: job.imported,
        failed: job.failed,
        total: totalRows,
        done: true,
        status: "done",
        chunkMs: 0,
        chunkImported: 0,
      });
    }

    let chunkLines: string[];

    if (chunkOffsets && chunkOffsets.length > effectiveChunkIndex) {
      // Fast path: read only the bytes for this chunk
      const startByte = chunkOffsets[effectiveChunkIndex];
      // Don't subtract 1 — the next chunk's start byte is the byte AFTER our last newline
      // Subtracting 1 truncates the last character of the last line in each chunk
      const endByte = effectiveChunkIndex + 1 < chunkOffsets.length ? chunkOffsets[effectiveChunkIndex + 1] : null;
      const chunkText = await readFileRange(filePath, startByte, endByte);
      chunkLines = chunkText.split(/\r?\n/).filter(l => l.trim());
    } else {
      // Fallback: read entire file (only for jobs created before this optimization)
      const text = await readFile(filePath, "utf-8");
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      // +1 because line 0 is header
      chunkLines = lines.slice(startRow + 1, endRow + 1);
    }

    // ── Load BIN cache (module-level, reused across chunks) ──
    const binLookup = await loadBinCache();

    // ── Parse all rows in this chunk ──
    let chunkImported = 0;
    let chunkFailed = 0;

    const leadRows: any[] = [];
    const cardDataByRef: Map<string, Record<string, string>> = new Map();

    for (let i = 0; i < chunkLines.length; i++) {
      const cols = parseLine(chunkLines[i], delimiter);
      const data: Record<string, string> = {};

      for (const [colIdx, field] of Object.entries(mapping)) {
        const val = cols[parseInt(colIdx)]?.trim();
        if (val && val.toLowerCase() !== "null" && val !== "") {
          data[field] = val;
        }
      }

      // Handle full name split
      if (data.fullName && !data.firstName) {
        const parts = data.fullName.trim().split(/\s+/);
        data.firstName = parts[0] || "";
        data.lastName = parts.slice(1).join(" ") || "";
        delete data.fullName;
      }

      // Handle middle name
      if (data._middleName && data.firstName) {
        data.firstName = data.firstName + " " + data._middleName;
      }
      delete data._middleName;

      // Combine exp month + year
      if (data.ccExpMonth && data.ccExpYear && !data.ccExp) {
        data.ccExp = `${data.ccExpMonth}/${data.ccExpYear}`;
      }
      delete data.ccExpMonth;
      delete data.ccExpYear;

      // Skip empty rows
      if (!data.firstName && !data.phone && !data.email) {
        chunkFailed++;
        continue;
      }

      // Clean phone
      const phone = data.phone?.replace(/\D/g, "") || null;
      const landline = data.landline?.replace(/\D/g, "") || null;

      // Parse DOB
      const dobParsed = data.dob ? parseDob(data.dob) : null;

      // Detect card brand from BIN
      let cardBrand = data.cardBrand || "";
      const ccNumberClean = data.ccNumber ? data.ccNumber.replace(/\D/g, "") : "";
      const bin = data.cardNumberBin || (ccNumberClean ? ccNumberClean.slice(0, 6) : "");
      let cardIssuer = data.cardIssuer || data.ccBank || "";
      let cardType = data.cardType || "";

      // Check BIN cache (local DB lookup, no API)
      if (bin && bin.length >= 6) {
        const cached = binLookup.get(bin.slice(0, 6));
        if (cached) {
          if (!cardBrand && cached.brand) cardBrand = cached.brand;
          if (!cardIssuer && cached.issuer) cardIssuer = cached.issuer;
          if (!cardType && cached.type) cardType = cached.type;
        }
      }
      // Fallback: pattern match
      if (bin && !cardBrand) {
        if (bin[0] === "4") cardBrand = "Visa";
        else if (bin[0] === "5" && bin[1] >= "1" && bin[1] <= "5") cardBrand = "Mastercard";
        else if (bin[0] === "3" && (bin[1] === "4" || bin[1] === "7")) cardBrand = "Amex";
        else if (bin.startsWith("6011") || bin.startsWith("65")) cardBrand = "Discover";
      }

      const refNumber = generateRef();

      leadRows.push({
        refNumber,
        firstName: data.firstName?.slice(0, 120) || null,
        lastName: data.lastName?.slice(0, 120) || null,
        email: data.email || null,
        phone: phone && phone.length >= 10 ? phone : null,
        landline: landline && landline.length >= 10 ? landline : null,
        dob: dobParsed,
        ssnLast4: data.ssnLast4?.replace(/\D/g, "").slice(-4) || null,
        mmn: data.mmn || null,
        vpass: data.vpass || null,
        county: data.county || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state?.slice(0, 80) || null,
        zip: data.zip || null,
        country: data.country || null,
        cardType: cardType || null,
        cardNumberBin: bin?.slice(0, 8) || null,
        cardNumberMasked: data.cardNumberMasked || (ccNumberClean.length >= 13 ? `****${ccNumberClean.slice(-4)}` : null),
        cardBrand: cardBrand || null,
        cardIssuer: cardIssuer || null,
        businessName: data.businessName || null,
        businessEin: data.businessEin || null,
        mortgageBank: data.mortgageBank || null,
        mortgagePayment: data.mortgagePayment?.replace(/[^0-9.]/g, "") || null,
        annualIncome: data.annualIncome?.replace(/[^0-9.]/g, "") || null,
        employmentStatus: data.employmentStatus || null,
        creditScoreRange: data.creditScoreRange || null,
        notes: data.notes || null,
        status: "new",
        agentId: user.id,
        importRef,
      });

      // Queue card data if ANY card-related field is present
      // Store the full card number (or BIN if that's all we have) in the ccn field
      if (ccNumberClean || data.ccExp || data.ccCvc || data.ccNoc || data.ccLimit || bin || cardBrand || cardIssuer) {
        cardDataByRef.set(refNumber, {
          ccn: ccNumberClean || bin || "",
          cvc: data.ccCvc || "",
          expDate: data.ccExp || "",
          noc: data.ccNoc || "",
          bank: cardIssuer || "",
          cardType: cardType || cardBrand || "",
          creditLimit: data.ccLimit?.replace(/[^0-9.]/g, "") || "",
        });
      }
    }

    // ── Bulk insert leads using raw postgres client for maximum speed ──
    const leadColumns = [
      "ref_number", "first_name", "last_name", "email", "phone", "landline",
      "dob", "ssn_last4", "mmn", "vpass", "county", "address", "city", "state", "zip", "country",
      "card_type", "card_number_bin", "card_number_masked", "card_brand", "card_issuer",
      "business_name", "business_ein", "mortgage_bank", "mortgage_payment",
      "annual_income", "employment_status", "credit_score_range",
      "notes", "status", "agent_id", "import_ref",
    ];

    // Reserve a dedicated connection for session-level tuning
    const conn = await rawSql.reserve();
    try {
    // Session-level tuning (only affects this connection)
    await conn.unsafe("SET synchronous_commit = OFF");
    await conn.unsafe("SET maintenance_work_mem = '512MB'");

    // Process in batches using reserved connection
    for (let b = 0; b < leadRows.length; b += BATCH_SIZE) {
      const batch = leadRows.slice(b, b + BATCH_SIZE);
      const hasCards = batch.some(r => cardDataByRef.has(r.refNumber));

      try {
        // Build raw multi-row VALUES for maximum speed
        const valueRows = batch.map(r => {
          const mp = r.mortgagePayment;
          const ai = r.annualIncome;
          return `(${esc(r.refNumber)},${esc(r.firstName)},${esc(r.lastName)},${esc(r.email)},${esc(r.phone)},${esc(r.landline)},${r.dob ? esc(r.dob) : "NULL"},${esc(r.ssnLast4)},${esc(r.mmn)},${esc(r.vpass)},${esc(r.county)},${esc(r.address)},${esc(r.city)},${esc(r.state)},${esc(r.zip)},${esc(r.country)},${esc(r.cardType)},${esc(r.cardNumberBin)},${esc(r.cardNumberMasked)},${esc(r.cardBrand)},${esc(r.cardIssuer)},${esc(r.businessName)},${esc(r.businessEin)},${esc(r.mortgageBank)},${mp ? mp : "NULL"},${ai ? ai : "NULL"},${esc(r.employmentStatus)},${esc(r.creditScoreRange)},${esc(r.notes)},${esc(r.status)},${r.agentId},${esc(r.importRef)})`;
        });

        const insertQuery = `INSERT INTO leads (${leadColumns.join(",")}) VALUES ${valueRows.join(",")} ON CONFLICT DO NOTHING${hasCards ? " RETURNING id, ref_number" : ""}`;

        // Use reserved connection with session tuning
        const result = await conn.unsafe(insertQuery);
        chunkImported += batch.length;

        // Insert card records using returned IDs
        if (hasCards && result && result.length > 0) {
          const cardValues: string[] = [];
          for (const row of result) {
            const cardData = cardDataByRef.get(row.ref_number);
            if (cardData) {
              const cl = cardData.creditLimit;
              cardValues.push(`(${row.id},${esc(cardData.ccn)},${esc(cardData.cvc)},${esc(cardData.expDate)},${esc(cardData.noc)},${esc(cardData.bank)},${esc(cardData.cardType)},${cl ? cl : "NULL"})`);
            }
          }
          if (cardValues.length > 0) {
            await conn.unsafe(`INSERT INTO lead_cards (lead_id,ccn,cvc,exp_date,noc,bank,card_type,credit_limit) VALUES ${cardValues.join(",")} ON CONFLICT DO NOTHING`);
          }
        }
      } catch (e: any) {
        // Smart fallback: split batch in half recursively instead of 1-by-1
        const result = await splitInsert(batch, cardDataByRef, leadColumns, user.id);
        chunkImported += result.imported;
        chunkFailed += result.failed;
      }
    }
    } finally {
      // Reset session settings and release connection back to pool
      try { await conn.unsafe("SET synchronous_commit = ON"); } catch {}
      try { await conn.unsafe("RESET maintenance_work_mem"); } catch {}
      (conn as any).release();
    }

    // ── Update job progress (atomic increment for parallel safety) ──
    const rowsInChunk = endRow - startRow;
    await db.execute(sql`
      UPDATE import_jobs SET
        processed = LEAST(processed + ${rowsInChunk}, ${totalRows}),
        imported = imported + ${chunkImported},
        failed = failed + ${chunkFailed},
        status = CASE WHEN processed + ${rowsInChunk} >= ${totalRows} THEN 'done'::import_status ELSE 'running'::import_status END,
        finished_at = CASE WHEN processed + ${rowsInChunk} >= ${totalRows} THEN NOW() ELSE finished_at END
      WHERE id = ${jobId}
    `);

    // Check if done
    const [updatedJob] = await db.select({
      processed: importJobs.processed,
      imported: importJobs.imported,
      failed: importJobs.failed,
      status: importJobs.status,
    }).from(importJobs).where(sql`id = ${jobId}`).limit(1);

    const isDone = updatedJob?.status === "done";

    if (isDone) {
      try {
        const { unlink } = await import("fs/promises");
        await unlink(filePath);
      } catch {}
      await audit(user.id, user.username, "bulk_import", "lead", undefined,
        `Imported ${updatedJob.imported} leads, ${updatedJob.failed} failed from ${job.filename}`);
    }

    const chunkMs = Math.round(performance.now() - chunkStart);

    return NextResponse.json({
      processed: updatedJob?.processed || 0,
      imported: updatedJob?.imported || 0,
      failed: updatedJob?.failed || 0,
      total: totalRows,
      done: isDone,
      status: isDone ? "done" : "running",
      chunkMs,
      chunkImported,
      chunkIndex: effectiveChunkIndex,
    });
  } catch (e: any) {
    console.error("Chunk import error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── Smart fallback: binary-split retry instead of 1-by-1 ──
async function splitInsert(
  batch: any[],
  cardDataByRef: Map<string, Record<string, string>>,
  leadColumns: string[],
  agentId: number,
): Promise<{ imported: number; failed: number }> {
  if (batch.length === 0) return { imported: 0, failed: 0 };

  const buildRow = (r: any) => {
    const mp = r.mortgagePayment;
    const ai = r.annualIncome;
    return `(${esc(r.refNumber)},${esc(r.firstName)},${esc(r.lastName)},${esc(r.email)},${esc(r.phone)},${esc(r.landline)},${r.dob ? esc(r.dob) : "NULL"},${esc(r.ssnLast4)},${esc(r.mmn)},${esc(r.vpass)},${esc(r.county)},${esc(r.address)},${esc(r.city)},${esc(r.state)},${esc(r.zip)},${esc(r.country)},${esc(r.cardType)},${esc(r.cardNumberBin)},${esc(r.cardNumberMasked)},${esc(r.cardBrand)},${esc(r.cardIssuer)},${esc(r.businessName)},${esc(r.businessEin)},${esc(r.mortgageBank)},${mp ? mp : "NULL"},${ai ? ai : "NULL"},${esc(r.employmentStatus)},${esc(r.creditScoreRange)},${esc(r.notes)},${esc(r.status)},${r.agentId},${esc(r.importRef)})`;
  };

  if (batch.length === 1) {
    try {
      await rawSql.unsafe(`INSERT INTO leads (${leadColumns.join(",")}) VALUES ${buildRow(batch[0])} ON CONFLICT DO NOTHING`);
      return { imported: 1, failed: 0 };
    } catch {
      return { imported: 0, failed: 1 };
    }
  }

  // Split in half and try each half
  const mid = Math.floor(batch.length / 2);
  const left = batch.slice(0, mid);
  const right = batch.slice(mid);

  try {
    const valueRows = left.map(buildRow);
    await rawSql.unsafe(`INSERT INTO leads (${leadColumns.join(",")}) VALUES ${valueRows.join(",")} ON CONFLICT DO NOTHING`);
    const leftResult = { imported: left.length, failed: 0 };
    const rightResult = await splitInsert(right, cardDataByRef, leadColumns, agentId);
    return { imported: leftResult.imported + rightResult.imported, failed: leftResult.failed + rightResult.failed };
  } catch {
    const leftResult = await splitInsert(left, cardDataByRef, leadColumns, agentId);
    const rightResult = await splitInsert(right, cardDataByRef, leadColumns, agentId);
    return { imported: leftResult.imported + rightResult.imported, failed: leftResult.failed + rightResult.failed };
  }
}
