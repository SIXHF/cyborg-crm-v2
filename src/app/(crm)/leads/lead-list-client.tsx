"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Filter, ChevronLeft, ChevronRight, Plus, Download, Trash2, Phone, Eye, ExternalLink, X, Loader2, CreditCard } from "lucide-react";
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
  cardNumberBin: string | null;
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
  filters: Record<string, string | undefined> & { name?: string; phone?: string; bin?: string; bank?: string; email?: string };
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
  const [searchName, setSearchName] = useState(filters.name || "");
  const [searchPhone, setSearchPhone] = useState(filters.phone || "");
  const [searchBin, setSearchBin] = useState(filters.bin || "");
  const [searchBank, setSearchBank] = useState(filters.bank || "");
  const [searchEmail, setSearchEmail] = useState(filters.email || "");
  const [showFilters, setShowFilters] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [queuingLeads, setQueuingLeads] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [quickViewId, setQuickViewId] = useState<number | null>(null);
  const [quickViewData, setQuickViewData] = useState<any>(null);
  const [quickViewLoading, setQuickViewLoading] = useState(false);

  // Reset searching state when results arrive (new props = page re-rendered)
  useEffect(() => { setSearching(false); }, [leads]);

  async function openQuickView(e: React.MouseEvent, leadId: number) {
    e.stopPropagation();
    setQuickViewId(leadId);
    setQuickViewData(null);
    setQuickViewLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/quickview`);
      if (res.ok) setQuickViewData(await res.json());
    } catch {}
    setQuickViewLoading(false);
  }

  function navigate(params: Record<string, string>) {
    const sp = new URLSearchParams();
    const merged = { ...filters, ...params };
    Object.entries(merged).forEach(([k, v]) => {
      if (v && v !== "") sp.set(k, v);
    });
    setSearching(true);
    router.push(`/leads?${sp.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searching) return; // prevent double-submit
    navigate({
      name: searchName, phone: searchPhone, bin: searchBin,
      bank: searchBank, email: searchEmail,
      q: "", cursor: "", dir: "",
    });
  }

  function clearSearch() {
    setSearchName(""); setSearchPhone(""); setSearchBin("");
    setSearchBank(""); setSearchEmail("");
    navigate({ name: "", phone: "", bin: "", bank: "", email: "", q: "", cursor: "", dir: "" });
  }

  function toggleAll() {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  }

  const hasSearch = !!(searchName || searchPhone || searchBin || searchBank || searchEmail);

  return (
    <div className="p-6 space-y-4">
      {/* Search fields */}
      <form onSubmit={handleSearch} className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Name</label>
            <input type="text" value={searchName} onChange={e => setSearchName(e.target.value)}
              placeholder="First or last name" className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Phone</label>
            <input type="text" value={searchPhone} onChange={e => setSearchPhone(e.target.value)}
              placeholder="Phone number" className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">BIN</label>
            <input type="text" value={searchBin} onChange={e => setSearchBin(e.target.value)}
              placeholder="Card BIN (e.g. 519731)" className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Bank / Brand</label>
            <input type="text" value={searchBank} onChange={e => setSearchBank(e.target.value)}
              placeholder="Bank or card brand" className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Email</label>
            <input type="text" value={searchEmail} onChange={e => setSearchEmail(e.target.value)}
              placeholder="Email address" className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={searching || !hasSearch}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {searching ? "Searching..." : "Search"}
          </button>
          {hasSearch && (
            <button type="button" onClick={clearSearch}
              className="h-9 px-3 text-sm text-destructive hover:bg-destructive/10 rounded-lg">
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">BIN / CC#</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bank Name</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
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
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", statusColors[lead.status] || "bg-muted text-muted-foreground")}>
                        {lead.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {lead.cardNumberBin || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {lead.cardIssuer || lead.cardBrand || "—"}
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => openQuickView(e, lead.id)}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                          title="Quick View"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
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
                      </div>
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

      {/* Quick View Modal */}
      {quickViewId !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setQuickViewId(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            {quickViewLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : quickViewData ? (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {[quickViewData.firstName, quickViewData.lastName].filter(Boolean).join(" ") || "—"}
                    </h3>
                    <p className="text-xs text-muted-foreground">{quickViewData.refNumber}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/leads/${quickViewId}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Edit Lead
                    </a>
                    <button onClick={() => setQuickViewId(null)} className="p-1.5 hover:bg-muted rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="font-medium">{quickViewData.phone ? formatPhone(quickViewData.phone) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium truncate">{quickViewData.email || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", statusColors[quickViewData.status] || "bg-muted text-muted-foreground")}>
                        {quickViewData.status?.replace("_", " ")}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Agent</p>
                      <p className="font-medium">{quickViewData.agentName || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="font-medium">{[quickViewData.city, quickViewData.state, quickViewData.zip].filter(Boolean).join(", ") || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Card</p>
                      <p className="font-medium flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                        {quickViewData.cardBrand || quickViewData.cardIssuer || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Lead Score</p>
                      <p className="font-medium">{quickViewData.leadScore ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="font-medium">{quickViewData.createdAt ? timeAgo(new Date(quickViewData.createdAt)) : "—"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <a
                      href={`/leads/${quickViewId}`}
                      className="flex-1 h-9 flex items-center justify-center gap-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      View Full Details
                    </a>
                    <button
                      onClick={async () => {
                        setQueuingLeads(prev => new Set(prev).add(quickViewId));
                        try {
                          const res = await fetch("/api/call-queue", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ leadId: quickViewId }),
                          });
                          if (res.ok) alert("Added to queue");
                          else {
                            const d = await res.json();
                            alert(d.error || "Failed");
                          }
                        } finally {
                          setQueuingLeads(prev => { const n = new Set(prev); n.delete(quickViewId); return n; });
                        }
                      }}
                      disabled={queuingLeads.has(quickViewId)}
                      className="h-9 px-4 flex items-center gap-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Add to Queue
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-muted-foreground">Failed to load</div>
            )}
          </div>
        </div>
      )}

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
