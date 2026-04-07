"use client";

import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, Loader2, CheckCircle } from "lucide-react";

export function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "done" | "error">("idle");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setStatus("uploading");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.upload.onload = () => {
        setStatus("processing");
      };

      xhr.onload = () => {
        setUploading(false);
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success) {
            setStatus("done");
            setResult(data);
          } else {
            setStatus("error");
            setError(data.error || "Import failed");
          }
        } catch {
          setStatus("error");
          setError("Invalid response");
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        setStatus("error");
        setError("Network error");
      };

      xhr.open("POST", "/api/leads/import");
      xhr.send(formData);
    } catch (e: any) {
      setUploading(false);
      setStatus("error");
      setError(e.message);
    }
  }

  function formatBytes(b: number) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Drop zone */}
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
        <p className="text-sm text-muted-foreground">CSV · TXT · TSV · DAT · XLSX · ZIP — Up to 200MB</p>
      </div>

      {/* File info */}
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
            {uploading ? "Uploading…" : "Start Import"}
          </button>
        </div>
      )}

      {/* Progress */}
      {status !== "idle" && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          {status === "uploading" && (
            <>
              <div className="flex justify-between text-sm">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </>
          )}
          {status === "processing" && (
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm">Processing file…</span>
            </div>
          )}
          {status === "done" && (
            <div className="flex items-center gap-3 text-green-500">
              <CheckCircle className="w-5 h-5" />
              <div>
                <p className="font-medium">Import Complete!</p>
                {result && (
                  <p className="text-sm text-muted-foreground">
                    {result.imported?.toLocaleString()} imported, {result.failed?.toLocaleString()} failed
                  </p>
                )}
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="text-red-500 text-sm">{error}</div>
          )}
        </div>
      )}

      <div className="bg-muted/50 border border-border rounded-xl p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> First row must be a header row. Delimiter is auto-detected.
          XLSX files are auto-converted. ZIP files are extracted automatically.
          Use AI Auto-Map for instant column mapping.
        </p>
      </div>
    </div>
  );
}
