import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { binCache } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const bin = searchParams.get("bin");

    if (!bin || bin.length < 6) {
      return NextResponse.json({ error: "bin param required (min 6 digits)" }, { status: 400 });
    }

    const bin6 = bin.slice(0, 6);

    // Check cache first
    const [cached] = await db
      .select()
      .from(binCache)
      .where(eq(binCache.bin6, bin6))
      .limit(1);

    if (cached) {
      return NextResponse.json({
        brand: cached.brand,
        type: cached.type,
        issuer: cached.issuer,
        country: cached.country,
        cached: true,
      });
    }

    // Fetch from binlist.io
    const response = await fetch(`https://binlist.io/lookup/${bin6}`, {
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "BIN lookup failed" }, { status: 502 });
    }

    const data = await response.json();

    const brand = data.scheme || data.brand || null;
    const type = data.type || null;
    const issuer = data.bank?.name || null;
    const country = data.country?.name || null;
    const prepaid = data.prepaid ?? null;

    // Cache result
    await db.insert(binCache).values({
      bin6,
      brand,
      type,
      issuer,
      country,
      prepaid,
      source: "binlist.io",
      lookedUp: new Date(),
    }).onConflictDoNothing();

    return NextResponse.json({ brand, type, issuer, country, cached: false });
  } catch (error) {
    console.error("BIN lookup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
