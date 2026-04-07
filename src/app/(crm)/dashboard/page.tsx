import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, users } from "@/lib/db/schema";
import { sql, eq, and, gte } from "drizzle-orm";
import { Topbar } from "@/components/topbar";
import { Users, UserCheck, UserX, Clock, TrendingUp, Activity } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

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

export default async function DashboardPage() {
  const user = await requireAuth();
  const stats = await getStats();

  const cards = [
    { label: "Total Leads", value: stats.total.toLocaleString(), icon: Users, color: "text-blue-500" },
    { label: "New", value: (stats.statusMap.new || 0).toLocaleString(), icon: UserCheck, color: "text-green-500" },
    { label: "Declined", value: (stats.statusMap.declined || 0).toLocaleString(), icon: UserX, color: "text-red-500" },
    { label: "On Hold", value: (stats.statusMap.on_hold || 0).toLocaleString(), icon: Clock, color: "text-yellow-500" },
    { label: "Today", value: stats.today.toLocaleString(), icon: TrendingUp, color: "text-purple-500" },
    { label: "This Week", value: stats.thisWeek.toLocaleString(), icon: Activity, color: "text-cyan-500" },
  ];

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
      </div>
    </>
  );
}
