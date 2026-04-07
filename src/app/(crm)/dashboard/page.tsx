import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, users, auditLog } from "@/lib/db/schema";
import { sql, eq, and, gte, desc } from "drizzle-orm";
import { Topbar } from "@/components/topbar";
import { Users, UserCheck, UserX, Clock, TrendingUp, Activity, BarChart3, PieChart } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const statusColorMap: Record<string, string> = {
  new: "bg-green-500",
  in_review: "bg-blue-500",
  approved: "bg-emerald-500",
  declined: "bg-red-500",
  forwarded: "bg-purple-500",
  on_hold: "bg-yellow-500",
};

const statusLabelMap: Record<string, string> = {
  new: "New",
  in_review: "In Review",
  approved: "Approved",
  declined: "Declined",
  forwarded: "Forwarded",
  on_hold: "On Hold",
};

async function getStats() {
  const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(leads);
  const total = totalResult.count;

  const statusCounts = await db
    .select({
      status: leads.status,
      count: sql<number>`count(*)`,
    })
    .from(leads)
    .groupBy(leads.status);

  const statusMap: Record<string, number> = {};
  statusCounts.forEach((r) => { statusMap[r.status] = r.count; });

  // Today's leads
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [todayResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(gte(leads.createdAt, todayStart));

  // This week
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const [weekResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(gte(leads.createdAt, weekStart));

  return {
    total,
    statusMap,
    today: todayResult.count,
    thisWeek: weekResult.count,
  };
}

async function getTrendData() {
  const rows = await db.execute(
    sql`SELECT DATE(created_at) as day, COUNT(*)::int as cnt FROM leads WHERE created_at >= NOW() - INTERVAL '14 days' GROUP BY DATE(created_at) ORDER BY day`
  );

  // Build a 14-day array with zeros for missing days
  const dayMap = new Map<string, number>();
  for (const row of rows as any[]) {
    const dayStr = typeof row.day === "string" ? row.day : new Date(row.day).toISOString().slice(0, 10);
    dayMap.set(dayStr, Number(row.cnt));
  }

  const days: { day: string; label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const label = `${months[d.getMonth()]} ${d.getDate()}`;
    days.push({ day: key, label, count: dayMap.get(key) || 0 });
  }

  return days;
}

async function getRecentActivity() {
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      username: auditLog.username,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      details: auditLog.details,
      ipAddress: auditLog.ipAddress,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(15);

  return rows;
}

export default async function DashboardPage() {
  const user = await requireAuth();
  const [stats, trendData, recentActivity] = await Promise.all([
    getStats(),
    getTrendData(),
    user.role === "admin" ? getRecentActivity() : Promise.resolve([]),
  ]);

  const cards = [
    { label: "Total Leads", value: stats.total.toLocaleString(), icon: Users, color: "text-blue-500" },
    { label: "New", value: (stats.statusMap.new || 0).toLocaleString(), icon: UserCheck, color: "text-green-500" },
    { label: "Declined", value: (stats.statusMap.declined || 0).toLocaleString(), icon: UserX, color: "text-red-500" },
    { label: "On Hold", value: (stats.statusMap.on_hold || 0).toLocaleString(), icon: Clock, color: "text-yellow-500" },
    { label: "Today", value: stats.today.toLocaleString(), icon: TrendingUp, color: "text-purple-500" },
    { label: "This Week", value: stats.thisWeek.toLocaleString(), icon: Activity, color: "text-cyan-500" },
  ];

  const maxTrend = Math.max(...trendData.map((d) => d.count), 1);

  // Status breakdown for colored bars
  const allStatuses = ["new", "in_review", "approved", "declined", "forwarded", "on_hold"];
  const statusBreakdown = allStatuses.map((s) => ({
    status: s,
    label: statusLabelMap[s] || s,
    count: stats.statusMap[s] || 0,
    color: statusColorMap[s] || "bg-gray-500",
    pct: stats.total > 0 ? ((stats.statusMap[s] || 0) / stats.total) * 100 : 0,
  }));

  return (
    <>
      <Topbar title="Dashboard" user={user} />
      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {cards.map((card) => (
            <div key={card.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`w-4 h-4 ${card.color}`} />
                <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              </div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 14-Day Trend Chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Leads Created (Last 14 Days)</h3>
            </div>
            <div className="flex items-end gap-1 h-40">
              {trendData.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {d.count}
                  </span>
                  <div
                    className="w-full bg-primary/80 rounded-t hover:bg-primary transition-colors min-h-[2px]"
                    style={{ height: `${Math.max((d.count / maxTrend) * 100, 2)}%` }}
                    title={`${d.label}: ${d.count} leads`}
                  />
                  <span className="text-[9px] text-muted-foreground leading-tight text-center hidden md:block">
                    {d.label.split(" ")[1]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Lead Status Breakdown</h3>
            </div>
            <div className="space-y-3">
              {statusBreakdown.map((s) => (
                <div key={s.status}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-medium">{s.count} ({s.pct.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={`${s.color} h-2 rounded-full transition-all`}
                      style={{ width: `${Math.max(s.pct, 0.5)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/leads/new"
            className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors group"
          >
            <UserCheck className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold mb-1">Add New Lead</h3>
            <p className="text-sm text-muted-foreground">Create a new lead manually</p>
          </Link>
          <Link
            href="/leads/import"
            className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors group"
          >
            <TrendingUp className="w-8 h-8 text-green-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold mb-1">Bulk Import</h3>
            <p className="text-sm text-muted-foreground">Upload CSV, XLSX, or ZIP files</p>
          </Link>
          <Link
            href="/leads"
            className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors group"
          >
            <Users className="w-8 h-8 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold mb-1">View All Leads</h3>
            <p className="text-sm text-muted-foreground">Search and manage leads</p>
          </Link>
        </div>

        {/* Activity Log (Admin only) */}
        {user.role === "admin" && recentActivity.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Recent Activity</h3>
            </div>
            <div className="divide-y divide-border">
              {recentActivity.map((entry) => (
                <div key={entry.id} className="py-2.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{entry.username || "System"}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-muted rounded font-mono">{entry.action}</span>
                      {entry.entityType && (
                        <span className="text-xs text-muted-foreground">
                          {entry.entityType}
                          {entry.entityId ? ` #${entry.entityId}` : ""}
                        </span>
                      )}
                    </div>
                    {entry.details && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.details}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                    {entry.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
