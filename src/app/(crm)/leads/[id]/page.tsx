import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  leads, leadCards, leadComments, leadAttachments, leadFollowups,
  leadCosigners, leadEmployers, leadVehicles, leadRelatives,
  leadAddresses, leadEmails, leadLicenses, leadViews, users, callLog,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { LeadDetailClient } from "./lead-detail-client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: Props) {
  const user = await requireAuth();
  const { id } = await params;
  const leadId = parseInt(id);
  if (isNaN(leadId)) notFound();

  // Fetch lead with all related data in parallel
  const [
    [lead],
    cards,
    comments,
    attachments,
    followups,
    cosigners,
    employers,
    vehicles,
    relatives,
    addresses,
    emails,
    licenses,
    calls,
  ] = await Promise.all([
    db.select().from(leads).where(eq(leads.id, leadId)).limit(1),
    db.select().from(leadCards).where(eq(leadCards.leadId, leadId)).orderBy(leadCards.sortOrder),
    db.select({
      id: leadComments.id,
      body: leadComments.body,
      isPrivate: leadComments.isPrivate,
      createdAt: leadComments.createdAt,
      userName: users.fullName,
      userRole: users.role,
    }).from(leadComments)
      .leftJoin(users, eq(leadComments.userId, users.id))
      .where(eq(leadComments.leadId, leadId))
      .orderBy(desc(leadComments.createdAt)),
    db.select().from(leadAttachments).where(eq(leadAttachments.leadId, leadId)),
    db.select().from(leadFollowups).where(eq(leadFollowups.leadId, leadId)).orderBy(desc(leadFollowups.dueAt)),
    db.select().from(leadCosigners).where(eq(leadCosigners.leadId, leadId)),
    db.select().from(leadEmployers).where(eq(leadEmployers.leadId, leadId)),
    db.select().from(leadVehicles).where(eq(leadVehicles.leadId, leadId)),
    db.select().from(leadRelatives).where(eq(leadRelatives.leadId, leadId)),
    db.select().from(leadAddresses).where(eq(leadAddresses.leadId, leadId)),
    db.select().from(leadEmails).where(eq(leadEmails.leadId, leadId)),
    db.select().from(leadLicenses).where(eq(leadLicenses.leadId, leadId)),
    db.select({
      id: callLog.id,
      outcome: callLog.outcome,
      notes: callLog.notes,
      callDuration: callLog.callDuration,
      createdAt: callLog.createdAt,
      agentName: users.fullName,
    }).from(callLog)
      .leftJoin(users, eq(callLog.agentId, users.id))
      .where(eq(callLog.leadId, leadId))
      .orderBy(desc(callLog.createdAt))
      .limit(20),
  ]);

  if (!lead) notFound();

  // Record view (safe - ignores duplicates)
  try { await db.insert(leadViews).values({ leadId, userId: user.id }); } catch {}

  // Get agent info
  let agentName = null;
  if (lead.agentId) {
    const [agent] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, lead.agentId));
    agentName = agent?.fullName;
  }

  // Serialize dates
  const serialized = {
    lead: { ...lead, createdAt: lead.createdAt.toISOString(), updatedAt: lead.updatedAt.toISOString() },
    cards: cards.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    comments: comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    attachments: attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    followups: followups.map((f) => ({ ...f, dueAt: f.dueAt.toISOString(), createdAt: f.createdAt.toISOString(), completedAt: f.completedAt?.toISOString() || null })),
    cosigners, employers, vehicles, relatives, addresses, emails, licenses,
    calls: calls.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    agentName,
  };

  return (
    <>
      <Topbar title={`${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.refNumber} user={user} />
      <LeadDetailClient data={serialized} currentUser={user} />
    </>
  );
}
