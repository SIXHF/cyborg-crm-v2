import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, users, callLog } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { sql, gte, eq, desc } from "drizzle-orm";
import { BarChart3, Users, TrendingUp, PieChart, Phone, Target } from "lucide-react";

export const dynamic = "force-dynamic";

const statusColors: Record<string, string> = {
  new: "bg-green-500",
  in_review: "bg-blue-500",
  approved: "bg-emerald-500",
  declined: "bg-red-500",
  forwarded: "bg-purple-500",
  on_hold: "bg-yellow-500",
};

export default async function AnalyticsPage() {
  const user = await requireAuth(["admin"]);

  // Summary stats
  const [totalResult] = await db.select({ count: sql<number>`count(*)::int` }).from(leads);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const [weekResult] = await db.select({ count: sql<number>`count(*)::int` }).from(leads).where(gte(leads.createdAt, weekStart));
  const monthStart = new Date(); monthStart.setDate(monthStart.getDate() - 30);
  const [monthResult] = await db.select({ count: sql<number>`count(*)::int` }).from(leads).where(gte(leads.createdAt, monthStart));

  // Status breakdown
  const statusBreakdown = await db
    .select({ status: leads.status, count: sql<number>`count(*)::int` })
    .from(leads).groupBy(leads.status);

  // 14-day trend
  const trendData = await db.execute(
    sql`SELECT DATE(created_at) as day, COUNT(*)::int as cnt FROM leads WHERE created_at >= NOW() - INTERVAL '14 days' GROUP BY DATE(created_at) ORDER BY day`
  );
  const days: { day: string; count: number }[] = [];
  const dayMap = new Map<string, number>();
  for (const row of trendData as any[]) {
    const dayStr = typeof row.day === "string" ? row.day : new Date(row.day).toISOString().slice(0, 10);
    dayMap.set(dayStr, Number(row.cnt));
  }
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, count: dayMap.get(key) || 0 });
  }
  const maxDay = Math.max(...days.map(d => d.count), 1);

  // Agent performance
  const agentStats = await db
    .select({
      agentId: leads.agentId,
      agentName: users.fullName,
      total: sql<number>`count(*)::int`,
      approved: sql<number>`count(*) FILTER (WHERE ${leads.status} = 'approved')::int`,
      declined: sql<number>`count(*) FILTER (WHERE ${leads.status} = 'declined')::int`,
      inReview: sql<number>`count(*) FILTER (WHERE ${leads.status} = 'in_review')::int`,
    })
    .from(leads)
    .leftJoin(users, eq(leads.agentId, users.id))
    .where(sql`${leads.agentId} IS NOT NULL`)
    .groupBy(leads.agentId, users.fullName)
    .orderBy(sql`count(*) DESC`)
    .limit(15);

  // Call stats (last 30 days)
  const callStats = await db
    .select({
      outcome: callLog.outcome,
      count: sql<number>`count(*)::int`,
    })
    .from(callLog)
    .where(gte(callLog.createdAt, monthStart))
    .groupBy(callLog.outcome);

  const totalCalls = callStats.reduce((sum, c) => sum + Number(c.count), 0);
  const total = Number(totalResult.count);

  return (
    <>
      <Topbar title="Analytics" user={user} />
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2"><Users className="w-5 h-5 text-blue-500" /><span className="text-sm text-muted-foreground">Total Leads</span></div>
            <p className="text-3xl font-bold text-blue-500">{total.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-5 h-5 text-green-500" /><span className="text-sm text-muted-foreground">This Week</span></div>
            <p className="text-3xl font-bold text-green-500">{Number(weekResult.count).toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2"><BarChart3 className="w-5 h-5 text-purple-500" /><span className="text-sm text-muted-foreground">This Month</span></div>
            <p className="text-3xl font-bold text-purple-500">{Number(monthResult.count).toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2"><Phone className="w-5 h-5 text-cyan-500" /><span className="text-sm text-muted-foreground">Calls (30d)</span></div>
            <p className="text-3xl font-bold text-cyan-500">{totalCalls.toLocaleString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 14-Day Trend */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" />14-Day Trend</h2>
            <div className="flex items-end gap-1 h-40">
              {days.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{d.count || ""}</span>
                  <div
                    className="w-full bg-primary/80 rounded-t-sm transition-all min-h-[2px]"
                    style={{ height: `${(d.count / maxDay) * 100}%` }}
                    title={`${d.day}: ${d.count} leads`}
                  />
                  <span className="text-[10px] text-muted-foreground rotate-45 origin-left whitespace-nowrap">
                    {d.day.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><PieChart className="w-5 h-5 text-primary" />Status Breakdown</h2>
            <div className="space-y-3">
              {statusBreakdown.map((row) => {
                const pct = total > 0 ? (Number(row.count) / total) * 100 : 0;
                return (
                  <div key={row.status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium capitalize">{row.status.replace(/_/g, " ")}</span>
                      <span className="text-sm text-muted-foreground">{Number(row.count).toLocaleString()} ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${statusColors[row.status] ?? "bg-muted-foreground"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Agent Performance */}
        {agentStats.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-primary" />Agent Performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Agent</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">In Review</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Approved</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Declined</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map((a) => {
                    const convRate = Number(a.total) > 0 ? ((Number(a.approved) / Number(a.total)) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={a.agentId} className="border-b border-border/50">
                        <td className="px-4 py-2 font-medium">{a.agentName || `Agent #${a.agentId}`}</td>
                        <td className="px-4 py-2 text-right">{Number(a.total).toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-blue-500">{Number(a.inReview).toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-green-500">{Number(a.approved).toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-red-500">{Number(a.declined).toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-medium">{convRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Call Outcomes */}
        {totalCalls > 0 && (
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Phone className="w-5 h-5 text-primary" />Call Outcomes (Last 30 Days)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {callStats.map((c) => (
                <div key={c.outcome} className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground capitalize">{(c.outcome || "unknown").replace(/_/g, " ")}</p>
                  <p className="text-xl font-bold">{Number(c.count).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{totalCalls > 0 ? ((Number(c.count) / totalCalls) * 100).toFixed(1) : 0}%</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
