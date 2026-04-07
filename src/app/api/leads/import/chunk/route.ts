import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, leadCards, importJobs, binCache } from "@/lib/db/schema";
import { generateRef } from "@/lib/utils";
import { readFile, unlink } from "fs/promises";
import { sql } from "drizzle-orm";
import { parseLine } from "../route";

export const maxDuration = 60;

const CHUNK_SIZE = 5000;

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

// POST /api/leads/import/chunk — Process one chunk of rows
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { jobId } = body;

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

    // Read CSV file
    const filePath = job.filePath;
    if (!filePath) {
      return NextResponse.json({ error: "No file path stored for this job" }, { status: 500 });
    }

    let text: string;
    try {
      text = await readFile(filePath, "utf-8");
    } catch {
      return NextResponse.json({ error: "CSV file not found on disk. Re-upload required." }, { status: 500 });
    }

    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const totalRows = lines.length - 1; // excluding header
    const delimiter = job.delimiter || ",";
    const mapping = (job.mapping || {}) as Record<string, string>;
    const importRef = job.importRef || "";

    const alreadyProcessed = job.processed || 0;

    // If already done all rows, mark done
    if (alreadyProcessed >= totalRows) {
      await db.update(importJobs).set({
        status: "done",
        finishedAt: new Date(),
      }).where(sql`id = ${jobId}`);

      // Cleanup temp file
      try { await unlink(filePath); } catch {}

      await audit(user.id, user.username, "bulk_import", "lead", undefined,
        `Imported ${job.imported} leads, ${job.failed} failed from ${job.filename}`);

      return NextResponse.json({
        processed: alreadyProcessed,
        imported: job.imported,
        failed: job.failed,
        total: totalRows,
        done: true,
        status: "done",
        chunkMs: 0,
        chunkImported: 0,
      });
    }

    // Process one chunk starting from alreadyProcessed
    const startRow = alreadyProcessed + 1; // +1 because line 0 is header
    const endRow = Math.min(startRow + CHUNK_SIZE, lines.length);

    let chunkImported = 0;
    let chunkFailed = 0;
    const failedRows: { row: number; reason: string }[] = [];
    const batchSize = 500;
    // Load BIN cache for fast lookups during import (no external API calls)
    const binCacheRows = await db.select({ bin6: binCache.bin6, brand: binCache.brand, type: binCache.type, issuer: binCache.issuer, country: binCache.country })
      .from(binCache).limit(100000);
    const binLookup = new Map(binCacheRows.map(r => [r.bin6, r]));

    let rowBatch: any[] = [];
    let cardBatch: { refNumber: string; data: Record<string, string> }[] = [];

    for (let i = startRow; i < endRow; i++) {
      const cols = parseLine(lines[i], delimiter);
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
        delete data._middleName;
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
        if (failedRows.length < 50) {
          failedRows.push({ row: i + 1, reason: "Empty row: no name, phone, or email" });
        }
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
      // Check BIN cache first (local DB lookup, no API)
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

      rowBatch.push({
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
        cardType: data.cardType || null,
        cardNumberBin: bin?.slice(0, 8) || null,
        cardNumberMasked: data.cardNumberMasked || (ccNumberClean.length >= 13 ? `****${ccNumberClean.slice(-4)}` : null),
        cardBrand: cardBrand || null,
        cardIssuer: cardIssuer || null,
        businessName: data.businessName || null,
        businessEin: data.businessEin || null,
        mortgageBank: data.mortgageBank || null,
        mortgagePayment: data.mortgagePayment || null,
        annualIncome: data.annualIncome?.replace(/[^0-9.]/g, "") || null,
        employmentStatus: data.employmentStatus || null,
        creditScoreRange: data.creditScoreRange || null,
        notes: data.notes || null,
        status: "new" as const,
        agentId: user.id,
        importRef,
      });

      // Queue card data
      if (ccNumberClean || data.ccExp || data.ccCvc || data.ccNoc || data.ccLimit) {
        cardBatch.push({
          refNumber,
          data: {
            ccn: ccNumberClean || "",
            cvc: data.ccCvc || "",
            expDate: data.ccExp || "",
            noc: data.ccNoc || "",
            bank: cardIssuer || "",
            cardType: cardType || cardBrand || "",
            creditLimit: data.ccLimit?.replace(/[^0-9.]/g, "") || "",
          },
        });
      }

      // Flush batch at batchSize
      if (rowBatch.length >= batchSize) {
        const result = await flushBatch(rowBatch, cardBatch);
        chunkImported += result.imported;
        chunkFailed += result.failed;
        rowBatch = [];
        cardBatch = [];
      }
    }

    // Flush remaining
    if (rowBatch.length > 0) {
      const result = await flushBatch(rowBatch, cardBatch);
      chunkImported += result.imported;
      chunkFailed += result.failed;
    }

    const newProcessed = alreadyProcessed + (endRow - startRow);
    const newImported = (job.imported || 0) + chunkImported;
    const newFailed = (job.failed || 0) + chunkFailed;
    const isDone = newProcessed >= totalRows;

    // Merge error log
    let existingErrors: any[] = [];
    try {
      if (job.errorLog) existingErrors = JSON.parse(job.errorLog);
    } catch {}
    const allErrors = [...existingErrors, ...failedRows].slice(0, 200);

    await db.update(importJobs).set({
      processed: newProcessed,
      imported: newImported,
      failed: newFailed,
      status: isDone ? "done" : "running",
      errorLog: allErrors.length > 0 ? JSON.stringify(allErrors) : null,
      ...(isDone ? { finishedAt: new Date() } : {}),
    }).where(sql`id = ${jobId}`);

    // Cleanup on completion
    if (isDone) {
      try { await unlink(filePath); } catch {}
      await audit(user.id, user.username, "bulk_import", "lead", undefined,
        `Imported ${newImported} leads, ${newFailed} failed from ${job.filename}`);
    }

    const chunkMs = Math.round(performance.now() - chunkStart);

    return NextResponse.json({
      processed: newProcessed,
      imported: newImported,
      failed: newFailed,
      total: totalRows,
      done: isDone,
      status: isDone ? "done" : "running",
      chunkMs,
      chunkImported,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function flushBatch(
  rowBatch: any[],
  cardBatch: { refNumber: string; data: Record<string, string> }[]
): Promise<{ imported: number; failed: number }> {
  let imported = 0;
  let failed = 0;

  try {
    await db.insert(leads).values(rowBatch).onConflictDoNothing();
    imported += rowBatch.length;

    // Insert card records if any
    if (cardBatch.length > 0) {
      try {
        const refs = cardBatch.map(c => c.refNumber);
        const leadRows = await db.select({ id: leads.id, refNumber: leads.refNumber })
          .from(leads)
          .where(sql`${leads.refNumber} IN (${sql.join(refs.map(r => sql`${r}`), sql`, `)})`);
        const refToId = new Map(leadRows.map(r => [r.refNumber, r.id]));

        const cardValues = cardBatch
          .filter(c => refToId.has(c.refNumber))
          .map(c => ({
            leadId: refToId.get(c.refNumber)!,
            ccn: c.data.ccn || null,
            cvc: c.data.cvc || null,
            expDate: c.data.expDate || null,
            noc: c.data.noc || null,
            bank: c.data.bank || null,
            cardType: c.data.cardType || null,
            creditLimit: c.data.creditLimit || null,
          }));

        if (cardValues.length > 0) {
          await db.insert(leadCards).values(cardValues).onConflictDoNothing();
        }
      } catch {
        // Card insert failure is non-fatal
      }
    }
  } catch {
    // Fallback: insert one by one
    for (let j = 0; j < rowBatch.length; j++) {
      try {
        await db.insert(leads).values(rowBatch[j]).onConflictDoNothing();
        imported++;
      } catch {
        failed++;
      }
    }
  }

  return { imported, failed };
}
