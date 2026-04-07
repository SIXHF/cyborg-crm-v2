import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadVehicles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET — list vehicles for a lead
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(leadVehicles).where(eq(leadVehicles.leadId, parseInt(id))).orderBy(leadVehicles.sortOrder);
  return NextResponse.json(rows);
}

// POST — add a new vehicle to a lead
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();

  const [vehicle] = await db.insert(leadVehicles).values({
    leadId,
    year: body.year || null,
    make: body.make || null,
    model: body.model || null,
    color: body.color || null,
    vin: body.vin || null,
    sortOrder: body.sortOrder || 0,
  }).returning();

  await audit(user.id, user.username, "add_vehicle", "lead", leadId, `Added vehicle to lead ${leadId}`);
  return NextResponse.json({ success: true, vehicle });
}

// PATCH — update an existing vehicle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();
  const vehicleId = body.vehicleId;

  if (!vehicleId) return NextResponse.json({ error: "vehicleId required" }, { status: 400 });

  const updates: Record<string, any> = {};
  const fields = ["year", "make", "model", "color", "vin", "sortOrder"];
  for (const f of fields) {
    if (f in body) updates[f] = body[f] || null;
  }

  await db.update(leadVehicles).set(updates).where(and(eq(leadVehicles.id, vehicleId), eq(leadVehicles.leadId, leadId)));
  await audit(user.id, user.username, "edit_vehicle", "lead", leadId, `Updated vehicle ${vehicleId} on lead ${leadId}`);
  return NextResponse.json({ success: true });
}

// DELETE — remove a vehicle
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { vehicleId } = await req.json();

  if (!vehicleId) return NextResponse.json({ error: "vehicleId required" }, { status: 400 });

  await db.delete(leadVehicles).where(and(eq(leadVehicles.id, vehicleId), eq(leadVehicles.leadId, leadId)));
  await audit(user.id, user.username, "delete_vehicle", "lead", leadId, `Deleted vehicle ${vehicleId} from lead ${leadId}`);
  return NextResponse.json({ success: true });
}
