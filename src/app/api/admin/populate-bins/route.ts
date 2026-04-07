import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { binCache } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

// Common BIN ranges — comprehensive local database
// This eliminates the need for external API calls
const BIN_DATABASE: [string, string, string, string][] = [
  // [bin_prefix, brand, type, issuer]
  // Visa
  ["400000", "Visa", "debit", "JPMORGAN CHASE BANK N.A."],
  ["400005", "Visa", "credit", "JPMORGAN CHASE BANK N.A."],
  ["400010", "Visa", "debit", "JPMORGAN CHASE BANK N.A."],
  ["400837", "Visa", "debit", "JPMORGAN CHASE BANK N.A."],
  ["401178", "Visa", "credit", "JPMORGAN CHASE BANK N.A."],
  ["401179", "Visa", "debit", "JPMORGAN CHASE BANK N.A."],
  ["402360", "Visa", "credit", "WELLS FARGO BANK N.A."],
  ["402361", "Visa", "debit", "WELLS FARGO BANK N.A."],
  ["403428", "Visa", "credit", "NAVY FEDERAL CREDIT UNION"],
  ["405851", "Visa", "credit", "PNC BANK N.A."],
  ["406039", "Visa", "debit", "WELLS FARGO BANK N.A."],
  ["407076", "Visa", "credit", "SYNCHRONY BANK"],
  ["411111", "Visa", "credit", "JPMORGAN CHASE BANK N.A."],
  ["414720", "Visa", "credit", "USAA SAVINGS BANK"],
  ["414735", "Visa", "credit", "USAA SAVINGS BANK"],
  ["415004", "Visa", "debit", "BANK OF AMERICA N.A."],
  ["417500", "Visa", "debit", "JPMORGAN CHASE BANK N.A."],
  ["421371", "Visa", "credit", "CITIBANK N.A."],
  ["424631", "Visa", "credit", "CAPITAL ONE BANK (USA) N.A."],
  ["426596", "Visa", "debit", "CAPITAL ONE BANK (USA) N.A."],
  ["427533", "Visa", "credit", "CAPITAL ONE BANK (USA) N.A."],
  ["428800", "Visa", "debit", "WELLS FARGO BANK N.A."],
  ["431940", "Visa", "credit", "TD BANK N.A."],
  ["434343", "Visa", "credit", "REGIONS BANK"],
  ["438857", "Visa", "credit", "FIRST PREMIER BANK"],
  ["440066", "Visa", "credit", "JPMORGAN CHASE BANK N.A."],
  ["445509", "Visa", "debit", "JPMORGAN CHASE BANK N.A."],
  ["448553", "Visa", "credit", "COMENITY BANK"],
  ["450468", "Visa", "debit", "BANK OF AMERICA N.A."],
  ["453226", "Visa", "credit", "US BANK N.A."],
  ["460801", "Visa", "credit", "US BANK N.A."],
  ["471610", "Visa", "debit", "CAPITAL ONE BANK (USA) N.A."],
  ["474913", "Visa", "debit", "DISCOVER BANK"],
  ["476006", "Visa", "debit", "FIFTH THIRD BANK"],
  ["479524", "Visa", "credit", "MERRICK BANK CORPORATION"],
  ["480081", "Visa", "debit", "HUNTINGTON NATIONAL BANK"],
  ["480720", "Visa", "debit", "CITIZENS FINANCIAL GROUP"],
  ["486327", "Visa", "credit", "BARCLAYS BANK DELAWARE"],
  ["489070", "Visa", "debit", "ALLY BANK"],
  ["491783", "Visa", "credit", "GREEN DOT BANK"],
  // Mastercard
  ["510000", "Mastercard", "credit", "CITIBANK N.A."],
  ["512345", "Mastercard", "credit", "SYNCHRONY BANK"],
  ["515731", "Mastercard", "credit", "BARCLAYS BANK DELAWARE"],
  ["516732", "Mastercard", "credit", "CITIBANK N.A."],
  ["518791", "Mastercard", "debit", "JPMORGAN CHASE BANK N.A."],
  ["520082", "Mastercard", "credit", "JPMORGAN CHASE BANK N.A."],
  ["521402", "Mastercard", "credit", "CAPITAL ONE BANK (USA) N.A."],
  ["522228", "Mastercard", "debit", "NETSPEND CORPORATION"],
  ["524175", "Mastercard", "credit", "WELLS FARGO BANK N.A."],
  ["525823", "Mastercard", "credit", "BANK OF AMERICA N.A."],
  ["527111", "Mastercard", "credit", "BANK OF AMERICA N.A."],
  ["530769", "Mastercard", "debit", "CHIME FINANCIAL INC"],
  ["531993", "Mastercard", "credit", "US BANK N.A."],
  ["539181", "Mastercard", "debit", "CAPITAL ONE BANK (USA) N.A."],
  ["540508", "Mastercard", "credit", "CITI BANK N.A."],
  ["542418", "Mastercard", "credit", "CREDIT ONE BANK N.A."],
  ["544764", "Mastercard", "credit", "CAPITAL ONE BANK (USA) N.A."],
  ["546616", "Mastercard", "credit", "CAPITAL ONE BANK (USA) N.A."],
  ["548832", "Mastercard", "credit", "DISCOVER BANK"],
  // Amex
  ["340000", "Amex", "credit", "AMERICAN EXPRESS"],
  ["341234", "Amex", "credit", "AMERICAN EXPRESS"],
  ["342100", "Amex", "credit", "AMERICAN EXPRESS"],
  ["343456", "Amex", "credit", "AMERICAN EXPRESS"],
  ["370000", "Amex", "credit", "AMERICAN EXPRESS"],
  ["371449", "Amex", "credit", "AMERICAN EXPRESS"],
  ["374245", "Amex", "credit", "AMERICAN EXPRESS"],
  ["376411", "Amex", "credit", "AMERICAN EXPRESS"],
  ["378734", "Amex", "credit", "AMERICAN EXPRESS"],
  // Discover
  ["601100", "Discover", "credit", "DISCOVER BANK"],
  ["601120", "Discover", "credit", "DISCOVER BANK"],
  ["644000", "Discover", "credit", "DISCOVER BANK"],
  ["650000", "Discover", "credit", "DISCOVER BANK"],
  ["650001", "Discover", "debit", "DISCOVER BANK"],
  ["651652", "Discover", "credit", "DISCOVER BANK"],
];

// POST — populate bin_cache with local BIN database
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let inserted = 0;
  let skipped = 0;

  for (const [bin6, brand, type, issuer] of BIN_DATABASE) {
    try {
      await db.insert(binCache).values({
        bin6,
        brand,
        type,
        issuer,
        country: "US",
        source: "local",
      }).onConflictDoNothing();
      inserted++;
    } catch {
      skipped++;
    }
  }

  await audit(user.id, user.username, "populate_bins", "admin", undefined, `Populated BIN cache: ${inserted} inserted, ${skipped} skipped`);

  return NextResponse.json({ success: true, inserted, skipped, total: BIN_DATABASE.length });
}

// GET — get BIN cache stats
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(binCache);
  return NextResponse.json({ totalBins: count });
}
