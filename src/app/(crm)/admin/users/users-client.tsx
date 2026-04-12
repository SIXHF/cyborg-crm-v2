"use client";

import { useState } from "react";
import { cn, timeAgo } from "@/lib/utils";
import { Plus, Pencil, Trash2, X } from "lucide-react";

interface UserRow {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  leadsVisibility?: string | null;
  sipUsername?: string | null;
  sipPassword?: string | null;
  sipAuthUser?: string | null;
  sipDisplayName?: string | null;
  allowedIps?: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const roleColors: Record<string, string> = {
  admin: "bg-red-500/10 text-red-500",
  processor: "bg-blue-500/10 text-blue-500",
  agent: "bg-green-500/10 text-green-500",
};

export function UsersClient({ users: initialUsers }: { users: UserRow[] }) {
  const [usersList, setUsersList] = useState(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    fullName: "",
    role: "agent" as string,
    isActive: true,
    sipUsername: "",
    sipPassword: "",
    sipAuthUser: "",
    sipDisplayName: "",
    leadsVisibility: "own" as string,
    allowedIps: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  function openAdd() {
    setEditingUser(null);
    setForm({
      username: "", email: "", password: "", fullName: "", role: "agent", isActive: true,
      sipUsername: "", sipPassword: "", sipAuthUser: "", sipDisplayName: "",
      leadsVisibility: "own", allowedIps: "",
    });
    setError("");
    setShowForm(true);
  }

  function openEdit(u: UserRow) {
    setEditingUser(u);
    setForm({
      username: u.username,
      email: u.email,
      password: "",
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
      sipUsername: u.sipUsername || "",
      sipPassword: u.sipPassword || "",
      sipAuthUser: u.sipAuthUser || "",
      sipDisplayName: u.sipDisplayName || "",
      leadsVisibility: u.leadsVisibility || "own",
      allowedIps: u.allowedIps || "",
    });
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isEdit = !!editingUser;
      const body: Record<string, unknown> = { ...form };
      if (isEdit) body.id = editingUser!.id;
      if (isEdit && !form.password) delete body.password;

      const res = await fetch("/api/users", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save user");
        return;
      }
      setShowForm(false);
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(userId: number) {
    if (!confirm("Are you sure you want to deactivate this user?")) return;
    setDeleting(userId);
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId }),
      });
      if (res.ok) {
        setUsersList((prev) => prev.map((u) => u.id === userId ? { ...u, isActive: false } : u));
      }
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">{usersList.length} users</p>
        <button
          onClick={openAdd}
          className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">SIP</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Visibility</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Login</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {usersList.map((u) => (
              <tr key={u.id} className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openEdit(u)}>
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium">{u.fullName}</p>
                    <p className="text-xs text-muted-foreground">{u.username} &middot; {u.email}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", roleColors[u.role])}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", u.isActive ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500")}>
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {u.sipUsername || "-"}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs capitalize">
                  {u.leadsVisibility || "own"}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {u.lastLoginAt ? timeAgo(new Date(u.lastLoginAt)) : "Never"}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(u.id)}
                      disabled={deleting === u.id}
                      className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Deactivate"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit User Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto py-8">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg mx-4 shadow-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">{editingUser ? "Edit User" : "Add User"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Password {editingUser && <span className="text-muted-foreground">(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                  >
                    <option value="admin">Admin</option>
                    <option value="processor">Processor</option>
                    <option value="agent">Agent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Leads Visibility</label>
                  <select
                    value={form.leadsVisibility}
                    onChange={(e) => setForm((f) => ({ ...f, leadsVisibility: e.target.value }))}
                    className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                  >
                    <option value="all">All Leads</option>
                    <option value="own">Own Leads</option>
                    <option value="assigned">Assigned Leads</option>
                  </select>
                </div>
              </div>

              {/* SIP Credentials */}
              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">SIP Credentials</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">SIP Username</label>
                    <input
                      type="text"
                      value={form.sipUsername}
                      onChange={(e) => setForm((f) => ({ ...f, sipUsername: e.target.value }))}
                      placeholder="e.g. 1001"
                      className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">SIP Password</label>
                    <input
                      type="password"
                      value={form.sipPassword}
                      onChange={(e) => setForm((f) => ({ ...f, sipPassword: e.target.value }))}
                      placeholder="SIP password"
                      className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Auth Username</label>
                    <input
                      type="text"
                      value={form.sipAuthUser}
                      onChange={(e) => setForm((f) => ({ ...f, sipAuthUser: e.target.value }))}
                      placeholder="Defaults to SIP Username"
                      className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Display Name</label>
                    <input
                      type="text"
                      value={form.sipDisplayName}
                      onChange={(e) => setForm((f) => ({ ...f, sipDisplayName: e.target.value }))}
                      placeholder="Defaults to full name"
                      className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Access Control */}
              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Access Control</p>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Allowed IPs (comma-separated, leave blank for any)</label>
                  <textarea
                    value={form.allowedIps}
                    onChange={(e) => setForm((f) => ({ ...f, allowedIps: e.target.value }))}
                    placeholder="e.g. 192.168.1.1, 10.0.0.0/24"
                    rows={2}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm resize-none"
                  />
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="isActive" className="text-sm">Active</label>
                </div>
              </div>

              {error && (
                <div className="text-sm px-3 py-2 rounded-lg bg-red-500/10 text-red-500">{error}</div>
              )}
              <button
                type="submit"
                disabled={saving}
                className="w-full h-10 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : editingUser ? "Update User" : "Create User"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
