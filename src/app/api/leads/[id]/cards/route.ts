import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadCards } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET — list cards for a lead
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const cards = await db.select().from(leadCards).where(eq(leadCards.leadId, parseInt(id))).orderBy(leadCards.sortOrder);
  return NextResponse.json(cards);
}

// POST — add a new card to a lead
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();

  const [card] = await db.insert(leadCards).values({
    leadId,
    bank: body.bank || null,
    cardType: body.cardType || null,
    noc: body.noc || null,
    ccn: body.ccn || null,
    cvc: body.cvc || null,
    expDate: body.expDate || null,
    creditLimit: body.creditLimit || null,
    balance: body.balance || null,
    available: body.available || null,
    lastPayment: body.lastPayment || null,
    lastPayDate: body.lastPayDate || null,
    lastPayFrom: body.lastPayFrom || null,
    lastCharge: body.lastCharge || null,
    transactions: body.transactions || null,
    sortOrder: body.sortOrder || 0,
  }).returning();

  await audit(user.id, user.username, "add_card", "lead", leadId, `Added card to lead ${leadId}`);
  return NextResponse.json({ success: true, card });
}

// PATCH — update an existing card
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const body = await req.json();
  const cardId = body.cardId;

  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  const updates: Record<string, any> = {};
  const fields = ["bank", "cardType", "noc", "ccn", "cvc", "expDate", "creditLimit", "balance", "available", "lastPayment", "lastPayDate", "lastPayFrom", "lastCharge", "transactions", "sortOrder"];
  for (const f of fields) {
    if (f in body) updates[f] = body[f] || null;
  }

  await db.update(leadCards).set(updates).where(and(eq(leadCards.id, cardId), eq(leadCards.leadId, leadId)));
  await audit(user.id, user.username, "edit_card", "lead", leadId, `Updated card ${cardId} on lead ${leadId}`);
  return NextResponse.json({ success: true });
}

// DELETE — remove a card
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { cardId } = await req.json();

  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  await db.delete(leadCards).where(and(eq(leadCards.id, cardId), eq(leadCards.leadId, leadId)));
  await audit(user.id, user.username, "delete_card", "lead", leadId, `Deleted card ${cardId} from lead ${leadId}`);
  return NextResponse.json({ success: true });
}
