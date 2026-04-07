import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, customFields } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { Topbar } from "@/components/topbar";
import { LeadFormClient } from "../lead-form-client";

export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  const user = await requireAuth();

  const agents = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(eq(users.isActive, true));

  const fields = await db
    .select()
    .from(customFields)
    .where(eq(customFields.isActive, true))
    .orderBy(customFields.sortOrder);

  return (
    <>
      <Topbar title="Add New Lead" user={user} />
      <LeadFormClient agents={agents} customFields={fields} currentUser={user} />
    </>
  );
}
