import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { smsLog, leads } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { desc, eq } from "drizzle-orm";
import { MessageSquare, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { formatPhone, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SmsPage() {
  const user = await requireAuth();

  const messages = await db
    .select({
      id: smsLog.id,
      phone: smsLog.phone,
      message: smsLog.message,
      direction: smsLog.direction,
      status: smsLog.status,
      provider: smsLog.provider,
      createdAt: smsLog.createdAt,
      leadFirstName: leads.firstName,
      leadLastName: leads.lastName,
    })
    .from(smsLog)
    .leftJoin(leads, eq(smsLog.leadId, leads.id))
    .orderBy(desc(smsLog.createdAt))
    .limit(100);

  return (
    <>
      <Topbar title="SMS Messages" user={user} />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Recent Messages</h2>
            <span className="text-sm text-muted-foreground">({messages.length})</span>
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No SMS messages found</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-3 font-medium">Direction</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr key={msg.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      {msg.direction === "inbound" ? (
                        <ArrowDownLeft className="w-4 h-4 text-green-500" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-blue-500" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {formatPhone(msg.phone)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {msg.leadFirstName || msg.leadLastName
                        ? `${msg.leadFirstName ?? ""} ${msg.leadLastName ?? ""}`.trim()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">
                      {msg.message.length > 80 ? msg.message.slice(0, 80) + "…" : msg.message}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        {msg.status ?? "sent"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(new Date(msg.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
