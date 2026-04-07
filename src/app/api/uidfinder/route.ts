import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// UIDFinder API — lookup by phone, email, or address
// API docs: https://uidfinder.pro
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const phone = req.nextUrl.searchParams.get("phone");
  const email = req.nextUrl.searchParams.get("email");
  const address = req.nextUrl.searchParams.get("address");
  const city = req.nextUrl.searchParams.get("city");
  const state = req.nextUrl.searchParams.get("state");

  if (!phone && !email && !address) {
    return NextResponse.json({ error: "phone, email, or address required" }, { status: 400 });
  }

  // Get API key from app_settings or env
  let apiKey = process.env.UIDFINDER_API_KEY || "";
  if (!apiKey) {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, "uidfinder_api_key")).limit(1);
    apiKey = setting?.value || "";
  }

  if (!apiKey) {
    return NextResponse.json({ error: "UIDFinder API key not configured", hasKey: false }, { status: 400 });
  }

  // Build query params
  const params: Record<string, string> = { api_key: apiKey };
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    params.phone = digits.length === 10 ? `1${digits}` : digits;
  }
  if (email) params.email = email;
  if (address) params.address = address;
  if (city) params.city = city;
  if (state) params.state = state;

  try {
    const queryStr = new URLSearchParams(params).toString();
    const res = await fetch(`https://uidfinder.pro/v1/?${queryStr}`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "CyborgCRM/2.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `UIDFinder returned ${res.status}`, details: text }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, hasKey: true, ...data });
  } catch (e: any) {
    return NextResponse.json({ error: `UIDFinder error: ${e.message}` }, { status: 502 });
  }
}
