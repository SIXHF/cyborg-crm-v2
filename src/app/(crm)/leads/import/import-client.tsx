"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileSpreadsheet, Loader2, CheckCircle, XCircle, ArrowRight, X } from "lucide-react";

type Step = "upload" | "preview" | "importing" | "done" | "error";

interface MappedColumn {
  columnIndex: number;
  column: string;
  mappedTo: string;
}

interface UploadResult {
  jobId: number;
  filename: string;
  totalRows: number;
  headers: string[];
  delimiter: string;
  previewRows: Record<string, string>[];
  mapping: MappedColumn[];
}

interface ImportStats {
  processed: number;
  imported: number;
  failed: number;
  total: number;
  done: boolean;
  speed: number; // rows/sec
  eta: number; // seconds remaining
  chunkMs: number;
}

const CHUNK_SIZE = 50000;
const PARALLEL_CHUNKS = 4; // Send 4 chunk requests in parallel

export function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [stats, setStats] = useState<ImportStats>({
    processed: 0, imported: 0, failed: 0, total: 0,
    done: false, speed: 0, eta: 0, chunkMs: 0,
  });
  const [error, setError] = useState("");
  const cancelledRef = useRef(false);
  const startTimeRef = useRef(0);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  function formatBytes(b: number) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }

  function formatTime(seconds: number) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  // Step 1: Upload file
  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setStep("upload");
    setError("");
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success) {
              resolve(data as UploadResult);
            } else {
              reject(new Error(data.error || "Upload failed"));
            }
          } catch {
            reject(new Error("Invalid server response"));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));

        xhr.open("POST", "/api/leads/import");
        xhr.send(formData);
      });

      setUploadResult(result);
      setStats(s => ({ ...s, total: result.totalRows }));
      setStep("preview");
    } catch (e: any) {
      setError(e.message);
      setStep("error");
    } finally {
      setUploading(false);
    }
  }

  const [importPhase, setImportPhase] = useState<"preparing" | "importing" | "finalizing" | "">("");

  // Step 3: Start parallel chunked import with index management
  async function startImport() {
    if (!uploadResult) return;
    cancelledRef.current = false;
    startTimeRef.current = Date.now();
    setStep("importing");
    setStats({
      processed: 0, imported: 0, failed: 0,
      total: uploadResult.totalRows, done: false,
      speed: 0, eta: 0, chunkMs: 0,
    });

    try {
      // Phase 1: Drop indexes for faster inserts
      setImportPhase("preparing");
      const prepRes = await fetch("/api/leads/import/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: uploadResult.jobId }),
      });
      if (!prepRes.ok) {
        const data = await prepRes.json().catch(() => ({ error: "Prepare failed" }));
        throw new Error(data.error || "Failed to prepare database");
      }

      // Phase 2: Import chunks
      setImportPhase("importing");
      await processChunksParallel(uploadResult.jobId, uploadResult.totalRows);
    } catch (e: any) {
      if (!cancelledRef.current) {
        setError(e.message);
        setStep("error");
      }
    } finally {
      // Phase 3: Always recreate indexes, even on error/cancel
      setImportPhase("finalizing");
      try {
        await fetch("/api/leads/import/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: uploadResult.jobId }),
        });
      } catch {
        console.error("Failed to recreate indexes after import");
      }
      setImportPhase("");
    }
  }

  async function processChunksParallel(jobId: number, total: number) {
    const totalChunks = Math.ceil(total / CHUNK_SIZE);
    let nextChunk = 0;
    let totalProcessed = 0;
    let totalImported = 0;
    let totalFailed = 0;
    let lastChunkMs = 0;

    // Process chunks with N parallel workers
    async function processOneChunk(chunkIndex: number): Promise<{
      processed: number; imported: number; failed: number; chunkMs: number; done: boolean;
    }> {
      const res = await fetch("/api/leads/import/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, chunkIndex }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      return res.json();
    }

    while (nextChunk < totalChunks && !cancelledRef.current) {
      // Launch up to PARALLEL_CHUNKS requests in parallel
      const batch: number[] = [];
      for (let i = 0; i < PARALLEL_CHUNKS && nextChunk < totalChunks; i++) {
        batch.push(nextChunk++);
      }

      const results = await Promise.all(batch.map(idx => processOneChunk(idx)));

      for (const data of results) {
        totalImported = data.imported; // Server returns cumulative totals
        totalFailed = data.failed;
        totalProcessed = data.processed;
        lastChunkMs = data.chunkMs || 0;
      }

      // Use the max processed value from all results (atomic server-side updates)
      const maxProcessed = Math.max(...results.map(r => r.processed));
      totalProcessed = maxProcessed;
      totalImported = Math.max(...results.map(r => r.imported));
      totalFailed = Math.max(...results.map(r => r.failed));

      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const speed = elapsed > 0 ? totalProcessed / elapsed : 0;
      const remaining = total - totalProcessed;
      const eta = speed > 0 ? remaining / speed : 0;

      setStats({
        processed: totalProcessed,
        imported: totalImported,
        failed: totalFailed,
        total,
        done: totalProcessed >= total,
        speed: Math.round(speed),
        eta,
        chunkMs: lastChunkMs,
      });

      if (totalProcessed >= total || results.some(r => r.done)) {
        setStep("done");
        return;
      }
    }
  }

  function handleCancel() {
    cancelledRef.current = true;
    setStep("upload");
    setFile(null);
    setUploadResult(null);
    setUploadProgress(0);
  }

  function handleReset() {
    setStep("upload");
    setFile(null);
    setUploadResult(null);
    setUploadProgress(0);
    setError("");
    setStats({ processed: 0, imported: 0, failed: 0, total: 0, done: false, speed: 0, eta: 0, chunkMs: 0 });
  }

  const pct = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Step 1: Upload */}
      {(step === "upload" || step === "error") && (
        <>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => document.getElementById("fileInput")?.click()}
          >
            <input
              id="fileInput"
              type="file"
              accept=".csv,.txt,.tsv,.dat,.xlsx,.zip"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="font-medium mb-1">Drag & drop file here</p>
            <p className="text-sm text-muted-foreground">CSV, TXT, TSV, DAT, ZIP -- Up to 200MB</p>
          </div>

          {file && (
            <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Uploading..." : "Upload File"}
              </button>
            </div>
          )}

          {uploading && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="bg-card border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-500">Error</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="bg-muted/50 border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Note:</strong> First row must be a header row. Delimiter is auto-detected.
              ZIP files are extracted automatically. Large files (200K+ rows) are processed in chunks.
            </p>
          </div>
        </>
      )}

      {/* Step 2: Preview / Column Mapping */}
      {step === "preview" && uploadResult && (
        <>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">File Analyzed</h3>
                <p className="text-sm text-muted-foreground mt-1">{uploadResult.filename}</p>
              </div>
              <button
                onClick={handleReset}
                className="h-8 px-3 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground">Total Rows</p>
                <p className="font-semibold text-lg">{uploadResult.totalRows.toLocaleString()}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground">Columns Detected</p>
                <p className="font-semibold text-lg">{uploadResult.headers.length}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-muted-foreground">Columns Mapped</p>
                <p className="font-semibold text-lg">{uploadResult.mapping.length}</p>
              </div>
            </div>

            {/* Column mapping table */}
            {uploadResult.mapping.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Auto-Mapped Columns</p>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">CSV Column</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground"></th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Mapped To</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {uploadResult.mapping.map((m, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-mono text-xs">{m.column}</td>
                          <td className="px-3 py-2 text-muted-foreground"><ArrowRight className="w-3.5 h-3.5" /></td>
                          <td className="px-3 py-2 font-medium">{m.mappedTo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Preview rows */}
            {uploadResult.previewRows.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Preview (first {uploadResult.previewRows.length} rows)</p>
                <div className="border border-border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        {uploadResult.mapping.map((m, i) => (
                          <th key={i} className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap">{m.mappedTo}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {uploadResult.previewRows.map((row, ri) => (
                        <tr key={ri}>
                          {uploadResult.mapping.map((m, ci) => (
                            <td key={ci} className="px-2 py-1.5 whitespace-nowrap max-w-[200px] truncate">{row[m.mappedTo] || ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <button
              onClick={startImport}
              className="w-full h-10 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/90"
            >
              <Upload className="w-4 h-4" />
              Start Import ({uploadResult.totalRows.toLocaleString()} rows)
            </button>
          </div>
        </>
      )}

      {/* Step 3: Import Progress */}
      {step === "importing" && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">
              {importPhase === "preparing" ? "Preparing database..." :
               importPhase === "finalizing" ? "Rebuilding indexes..." :
               "Importing..."}
            </h3>
            <button
              onClick={handleCancel}
              className="h-8 px-3 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{stats.processed.toLocaleString()} / {stats.total.toLocaleString()} rows</span>
              <span>{pct}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Imported</p>
              <p className="font-semibold text-green-500">{stats.imported.toLocaleString()}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Failed</p>
              <p className="font-semibold text-red-500">{stats.failed.toLocaleString()}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Speed</p>
              <p className="font-semibold">{stats.speed.toLocaleString()} rows/s</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">ETA</p>
              <p className="font-semibold">{stats.eta > 0 ? formatTime(stats.eta) : "--"}</p>
            </div>
          </div>

          {stats.chunkMs > 0 && (
            <p className="text-xs text-muted-foreground">
              {importPhase === "preparing" ? "Dropping indexes for faster import..." :
               importPhase === "finalizing" ? "Recreating search indexes (this may take a minute)..." :
               `Last chunk: ${stats.chunkMs}ms | ${PARALLEL_CHUNKS} parallel workers`}
            </p>
          )}
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3 text-green-500">
            <CheckCircle className="w-6 h-6" />
            <h3 className="font-semibold text-lg">Import Complete</h3>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground">Total Rows</p>
              <p className="font-semibold text-lg">{stats.total.toLocaleString()}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground">Imported</p>
              <p className="font-semibold text-lg text-green-500">{stats.imported.toLocaleString()}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-muted-foreground">Failed</p>
              <p className="font-semibold text-lg text-red-500">{stats.failed.toLocaleString()}</p>
            </div>
          </div>

          {stats.speed > 0 && (
            <p className="text-sm text-muted-foreground">
              Average speed: {stats.speed.toLocaleString()} rows/sec
              {" "} -- Total time: {formatTime((Date.now() - startTimeRef.current) / 1000)}
            </p>
          )}

          <button
            onClick={handleReset}
            className="w-full h-10 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
}
