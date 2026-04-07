import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { sql, gte } from "drizzle-orm";
import { BarChart3, Users, TrendingUp, PieChart } from "lucide-react";

export const dynamic = "force-dynamic";

async function getAnalytics() {
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const [weekResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(gte(leads.createdAt, weekStart));

  const monthStart = new Date();
  monthStart.setDate(monthStart.getDate() - 30);
  const [monthResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(gte(leads.createdAt, monthStart));

  const statusBreakdown = await db
    .select({
      status: leads.status,
      count: sql<number>`count(*)`,
    })
    .from(leads)
    .groupBy(leads.status);

  return {
    total: totalResult.count,
    thisWeek: weekResult.count,
    thisMonth: monthResult.count,
    byStatus: statusBreakdown,
  };
}

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
  const analytics = await getAnalytics();

  const cards = [
    { label: "Total Leads", value: analytics.total.toLocaleString(), icon: Users, color: "text-blue-500" },
    { label: "This Week", value: analytics.thisWeek.toLocaleString(), icon: TrendingUp, color: "text-green-500" },
    { label: "This Month", value: analytics.thisMonth.toLocaleString(), icon: BarChart3, color: "text-purple-500" },
  ];

  return (
    <>
      <Topbar title="Analytics" user={user} />
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div key={card.label} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`w-5 h-5 ${card.color}`} />
                <span className="text-sm text-muted-foreground font-medium">{card.label}</span>
              </div>
              <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Status Breakdown */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Leads by Status</h2>
          </div>
          <div className="space-y-3">
            {analytics.byStatus.map((row) => {
              const pct = analytics.total > 0 ? (row.count / analytics.total) * 100 : 0;
              return (
                <div key={row.status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium capitalize">
                      {row.status.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {row.count.toLocaleString()} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${statusColors[row.status] ?? "bg-muted-foreground"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
