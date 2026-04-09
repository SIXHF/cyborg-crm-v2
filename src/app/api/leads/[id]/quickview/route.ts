import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, leadCards, users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// GET — quick preview of a lead (for modal/popup)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  if (isNaN(leadId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Single query with JOINs (was 3 separate queries — N+1 pattern)
  const [result] = await db
    .select({
      id: leads.id,
      refNumber: leads.refNumber,
      firstName: leads.firstName,
      lastName: leads.lastName,
      email: leads.email,
      phone: leads.phone,
      status: leads.status,
      state: leads.state,
      city: leads.city,
      zip: leads.zip,
      cardBrand: leads.cardBrand,
      cardIssuer: leads.cardIssuer,
      leadScore: leads.leadScore,
      createdAt: leads.createdAt,
      agentName: users.fullName,
    })
    .from(leads)
    .leftJoin(users, eq(leads.agentId, users.id))
    .where(eq(leads.id, leadId))
    .limit(1);

  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get first card only if lead doesn't have brand/issuer
  let cardBrand = result.cardBrand;
  let cardIssuer = result.cardIssuer;
  if (!cardBrand || !cardIssuer) {
    const [card] = await db.select({ cardType: leadCards.cardType, bank: leadCards.bank })
      .from(leadCards).where(eq(leadCards.leadId, leadId)).limit(1);
    if (card) {
      if (!cardBrand) cardBrand = card.cardType;
      if (!cardIssuer) cardIssuer = card.bank;
    }
  }

  return NextResponse.json({
    ...result,
    cardBrand,
    cardIssuer,
  });
}
