import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { phoneCache } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const phone = req.nextUrl.searchParams.get("phone")?.replace(/\D/g, "");
  if (!phone || phone.length < 10) {
    return NextResponse.json({ error: "Valid phone number required" }, { status: 400 });
  }

  // Normalize to 10 digits
  const normalized = phone.length === 11 && phone[0] === "1" ? phone.slice(1) : phone;
  if (normalized.length !== 10) {
    return NextResponse.json({ error: "US phone number required (10 digits)" }, { status: 400 });
  }

  // Check cache first
  const [cached] = await db.select().from(phoneCache).where(eq(phoneCache.phone, normalized)).limit(1);
  if (cached && cached.carrier) {
    return NextResponse.json({
      phone: normalized,
      carrier: cached.carrier,
      lineType: cached.lineType,
      country: cached.country,
      source: cached.source,
      cached: true,
    });
  }

  // AbstractAPI Phone Intelligence
  const apiKey = process.env.ABSTRACTAPI_KEY || "736887dd31674f29b0a36d13672ef36d";
  try {
    const res = await fetch(
      `https://phoneintelligence.abstractapi.com/v1/?api_key=${apiKey}&phone=%2B1${normalized}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Lookup failed", status: res.status }, { status: 502 });
    }

    const data = await res.json();
    const carrier = data.carrier || null;
    const lineType = data.line_type || data.type || null;
    const country = data.country?.name || data.country_code || null;

    // Cache result
    if (carrier) {
      try {
        await db.insert(phoneCache).values({
          phone: normalized,
          carrier,
          lineType,
          country,
          source: "abstractapi",
        }).onConflictDoNothing();
      } catch {}
    }

    return NextResponse.json({
      phone: normalized,
      carrier,
      lineType,
      country,
      source: "abstractapi",
      cached: false,
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Lookup error: ${e.message}` }, { status: 502 });
  }
}
