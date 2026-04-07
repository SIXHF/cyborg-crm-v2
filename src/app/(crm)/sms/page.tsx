import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { smsLog, leads } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { desc, eq, sql } from "drizzle-orm";
import { MessageSquare } from "lucide-react";
import { formatPhone } from "@/lib/utils";
import { SmsClient } from "./sms-client";

export const dynamic = "force-dynamic";

export default async function SmsPage() {
  const user = await requireAuth();

  // Get all conversations grouped by phone number
  const conversations = await db
    .select({
      phone: smsLog.phone,
      lastMessage: sql<string>`(array_agg(${smsLog.message} ORDER BY ${smsLog.createdAt} DESC))[1]`,
      lastDirection: sql<string>`(array_agg(${smsLog.direction} ORDER BY ${smsLog.createdAt} DESC))[1]`,
      lastStatus: sql<string>`(array_agg(${smsLog.status} ORDER BY ${smsLog.createdAt} DESC))[1]`,
      lastAt: sql<string>`max(${smsLog.createdAt})`,
      messageCount: sql<number>`count(*)::int`,
      leadId: sql<number | null>`(array_agg(${smsLog.leadId} ORDER BY ${smsLog.createdAt} DESC))[1]`,
    })
    .from(smsLog)
    .groupBy(smsLog.phone)
    .orderBy(sql`max(${smsLog.createdAt}) DESC`)
    .limit(200);

  // Get lead names for conversations that have a leadId
  const leadIds = conversations.map((c) => c.leadId).filter(Boolean) as number[];
  let leadsMap: Record<number, { firstName: string | null; lastName: string | null }> = {};
  if (leadIds.length > 0) {
    const leadRows = await db
      .select({ id: leads.id, firstName: leads.firstName, lastName: leads.lastName })
      .from(leads)
      .where(sql`${leads.id} IN ${leadIds}`);
    leadRows.forEach((l) => {
      leadsMap[l.id] = { firstName: l.firstName, lastName: l.lastName };
    });
  }

  // Get all messages for the conversation view
  const allMessages = await db
    .select({
      id: smsLog.id,
      phone: smsLog.phone,
      message: smsLog.message,
      direction: smsLog.direction,
      status: smsLog.status,
      provider: smsLog.provider,
      leadId: smsLog.leadId,
      createdAt: smsLog.createdAt,
    })
    .from(smsLog)
    .orderBy(desc(smsLog.createdAt))
    .limit(2000);

  // Get all leads for the send dialog
  const allLeads = await db
    .select({ id: leads.id, firstName: leads.firstName, lastName: leads.lastName, phone: leads.phone })
    .from(leads)
    .orderBy(desc(leads.createdAt))
    .limit(500);

  const conversationsData = conversations.map((c) => {
    const lead = c.leadId ? leadsMap[c.leadId] : null;
    return {
      phone: c.phone,
      lastMessage: c.lastMessage,
      lastDirection: c.lastDirection,
      lastStatus: c.lastStatus,
      lastAt: c.lastAt,
      messageCount: c.messageCount,
      leadId: c.leadId,
      leadName: lead ? `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() : null,
    };
  });

  const messagesData = allMessages.map((m) => ({
    id: m.id,
    phone: m.phone,
    message: m.message,
    direction: m.direction,
    status: m.status,
    provider: m.provider,
    leadId: m.leadId,
    createdAt: new Date(m.createdAt).toISOString(),
  }));

  const leadsData = allLeads.map((l) => ({
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    phone: l.phone,
  }));

  return (
    <>
      <Topbar title="SMS Messages" user={user} />
      <SmsClient
        conversations={conversationsData}
        allMessages={messagesData}
        leads={leadsData}
      />
    </>
  );
}
