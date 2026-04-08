"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, Database, Loader2, Phone, Hash, RotateCcw, FileText, X } from "lucide-react";

interface Props {
  total: number;
  statusMap: Record<string, number>;
  batches: { ref: string; count: number }[];
  duplicates: number;
  agents?: { id: number; fullName: string; username: string }[];
}

export function DataManagerClient({ total, statusMap, batches, duplicates, agents = [] }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ label: "", deleted: 0, remaining: 0, pct: 0, speed: 0, eta: "" });
  const [confirmText, setConfirmText] = useState("");
  const cancelledRef = useRef(false);
  const startTimeRef = useRef(0);
  const [ageDays, setAgeDays] = useState("90");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [refNumbers, setRefNumbers] = useState("");

  function formatTime(seconds: number) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  async function runBatchDelete(action: string, params: Record<string, string> = {}, desc: string) {
    if (running) return;
    if (!confirm(`FINAL WARNING\n\nYou are about to: ${desc}\n\nThis is PERMANENT and cannot be undone.\n\nClick OK to proceed.`)) return;

    setRunning(true);
    cancelledRef.current = false;
    startTimeRef.current = Date.now();
    setProgress({ label: "Starting...", deleted: 0, remaining: 0, pct: 0, speed: 0, eta: "" });
    let totalDeleted = 0;
    let initial: number | null = null;

    try {
      while (!cancelledRef.current) {
        const res = await fetch("/api/admin/data-manager", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...params }),
        });
        const data = await res.json();
        if (data.error) {
          setProgress((p) => ({ ...p, label: `Error: ${data.error}` }));
          break;
        }

        totalDeleted += data.deleted;
        if (initial === null) initial = totalDeleted + data.remaining;
        const pct = initial! > 0 ? Math.round(((initial! - data.remaining) / initial!) * 100) : 100;

        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const speed = elapsed > 0 ? Math.round(totalDeleted / elapsed) : 0;
        const etaSec = speed > 0 ? data.remaining / speed : 0;

        setProgress({
          label: data.done ? "Complete!" : cancelledRef.current ? "Cancelled" : "Deleting...",
          deleted: totalDeleted,
          remaining: data.remaining,
          pct,
          speed,
          eta: etaSec > 0 ? formatTime(etaSec) : "--",
        });

        if (data.done) {
          setTimeout(() => router.refresh(), 1500);
          break;
        }
      }
      if (cancelledRef.current) {
        setProgress(p => ({ ...p, label: "Cancelled" }));
      }
    } catch (e: any) {
      setProgress((p) => ({ ...p, label: `Error: ${e.message}` }));
    } finally {
      setRunning(false);
    }
  }

  async function runOneShot(action: string, params: Record<string, string> = {}, desc: string) {
    if (running) return;
    if (!confirm(`Are you sure?\n\n${desc}\n\nClick OK to proceed.`)) return;

    setRunning(true);
    setProgress({ label: "Running...", deleted: 0, remaining: 0, pct: 50, speed: 0, eta: "" });

    try {
      const res = await fetch("/api/admin/data-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...params }),
      });
      const data = await res.json();
      if (data.error) {
        setProgress({ label: `Error: ${data.error}`, deleted: 0, remaining: 0, pct: 0, speed: 0, eta: "" });
      } else {
        setProgress({ label: "Complete!", deleted: data.deleted || 0, remaining: 0, pct: 100, speed: 0, eta: "" });
        setTimeout(() => router.refresh(), 1500);
      }
    } catch (e: any) {
      setProgress((p) => ({ ...p, label: `Error: ${e.message}` }));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Progress bar */}
      {(running || progress.deleted > 0) && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-3">
            {running && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            <span className="text-sm font-medium">{progress.label}</span>
            {running && (
              <button
                onClick={() => { cancelledRef.current = true; }}
                className="ml-auto h-7 px-3 text-xs text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
            )}
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.max(progress.pct, 2)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress.deleted.toLocaleString()} deleted
              {progress.remaining > 0 && ` · ${progress.remaining.toLocaleString()} remaining`}
            </span>
            <span>
              {progress.speed > 0 && `${progress.speed.toLocaleString()}/s`}
              {progress.eta && progress.eta !== "--" && ` · ETA ${progress.eta}`}
              {progress.pct > 0 && ` · ${progress.pct}%`}
            </span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-primary">{total.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Total Leads</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold">{(statusMap.new || 0).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">New</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-red-500">{(statusMap.declined || 0).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Declined</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-yellow-500">{duplicates.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Dup. Phones</p>
        </div>
      </div>

      {/* Import batches */}
      {batches.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Import Batches</h3>
          <div className="flex flex-wrap gap-2">
            {batches.map((b) => (
              <span key={b.ref} className="px-3 py-1 bg-card border border-border rounded-full text-xs font-medium">
                {b.ref} ({b.count.toLocaleString()})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
        <p className="text-sm">
          <strong>Warning:</strong> All delete actions are <strong>permanent and irreversible</strong>.
          Linked cards, comments, attachments, call logs, and sub-records are also deleted.
        </p>
      </div>

      {/* Delete Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Delete All */}
        <div className="bg-card border border-red-500/30 rounded-xl p-5">
          <h3 className="text-red-500 font-semibold mb-2 flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Delete ALL Leads
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Permanently deletes every lead including all linked data.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Type DELETE to confirm'
            className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm mb-3"
          />
          <button
            onClick={() => {
              if (confirmText !== "DELETE") { alert("Type DELETE to confirm"); return; }
              runBatchDelete("delete_all", {}, `delete ALL ${total.toLocaleString()} leads`);
            }}
            disabled={running || confirmText !== "DELETE"}
            className="w-full h-9 bg-red-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-red-600 transition-colors"
          >
            Delete All {total.toLocaleString()} Leads
          </button>
        </div>

        {/* Delete by Status */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-2">Delete by Status</h3>
          <p className="text-sm text-muted-foreground mb-4">Delete all leads with a specific status.</p>
          <div className="flex flex-wrap gap-2">
            {["new", "in_review", "approved", "declined", "forwarded", "on_hold"].map((s) => (
              <button
                key={s}
                onClick={() => runBatchDelete("delete_by_status", { status: s }, `delete all ${s} leads`)}
                disabled={running}
                className="px-3 py-1.5 bg-muted border border-border rounded-lg text-xs font-medium hover:bg-muted/80 disabled:opacity-50 capitalize"
              >
                {s.replace("_", " ")} ({(statusMap[s] || 0).toLocaleString()})
              </button>
            ))}
          </div>
        </div>

        {/* Delete Duplicates */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-2">Delete Duplicates</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Remove duplicate leads by phone. Keeps the newest lead per phone number.
          </p>
          <button
            onClick={() => runBatchDelete("delete_duplicates", {}, `delete ${duplicates} duplicate leads`)}
            disabled={running}
            className="h-9 px-4 bg-yellow-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-yellow-600 transition-colors"
          >
            Delete {duplicates.toLocaleString()} Duplicates
          </button>
        </div>

        {/* Delete by Import Batch */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-2">Delete by Import Batch</h3>
          <p className="text-sm text-muted-foreground mb-3">Delete all leads from a specific import.</p>
          <div className="flex flex-wrap gap-2">
            {batches.slice(0, 8).map((b) => (
              <button
                key={b.ref}
                onClick={() => runBatchDelete("delete_by_import_ref", { importRef: b.ref }, `delete ${b.count} leads from ${b.ref}`)}
                disabled={running}
                className="px-3 py-1.5 bg-muted border border-border rounded-lg text-xs font-medium hover:bg-muted/80 disabled:opacity-50"
              >
                {b.ref} ({b.count.toLocaleString()})
              </button>
            ))}
          </div>
        </div>

        {/* Delete by Age */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Database className="w-4 h-4" /> Delete by Age
          </h3>
          <p className="text-sm text-muted-foreground mb-3">Delete leads older than N days.</p>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              value={ageDays}
              onChange={(e) => setAgeDays(e.target.value)}
              placeholder="Days"
              className="w-24 h-9 px-3 bg-muted border border-border rounded-lg text-sm"
            />
            <button
              onClick={() => {
                const d = parseInt(ageDays);
                if (!d || d < 1) { alert("Enter a valid number of days"); return; }
                runBatchDelete("delete_by_age", { days: String(d) }, `delete leads older than ${d} days`);
              }}
              disabled={running}
              className="h-9 px-4 bg-red-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-red-600 transition-colors"
            >
              Delete Old Leads
            </button>
          </div>
        </div>

        {/* Delete by Agent */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Delete by Agent
          </h3>
          <p className="text-sm text-muted-foreground mb-3">Delete all leads belonging to a specific agent.</p>
          <div className="flex gap-2">
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="flex-1 h-9 px-3 bg-muted border border-border rounded-lg text-sm"
            >
              <option value="">Select agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.fullName} ({a.username})
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!selectedAgent) { alert("Select an agent"); return; }
                const agent = agents.find(a => String(a.id) === selectedAgent);
                runBatchDelete("delete_by_agent", { agentId: selectedAgent }, `delete all leads for agent: ${agent?.fullName || selectedAgent}`);
              }}
              disabled={running || !selectedAgent}
              className="h-9 px-4 bg-red-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Delete by Ref Numbers */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Hash className="w-4 h-4" /> Delete by Ref Numbers
          </h3>
          <p className="text-sm text-muted-foreground mb-3">Delete leads by ref number (comma or newline separated).</p>
          <textarea
            value={refNumbers}
            onChange={(e) => setRefNumbers(e.target.value)}
            placeholder="REF001, REF002, REF003..."
            rows={3}
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm mb-2 resize-none"
          />
          <button
            onClick={() => {
              if (!refNumbers.trim()) { alert("Enter ref numbers"); return; }
              const count = refNumbers.split(/[,\n\r]+/).filter(r => r.trim()).length;
              runBatchDelete("delete_by_ref_numbers", { refNumbers }, `delete ${count} leads by ref numbers`);
            }}
            disabled={running || !refNumbers.trim()}
            className="h-9 px-4 bg-red-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-red-600 transition-colors"
          >
            Delete by Ref
          </button>
        </div>

        {/* Remove Bad Phones */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Phone className="w-4 h-4" /> Remove Bad Phones
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            <strong>Delete</strong> leads where phone has fewer than 10 or more than 15 digits.
          </p>
          <button
            onClick={() => runBatchDelete("remove_bad_phones", {}, "delete leads with bad phone numbers (<10 or >15 digits)")}
            disabled={running}
            className="h-9 px-4 bg-red-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-red-600 transition-colors"
          >
            Remove Bad Phones
          </button>
        </div>

        {/* Clear Bad Phones */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Phone className="w-4 h-4" /> Clear Bad Phones
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Set phone to NULL on leads with bad phone numbers. Does not delete leads.
          </p>
          <button
            onClick={() => runOneShot("clear_bad_phones", {}, "clear bad phone numbers (set to NULL)")}
            disabled={running}
            className="h-9 px-4 bg-yellow-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-yellow-600 transition-colors"
          >
            Clear Bad Phones
          </button>
        </div>

        {/* Reset Lead Scores */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <RotateCcw className="w-4 h-4" /> Reset Lead Scores
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Set lead_score to 0 for all leads.
          </p>
          <button
            onClick={() => runOneShot("reset_scores", {}, "reset all lead scores to 0")}
            disabled={running}
            className="h-9 px-4 bg-yellow-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-yellow-600 transition-colors"
          >
            Reset All Scores
          </button>
        </div>

        {/* Purge Audit Log */}
        <div className="bg-card border border-red-500/30 rounded-xl p-5">
          <h3 className="text-red-500 font-semibold mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Purge Audit Log
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Truncate the entire audit log table.
          </p>
          <button
            onClick={() => runOneShot("purge_audit", {}, "TRUNCATE the entire audit log table")}
            disabled={running}
            className="h-9 px-4 bg-red-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-red-600 transition-colors"
          >
            Purge Audit Log
          </button>
        </div>
      </div>
    </div>
  );
}
