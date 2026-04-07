import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, importJobs, users } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";
import { Topbar } from "@/components/topbar";
import { DataManagerClient } from "./data-manager-client";

export const dynamic = "force-dynamic";

export default async function DataManagerPage() {
  const user = await requireAuth(["admin"]);

  // Stats
  const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(leads);
  const statusCounts = await db
    .select({ status: leads.status, count: sql<number>`count(*)` })
    .from(leads)
    .groupBy(leads.status);

  const statusMap: Record<string, number> = {};
  statusCounts.forEach((r) => { statusMap[r.status] = r.count; });

  // Import batches
  const batches = await db
    .select({
      importRef: leads.importRef,
      count: sql<number>`count(*)`,
    })
    .from(leads)
    .where(sql`${leads.importRef} IS NOT NULL AND ${leads.importRef} != ''`)
    .groupBy(leads.importRef)
    .orderBy(sql`count(*) DESC`)
    .limit(15);

  // Duplicate phone count
  const [dupResult] = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM (
      SELECT phone FROM leads WHERE phone IS NOT NULL AND phone != '' GROUP BY phone HAVING COUNT(*) > 1
    ) t
  `);

  // Agents list for delete-by-agent
  const agentsList = await db
    .select({ id: users.id, fullName: users.fullName, username: users.username })
    .from(users)
    .orderBy(users.fullName);

  return (
    <>
      <Topbar title="Data Manager" user={user} />
      <DataManagerClient
        total={totalResult.count}
        statusMap={statusMap}
        batches={batches.map((b) => ({ ref: b.importRef!, count: b.count }))}
        duplicates={(dupResult as any)?.cnt || 0}
        agents={agentsList}
      />
    </>
  );
}
