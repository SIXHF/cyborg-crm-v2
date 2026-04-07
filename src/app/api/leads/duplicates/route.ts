import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { eq, and, ne, or, sql } from "drizzle-orm";

// GET — check for duplicate leads by phone, email, or SSN
// Query params: phone, email, ssn, excludeId (for editing)
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const phone = req.nextUrl.searchParams.get("phone")?.replace(/\D/g, "");
  const email = req.nextUrl.searchParams.get("email");
  const ssn = req.nextUrl.searchParams.get("ssn")?.replace(/\D/g, "");
  const excludeId = req.nextUrl.searchParams.get("excludeId");

  const duplicates: any[] = [];

  // Search by phone
  if (phone && phone.length >= 10) {
    const phoneMatches = await db.select({
      id: leads.id,
      refNumber: leads.refNumber,
      firstName: leads.firstName,
      lastName: leads.lastName,
      phone: leads.phone,
      email: leads.email,
    }).from(leads)
      .where(and(
        eq(leads.phone, phone),
        excludeId ? ne(leads.id, parseInt(excludeId)) : undefined,
      ) as any)
      .limit(3);

    phoneMatches.forEach(m => duplicates.push({ ...m, matchOn: "phone" }));
  }

  // Search by email
  if (email && email.includes("@")) {
    const emailMatches = await db.select({
      id: leads.id,
      refNumber: leads.refNumber,
      firstName: leads.firstName,
      lastName: leads.lastName,
      phone: leads.phone,
      email: leads.email,
    }).from(leads)
      .where(and(
        eq(leads.email, email.toLowerCase()),
        excludeId ? ne(leads.id, parseInt(excludeId)) : undefined,
      ) as any)
      .limit(3);

    emailMatches.forEach(m => {
      if (!duplicates.find(d => d.id === m.id)) {
        duplicates.push({ ...m, matchOn: "email" });
      }
    });
  }

  // Search by SSN last 4
  if (ssn && ssn.length >= 4) {
    const ssnSearch = ssn.slice(-4); // Use last 4 digits
    const ssnMatches = await db.select({
      id: leads.id,
      refNumber: leads.refNumber,
      firstName: leads.firstName,
      lastName: leads.lastName,
      phone: leads.phone,
      email: leads.email,
    }).from(leads)
      .where(and(
        eq(leads.ssnLast4, ssnSearch),
        excludeId ? ne(leads.id, parseInt(excludeId)) : undefined,
      ) as any)
      .limit(3);

    ssnMatches.forEach(m => {
      if (!duplicates.find(d => d.id === m.id)) {
        duplicates.push({ ...m, matchOn: "ssn" });
      }
    });
  }

  return NextResponse.json({ duplicates, count: duplicates.length });
}
