import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, userPresence, callLog, leads, sessions } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { eq, sql, desc, gte, and } from "drizzle-orm";
import { Phone, PhoneCall, Users, Activity, Wifi, Clock, TrendingUp } from "lucide-react";
import { cn, timeAgo, formatPhone } from "@/lib/utils";
import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = "force-dynamic";

export default async function LiveAnalyticsPage() {
  const user = await requireAuth(["admin"]);

  // Online users (active in last 90 seconds via presence heartbeat)
  const presenceCutoff = new Date(Date.now() - 90 * 1000);
  const onlineUsers = await db
    .select({
      userId: userPresence.userId,
      fullName: users.fullName,
      username: users.username,
      role: users.role,
      module: userPresence.module,
      action: userPresence.action,
      leadName: userPresence.leadName,
      pageUrl: userPresence.pageUrl,
      ip: userPresence.ip,
      lastSeen: userPresence.lastSeen,
    })
    .from(userPresence)
    .innerJoin(users, eq(userPresence.userId, users.id))
    .where(gte(userPresence.lastSeen, presenceCutoff))
    .orderBy(desc(userPresence.lastSeen));

  // Recent calls (last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCalls = await db
    .select({
      id: callLog.id,
      outcome: callLog.outcome,
      callDuration: callLog.callDuration,
      phoneDialed: callLog.phoneDialed,
      createdAt: callLog.createdAt,
      agentName: users.fullName,
      leadFirstName: leads.firstName,
      leadLastName: leads.lastName,
      leadRefNumber: leads.refNumber,
    })
    .from(callLog)
    .leftJoin(users, eq(callLog.agentId, users.id))
    .leftJoin(leads, eq(callLog.leadId, leads.id))
    .where(gte(callLog.createdAt, oneDayAgo))
    .orderBy(desc(callLog.createdAt))
    .limit(50);

  // Call stats today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCalls = await db
    .select({
      outcome: callLog.outcome,
      count: sql<number>`count(*)::int`,
      totalDuration: sql<number>`COALESCE(SUM(${callLog.callDuration}), 0)::int`,
    })
    .from(callLog)
    .where(gte(callLog.createdAt, todayStart))
    .groupBy(callLog.outcome);

  const totalCallsToday = todayCalls.reduce((sum, c) => sum + Number(c.count), 0);
  const totalDurationToday = todayCalls.reduce((sum, c) => sum + Number(c.totalDuration), 0);
  const pickedUpToday = todayCalls.find(c => c.outcome === "picked_up");
  const connectRate = totalCallsToday > 0 ? ((Number(pickedUpToday?.count || 0) / totalCallsToday) * 100).toFixed(1) : "0";

  // Agent call stats today
  const agentCallStats = await db
    .select({
      agentId: callLog.agentId,
      agentName: users.fullName,
      calls: sql<number>`count(*)::int`,
      pickedUp: sql<number>`count(*) FILTER (WHERE ${callLog.outcome} = 'picked_up')::int`,
      totalDuration: sql<number>`COALESCE(SUM(${callLog.callDuration}), 0)::int`,
    })
    .from(callLog)
    .leftJoin(users, eq(callLog.agentId, users.id))
    .where(gte(callLog.createdAt, todayStart))
    .groupBy(callLog.agentId, users.fullName)
    .orderBy(sql`count(*) DESC`);

  // Leads created today
  const [leadsToday] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(gte(leads.createdAt, todayStart));

  const outcomeColors: Record<string, string> = {
    picked_up: "text-green-500",
    no_answer: "text-yellow-500",
    voicemail: "text-blue-500",
    callback: "text-purple-500",
    wrong_number: "text-orange-500",
    do_not_call: "text-red-500",
    busy: "text-gray-500",
  };

  const roleColors: Record<string, string> = {
    admin: "bg-red-500/10 text-red-500",
    processor: "bg-blue-500/10 text-blue-500",
    agent: "bg-green-500/10 text-green-500",
  };

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }

  return (
    <>
      <AutoRefresh intervalMs={15000} />
      <Topbar title="Live Analytics" user={user} />
      <div className="p-6 space-y-6">
        {/* Today's Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1"><Wifi className="w-4 h-4 text-green-500" /><span className="text-xs text-muted-foreground">Online Now</span></div>
            <p className="text-3xl font-bold text-green-500">{onlineUsers.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1"><Phone className="w-4 h-4 text-blue-500" /><span className="text-xs text-muted-foreground">Calls Today</span></div>
            <p className="text-3xl font-bold text-blue-500">{totalCallsToday}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1"><PhoneCall className="w-4 h-4 text-emerald-500" /><span className="text-xs text-muted-foreground">Connect Rate</span></div>
            <p className="text-3xl font-bold text-emerald-500">{connectRate}%</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1"><Clock className="w-4 h-4 text-purple-500" /><span className="text-xs text-muted-foreground">Talk Time</span></div>
            <p className="text-3xl font-bold text-purple-500">{formatDuration(totalDurationToday)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-cyan-500" /><span className="text-xs text-muted-foreground">Leads Today</span></div>
            <p className="text-3xl font-bold text-cyan-500">{Number(leadsToday.count).toLocaleString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Users Online */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Users Online ({onlineUsers.length})
            </h2>
            {onlineUsers.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No users online</p>
            ) : (
              <div className="space-y-2">
                {onlineUsers.map((u, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <div>
                        <p className="text-sm font-medium">{u.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.module && u.action ? `${u.action} ${u.module}` : u.username}
                          {u.leadName && ` — ${u.leadName}`}
                        </p>
                      </div>
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", roleColors[u.role])}>
                        {u.role}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground font-mono">{u.ip}</p>
                      <p className="text-xs text-muted-foreground">{u.lastSeen ? timeAgo(u.lastSeen) : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agent Performance Today */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Agent Performance (Today)
            </h2>
            {agentCallStats.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">No calls today</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-medium text-muted-foreground">Agent</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Calls</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Connected</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Rate</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Talk Time</th>
                  </tr>
                </thead>
                <tbody>
                  {agentCallStats.map((a) => {
                    const rate = Number(a.calls) > 0 ? ((Number(a.pickedUp) / Number(a.calls)) * 100).toFixed(0) : "0";
                    return (
                      <tr key={a.agentId} className="border-b border-border/50">
                        <td className="py-2 font-medium">{a.agentName || `#${a.agentId}`}</td>
                        <td className="py-2 text-right">{Number(a.calls)}</td>
                        <td className="py-2 text-right text-green-500">{Number(a.pickedUp)}</td>
                        <td className="py-2 text-right font-medium">{rate}%</td>
                        <td className="py-2 text-right text-muted-foreground">{formatDuration(Number(a.totalDuration))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent Calls Feed */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            Recent Calls (Last 24h)
          </h2>
          {recentCalls.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No recent calls</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Agent</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Lead</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Phone</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Outcome</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Duration</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCalls.map((call) => (
                    <tr key={call.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-2">{call.agentName || "—"}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{[call.leadFirstName, call.leadLastName].filter(Boolean).join(" ") || "—"}</span>
                        {call.leadRefNumber && <span className="text-xs text-muted-foreground ml-1">{call.leadRefNumber}</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                        {call.phoneDialed ? formatPhone(call.phoneDialed) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("text-xs font-medium capitalize", outcomeColors[call.outcome || ""] || "text-muted-foreground")}>
                          {(call.outcome || "unknown").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {call.callDuration ? formatDuration(call.callDuration) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{timeAgo(call.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
