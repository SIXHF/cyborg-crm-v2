import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadAddresses } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET — list addresses for a lead
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(leadAddresses).where(eq(leadAddresses.leadId, parseInt(id))).orderBy(leadAddresses.sortOrder);
  return NextResponse.json(rows);
}

// POST — add a new address to a lead
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();

  const [address] = await db.insert(leadAddresses).values({
    leadId,
    address: body.address || null,
    city: body.city || null,
    state: body.state || null,
    zip: body.zip || null,
    yearFrom: body.yearFrom || null,
    yearTo: body.yearTo || null,
    isCurrent: body.isCurrent || false,
    sortOrder: body.sortOrder || 0,
  }).returning();

  await audit(user.id, user.username, "add_address", "lead", leadId, `Added address to lead ${leadId}`);
  return NextResponse.json({ success: true, address });
}

// PATCH — update an existing address
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();
  const addressId = body.addressId;

  if (!addressId) return NextResponse.json({ error: "addressId required" }, { status: 400 });

  const updates: Record<string, any> = {};
  const fields = ["address", "city", "state", "zip", "yearFrom", "yearTo", "isCurrent", "sortOrder"];
  for (const f of fields) {
    if (f in body) updates[f] = body[f] || null;
  }

  await db.update(leadAddresses).set(updates).where(and(eq(leadAddresses.id, addressId), eq(leadAddresses.leadId, leadId)));
  await audit(user.id, user.username, "edit_address", "lead", leadId, `Updated address ${addressId} on lead ${leadId}`);
  return NextResponse.json({ success: true });
}

// DELETE — remove an address
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { addressId } = await req.json();

  if (!addressId) return NextResponse.json({ error: "addressId required" }, { status: 400 });

  await db.delete(leadAddresses).where(and(eq(leadAddresses.id, addressId), eq(leadAddresses.leadId, leadId)));
  await audit(user.id, user.username, "delete_address", "lead", leadId, `Deleted address ${addressId} from lead ${leadId}`);
  return NextResponse.json({ success: true });
}
