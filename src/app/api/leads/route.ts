import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { generateRef } from "@/lib/utils";
import { calculateLeadScore } from "@/lib/lead-scoring";
import { z } from "zod";

const createLeadSchema = z.object({
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  landline: z.string().optional(),
  dob: z.string().optional(),
  ssnLast4: z.string().max(10).optional(),
  mmn: z.string().max(120).optional(),
  vpass: z.string().max(255).optional(),
  county: z.string().max(120).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(80).optional(),
  zip: z.string().max(20).optional(),
  country: z.string().max(80).optional(),
  annualIncome: z.string().optional(),
  employmentStatus: z.string().max(60).optional(),
  creditScoreRange: z.string().max(30).optional(),
  requestedLimit: z.string().optional(),
  cardType: z.string().max(60).optional(),
  cardNumberBin: z.string().max(8).optional(),
  cardBrand: z.string().max(30).optional(),
  cardIssuer: z.string().max(200).optional(),
  businessName: z.string().max(200).optional(),
  businessEin: z.string().max(20).optional(),
  mortgageBank: z.string().max(200).optional(),
  mortgagePayment: z.string().optional(),
  status: z.enum(["new", "in_review", "approved", "declined", "forwarded", "on_hold"]).default("new"),
  agentId: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional(),
}).passthrough(); // Allow cf_* custom fields

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await req.json();
  const parsed = createLeadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const body: any = parsed.data;

  // Clean decimal fields — values come as strings from the form
  if (body.annualIncome) body.annualIncome = body.annualIncome.toString().replace(/[^0-9.]/g, '') || null;
  if (body.mortgagePayment) body.mortgagePayment = body.mortgagePayment.toString().replace(/[^0-9.]/g, '') || null;
  if (body.requestedLimit) body.requestedLimit = body.requestedLimit.toString().replace(/[^0-9.]/g, '') || null;

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

  // Extract custom fields from body
  const customFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith("cf_")) {
      customFields[key.slice(3)] = value as string;
    }
  }

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
    customFields: Object.keys(customFields).length > 0 ? customFields : {},
  }).returning({ id: leads.id, refNumber: leads.refNumber });

  await audit(user.id, user.username, "create_lead", "lead", lead.id, `Created lead ${lead.refNumber}`);

  return NextResponse.json({ success: true, id: lead.id, refNumber: lead.refNumber, leadScore });
}
