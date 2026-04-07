import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { desc, eq, ilike, and, sql, gte, lte } from "drizzle-orm";
import { Topbar } from "@/components/topbar";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    action?: string;
    user?: string;
    search?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function AuditPage({ searchParams }: Props) {
  const currentUser = await requireAuth(["admin"]);
  const params = await searchParams;

  // Build where conditions
  const conditions: any[] = [];
  if (params.action) conditions.push(eq(auditLog.action, params.action));
  if (params.user) conditions.push(eq(auditLog.username, params.user));
  if (params.search) conditions.push(ilike(auditLog.details, `%${params.search}%`));
  if (params.from) conditions.push(gte(auditLog.createdAt, new Date(params.from)));
  if (params.to) { const to = new Date(params.to); to.setHours(23,59,59); conditions.push(lte(auditLog.createdAt, to)); }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const logs = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(500);

  // Get distinct actions and usernames for filter dropdowns
  const distinctActions = await db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog)
    .orderBy(auditLog.action)
    .limit(50);

  const distinctUsers = await db
    .selectDistinct({ username: auditLog.username })
    .from(auditLog)
    .where(sql`${auditLog.username} IS NOT NULL`)
    .orderBy(auditLog.username)
    .limit(50);

  const actionColors: Record<string, string> = {
    login: "bg-green-500/10 text-green-500",
    logout: "bg-gray-500/10 text-gray-500",
    login_failed: "bg-red-500/10 text-red-500",
    create_lead: "bg-blue-500/10 text-blue-500",
    edit_lead: "bg-yellow-500/10 text-yellow-500",
    delete_lead: "bg-red-500/10 text-red-500",
    bulk_import: "bg-purple-500/10 text-purple-500",
    send_sms: "bg-cyan-500/10 text-cyan-500",
    data_manager: "bg-orange-500/10 text-orange-500",
    create_user: "bg-blue-500/10 text-blue-500",
    call_logged: "bg-green-500/10 text-green-500",
  };

  return (
    <>
      <Topbar title="Audit Log" user={currentUser} />
      <div className="p-6 space-y-4">
        {/* Filters */}
        <form className="flex flex-wrap gap-3 bg-card border border-border rounded-xl p-4">
          <input
            name="search"
            defaultValue={params.search || ""}
            placeholder="Search details..."
            className="h-9 px-3 bg-muted border border-border rounded-lg text-sm flex-1 min-w-[200px]"
          />
          <select name="action" defaultValue={params.action || ""} className="h-9 px-3 bg-muted border border-border rounded-lg text-sm">
            <option value="">All Actions</option>
            {distinctActions.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}
          </select>
          <select name="user" defaultValue={params.user || ""} className="h-9 px-3 bg-muted border border-border rounded-lg text-sm">
            <option value="">All Users</option>
            {distinctUsers.map((u) => <option key={u.username} value={u.username!}>{u.username}</option>)}
          </select>
          <input name="from" type="date" defaultValue={params.from || ""} className="h-9 px-3 bg-muted border border-border rounded-lg text-sm" />
          <input name="to" type="date" defaultValue={params.to || ""} className="h-9 px-3 bg-muted border border-border rounded-lg text-sm" />
          <button type="submit" className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium">Filter</button>
          {Object.values(params).some(v => v) && (
            <a href="/admin/audit" className="h-9 px-3 flex items-center text-sm text-destructive hover:bg-destructive/10 rounded-lg">Clear</a>
          )}
        </form>

        <p className="text-sm text-muted-foreground">{logs.length} entries</p>

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
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No audit entries found</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{log.username || "System"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColors[log.action] || "bg-muted text-muted-foreground"}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {log.entityType && `${log.entityType}${log.entityId ? ` #${log.entityId}` : ""}`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[300px] truncate">{log.details}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{log.ipAddress}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{timeAgo(log.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
