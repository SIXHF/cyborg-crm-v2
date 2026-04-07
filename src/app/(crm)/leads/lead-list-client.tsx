"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Filter, ChevronLeft, ChevronRight, Plus, Download, Trash2, MoreHorizontal, Phone } from "lucide-react";
import { cn, formatPhone, timeAgo } from "@/lib/utils";

interface Lead {
  id: number;
  refNumber: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  state: string | null;
  cardBrand: string | null;
  cardIssuer: string | null;
  agentId: number | null;
  agentName: string | null;
  createdAt: string;
}

interface Props {
  leads: Lead[];
  total: number;
  nextCursor: number | null;
  prevCursor: number | null;
  agents: { id: number; fullName: string }[];
  filters: Record<string, string | undefined>;
  userRole: string;
}

const statusColors: Record<string, string> = {
  new: "bg-green-500/10 text-green-500",
  in_review: "bg-blue-500/10 text-blue-500",
  approved: "bg-emerald-500/10 text-emerald-500",
  declined: "bg-red-500/10 text-red-500",
  forwarded: "bg-purple-500/10 text-purple-500",
  on_hold: "bg-yellow-500/10 text-yellow-500",
};

export function LeadListClient({ leads, total, nextCursor, prevCursor, agents, filters, userRole }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(filters.q || "");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [queuingLeads, setQueuingLeads] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  function navigate(params: Record<string, string>) {
    const sp = new URLSearchParams();
    const merged = { ...filters, ...params };
    Object.entries(merged).forEach(([k, v]) => {
      if (v && v !== "") sp.set(k, v);
    });
    router.push(`/leads?${sp.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ q: search, cursor: "", dir: "" });
  }

  function toggleAll() {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads…"
              className="w-64 h-9 pl-9 pr-3 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </form>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "h-9 px-3 flex items-center gap-1.5 rounded-lg border text-sm font-medium transition-colors",
              showFilters ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{total.toLocaleString()} leads</span>
          <button
            onClick={() => {
              const params = new URLSearchParams(filters as Record<string, string>);
              window.open(`/api/leads/export?${params.toString()}`, "_blank");
            }}
            className="h-9 px-3 border border-border rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-muted transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <Link
            href="/leads/new"
            className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Lead
          </Link>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-card border border-border rounded-lg">
          <select
            value={filters.status || ""}
            onChange={(e) => navigate({ status: e.target.value, cursor: "", dir: "" })}
            className="h-9 px-3 bg-muted border border-border rounded-lg text-sm"
          >
            <option value="">All Statuses</option>
            {["new", "in_review", "approved", "declined", "forwarded", "on_hold"].map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <select
            value={filters.agent || ""}
            onChange={(e) => navigate({ agent: e.target.value, cursor: "", dir: "" })}
            className="h-9 px-3 bg-muted border border-border rounded-lg text-sm"
          >
            <option value="">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id.toString()}>{a.fullName}</option>
            ))}
          </select>
          <input
            type="date"
            value={filters.from || ""}
            onChange={(e) => navigate({ from: e.target.value, cursor: "", dir: "" })}
            className="h-9 px-3 bg-muted border border-border rounded-lg text-sm"
          />
          <input
            type="date"
            value={filters.to || ""}
            onChange={(e) => navigate({ to: e.target.value, cursor: "", dir: "" })}
            className="h-9 px-3 bg-muted border border-border rounded-lg text-sm"
          />
          {Object.values(filters).some((v) => v) && (
            <button
              onClick={() => router.push("/leads")}
              className="h-9 px-3 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === leads.length && leads.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Phone</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">State</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Card</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Agent</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    No leads found
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(lead.id)) next.delete(lead.id);
                          else next.add(lead.id);
                          setSelected(next);
                        }}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium">{[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "—"}</span>
                        <span className="block text-xs text-muted-foreground">{lead.refNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {lead.phone ? formatPhone(lead.phone) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
                      {lead.email || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", statusColors[lead.status] || "bg-muted text-muted-foreground")}>
                        {lead.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.state || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {lead.cardBrand || lead.cardIssuer || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{lead.agentName || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {timeAgo(new Date(lead.createdAt))}
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        disabled={queuingLeads.has(lead.id)}
                        onClick={async () => {
                          setQueuingLeads(prev => new Set(prev).add(lead.id));
                          try {
                            const res = await fetch("/api/call-queue", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ leadId: lead.id }),
                            });
                            if (res.ok) alert("Added to queue");
                            else {
                              const d = await res.json();
                              alert(d.error || "Failed");
                            }
                          } finally {
                            setQueuingLeads(prev => { const n = new Set(prev); n.delete(lead.id); return n; });
                          }
                        }}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        title="Add to Call Queue"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-sm text-muted-foreground">
            Showing {leads.length} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            {prevCursor && (
              <button
                onClick={() => navigate({ cursor: prevCursor.toString(), dir: "prev" })}
                className="h-8 px-3 flex items-center gap-1 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
            )}
            {nextCursor && (
              <button
                onClick={() => navigate({ cursor: nextCursor.toString(), dir: "next" })}
                className="h-8 px-3 flex items-center gap-1 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Batch actions */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">{selected.size} selected</span>
          {/* Status update */}
          <select
            disabled={batchLoading}
            onChange={async (e) => {
              if (!e.target.value) return;
              if (!confirm(`Update ${selected.size} leads to "${e.target.value.replace("_"," ")}"?`)) { e.target.value = ""; return; }
              setBatchLoading(true);
              try {
                await fetch("/api/leads/batch", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids: Array.from(selected), action: "update_status", value: e.target.value }),
                });
                setSelected(new Set());
                router.refresh();
              } finally { setBatchLoading(false); }
            }}
            className="h-8 px-2 text-xs bg-muted border border-border rounded-lg disabled:opacity-50"
            defaultValue=""
          >
            <option value="">Change Status…</option>
            {["new", "in_review", "approved", "declined", "forwarded", "on_hold"].map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          {/* Add to queue */}
          <button
            disabled={batchLoading}
            onClick={async () => {
              setBatchLoading(true);
              try {
                for (const id of selected) {
                  await fetch("/api/call-queue", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ leadId: id }),
                  }).catch(() => {});
                }
                alert(`${selected.size} leads added to call queue`);
                setSelected(new Set());
              } finally { setBatchLoading(false); }
            }}
            className="h-8 px-3 text-sm bg-muted rounded-lg hover:bg-muted/80 flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Phone className="w-3.5 h-3.5" />
            Add to Queue
          </button>
          {/* Export */}
          <button
            onClick={() => {
              const params = new URLSearchParams(filters as Record<string, string>);
              window.open(`/api/leads/export?${params.toString()}`, "_blank");
            }}
            className="h-8 px-3 text-sm bg-muted rounded-lg hover:bg-muted/80 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          {/* Delete */}
          <button
            disabled={batchLoading}
            onClick={async () => {
              if (!confirm(`Delete ${selected.size} leads? This is permanent.`)) return;
              setBatchLoading(true);
              try {
                await fetch("/api/leads/batch", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids: Array.from(selected), action: "delete" }),
                });
                setSelected(new Set());
                router.refresh();
              } finally { setBatchLoading(false); }
            }}
            className="h-8 px-3 text-sm bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
