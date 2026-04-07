import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, importJobs } from "@/lib/db/schema";
import { generateRef } from "@/lib/utils";

// Allow large file uploads (250MB)
export const config = {
  api: { bodyParser: false },
};

export const maxDuration = 300; // 5 min timeout for large imports
import { sql } from "drizzle-orm";

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

    const text = await file.text();
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

    // Auto-map columns
    const fieldMap: Record<string, string> = {
      "first_name": "firstName", "firstname": "firstName", "first name": "firstName", "fname": "firstName",
      "last_name": "lastName", "lastname": "lastName", "last name": "lastName", "lname": "lastName",
      "full_name": "fullName", "fullname": "fullName", "name": "fullName",
      "email": "email", "e-mail": "email", "email_address": "email",
      "phone": "phone", "cell": "phone", "cell_phone": "phone", "mobile": "phone", "phone_number": "phone",
      "landline": "landline", "home_phone": "landline",
      "address": "address", "street": "address", "address1": "address",
      "city": "city",
      "state": "state", "st": "state",
      "zip": "zip", "zipcode": "zip", "zip_code": "zip", "postal": "zip", "postal_code": "zip",
      "country": "country",
      "dob": "dob", "date_of_birth": "dob", "birth_date": "dob", "birthday": "dob",
      "ssn": "ssnLast4", "ssn_last4": "ssnLast4", "ssn4": "ssnLast4", "last4ssn": "ssnLast4",
      "cc_number": "ccNumber", "card_number": "ccNumber", "ccn": "ccNumber", "cc": "ccNumber",
      "cc_exp": "ccExp", "expiry": "ccExp", "exp_date": "ccExp", "expiration": "ccExp",
      "cc_cvc": "ccCvc", "cvv": "ccCvc", "cvc": "ccCvc", "cvv2": "ccCvc",
      "cc_bank": "ccBank", "bank": "ccBank", "issuer": "cardIssuer", "card_issuer": "cardIssuer",
      "card_type": "cardType", "card_brand": "cardBrand", "brand": "cardBrand",
      "bin": "cardNumberBin", "card_number_bin": "cardNumberBin",
      "notes": "notes", "note": "notes",
      "county": "county", "mmn": "mmn", "mothers_maiden_name": "mmn",
    };

    const mapping: Record<number, string> = {};
    headers.forEach((h, i) => {
      const normalized = h.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_");
      if (fieldMap[h]) mapping[i] = fieldMap[h];
      else if (fieldMap[normalized]) mapping[i] = fieldMap[normalized];
    });

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
    const errors: string[] = [];
    const batchSize = 500;
    let rowBatch: any[] = [];

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

      // Skip empty rows
      if (!data.firstName && !data.phone && !data.email) {
        failed++;
        continue;
      }

      // Clean phone
      const phone = data.phone?.replace(/\D/g, "") || null;
      const landline = data.landline?.replace(/\D/g, "") || null;

      // Detect card brand from BIN
      let cardBrand = data.cardBrand || "";
      const bin = data.cardNumberBin || (data.ccNumber ? data.ccNumber.replace(/\D/g, "").slice(0, 6) : "");
      if (bin && !cardBrand) {
        if (bin[0] === "4") cardBrand = "Visa";
        else if (bin[0] === "5" && bin[1] >= "1" && bin[1] <= "5") cardBrand = "Mastercard";
        else if (bin[0] === "3" && (bin[1] === "4" || bin[1] === "7")) cardBrand = "Amex";
        else if (bin.startsWith("6011") || bin.startsWith("65")) cardBrand = "Discover";
      }

      rowBatch.push({
        refNumber: generateRef(),
        firstName: data.firstName?.slice(0, 120) || null,
        lastName: data.lastName?.slice(0, 120) || null,
        email: data.email || null,
        phone: phone && phone.length >= 10 ? phone : null,
        landline: landline && landline.length >= 10 ? landline : null,
        dob: data.dob || null,
        ssnLast4: data.ssnLast4?.replace(/\D/g, "") || null,
        mmn: data.mmn || null,
        county: data.county || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state?.slice(0, 80) || null,
        zip: data.zip || null,
        country: data.country || null,
        cardType: data.cardType || null,
        cardNumberBin: bin?.slice(0, 8) || null,
        cardBrand: cardBrand || null,
        cardIssuer: data.cardIssuer || data.ccBank || null,
        notes: data.notes || null,
        status: "new" as const,
        agentId: user.id,
        importRef,
      });

      if (rowBatch.length >= batchSize) {
        try {
          await db.insert(leads).values(rowBatch).onConflictDoNothing();
          imported += rowBatch.length;
        } catch (e: any) {
          // Fallback: insert one by one
          for (const row of rowBatch) {
            try {
              await db.insert(leads).values(row).onConflictDoNothing();
              imported++;
            } catch {
              failed++;
            }
          }
        }
        rowBatch = [];
      }
    }

    // Flush remaining
    if (rowBatch.length > 0) {
      try {
        await db.insert(leads).values(rowBatch).onConflictDoNothing();
        imported += rowBatch.length;
      } catch {
        for (const row of rowBatch) {
          try {
            await db.insert(leads).values(row).onConflictDoNothing();
            imported++;
          } catch {
            failed++;
          }
        }
      }
    }

    // Update job status
    await db.update(importJobs).set({
      status: "done",
      imported,
      failed,
      processed: imported + failed,
      finishedAt: new Date(),
    }).where(sql`id = ${job.id}`);

    await audit(user.id, user.username, "bulk_import", "lead", undefined, `Imported ${imported} leads, ${failed} failed from ${file.name}`);

    return NextResponse.json({
      success: true,
      imported,
      failed,
      total: lines.length - 1,
      importRef,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
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
