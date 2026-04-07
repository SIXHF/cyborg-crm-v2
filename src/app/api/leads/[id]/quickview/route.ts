import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, leadCards, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET — quick preview of a lead (for modal/popup)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get first card
  const [card] = await db.select().from(leadCards).where(eq(leadCards.leadId, leadId)).limit(1);

  // Get agent name
  let agentName = null;
  if (lead.agentId) {
    const [agent] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, lead.agentId));
    agentName = agent?.fullName;
  }

  return NextResponse.json({
    id: lead.id,
    refNumber: lead.refNumber,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    status: lead.status,
    state: lead.state,
    city: lead.city,
    zip: lead.zip,
    cardBrand: lead.cardBrand || card?.cardType,
    cardIssuer: lead.cardIssuer || card?.bank,
    leadScore: lead.leadScore,
    agentName,
    createdAt: lead.createdAt,
  });
}
