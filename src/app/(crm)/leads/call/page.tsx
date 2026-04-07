import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { callQueue, leads } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { Topbar } from "@/components/topbar";
import { CallQueueClient } from "./call-queue-client";

export const dynamic = "force-dynamic";

export default async function CallQueuePage() {
  const user = await requireAuth();

  const queue = await db
    .select({
      id: callQueue.id,
      leadId: callQueue.leadId,
      sortOrder: callQueue.sortOrder,
      firstName: leads.firstName,
      lastName: leads.lastName,
      phone: leads.phone,
      email: leads.email,
      status: leads.status,
      state: leads.state,
      refNumber: leads.refNumber,
      cardBrand: leads.cardBrand,
      cardIssuer: leads.cardIssuer,
    })
    .from(callQueue)
    .innerJoin(leads, eq(callQueue.leadId, leads.id))
    .where(eq(callQueue.agentId, user.id))
    .orderBy(asc(callQueue.sortOrder));

  return (
    <>
      <Topbar title="Call Queue" user={user} />
      <CallQueueClient
        initialQueue={queue}
        sipCredentials={{
          username: user.sipUsername || "",
          password: user.sipPassword || "",
          authUser: user.sipAuthUser || user.sipUsername || "",
          displayName: user.sipDisplayName || user.fullName || user.username,
        }}
        currentUser={user}
      />
    </>
  );
}
