"use client";

import { useState } from "react";
import {
  Settings2, CheckCircle2, XCircle, Search, Plus, Trash2, X, ToggleLeft, ToggleRight,
} from "lucide-react";

interface FieldRow {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  options: string[] | null;
  isRequired: boolean;
  isSearchable: boolean;
  showInList: boolean;
  isActive: boolean;
  sortOrder: number;
}

export function FieldsClient({ fields: initialFields }: { fields: FieldRow[] }) {
  const [fieldsList, setFieldsList] = useState(initialFields);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    label: "",
    fieldType: "text",
    options: "",
    isRequired: false,
    isSearchable: false,
    showInList: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);

  function generateFieldKey(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const fieldKey = generateFieldKey(form.label);
      const body: Record<string, unknown> = {
        fieldKey,
        label: form.label,
        fieldType: form.fieldType,
        isRequired: form.isRequired,
        isSearchable: form.isSearchable,
        showInList: form.showInList,
      };
      if (form.fieldType === "select" && form.options.trim()) {
        body.options = form.options.split("\n").map((o) => o.trim()).filter(Boolean);
      }

      const res = await fetch("/api/custom-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create field");
        return;
      }
      setShowForm(false);
      setForm({ label: "", fieldType: "text", options: "", isRequired: false, isSearchable: false, showInList: false });
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(fieldId: number) {
    if (!confirm("Are you sure you want to delete this field?")) return;
    setDeleting(fieldId);
    try {
      const res = await fetch("/api/custom-fields", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: fieldId }),
      });
      if (res.ok) {
        setFieldsList((prev) => prev.filter((f) => f.id !== fieldId));
      }
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggleActive(field: FieldRow) {
    setToggling(field.id);
    try {
      const res = await fetch("/api/custom-fields", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: field.id, isActive: !field.isActive }),
      });
      if (res.ok) {
        setFieldsList((prev) =>
          prev.map((f) => (f.id === field.id ? { ...f, isActive: !f.isActive } : f))
        );
      }
    } catch {
      // ignore
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Custom Fields</h2>
          <span className="text-sm text-muted-foreground">({fieldsList.length})</span>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(""); }}
          className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Field
        </button>
      </div>

      {fieldsList.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Settings2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No custom fields defined</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-left">
                <th className="px-4 py-3 font-medium">Sort</th>
                <th className="px-4 py-3 font-medium">Field Key</th>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Required</th>
                <th className="px-4 py-3 font-medium">Searchable</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fieldsList.map((field) => (
                <tr key={field.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{field.sortOrder}</td>
                  <td className="px-4 py-3 font-mono text-xs">{field.fieldKey}</td>
                  <td className="px-4 py-3 font-medium">{field.label}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                      {field.fieldType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {field.isRequired ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-muted-foreground/40" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {field.isSearchable ? (
                      <Search className="w-4 h-4 text-blue-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-muted-foreground/40" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(field)}
                      disabled={toggling === field.id}
                      className="flex items-center gap-1 disabled:opacity-50"
                      title={field.isActive ? "Click to deactivate" : "Click to activate"}
                    >
                      {field.isActive ? (
                        <ToggleRight className="w-5 h-5 text-green-500" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span className={`text-xs font-medium ${field.isActive ? "text-green-500" : "text-muted-foreground"}`}>
                        {field.isActive ? "Active" : "Inactive"}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(field.id)}
                      disabled={deleting === field.id}
                      className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Delete"
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

      {/* Add Field Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl w-full max-w-md mx-4 shadow-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">Add Custom Field</h3>
              <button onClick={() => setShowForm(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Label</label>
                <input
                  type="text"
                  required
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                  placeholder="e.g. Preferred Contact Method"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Field Key <span className="text-muted-foreground">(auto-generated)</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={generateFieldKey(form.label)}
                  className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-muted-foreground font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Field Type</label>
                <select
                  value={form.fieldType}
                  onChange={(e) => setForm((f) => ({ ...f, fieldType: e.target.value }))}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="select">Select</option>
                  <option value="textarea">Textarea</option>
                  <option value="checkbox">Checkbox</option>
                </select>
              </div>
              {form.fieldType === "select" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Options <span className="text-muted-foreground">(one per line)</span>
                  </label>
                  <textarea
                    value={form.options}
                    onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm resize-none"
                    placeholder={"Option 1\nOption 2\nOption 3"}
                  />
                </div>
              )}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isRequired}
                    onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))}
                    className="rounded"
                  />
                  Required
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isSearchable}
                    onChange={(e) => setForm((f) => ({ ...f, isSearchable: e.target.checked }))}
                    className="rounded"
                  />
                  Searchable
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.showInList}
                    onChange={(e) => setForm((f) => ({ ...f, showInList: e.target.checked }))}
                    className="rounded"
                  />
                  Show in List
                </label>
              </div>
              {error && (
                <div className="text-sm px-3 py-2 rounded-lg bg-red-500/10 text-red-500">{error}</div>
              )}
              <button
                type="submit"
                disabled={saving}
                className="w-full h-10 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Field"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
