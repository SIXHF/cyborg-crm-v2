import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadEmails } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET — list emails for a lead
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(leadEmails).where(eq(leadEmails.leadId, parseInt(id))).orderBy(leadEmails.createdAt);
  return NextResponse.json(rows);
}

// POST — add a new email to a lead
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();

  const [email] = await db.insert(leadEmails).values({
    leadId,
    email: body.email,
    label: body.label || null,
  }).returning();

  await audit(user.id, user.username, "add_email", "lead", leadId, `Added email to lead ${leadId}`);
  return NextResponse.json({ success: true, email });
}

// PATCH — update an existing email
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();
  const emailId = body.emailId;

  if (!emailId) return NextResponse.json({ error: "emailId required" }, { status: 400 });

  const updates: Record<string, any> = {};
  const fields = ["email", "label"];
  for (const f of fields) {
    if (f in body) updates[f] = body[f] || null;
  }

  await db.update(leadEmails).set(updates).where(and(eq(leadEmails.id, emailId), eq(leadEmails.leadId, leadId)));
  await audit(user.id, user.username, "edit_email", "lead", leadId, `Updated email ${emailId} on lead ${leadId}`);
  return NextResponse.json({ success: true });
}

// DELETE — remove an email
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { emailId } = await req.json();

  if (!emailId) return NextResponse.json({ error: "emailId required" }, { status: 400 });

  await db.delete(leadEmails).where(and(eq(leadEmails.id, emailId), eq(leadEmails.leadId, leadId)));
  await audit(user.id, user.username, "delete_email", "lead", leadId, `Deleted email ${emailId} from lead ${leadId}`);
  return NextResponse.json({ success: true });
}
