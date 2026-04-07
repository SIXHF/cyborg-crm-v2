import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadCosigners } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET — list cosigners for a lead
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(leadCosigners).where(eq(leadCosigners.leadId, parseInt(id))).orderBy(leadCosigners.sortOrder);
  return NextResponse.json(rows);
}

// POST — add a new cosigner to a lead
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();

  const [cosigner] = await db.insert(leadCosigners).values({
    leadId,
    fullName: body.fullName || null,
    dob: body.dob || null,
    phone: body.phone || null,
    email: body.email || null,
    ssn: body.ssn || null,
    address: body.address || null,
    sortOrder: body.sortOrder || 0,
  }).returning();

  await audit(user.id, user.username, "add_cosigner", "lead", leadId, `Added cosigner to lead ${leadId}`);
  return NextResponse.json({ success: true, cosigner });
}

// PATCH — update an existing cosigner
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();
  const cosignerId = body.cosignerId;

  if (!cosignerId) return NextResponse.json({ error: "cosignerId required" }, { status: 400 });

  const updates: Record<string, any> = {};
  const fields = ["fullName", "dob", "phone", "email", "ssn", "address", "sortOrder"];
  for (const f of fields) {
    if (f in body) updates[f] = body[f] || null;
  }

  await db.update(leadCosigners).set(updates).where(and(eq(leadCosigners.id, cosignerId), eq(leadCosigners.leadId, leadId)));
  await audit(user.id, user.username, "edit_cosigner", "lead", leadId, `Updated cosigner ${cosignerId} on lead ${leadId}`);
  return NextResponse.json({ success: true });
}

// DELETE — remove a cosigner
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { cosignerId } = await req.json();

  if (!cosignerId) return NextResponse.json({ error: "cosignerId required" }, { status: 400 });

  await db.delete(leadCosigners).where(and(eq(leadCosigners.id, cosignerId), eq(leadCosigners.leadId, leadId)));
  await audit(user.id, user.username, "delete_cosigner", "lead", leadId, `Deleted cosigner ${cosignerId} from lead ${leadId}`);
  return NextResponse.json({ success: true });
}
