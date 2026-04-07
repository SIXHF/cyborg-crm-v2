import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();

  // Build update object from allowed fields
  const allowedFields = [
    "firstName", "lastName", "email", "phone", "landline", "dob", "ssnLast4",
    "mmn", "county", "vpass", "address", "city", "state", "zip", "country",
    "annualIncome", "employmentStatus", "creditScoreRange", "requestedLimit",
    "cardType", "cardNumberBin", "cardBrand", "cardIssuer",
    "businessName", "businessEin", "mortgageBank", "mortgagePayment",
    "status", "agentId", "assignedTo", "notes", "processorNotes",
  ];

  const updates: any = { updatedAt: new Date() };
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field] || null;
    }
  }

  // Clean phone fields
  if (updates.phone) updates.phone = updates.phone.replace(/\D/g, "");
  if (updates.landline) updates.landline = updates.landline.replace(/\D/g, "");
  if (updates.agentId) updates.agentId = parseInt(updates.agentId);
  if (updates.assignedTo) updates.assignedTo = parseInt(updates.assignedTo);

  await db.update(leads).set(updates).where(eq(leads.id, leadId));
  await audit(user.id, user.username, "edit_lead", "lead", leadId, `Updated: ${Object.keys(updates).join(", ")}`);

  return NextResponse.json({ success: true, id: leadId });
}
