"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, Database, Loader2 } from "lucide-react";

interface Props {
  total: number;
  statusMap: Record<string, number>;
  batches: { ref: string; count: number }[];
  duplicates: number;
}

export function DataManagerClient({ total, statusMap, batches, duplicates }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ label: "", deleted: 0, remaining: 0, pct: 0 });
  const [confirmText, setConfirmText] = useState("");

  async function runBatchDelete(action: string, params: Record<string, string> = {}, desc: string) {
    if (running) return;
    if (!confirm(`FINAL WARNING\n\nYou are about to: ${desc}\n\nThis is PERMANENT and cannot be undone.\n\nClick OK to proceed.`)) return;

    setRunning(true);
    setProgress({ label: "Starting...", deleted: 0, remaining: 0, pct: 0 });
    let totalDeleted = 0;
    let initial: number | null = null;

    try {
      while (true) {
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

        setProgress({
          label: data.done ? "Complete!" : "Deleting...",
          deleted: totalDeleted,
          remaining: data.remaining,
          pct,
        });

        if (data.done) {
          setTimeout(() => router.refresh(), 1500);
          break;
        }
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
        <div className="bg-card border border-primary/30 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            {running && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            <span className="text-sm font-medium">{progress.label}</span>
            <span className="ml-auto text-sm text-muted-foreground">
              {progress.deleted.toLocaleString()} deleted
              {progress.remaining > 0 && `, ${progress.remaining.toLocaleString()} remaining`}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.max(progress.pct, 2)}%` }}
            />
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
      </div>
    </div>
  );
}
