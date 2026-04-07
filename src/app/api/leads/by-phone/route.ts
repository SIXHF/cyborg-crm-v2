import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET — lookup lead by phone number (for incoming call matching)
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const phone = req.nextUrl.searchParams.get("phone")?.replace(/\D/g, "");
  if (!phone || phone.length < 10) {
    return NextResponse.json({ error: "Valid phone number required" }, { status: 400 });
  }

  // Normalize: remove leading 1 if 11 digits
  const normalized = phone.length === 11 && phone[0] === "1" ? phone.slice(1) : phone;

  const results = await db.select({
    id: leads.id,
    refNumber: leads.refNumber,
    firstName: leads.firstName,
    lastName: leads.lastName,
    phone: leads.phone,
    email: leads.email,
    status: leads.status,
    state: leads.state,
  }).from(leads)
    .where(eq(leads.phone, normalized))
    .limit(5);

  return NextResponse.json({ results, count: results.length });
}
