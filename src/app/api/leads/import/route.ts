import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, leadCards, importJobs } from "@/lib/db/schema";
import { generateRef } from "@/lib/utils";

// Allow large file uploads (250MB)
export const config = {
  api: { bodyParser: false },
};

export const maxDuration = 300; // 5 min timeout for large imports
import { sql } from "drizzle-orm";

// ── Comprehensive column alias map (ported from v1 bulk_upload.php) ──
const fieldMap: Record<string, string> = {
  // Personal
  "first_name": "firstName", "fname": "firstName", "firstname": "firstName", "first name": "firstName",
  "last_name": "lastName", "lname": "lastName", "lastname": "lastName", "last name": "lastName",
  "full_name": "fullName", "fullname": "fullName", "name": "fullName",
  "email": "email", "e-mail": "email", "email_address": "email", "emailaddress": "email",
  "phone": "phone", "mobile": "phone", "cell": "phone", "telephone": "phone", "tel": "phone",
  "cellphone": "phone", "cell_phone": "phone", "phone_number": "phone", "phonenumber": "phone",
  "home_phone": "landline", "homephone": "landline", "landline": "landline", "land_line": "landline",
  "work_phone": "landline", "workphone": "landline",
  "dob": "dob", "birthdate": "dob", "birthday": "dob", "dateofbirth": "dob",
  "birth_date": "dob", "date_of_birth": "dob",
  "ssn_last4": "ssnLast4", "ssn": "ssnLast4", "ssn4": "ssnLast4", "last4": "ssnLast4",
  "last4ssn": "ssnLast4", "ssn_last_4": "ssnLast4",
  "mmn": "mmn", "mothers_maiden_name": "mmn", "mothersmaidenname": "mmn",
  "vpass": "vpass",
  "county": "county",
  // Address
  "address": "address", "addr": "address", "street": "address", "address1": "address",
  "street_address": "address", "streetaddress": "address",
  "city": "city",
  "state": "state", "st": "state", "province": "state",
  "zip": "zip", "zipcode": "zip", "zip_code": "zip", "postal": "zip",
  "postalcode": "zip", "postal_code": "zip", "postcode": "zip",
  "country": "country",
  // Card core
  "card_type": "cardType", "cardtype": "cardType",
  "cc_number": "ccNumber", "cardnumber": "ccNumber", "ccnumber": "ccNumber",
  "card_number": "ccNumber", "fullcard": "ccNumber", "pan": "ccNumber", "ccn": "ccNumber",
  "credit_card_number": "ccNumber", "creditcardnumber": "ccNumber",
  "card_num": "ccNumber", "cc_num": "ccNumber", "credit_card": "ccNumber",
  "card_number_full": "ccNumber", "account_number": "ccNumber", "account_no": "ccNumber",
  "acct_number": "ccNumber", "cardno": "ccNumber",
  "cc_exp": "ccExp", "exp": "ccExp", "expiry": "ccExp", "expdate": "ccExp",
  "expirydate": "ccExp", "expiration": "ccExp", "expirationdate": "ccExp",
  "exp_date": "ccExp", "expire": "ccExp", "expiration_date": "ccExp",
  "cc_exp_month": "ccExpMonth", "expmonth": "ccExpMonth", "exp_month": "ccExpMonth", "mm": "ccExpMonth",
  "cc_exp_year": "ccExpYear", "expyear": "ccExpYear", "exp_year": "ccExpYear",
  "yy": "ccExpYear", "yyyy": "ccExpYear",
  "cc_cvc": "ccCvc", "cvv": "ccCvc", "cvc": "ccCvc", "cvv2": "ccCvc",
  "securitycode": "ccCvc", "security_code": "ccCvc",
  "cc_noc": "ccNoc", "noc": "ccNoc", "nameoncard": "ccNoc",
  "cardholder": "ccNoc", "holdername": "ccNoc", "name_on_card": "ccNoc",
  "card_holder": "ccNoc", "cardholdername": "ccNoc",
  // Card issuer / brand
  "card_brand": "cardBrand", "brand": "cardBrand",
  "card_issuer": "cardIssuer", "issuer": "cardIssuer", "cardissuer": "cardIssuer",
  "cc_bank": "ccBank", "bank": "ccBank", "bank_name": "ccBank", "bankname": "ccBank",
  // Card limits
  "cc_limit": "ccLimit", "limit": "ccLimit", "creditlimit": "ccLimit",
  "credit_limit": "ccLimit", "card_limit": "ccLimit", "cardlimit": "ccLimit",
  // Card number variants
  "card_number_bin": "cardNumberBin", "bin": "cardNumberBin",
  "card_number_masked": "cardNumberMasked", "masked": "cardNumberMasked",
  // Business
  "business_name": "businessName", "businessname": "businessName", "company": "businessName",
  "company_name": "businessName",
  "business_ein": "businessEin", "ein": "businessEin",
  // Mortgage
  "mortgage_bank": "mortgageBank", "mortgagebank": "mortgageBank",
  "mortgage_payment": "mortgagePayment", "mortgagepayment": "mortgagePayment",
  // Income / employment
  "annual_income": "annualIncome", "annualincome": "annualIncome", "income": "annualIncome",
  "employment_status": "employmentStatus", "employmentstatus": "employmentStatus", "employment": "employmentStatus",
  "credit_score_range": "creditScoreRange", "creditscore": "creditScoreRange", "credit_score": "creditScoreRange",
  // Misc
  "notes": "notes", "note": "notes", "extrafield": "notes", "extra_field": "notes", "extra": "notes",
  "ref_number": "refNumberOriginal", "refnumber": "refNumberOriginal", "ref": "refNumberOriginal",
  "middle_name": "_middleName", "middlename": "_middleName", "middle": "_middleName", "mi": "_middleName",
};

// ── Content-based column detection fallback ──
function detectColumnByContent(values: string[]): string | null {
  const sample = values.slice(0, 50).filter(v => v && v.trim() && v.toLowerCase() !== "null");
  if (sample.length < 3) return null;

  // Check for email pattern
  const emailCount = sample.filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)).length;
  if (emailCount > sample.length * 0.5) return "email";

  // Check for phone (10-15 digits, possibly formatted)
  const phoneCount = sample.filter(v => {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  }).length;
  if (phoneCount > sample.length * 0.6) return "phone";

  // Check for date patterns (MM/DD/YYYY, YYYY-MM-DD, etc.)
  const dateCount = sample.filter(v =>
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(v) ||
    /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(v)
  ).length;
  if (dateCount > sample.length * 0.5) return "dob";

  // Check for SSN last 4 (exactly 4 digits)
  const ssn4Count = sample.filter(v => /^\d{4}$/.test(v.trim())).length;
  if (ssn4Count > sample.length * 0.7) return "ssnLast4";

  // Check for US state codes (2 letter)
  const stateCodes = new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"]);
  const stateCount = sample.filter(v => stateCodes.has(v.trim().toUpperCase())).length;
  if (stateCount > sample.length * 0.5) return "state";

  // Check for ZIP codes (5 or 9 digits)
  const zipCount = sample.filter(v => /^\d{5}(-\d{4})?$/.test(v.trim())).length;
  if (zipCount > sample.length * 0.5) return "zip";

  // Check for credit card numbers (13-19 digits)
  const ccCount = sample.filter(v => {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19;
  }).length;
  if (ccCount > sample.length * 0.5) return "ccNumber";

  // Check for CVV (3-4 digits)
  const cvvCount = sample.filter(v => /^\d{3,4}$/.test(v.trim())).length;
  if (cvvCount > sample.length * 0.7) return "ccCvc";

  return null;
}

// ── Parse DOB to YYYY-MM-DD format ──
function parseDob(raw: string): string | null {
  if (!raw || raw.trim() === "") return null;
  const s = raw.trim();

  // YYYY-MM-DD (already correct)
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    return null;
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const mdyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdyMatch) {
    const [, mm, dd, yyyy] = mdyMatch.map(Number);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 1900 && yyyy <= 2100) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
    return null;
  }

  // MM/DD/YY
  const mdyShort = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (mdyShort) {
    const [, mm, dd, yy] = mdyShort.map(Number);
    const yyyy = yy > 50 ? 1900 + yy : 2000 + yy;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
    return null;
  }

  // YYYY/MM/DD
  const ymdSlash = s.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/);
  if (ymdSlash) {
    const [, yyyy, mm, dd] = ymdSlash.map(Number);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 1900 && yyyy <= 2100) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
    return null;
  }

  // MMDDYYYY (8 digits)
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

// ── Extract CSV text from a ZIP file ──
async function extractCsvFromZip(buffer: ArrayBuffer): Promise<string> {
  // Simple ZIP parser - find the first CSV/TXT file
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder("utf-8");

  // Look for local file headers (PK\x03\x04)
  for (let i = 0; i < bytes.length - 30; i++) {
    if (bytes[i] === 0x50 && bytes[i+1] === 0x4B && bytes[i+2] === 0x03 && bytes[i+3] === 0x04) {
      const compressionMethod = bytes[i+8] | (bytes[i+9] << 8);
      const compressedSize = bytes[i+18] | (bytes[i+19] << 8) | (bytes[i+20] << 16) | (bytes[i+21] << 24);
      const uncompressedSize = bytes[i+22] | (bytes[i+23] << 8) | (bytes[i+24] << 16) | (bytes[i+25] << 24);
      const nameLen = bytes[i+26] | (bytes[i+27] << 8);
      const extraLen = bytes[i+28] | (bytes[i+29] << 8);

      const fileName = decoder.decode(bytes.slice(i+30, i+30+nameLen));
      const dataStart = i + 30 + nameLen + extraLen;

      const lowerName = fileName.toLowerCase();
      if (lowerName.endsWith(".csv") || lowerName.endsWith(".txt") || lowerName.endsWith(".tsv") || lowerName.endsWith(".dat")) {
        if (compressionMethod === 0) {
          // Stored (no compression)
          const size = uncompressedSize || compressedSize;
          return decoder.decode(bytes.slice(dataStart, dataStart + size));
        } else if (compressionMethod === 8) {
          // Deflate - use DecompressionStream
          const compressed = bytes.slice(dataStart, dataStart + compressedSize);
          try {
            const ds = new DecompressionStream("deflate-raw" as any);
            const writer = ds.writable.getWriter();
            writer.write(compressed);
            writer.close();
            const reader = ds.readable.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }
            const totalLen = chunks.reduce((s, c) => s + c.length, 0);
            const result = new Uint8Array(totalLen);
            let offset = 0;
            for (const chunk of chunks) {
              result.set(chunk, offset);
              offset += chunk.length;
            }
            return decoder.decode(result);
          } catch {
            // Skip this file, try next
            continue;
          }
        }
      }
    }
  }
  throw new Error("No CSV/TXT file found inside the ZIP archive");
}

// POST /api/leads/import — Upload and import CSV file
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Handle ZIP files
    let text: string;
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".zip")) {
      const buffer = await file.arrayBuffer();
      text = await extractCsvFromZip(buffer);
    } else {
      text = await file.text();
    }

    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: "File must have a header row and at least one data row" }, { status: 400 });
    }

    // Detect delimiter
    const firstLine = lines[0];
    const delimiters = [",", "\t", "|", ";"];
    let delimiter = ",";
    let maxCount = 0;
    for (const d of delimiters) {
      const count = (firstLine.match(new RegExp(d === "|" ? "\\|" : d, "g")) || []).length;
      if (count > maxCount) { maxCount = count; delimiter = d; }
    }

    // Parse header
    const headers = parseLine(firstLine, delimiter).map((h) => h.trim().toLowerCase());

    // Auto-map columns using alias map
    const mapping: Record<number, string> = {};
    headers.forEach((h, i) => {
      const normalized = h.replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      const noUnderscore = normalized.replace(/_/g, "");
      if (fieldMap[h]) mapping[i] = fieldMap[h];
      else if (fieldMap[normalized]) mapping[i] = fieldMap[normalized];
      else if (fieldMap[noUnderscore]) mapping[i] = fieldMap[noUnderscore];
    });

    // Fallback: if very few columns mapped, try content-based detection
    const mappedCount = Object.keys(mapping).length;
    if (mappedCount < Math.min(3, headers.length)) {
      // Collect sample values for each unmapped column
      const sampleRows = Math.min(50, lines.length - 1);
      const columnSamples: string[][] = headers.map(() => []);
      for (let i = 1; i <= sampleRows; i++) {
        const cols = parseLine(lines[i], delimiter);
        cols.forEach((val, idx) => {
          if (idx < columnSamples.length) {
            columnSamples[idx].push(val.trim());
          }
        });
      }

      // Track which fields are already mapped to avoid duplicates
      const usedFields = new Set(Object.values(mapping));

      for (let i = 0; i < headers.length; i++) {
        if (mapping[i]) continue; // already mapped
        const detected = detectColumnByContent(columnSamples[i]);
        if (detected && !usedFields.has(detected)) {
          mapping[i] = detected;
          usedFields.add(detected);
        }
      }

      // If still nothing mapped, try to map by position for common formats:
      // firstName, lastName, phone, email (or similar orders)
      if (Object.keys(mapping).length === 0 && headers.length >= 2) {
        // Check if first column looks like names (contains spaces or letters only)
        const firstColSample = columnSamples[0] || [];
        const nameCount = firstColSample.filter(v => /^[a-zA-Z\s'-]+$/.test(v) && v.length >= 2).length;
        if (nameCount > firstColSample.length * 0.5) {
          mapping[0] = "fullName";
        }
      }
    }

    // Import ref for this batch
    const importRef = `import-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;

    // Create import job
    const [job] = await db.insert(importJobs).values({
      userId: user.id,
      filename: file.name,
      totalRows: lines.length - 1,
      status: "running",
      importRef,
      mapping: mapping as any,
    }).returning({ id: importJobs.id });

    // Process rows in batches
    let imported = 0;
    let failed = 0;
    const failedRows: { row: number; reason: string }[] = [];
    const batchSize = 500;
    let rowBatch: any[] = [];
    let cardBatch: { refNumber: string; data: Record<string, string> }[] = [];

    for (let i = 1; i < lines.length; i++) {
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

      // Handle middle name — append to firstName if present
      if (data._middleName && data.firstName) {
        data.firstName = data.firstName + " " + data._middleName;
        delete data._middleName;
      }
      delete data._middleName;

      // Combine exp month + year into ccExp if separate
      if (data.ccExpMonth && data.ccExpYear && !data.ccExp) {
        data.ccExp = `${data.ccExpMonth}/${data.ccExpYear}`;
      }
      delete data.ccExpMonth;
      delete data.ccExpYear;

      // Skip empty rows
      if (!data.firstName && !data.phone && !data.email) {
        failed++;
        if (failedRows.length < 100) {
          failedRows.push({ row: i + 1, reason: "Empty row: no name, phone, or email" });
        }
        continue;
      }

      // Clean phone
      const phone = data.phone?.replace(/\D/g, "") || null;
      const landline = data.landline?.replace(/\D/g, "") || null;

      // Parse DOB properly
      const dobParsed = data.dob ? parseDob(data.dob) : null;

      // Detect card brand from BIN
      let cardBrand = data.cardBrand || "";
      const ccNumberClean = data.ccNumber ? data.ccNumber.replace(/\D/g, "") : "";
      const bin = data.cardNumberBin || (ccNumberClean ? ccNumberClean.slice(0, 6) : "");
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
        cardIssuer: data.cardIssuer || data.ccBank || null,
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

      // If we have card data, queue it for lead_cards insert
      if (ccNumberClean || data.ccExp || data.ccCvc || data.ccNoc || data.ccLimit) {
        cardBatch.push({
          refNumber,
          data: {
            ccn: ccNumberClean || "",
            cvc: data.ccCvc || "",
            expDate: data.ccExp || "",
            noc: data.ccNoc || "",
            bank: data.ccBank || data.cardIssuer || "",
            cardType: data.cardType || cardBrand || "",
            creditLimit: data.ccLimit?.replace(/[^0-9.]/g, "") || "",
          },
        });
      }

      if (rowBatch.length >= batchSize) {
        const result = await flushBatch(rowBatch, cardBatch);
        imported += result.imported;
        failed += result.failed;
        if (result.errors.length && failedRows.length < 100) {
          failedRows.push(...result.errors.slice(0, 100 - failedRows.length));
        }
        rowBatch = [];
        cardBatch = [];
      }
    }

    // Flush remaining
    if (rowBatch.length > 0) {
      const result = await flushBatch(rowBatch, cardBatch);
      imported += result.imported;
      failed += result.failed;
      if (result.errors.length && failedRows.length < 100) {
        failedRows.push(...result.errors.slice(0, 100 - failedRows.length));
      }
    }

    // Update job status
    await db.update(importJobs).set({
      status: "done",
      imported,
      failed,
      processed: imported + failed,
      errorLog: failedRows.length > 0 ? JSON.stringify(failedRows) : null,
      finishedAt: new Date(),
    }).where(sql`id = ${job.id}`);

    await audit(user.id, user.username, "bulk_import", "lead", undefined, `Imported ${imported} leads, ${failed} failed from ${file.name}`);

    return NextResponse.json({
      success: true,
      imported,
      failed,
      total: lines.length - 1,
      importRef,
      mappedColumns: Object.entries(mapping).map(([idx, field]) => ({
        column: headers[parseInt(idx)] || `col${idx}`,
        mappedTo: field,
      })),
      failedRows: failedRows.slice(0, 50),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function flushBatch(
  rowBatch: any[],
  cardBatch: { refNumber: string; data: Record<string, string> }[]
): Promise<{ imported: number; failed: number; errors: { row: number; reason: string }[] }> {
  let imported = 0;
  let failed = 0;
  const errors: { row: number; reason: string }[] = [];

  try {
    await db.insert(leads).values(rowBatch).onConflictDoNothing();
    imported += rowBatch.length;

    // Insert card records if any
    if (cardBatch.length > 0) {
      try {
        // Look up lead IDs by ref numbers
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
  } catch (e: any) {
    // Fallback: insert one by one
    for (let j = 0; j < rowBatch.length; j++) {
      try {
        await db.insert(leads).values(rowBatch[j]).onConflictDoNothing();
        imported++;
      } catch (rowErr: any) {
        failed++;
        if (errors.length < 100) {
          errors.push({ row: j, reason: rowErr.message?.slice(0, 200) || "Insert failed" });
        }
      }
    }
  }

  return { imported, failed, errors };
}

// Simple CSV line parser that handles quoted fields
function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
