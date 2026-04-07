import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadLicenses } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET — list licenses for a lead
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(leadLicenses).where(eq(leadLicenses.leadId, parseInt(id))).orderBy(leadLicenses.createdAt);
  return NextResponse.json(rows);
}

// POST — add a new license to a lead
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();

  const [license] = await db.insert(leadLicenses).values({
    leadId,
    dlNumber: body.dlNumber || null,
    dlState: body.dlState || null,
    dlExpiry: body.dlExpiry || null,
    dlIssued: body.dlIssued || null,
    eyeColor: body.eyeColor || null,
    hairColor: body.hairColor || null,
    height: body.height || null,
  }).returning();

  await audit(user.id, user.username, "add_license", "lead", leadId, `Added license to lead ${leadId}`);
  return NextResponse.json({ success: true, license });
}

// PATCH — update an existing license
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();
  const licenseId = body.licenseId;

  if (!licenseId) return NextResponse.json({ error: "licenseId required" }, { status: 400 });

  const updates: Record<string, any> = {};
  const fields = ["dlNumber", "dlState", "dlExpiry", "dlIssued", "eyeColor", "hairColor", "height"];
  for (const f of fields) {
    if (f in body) updates[f] = body[f] || null;
  }

  await db.update(leadLicenses).set(updates).where(and(eq(leadLicenses.id, licenseId), eq(leadLicenses.leadId, leadId)));
  await audit(user.id, user.username, "edit_license", "lead", leadId, `Updated license ${licenseId} on lead ${leadId}`);
  return NextResponse.json({ success: true });
}

// DELETE — remove a license
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { licenseId } = await req.json();

  if (!licenseId) return NextResponse.json({ error: "licenseId required" }, { status: 400 });

  await db.delete(leadLicenses).where(and(eq(leadLicenses.id, licenseId), eq(leadLicenses.leadId, leadId)));
  await audit(user.id, user.username, "delete_license", "lead", leadId, `Deleted license ${licenseId} from lead ${leadId}`);
  return NextResponse.json({ success: true });
}
