import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { importJobs } from "@/lib/db/schema";
import { writeFile } from "fs/promises";

// Allow large file uploads (250MB)
export const config = {
  api: { bodyParser: false },
};

export const maxDuration = 60;

// ── Comprehensive column alias map (ported from v1 bulk_upload.php) ──
export const fieldMap: Record<string, string> = {
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
  "requested_limit": "requestedLimit", "requestedlimit": "requestedLimit", "req_limit": "requestedLimit",
  // Misc
  "notes": "notes", "note": "notes", "extrafield": "notes", "extra_field": "notes", "extra": "notes",
  "ref_number": "refNumberOriginal", "refnumber": "refNumberOriginal", "ref": "refNumberOriginal",
  "middle_name": "_middleName", "middlename": "_middleName", "middle": "_middleName", "mi": "_middleName",
};

// ── Content-based column detection fallback ──
export function detectColumnByContent(values: string[]): string | null {
  const sample = values.slice(0, 50).filter(v => v && v.trim() && v.toLowerCase() !== "null");
  if (sample.length < 3) return null;

  const emailCount = sample.filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)).length;
  if (emailCount > sample.length * 0.5) return "email";

  const phoneCount = sample.filter(v => {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  }).length;
  if (phoneCount > sample.length * 0.6) return "phone";

  const dateCount = sample.filter(v =>
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(v) ||
    /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(v)
  ).length;
  if (dateCount > sample.length * 0.5) return "dob";

  const ssn4Count = sample.filter(v => /^\d{4}$/.test(v.trim())).length;
  if (ssn4Count > sample.length * 0.7) return "ssnLast4";

  const stateCodes = new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"]);
  const stateCount = sample.filter(v => stateCodes.has(v.trim().toUpperCase())).length;
  if (stateCount > sample.length * 0.5) return "state";

  const zipCount = sample.filter(v => /^\d{5}(-\d{4})?$/.test(v.trim())).length;
  if (zipCount > sample.length * 0.5) return "zip";

  const ccCount = sample.filter(v => {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19;
  }).length;
  if (ccCount > sample.length * 0.5) return "ccNumber";

  const cvvCount = sample.filter(v => /^\d{3,4}$/.test(v.trim())).length;
  if (cvvCount > sample.length * 0.7) return "ccCvc";

  return null;
}

// ── Simple CSV line parser that handles quoted fields ──
export function parseLine(line: string, delimiter: string): string[] {
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

// ── Extract CSV text from a ZIP file ──
async function extractCsvFromZip(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder("utf-8");

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
          const size = uncompressedSize || compressedSize;
          return decoder.decode(bytes.slice(dataStart, dataStart + size));
        } else if (compressionMethod === 8) {
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
            continue;
          }
        }
      }
    }
  }
  throw new Error("No CSV/TXT file found inside the ZIP archive");
}

// POST /api/leads/import — Upload file, detect columns, create job, save CSV to disk
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

    // Fallback: content-based detection for unmapped columns
    const mappedCount = Object.keys(mapping).length;
    if (mappedCount < Math.min(3, headers.length)) {
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

      const usedFields = new Set(Object.values(mapping));

      for (let i = 0; i < headers.length; i++) {
        if (mapping[i]) continue;
        const detected = detectColumnByContent(columnSamples[i]);
        if (detected && !usedFields.has(detected)) {
          mapping[i] = detected;
          usedFields.add(detected);
        }
      }

      if (Object.keys(mapping).length === 0 && headers.length >= 2) {
        const firstColSample = columnSamples[0] || [];
        const nameCount = firstColSample.filter(v => /^[a-zA-Z\s'-]+$/.test(v) && v.length >= 2).length;
        if (nameCount > firstColSample.length * 0.5) {
          mapping[0] = "fullName";
        }
      }
    }

    const totalRows = lines.length - 1;
    const importRef = `import-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;

    // Create import job (pending — no rows processed yet)
    const [job] = await db.insert(importJobs).values({
      userId: user.id,
      filename: file.name,
      totalRows,
      status: "pending",
      importRef,
      mapping: mapping as any,
      delimiter,
      processed: 0,
      imported: 0,
      failed: 0,
    }).returning({ id: importJobs.id });

    // Save CSV text to /tmp for chunked processing
    const csvPath = `/tmp/import_${job.id}.csv`;
    await writeFile(csvPath, text, "utf-8");

    // Pre-compute byte offsets for each 50K-line chunk (avoids re-reading entire file per chunk)
    const CHUNK_SIZE = 50000;
    const chunkOffsets: number[] = [];
    let bytePos = 0;
    let lineCount = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") {
        lineCount++;
        if (lineCount === 1) {
          // First newline = end of header, start of data
          chunkOffsets.push(i + 1);
        } else if ((lineCount - 1) % CHUNK_SIZE === 0 && lineCount > 1) {
          // Start of a new chunk
          chunkOffsets.push(i + 1);
        }
      }
    }

    // Update job with file path and chunk offsets
    const { sql } = await import("drizzle-orm");
    await db.update(importJobs).set({
      filePath: csvPath,
      validationRules: { chunkOffsets } as any,
    }).where(sql`id = ${job.id}`);

    // Build preview rows (first 5 data rows)
    const previewRows: Record<string, string>[] = [];
    for (let i = 1; i <= Math.min(5, totalRows); i++) {
      const cols = parseLine(lines[i], delimiter);
      const row: Record<string, string> = {};
      for (const [colIdx, field] of Object.entries(mapping)) {
        const val = cols[parseInt(colIdx)]?.trim();
        if (val && val.toLowerCase() !== "null" && val !== "") {
          row[field] = val;
        }
      }
      previewRows.push(row);
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      filename: file.name,
      totalRows,
      headers,
      delimiter,
      previewRows,
      mapping: Object.entries(mapping).map(([idx, field]) => ({
        columnIndex: parseInt(idx),
        column: headers[parseInt(idx)] || `col${idx}`,
        mappedTo: field,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
