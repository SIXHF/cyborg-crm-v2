import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appSettings, users } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { inArray, eq } from "drizzle-orm";
import { Phone, Lock, Server, Wifi, Users, Settings, CheckCircle, XCircle, Shield } from "lucide-react";

export const dynamic = "force-dynamic";

const SIP_KEYS = [
  "telnyx_api_key",
  "telnyx_sip_connection_id",
  "magnus_pbx_host",
  "magnus_api_url",
  "stun_server",
  "turn_server",
  "turn_username",
  "turn_credential",
];

function maskSecret(value: string | null): string {
  if (!value) return "Not configured";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
        configured
          ? "bg-green-500/10 text-green-500"
          : "bg-yellow-500/10 text-yellow-500"
      }`}
    >
      {configured ? (
        <><CheckCircle className="w-3 h-3" /> Configured</>
      ) : (
        <><XCircle className="w-3 h-3" /> Missing</>
      )}
    </span>
  );
}

export default async function SipSettingsPage() {
  const user = await requireAuth(["admin"]);

  const [settings, sipUsers] = await Promise.all([
    db.select().from(appSettings).where(inArray(appSettings.key, SIP_KEYS)),
    db.select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      sipUsername: users.sipUsername,
      sipPassword: users.sipPassword,
      isActive: users.isActive,
    }).from(users).where(eq(users.isActive, true)),
  ]);

  const settingsMap: Record<string, string | null> = {};
  settings.forEach((s) => { settingsMap[s.key] = s.value; });

  const telnyxKey = settingsMap["telnyx_api_key"];
  const telnyxConnectionId = settingsMap["telnyx_sip_connection_id"];
  const magnusHost = settingsMap["magnus_pbx_host"] || "sip.osetec.net";
  const magnusApi = settingsMap["magnus_api_url"];
  const stunServer = settingsMap["stun_server"] || "stun:stun.l.google.com:19302";
  const turnServer = settingsMap["turn_server"];
  const turnUsername = settingsMap["turn_username"];
  const turnCredential = settingsMap["turn_credential"];

  return (
    <>
      <Topbar title="SIP Settings" user={user} />
      <div className="p-6 space-y-6 max-w-5xl">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">SIP / VoIP Configuration</h2>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="w-4 h-4" />
          <span>Read-only view. Update values via Admin &gt; Settings or environment variables.</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Telnyx WebRTC Gateway */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wifi className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold">Telnyx WebRTC Gateway</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">API Key</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={telnyxKey ? maskSecret(telnyxKey) : "Not configured"}
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                  />
                  <StatusBadge configured={!!telnyxKey} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">SIP Connection ID</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={telnyxConnectionId || "Not configured"}
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                  />
                  <StatusBadge configured={!!telnyxConnectionId} />
                </div>
              </div>
            </div>
          </div>

          {/* Magnus Billing PBX */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Server className="w-4 h-4 text-purple-500" />
              <h3 className="font-semibold">Magnus Billing PBX</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">PBX Host</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={magnusHost}
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                  />
                  <StatusBadge configured={!!magnusHost} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">API URL</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={magnusApi || "Not configured"}
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                  />
                  <StatusBadge configured={!!magnusApi} />
                </div>
              </div>
            </div>
          </div>

          {/* STUN/TURN Configuration */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-cyan-500" />
              <h3 className="font-semibold">STUN/TURN Configuration</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">STUN Server</label>
                <input
                  type="text"
                  readOnly
                  value={stunServer}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">TURN Server</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={turnServer || "Not configured"}
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                  />
                  <StatusBadge configured={!!turnServer} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">TURN Username</label>
                <input
                  type="text"
                  readOnly
                  value={turnUsername || "Not configured"}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">TURN Credential</label>
                <input
                  type="text"
                  readOnly
                  value={turnCredential ? maskSecret(turnCredential) : "Not configured"}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* SIP User Management */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-orange-500" />
              <h3 className="font-semibold">SIP User Credentials</h3>
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              SIP credentials configured per user for WebRTC calling.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">User</th>
                    <th className="pb-2 font-medium text-muted-foreground">Role</th>
                    <th className="pb-2 font-medium text-muted-foreground">SIP Username</th>
                    <th className="pb-2 font-medium text-muted-foreground">SIP Password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {sipUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 font-medium">{u.fullName}</td>
                      <td className="py-2 capitalize text-muted-foreground">{u.role}</td>
                      <td className="py-2 font-mono text-xs">
                        {u.sipUsername || <span className="text-muted-foreground italic">none</span>}
                      </td>
                      <td className="py-2 font-mono text-xs">
                        {u.sipPassword ? maskSecret(u.sipPassword) : <span className="text-muted-foreground italic">none</span>}
                      </td>
                    </tr>
                  ))}
                  {sipUsers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-muted-foreground">No active users</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
