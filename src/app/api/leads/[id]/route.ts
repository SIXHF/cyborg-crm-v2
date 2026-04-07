import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, leadCards, leadCosigners, leadEmployers, leadVehicles, leadRelatives, leadAddresses, leadEmails, leadLicenses, leadComments, leadAttachments, leadFollowups, leadViews, callQueue, callLog, collabEvents } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

// GET /api/leads/[id] — fetch single lead
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [lead] = await db.select().from(leads).where(eq(leads.id, parseInt(id))).limit(1);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(lead);
}

// PATCH /api/leads/[id] — update lead fields
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();

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

  if (updates.phone) updates.phone = updates.phone.replace(/\D/g, "");
  if (updates.landline) updates.landline = updates.landline.replace(/\D/g, "");
  if (updates.agentId) updates.agentId = parseInt(updates.agentId);
  if (updates.assignedTo) updates.assignedTo = parseInt(updates.assignedTo);

  await db.update(leads).set(updates).where(eq(leads.id, leadId));
  await audit(user.id, user.username, "edit_lead", "lead", leadId, `Updated: ${Object.keys(updates).join(", ")}`);

  return NextResponse.json({ success: true, id: leadId });
}

// DELETE /api/leads/[id] — delete lead and all related records
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || (user.role !== "admin" && user.role !== "processor")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const leadId = parseInt(id);

  // Delete from child tables first
  const childTables = [leadCards, leadCosigners, leadEmployers, leadVehicles, leadRelatives, leadAddresses, leadEmails, leadLicenses, leadComments, leadAttachments, leadFollowups, leadViews, callQueue, callLog, collabEvents];
  for (const table of childTables) {
    try { await db.delete(table).where(eq((table as any).leadId, leadId)); } catch {}
  }
  await db.delete(leads).where(eq(leads.id, leadId));
  await audit(user.id, user.username, "delete_lead", "lead", leadId, "Deleted lead");

  return NextResponse.json({ success: true });
}
