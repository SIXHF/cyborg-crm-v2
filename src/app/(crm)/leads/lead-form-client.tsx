"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";

interface Props {
  agents: { id: number; fullName: string }[];
  customFields: any[];
  currentUser: { id: number; role: string; fullName: string };
  initialData?: any;
}

const statuses = ["new", "in_review", "approved", "declined", "forwarded", "on_hold"];

export function LeadFormClient({ agents, customFields, currentUser, initialData }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!initialData;

  const [form, setForm] = useState({
    firstName: initialData?.firstName || "",
    lastName: initialData?.lastName || "",
    email: initialData?.email || "",
    phone: initialData?.phone || "",
    landline: initialData?.landline || "",
    dob: initialData?.dob || "",
    ssnLast4: initialData?.ssnLast4 || "",
    mmn: initialData?.mmn || "",
    county: initialData?.county || "",
    vpass: initialData?.vpass || "",
    address: initialData?.address || "",
    city: initialData?.city || "",
    state: initialData?.state || "",
    zip: initialData?.zip || "",
    country: initialData?.country || "",
    annualIncome: initialData?.annualIncome || "",
    employmentStatus: initialData?.employmentStatus || "",
    creditScoreRange: initialData?.creditScoreRange || "",
    requestedLimit: initialData?.requestedLimit || "",
    cardType: initialData?.cardType || "",
    cardNumberBin: initialData?.cardNumberBin || "",
    cardBrand: initialData?.cardBrand || "",
    cardIssuer: initialData?.cardIssuer || "",
    businessName: initialData?.businessName || "",
    businessEin: initialData?.businessEin || "",
    mortgageBank: initialData?.mortgageBank || "",
    mortgagePayment: initialData?.mortgagePayment || "",
    status: initialData?.status || "new",
    agentId: initialData?.agentId?.toString() || currentUser.id.toString(),
    notes: initialData?.notes || "",
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const url = isEdit ? `/api/leads/${initialData.id}` : "/api/leads";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success || data.id) {
        router.push(`/leads/${data.id || initialData?.id}`);
        router.refresh();
      } else {
        setError(data.error || "Failed to save");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function renderField(label: string, name: string, type = "text", placeholder?: string) {
    return (
      <div key={name}>
        <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
        <input
          type={type}
          name={name}
          value={(form as any)[name] || ""}
          onChange={(e) => update(name, e.target.value)}
          placeholder={placeholder}
          className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-4 mb-2">
        <button type="button" onClick={() => router.back()} className="p-2 hover:bg-muted rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold">{isEdit ? "Edit Lead" : "New Lead"}</h2>
      </div>

      {error && <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-lg">{error}</div>}

      {/* Personal */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {renderField("First Name", "firstName")}
          {renderField("Last Name", "lastName")}
          {renderField("Email", "email", "email")}
          {renderField("Phone", "phone", "text", "10-digit phone")}
          {renderField("Landline", "landline")}
          {renderField("Date of Birth", "dob", "date")}
          {renderField("SSN Last 4", "ssnLast4", "text", "1234")}
          {renderField("Mother's Maiden Name", "mmn")}
          {renderField("County", "county")}
        </div>
      </div>

      {/* Address */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">{renderField("Address", "address")}</div>
          {renderField("City", "city")}
          {renderField("State", "state")}
          {renderField("ZIP", "zip")}
          {renderField("Country", "country")}
        </div>
      </div>

      {/* Financial */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Financial</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {renderField("Annual Income", "annualIncome", "number")}
          {renderField("Employment Status", "employmentStatus")}
          {renderField("Credit Score Range", "creditScoreRange")}
          {renderField("Requested Limit", "requestedLimit", "number")}
          {renderField("Card Type", "cardType")}
          {renderField("Card BIN", "cardNumberBin")}
          {renderField("Card Brand", "cardBrand")}
          {renderField("Card Issuer", "cardIssuer")}
        </div>
      </div>

      {/* Business */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Business</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {renderField("Business Name", "businessName")}
          {renderField("EIN", "businessEin")}
          {renderField("Mortgage Bank", "mortgageBank")}
          {renderField("Mortgage Payment", "mortgagePayment", "number")}
          {renderField("V-Pass", "vpass")}
        </div>
      </div>

      {/* Assignment */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Assignment & Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => update("status", e.target.value)}
              className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Agent</label>
            <select
              value={form.agentId}
              onChange={(e) => update("agentId", e.target.value)}
              className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id.toString()}>{a.fullName}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              className="w-full h-24 px-3 py-2 bg-muted border border-border rounded-lg text-sm resize-none"
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="h-10 px-6 border border-border rounded-lg text-sm font-medium hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="h-10 px-6 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Lead"}
        </button>
      </div>
    </form>
  );
}
