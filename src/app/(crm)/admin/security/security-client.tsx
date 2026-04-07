"use client";

import { useState } from "react";
import { Shield, Globe, Plus, Trash2, X, AlertTriangle, LogOut } from "lucide-react";
import { timeAgo } from "@/lib/utils";

interface WhitelistEntry {
  id: number;
  ipAddress: string;
  label: string | null;
  createdAt: string;
}

export function SecurityClient({ whitelist: initialWhitelist }: { whitelist: WhitelistEntry[] }) {
  const [whitelist, setWhitelist] = useState(initialWhitelist);
  const [showAddForm, setShowAddForm] = useState(false);
  const [ipAddress, setIpAddress] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [forceLogoutLoading, setForceLogoutLoading] = useState(false);
  const [forceLogoutResult, setForceLogoutResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleAddIp(e: React.FormEvent) {
    e.preventDefault();
    if (!ipAddress) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ipAddress, label: label || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add IP");
        return;
      }
      setShowAddForm(false);
      setIpAddress("");
      setLabel("");
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteIp(id: number) {
    if (!confirm("Remove this IP from the whitelist?")) return;
    setDeleting(id);
    try {
      const res = await fetch("/api/security", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setWhitelist((prev) => prev.filter((e) => e.id !== id));
      }
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  async function handleForceLogout() {
    if (!confirm("This will log out ALL users (including you). Continue?")) return;
    setForceLogoutLoading(true);
    setForceLogoutResult(null);
    try {
      const res = await fetch("/api/security", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "force_logout_all" }),
      });
      const data = await res.json();
      if (res.ok) {
        setForceLogoutResult({ ok: true, text: "All sessions have been cleared." });
        setTimeout(() => window.location.href = "/login", 2000);
      } else {
        setForceLogoutResult({ ok: false, text: data.error || "Failed" });
      }
    } catch {
      setForceLogoutResult({ ok: false, text: "Network error" });
    } finally {
      setForceLogoutLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* IP Whitelist */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">IP Whitelist</h2>
          <span className="text-sm text-muted-foreground">({whitelist.length} entries)</span>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setError(""); }}
          className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add IP
        </button>
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
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {whitelist.map((entry) => (
                <tr key={entry.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{entry.ipAddress}</td>
                  <td className="px-4 py-3 text-muted-foreground">{entry.label ?? "\u2014"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {timeAgo(new Date(entry.createdAt))}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDeleteIp(entry.id)}
                      disabled={deleting === entry.id}
                      className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Force Logout Section */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold">Danger Zone</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Force logout will terminate all active sessions, including your own. All users will need to log in again.
        </p>
        {forceLogoutResult && (
          <div
            className={`mb-3 text-sm px-3 py-2 rounded-lg ${
              forceLogoutResult.ok
                ? "bg-green-500/10 text-green-500"
                : "bg-red-500/10 text-red-500"
            }`}
          >
            {forceLogoutResult.text}
          </div>
        )}
        <button
          onClick={handleForceLogout}
          disabled={forceLogoutLoading}
          className="h-9 px-4 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          {forceLogoutLoading ? "Logging out..." : "Force Logout All Users"}
        </button>
      </div>

      {/* Add IP Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl w-full max-w-sm mx-4 shadow-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">Add IP Address</h3>
              <button onClick={() => setShowAddForm(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddIp} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">IP Address</label>
                <input
                  type="text"
                  required
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="e.g. 192.168.1.1"
                  className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Label (optional)</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Office, Home"
                  className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                />
              </div>
              {error && (
                <div className="text-sm px-3 py-2 rounded-lg bg-red-500/10 text-red-500">{error}</div>
              )}
              <button
                type="submit"
                disabled={saving}
                className="w-full h-10 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Adding..." : "Add to Whitelist"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
