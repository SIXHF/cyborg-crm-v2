import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ipWhitelist } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { desc } from "drizzle-orm";
import { Shield, Globe } from "lucide-react";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requireAuth(["admin"]);

  const whitelist = await db
    .select()
    .from(ipWhitelist)
    .orderBy(desc(ipWhitelist.createdAt));

  return (
    <>
      <Topbar title="Security" user={user} />
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">IP Whitelist</h2>
          <span className="text-sm text-muted-foreground">({whitelist.length} entries)</span>
        </div>

        {whitelist.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No IP addresses whitelisted</p>
            <p className="text-xs text-muted-foreground mt-1">All IPs are currently allowed</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-3 font-medium">IP Address</th>
                  <th className="px-4 py-3 font-medium">Label</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {whitelist.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{entry.ipAddress}</td>
                    <td className="px-4 py-3 text-muted-foreground">{entry.label ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(new Date(entry.createdAt))}
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
