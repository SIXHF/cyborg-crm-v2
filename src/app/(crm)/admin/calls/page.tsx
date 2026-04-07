import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { callLog, users, leads } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { desc, eq } from "drizzle-orm";
import { Phone, PhoneOff, PhoneIncoming, Voicemail, Clock } from "lucide-react";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const outcomeIcons: Record<string, { icon: typeof Phone; color: string }> = {
  picked_up: { icon: PhoneIncoming, color: "text-green-500" },
  no_answer: { icon: PhoneOff, color: "text-red-500" },
  voicemail: { icon: Voicemail, color: "text-yellow-500" },
  callback: { icon: Clock, color: "text-blue-500" },
  wrong_number: { icon: PhoneOff, color: "text-orange-500" },
  do_not_call: { icon: PhoneOff, color: "text-red-700" },
  busy: { icon: Phone, color: "text-yellow-600" },
  other: { icon: Phone, color: "text-muted-foreground" },
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default async function CallsPage() {
  const user = await requireAuth(["admin"]);

  const calls = await db
    .select({
      id: callLog.id,
      outcome: callLog.outcome,
      notes: callLog.notes,
      callDuration: callLog.callDuration,
      phoneDialed: callLog.phoneDialed,
      createdAt: callLog.createdAt,
      agentName: users.fullName,
      leadFirstName: leads.firstName,
      leadLastName: leads.lastName,
      leadRef: leads.refNumber,
    })
    .from(callLog)
    .innerJoin(users, eq(callLog.agentId, users.id))
    .innerJoin(leads, eq(callLog.leadId, leads.id))
    .orderBy(desc(callLog.createdAt))
    .limit(100);

  return (
    <>
      <Topbar title="Call History" user={user} />
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Recent Calls</h2>
          <span className="text-sm text-muted-foreground">({calls.length})</span>
        </div>

        {calls.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Phone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No call history found</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => {
                  const outcomeInfo = outcomeIcons[call.outcome ?? "other"] ?? outcomeIcons.other;
                  const OutcomeIcon = outcomeInfo.icon;
                  return (
                    <tr key={call.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <OutcomeIcon className={`w-4 h-4 ${outcomeInfo.color}`} />
                          <span className="capitalize text-xs">
                            {(call.outcome ?? "unknown").replace(/_/g, " ")}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{call.agentName}</td>
                      <td className="px-4 py-3">
                        <div>
                          <span className="text-foreground">
                            {`${call.leadFirstName ?? ""} ${call.leadLastName ?? ""}`.trim() || "Unknown"}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">{call.leadRef}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {call.phoneDialed ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDuration(call.callDuration)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(new Date(call.createdAt))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
