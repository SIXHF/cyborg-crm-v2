import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadEmployers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET — list employers for a lead
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(leadEmployers).where(eq(leadEmployers.leadId, parseInt(id))).orderBy(leadEmployers.sortOrder);
  return NextResponse.json(rows);
}

// POST — add a new employer to a lead
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();

  const [employer] = await db.insert(leadEmployers).values({
    leadId,
    employer: body.employer || null,
    position: body.position || null,
    phone: body.phone || null,
    yearFrom: body.yearFrom || null,
    yearTo: body.yearTo || null,
    isCurrent: body.isCurrent || false,
    sortOrder: body.sortOrder || 0,
  }).returning();

  await audit(user.id, user.username, "add_employer", "lead", leadId, `Added employer to lead ${leadId}`);
  return NextResponse.json({ success: true, employer });
}

// PATCH — update an existing employer
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();
  const employerId = body.employerId;

  if (!employerId) return NextResponse.json({ error: "employerId required" }, { status: 400 });

  const updates: Record<string, any> = {};
  const fields = ["employer", "position", "phone", "yearFrom", "yearTo", "isCurrent", "sortOrder"];
  for (const f of fields) {
    if (f in body) updates[f] = body[f] || null;
  }

  await db.update(leadEmployers).set(updates).where(and(eq(leadEmployers.id, employerId), eq(leadEmployers.leadId, leadId)));
  await audit(user.id, user.username, "edit_employer", "lead", leadId, `Updated employer ${employerId} on lead ${leadId}`);
  return NextResponse.json({ success: true });
}

// DELETE — remove an employer
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { employerId } = await req.json();

  if (!employerId) return NextResponse.json({ error: "employerId required" }, { status: 400 });

  await db.delete(leadEmployers).where(and(eq(leadEmployers.id, employerId), eq(leadEmployers.leadId, leadId)));
  await audit(user.id, user.username, "delete_employer", "lead", leadId, `Deleted employer ${employerId} from lead ${leadId}`);
  return NextResponse.json({ success: true });
}
