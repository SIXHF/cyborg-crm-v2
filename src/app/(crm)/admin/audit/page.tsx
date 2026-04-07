import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { Topbar } from "@/components/topbar";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const user = await requireAuth(["admin"]);

  const logs = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  return (
    <>
      <Topbar title="Audit Log" user={user} />
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Entity</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Details</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border">
                  <td className="px-4 py-3 font-medium">{log.username || "System"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{log.action}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {log.entityType && `${log.entityType}${log.entityId ? ` #${log.entityId}` : ""}`}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[300px] truncate">
                    {log.details}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{log.ipAddress}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {timeAgo(log.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
