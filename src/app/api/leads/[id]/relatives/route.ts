import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadRelatives } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET — list relatives for a lead
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(leadRelatives).where(eq(leadRelatives.leadId, parseInt(id))).orderBy(leadRelatives.sortOrder);
  return NextResponse.json(rows);
}

// POST — add a new relative to a lead
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();

  const [relative] = await db.insert(leadRelatives).values({
    leadId,
    fullName: body.fullName || null,
    relation: body.relation || null,
    dob: body.dob || null,
    phone: body.phone || null,
    sortOrder: body.sortOrder || 0,
  }).returning();

  await audit(user.id, user.username, "add_relative", "lead", leadId, `Added relative to lead ${leadId}`);
  return NextResponse.json({ success: true, relative });
}

// PATCH — update an existing relative
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();
  const relativeId = body.relativeId;

  if (!relativeId) return NextResponse.json({ error: "relativeId required" }, { status: 400 });

  const updates: Record<string, any> = {};
  const fields = ["fullName", "relation", "dob", "phone", "sortOrder"];
  for (const f of fields) {
    if (f in body) updates[f] = body[f] || null;
  }

  await db.update(leadRelatives).set(updates).where(and(eq(leadRelatives.id, relativeId), eq(leadRelatives.leadId, leadId)));
  await audit(user.id, user.username, "edit_relative", "lead", leadId, `Updated relative ${relativeId} on lead ${leadId}`);
  return NextResponse.json({ success: true });
}

// DELETE — remove a relative
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { relativeId } = await req.json();

  if (!relativeId) return NextResponse.json({ error: "relativeId required" }, { status: 400 });

  await db.delete(leadRelatives).where(and(eq(leadRelatives.id, relativeId), eq(leadRelatives.leadId, leadId)));
  await audit(user.id, user.username, "delete_relative", "lead", leadId, `Deleted relative ${relativeId} from lead ${leadId}`);
  return NextResponse.json({ success: true });
}
