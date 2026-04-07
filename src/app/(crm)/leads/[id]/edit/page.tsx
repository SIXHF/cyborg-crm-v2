import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, users, customFields } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { LeadFormClient } from "../../lead-form-client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditLeadPage({ params }: Props) {
  const user = await requireAuth();
  const { id } = await params;
  const leadId = parseInt(id);
  if (isNaN(leadId)) notFound();

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) notFound();

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
      <Topbar title={`Edit: ${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.refNumber} user={user} />
      <LeadFormClient
        agents={agents}
        customFields={fields}
        currentUser={user}
        initialData={{
          ...lead,
          id: lead.id,
          dob: lead.dob || "",
          annualIncome: lead.annualIncome?.toString() || "",
          requestedLimit: lead.requestedLimit?.toString() || "",
          mortgagePayment: lead.mortgagePayment?.toString() || "",
        }}
      />
    </>
  );
}
