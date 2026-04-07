"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Shield, Clock, Phone, Save, Loader2, Key } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

interface Props {
  user: {
    id: number;
    username: string;
    email: string;
    fullName: string;
    role: string;
    lastLoginAt: string | null;
    lastLoginIp: string | null;
    createdAt: string;
    sipUsername: string | null;
    sipPassword: string | null;
    sipAuthUser: string | null;
    sipDisplayName: string | null;
  };
}

export function ProfileClient({ user }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sipTesting, setSipTesting] = useState(false);
  const [sipTestResult, setSipTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // SIP credentials
  const [sipUsername, setSipUsername] = useState(user.sipUsername || "");
  const [sipPassword, setSipPassword] = useState(user.sipPassword || "");
  const [sipAuthUser, setSipAuthUser] = useState(user.sipAuthUser || "");
  const [sipDisplayName, setSipDisplayName] = useState(user.sipDisplayName || "");

  async function testSipConnection() {
    if (!sipUsername || !sipPassword) {
      setSipTestResult({ ok: false, message: "Enter SIP username and password first" });
      return;
    }
    setSipTesting(true);
    setSipTestResult(null);

    try {
      const { SimpleUser } = await import("sip.js/lib/platform/web");
      const SIP_DOMAIN = "sip.osetec.com"; // Kamailio WSS proxy
      const server = `wss://${SIP_DOMAIN}/ws`;
      const aor = `sip:${sipUsername}@${SIP_DOMAIN}`;
      const authUser = sipAuthUser || sipUsername;

      const result = await new Promise<{ ok: boolean; message: string }>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ ok: false, message: "Connection timeout (10s) — check credentials and that wss://sip.osetec.net/ws is reachable" });
        }, 10000);

        try {
          const testUser = new SimpleUser(server, {
            aor,
            userAgentOptions: {
              authorizationUsername: authUser,
              authorizationPassword: sipPassword,
              displayName: sipDisplayName || user.fullName,
            },
            delegate: {
              onRegistered: () => {
                clearTimeout(timeout);
                try { testUser.unregister(); testUser.disconnect(); } catch {}
                resolve({ ok: true, message: `Registered successfully as ${sipUsername}@${SIP_DOMAIN}` });
              },
              onServerConnect: () => {
                // Connected to WSS, now try to register
              },
              onServerDisconnect: () => {
                clearTimeout(timeout);
                resolve({ ok: false, message: `WebSocket disconnected — wss://${SIP_DOMAIN}/ws may not be available` });
              },
            },
          });

          testUser.connect().then(() => testUser.register()).catch((e: any) => {
            clearTimeout(timeout);
            resolve({ ok: false, message: `Registration failed: ${e.message}` });
          });
        } catch (e: any) {
          clearTimeout(timeout);
          resolve({ ok: false, message: `Init error: ${e.message}` });
        }
      });

      setSipTestResult(result);
    } catch (e: any) {
      setSipTestResult({ ok: false, message: `Test failed: ${e.message}` });
    } finally {
      setSipTesting(false);
    }
  }

  async function saveSipCredentials() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sipUsername: sipUsername || null,
          sipPassword: sipPassword || null,
          sipAuthUser: sipAuthUser || null,
          sipDisplayName: sipDisplayName || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "SIP credentials saved" });
        router.refresh();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (!currentPassword || !newPassword) return;
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords don't match" });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Password changed successfully" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setMessage({ type: "error", text: data.error || "Failed to change password" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  const roleBadge: Record<string, string> = {
    admin: "bg-red-500/10 text-red-500",
    processor: "bg-blue-500/10 text-blue-500",
    agent: "bg-green-500/10 text-green-500",
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {message && (
        <div className={cn("px-4 py-3 rounded-lg text-sm", message.type === "success" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500")}>
          {message.text}
        </div>
      )}

      {/* User Info */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-semibold">{user.fullName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", roleBadge[user.role])}>
                {user.role}
              </span>
              <span className="text-sm text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">Username:</span> <span className="font-medium ml-2">{user.username}</span></div>
          <div><span className="text-muted-foreground">Last Login:</span> <span className="font-medium ml-2">{user.lastLoginAt ? timeAgo(new Date(user.lastLoginAt)) : "Never"}</span></div>
          <div><span className="text-muted-foreground">Last IP:</span> <span className="font-medium ml-2 font-mono text-xs">{user.lastLoginIp || "Unknown"}</span></div>
          <div><span className="text-muted-foreground">Member Since:</span> <span className="font-medium ml-2">{new Date(user.createdAt).toLocaleDateString()}</span></div>
        </div>
      </div>

      {/* SIP Credentials */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Phone className="w-4 h-4" />SIP Credentials (Softphone)</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Configure your SIP credentials for the WebRTC softphone. These are your Magnus Billing credentials for sip.osetec.net.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">SIP Username</label>
            <input
              type="text"
              value={sipUsername}
              onChange={(e) => setSipUsername(e.target.value)}
              placeholder="e.g. 1001"
              className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">SIP Password</label>
            <input
              type="password"
              value={sipPassword}
              onChange={(e) => setSipPassword(e.target.value)}
              placeholder="SIP password"
              className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Auth Username</label>
            <input
              type="text"
              value={sipAuthUser}
              onChange={(e) => setSipAuthUser(e.target.value)}
              placeholder="Defaults to SIP Username"
              className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Display Name</label>
            <input
              type="text"
              value={sipDisplayName}
              onChange={(e) => setSipDisplayName(e.target.value)}
              placeholder="Defaults to your full name"
              className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={saveSipCredentials}
            disabled={saving}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save SIP Credentials
          </button>
          <button
            onClick={testSipConnection}
            disabled={sipTesting || !sipUsername || !sipPassword}
            className="h-9 px-4 bg-muted border border-border rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 hover:bg-muted/80"
          >
            {sipTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
            {sipTesting ? "Testing..." : "Test SIP Connection"}
          </button>
        </div>
        {sipTestResult && (
          <div className={cn("mt-3 px-4 py-3 rounded-lg text-sm", sipTestResult.ok ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500")}>
            {sipTestResult.ok ? "✓ " : "✗ "}{sipTestResult.message}
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Key className="w-4 h-4" />Change Password</h3>
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
            />
          </div>
          <button
            onClick={changePassword}
            disabled={saving || !currentPassword || !newPassword}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            Change Password
          </button>
        </div>
      </div>
    </div>
  );
}
