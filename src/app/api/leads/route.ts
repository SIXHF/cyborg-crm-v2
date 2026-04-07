import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { generateRef } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const [lead] = await db.insert(leads).values({
    refNumber: generateRef(),
    firstName: body.firstName || null,
    lastName: body.lastName || null,
    email: body.email || null,
    phone: body.phone?.replace(/\D/g, "") || null,
    landline: body.landline?.replace(/\D/g, "") || null,
    dob: body.dob || null,
    ssnLast4: body.ssnLast4 || null,
    mmn: body.mmn || null,
    county: body.county || null,
    vpass: body.vpass || null,
    address: body.address || null,
    city: body.city || null,
    state: body.state || null,
    zip: body.zip || null,
    country: body.country || null,
    annualIncome: body.annualIncome || null,
    employmentStatus: body.employmentStatus || null,
    creditScoreRange: body.creditScoreRange || null,
    requestedLimit: body.requestedLimit || null,
    cardType: body.cardType || null,
    cardNumberBin: body.cardNumberBin || null,
    cardBrand: body.cardBrand || null,
    cardIssuer: body.cardIssuer || null,
    businessName: body.businessName || null,
    businessEin: body.businessEin || null,
    mortgageBank: body.mortgageBank || null,
    mortgagePayment: body.mortgagePayment || null,
    status: body.status || "new",
    agentId: body.agentId ? parseInt(body.agentId) : user.id,
    notes: body.notes || null,
  }).returning({ id: leads.id });

  await audit(user.id, user.username, "create_lead", "lead", lead.id, `Created lead`);

  return NextResponse.json({ success: true, id: lead.id });
}
