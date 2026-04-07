import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { eq } from "drizzle-orm";
import { Phone, Lock, Server, Shield, Users, CheckCircle, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const WSS_ENDPOINT = "wss://sip.osetec.com/ws";
const KAMAILIO_PING_URL = "http://sip.osetec.com:9800/ping";
const STUN_SERVER = "187.77.87.33:3478";
const TURN_SERVER = "187.77.87.33:3478";
const TURN_USERNAME = "osetec";
const TURN_CREDENTIAL = "CyborgTurn2026!";

function maskSecret(value: string | null): string {
  if (!value) return "Not configured";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

function StatusBadge({ configured, label }: { configured: boolean; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
        configured
          ? "bg-green-500/10 text-green-500"
          : "bg-red-500/10 text-red-500"
      }`}
    >
      {configured ? (
        <><CheckCircle className="w-3 h-3" /> {label || "OK"}</>
      ) : (
        <><XCircle className="w-3 h-3" /> {label || "Down"}</>
      )}
    </span>
  );
}

async function checkKamailioStatus(): Promise<boolean> {
  try {
    const res = await fetch(KAMAILIO_PING_URL, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function SipSettingsPage() {
  const user = await requireAuth(["admin"]);

  const [sipUsers, kamailioUp] = await Promise.all([
    db.select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      sipUsername: users.sipUsername,
      sipPassword: users.sipPassword,
      isActive: users.isActive,
    }).from(users).where(eq(users.isActive, true)),
    checkKamailioStatus(),
  ]);

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
          <span>Read-only view. SIP.js connects to Kamailio via WebSocket.</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SIP Proxy (Kamailio) */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Server className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold">SIP Proxy (Kamailio)</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">WSS Endpoint</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={WSS_ENDPOINT}
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                  />
                  <StatusBadge configured={true} label="Configured" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Kamailio Status</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={kamailioUp ? "Responding to ping" : "Not responding"}
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                  />
                  <StatusBadge configured={kamailioUp} label={kamailioUp ? "Online" : "Offline"} />
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
                  value={`stun:${STUN_SERVER}`}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">TURN Server</label>
                <input
                  type="text"
                  readOnly
                  value={`turn:${TURN_SERVER}`}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">TURN Username</label>
                <input
                  type="text"
                  readOnly
                  value={TURN_USERNAME}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">TURN Credential</label>
                <input
                  type="text"
                  readOnly
                  value={maskSecret(TURN_CREDENTIAL)}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* SIP Users */}
          <div className="bg-card border border-border rounded-xl p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-orange-500" />
              <h3 className="font-semibold">SIP Users</h3>
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              SIP credentials configured per user for WebRTC calling via Kamailio.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">User</th>
                    <th className="pb-2 font-medium text-muted-foreground">Role</th>
                    <th className="pb-2 font-medium text-muted-foreground">SIP Username</th>
                    <th className="pb-2 font-medium text-muted-foreground">SIP Password</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
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
                      <td className="py-2">
                        <StatusBadge
                          configured={!!u.sipUsername && !!u.sipPassword}
                          label={u.sipUsername && u.sipPassword ? "Ready" : "No credentials"}
                        />
                      </td>
                    </tr>
                  ))}
                  {sipUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-muted-foreground">No active users</td>
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
