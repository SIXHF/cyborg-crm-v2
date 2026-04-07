import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { binCache } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

// POST — download and import 374K+ BIN records from GitHub
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // Download the BIN database CSV from GitHub (374K+ records)
    const csvUrl = "https://raw.githubusercontent.com/venelinkochev/bin-list-data/master/bin-list-data.csv";
    const res = await fetch(csvUrl);
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to download BIN database" }, { status: 502 });
    }

    const csvText = await res.text();
    const lines = csvText.split("\n");
    const header = lines[0]; // BIN,Brand,Type,Category,Issuer,IssuerPhone,IssuerUrl,isoCode2,isoCode3,CountryName

    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    const batchSize = 500;
    let batch: { bin6: string; brand: string; type: string; issuer: string; country: string; source: string }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV line (handle quoted fields)
      const cols = parseCSVLine(line);
      if (cols.length < 10) continue;

      const bin6 = cols[0]?.replace(/"/g, "").trim();
      if (!bin6 || bin6.length < 4) continue;

      const brand = cols[1]?.replace(/"/g, "").trim() || null;
      const type = cols[2]?.replace(/"/g, "").trim() || null;
      const issuer = cols[4]?.replace(/"/g, "").trim() || null;
      const country = cols[9]?.replace(/"/g, "").trim() || null;

      batch.push({
        bin6: bin6.slice(0, 8),
        brand: brand || "",
        type: (type || "").toLowerCase(),
        issuer: issuer || "",
        country: country || "",
        source: "github-venelinkochev",
      });

      if (batch.length >= batchSize) {
        const result = await flushBatch(batch);
        inserted += result.inserted;
        skipped += result.skipped;
        errors += result.errors;
        batch = [];
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      const result = await flushBatch(batch);
      inserted += result.inserted;
      skipped += result.skipped;
      errors += result.errors;
    }

    await audit(user.id, user.username, "populate_bins", "admin", undefined,
      `Imported ${inserted} BINs from GitHub (${skipped} skipped, ${errors} errors)`);

    return NextResponse.json({
      success: true,
      inserted,
      skipped,
      errors,
      total: lines.length - 1,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function flushBatch(batch: any[]): Promise<{ inserted: number; skipped: number; errors: number }> {
  let inserted = 0, skipped = 0, errors = 0;

  try {
    await db.insert(binCache).values(batch).onConflictDoNothing();
    inserted += batch.length;
  } catch {
    // Fallback: insert one by one
    for (const row of batch) {
      try {
        await db.insert(binCache).values(row).onConflictDoNothing();
        inserted++;
      } catch {
        skipped++;
      }
    }
  }

  return { inserted, skipped, errors };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// GET — get BIN cache stats
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(binCache);
  const [{ brands }] = await db.select({ brands: sql<number>`count(DISTINCT brand)::int` }).from(binCache);

  return NextResponse.json({ totalBins: count, distinctBrands: brands });
}
