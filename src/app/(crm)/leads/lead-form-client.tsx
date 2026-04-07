"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, CreditCard, Plus, Pencil, Trash2, X, Check, Users, Briefcase, Car } from "lucide-react";

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

  // Card management state
  const [cards, setCards] = useState<any[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [showNewCard, setShowNewCard] = useState(false);
  const [cardSaving, setCardSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const emptyCard = { bank: "", cardType: "", noc: "", ccn: "", cvc: "", expDate: "", creditLimit: "", balance: "" };
  const [newCardForm, setNewCardForm] = useState<Record<string, any>>({ ...emptyCard });
  const [editCardForm, setEditCardForm] = useState<Record<string, any>>({});

  // Sub-entity counts
  const [subCounts, setSubCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isEdit && initialData?.id) {
      setCardsLoading(true);
      fetch(`/api/leads/${initialData.id}/cards`)
        .then((r) => r.json())
        .then((data) => { setCards(Array.isArray(data) ? data : []); })
        .catch(() => {})
        .finally(() => setCardsLoading(false));

      // Fetch sub-entity counts
      fetch(`/api/leads/${initialData.id}`)
        .then((r) => r.json())
        .then((data) => {
          setSubCounts({
            cosigners: data.cosigners?.length || 0,
            employers: data.employers?.length || 0,
            vehicles: data.vehicles?.length || 0,
            relatives: data.relatives?.length || 0,
            addresses: data.addresses?.length || 0,
          });
        })
        .catch(() => {});
    }
  }, []);

  function maskCardNumber(ccn: string) {
    if (!ccn || ccn.length < 4) return ccn || "";
    return "•••• •••• •••• " + ccn.slice(-4);
  }

  async function saveNewCard() {
    if (!initialData?.id) return;
    setCardSaving(true);
    try {
      const res = await fetch(`/api/leads/${initialData.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newCardForm,
          creditLimit: newCardForm.creditLimit ? parseFloat(newCardForm.creditLimit) : null,
          balance: newCardForm.balance ? parseFloat(newCardForm.balance) : null,
        }),
      });
      const data = await res.json();
      if (data.success && data.card) {
        setCards((prev) => [...prev, data.card]);
        setNewCardForm({ ...emptyCard });
        setShowNewCard(false);
      }
    } catch {}
    setCardSaving(false);
  }

  async function saveEditCard(cardId: number) {
    if (!initialData?.id) return;
    setCardSaving(true);
    try {
      const res = await fetch(`/api/leads/${initialData.id}/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId,
          ...editCardForm,
          creditLimit: editCardForm.creditLimit ? parseFloat(editCardForm.creditLimit) : null,
          balance: editCardForm.balance ? parseFloat(editCardForm.balance) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, ...editCardForm } : c)));
        setEditingCardId(null);
        setEditCardForm({});
      }
    } catch {}
    setCardSaving(false);
  }

  async function deleteCard(cardId: number) {
    if (!initialData?.id) return;
    try {
      const res = await fetch(`/api/leads/${initialData.id}/cards`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      const data = await res.json();
      if (data.success) {
        setCards((prev) => prev.filter((c) => c.id !== cardId));
      }
    } catch {}
    setDeleteConfirmId(null);
  }

  function startEditCard(card: any) {
    setEditingCardId(card.id);
    setEditCardForm({
      bank: card.bank || "",
      cardType: card.cardType || "",
      noc: card.noc || "",
      ccn: card.ccn || "",
      cvc: card.cvc || "",
      expDate: card.expDate || "",
      creditLimit: card.creditLimit || "",
      balance: card.balance || "",
    });
  }

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
    // Validate: at least one identifier required
    if (!form.firstName && !form.phone && !form.email) {
      setError("At least one of First Name, Phone, or Email is required.");
      return;
    }

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

      {/* Custom Fields */}
      {customFields.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Custom Fields</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {customFields.map((cf: any) => {
              const cfKey = `cf_${cf.fieldKey}`;
              const cfValue = (form as any)[cfKey] || initialData?.customFields?.[cf.fieldKey] || "";
              return (
                <div key={cf.id}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {cf.label} {cf.isRequired && <span className="text-red-500">*</span>}
                  </label>
                  {cf.fieldType === "select" ? (
                    <select
                      value={cfValue}
                      onChange={(e) => update(cfKey, e.target.value)}
                      className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                    >
                      <option value="">Select...</option>
                      {(cf.options || []).map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : cf.fieldType === "textarea" ? (
                    <textarea
                      value={cfValue}
                      onChange={(e) => update(cfKey, e.target.value)}
                      className="w-full h-20 px-3 py-2 bg-muted border border-border rounded-lg text-sm resize-none"
                    />
                  ) : cf.fieldType === "checkbox" ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={cfValue === "1" || cfValue === true}
                        onChange={(e) => update(cfKey, e.target.checked ? "1" : "0")}
                        className="rounded"
                      />
                      <span className="text-sm">{cf.label}</span>
                    </label>
                  ) : (
                    <input
                      type={cf.fieldType === "number" ? "number" : cf.fieldType === "date" ? "date" : "text"}
                      value={cfValue}
                      onChange={(e) => update(cfKey, e.target.value)}
                      className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cards — edit mode only */}
      {isEdit && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Cards
            </h3>
            <button
              type="button"
              onClick={() => { setShowNewCard(true); setNewCardForm({ ...emptyCard }); }}
              className="h-8 px-3 bg-primary text-primary-foreground rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5" /> Add Card
            </button>
          </div>

          {cardsLoading && <p className="text-sm text-muted-foreground">Loading cards...</p>}

          {/* Existing cards */}
          {cards.map((card) => (
            <div key={card.id} className="border border-border rounded-lg p-4 mb-3 bg-muted/30">
              {editingCardId === card.id ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {[
                      { label: "Bank/Issuer", key: "bank", type: "text" },
                      { label: "Card Type", key: "cardType", type: "text" },
                      { label: "Name on Card", key: "noc", type: "text" },
                      { label: "Card Number", key: "ccn", type: "text" },
                      { label: "CVC", key: "cvc", type: "text" },
                      { label: "Expiry (MM/YY)", key: "expDate", type: "text" },
                      { label: "Credit Limit", key: "creditLimit", type: "number" },
                      { label: "Balance", key: "balance", type: "number" },
                    ].map((f) => (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">{f.label}</label>
                        <input
                          type={f.type}
                          value={editCardForm[f.key] || ""}
                          onChange={(e) => setEditCardForm((prev: Record<string, any>) => ({ ...prev, [f.key]: e.target.value }))}
                          className="w-full h-8 px-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => saveEditCard(card.id)}
                      disabled={cardSaving}
                      className="h-8 px-3 bg-primary text-primary-foreground rounded text-xs font-medium flex items-center gap-1 hover:bg-primary/90 disabled:opacity-50"
                    >
                      {cardSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingCardId(null); setEditCardForm({}); }}
                      className="h-8 px-3 border border-border rounded text-xs font-medium flex items-center gap-1 hover:bg-muted"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm flex-1">
                    {card.bank && <div><span className="text-muted-foreground text-xs">Bank:</span> {card.bank}</div>}
                    {card.cardType && <div><span className="text-muted-foreground text-xs">Type:</span> {card.cardType}</div>}
                    {card.noc && <div><span className="text-muted-foreground text-xs">Name:</span> {card.noc}</div>}
                    <div><span className="text-muted-foreground text-xs">Number:</span> {maskCardNumber(card.ccn)}</div>
                    {card.cvc && <div><span className="text-muted-foreground text-xs">CVC:</span> •••</div>}
                    {card.expDate && <div><span className="text-muted-foreground text-xs">Exp:</span> {card.expDate}</div>}
                    {card.creditLimit && <div><span className="text-muted-foreground text-xs">Limit:</span> ${Number(card.creditLimit).toLocaleString()}</div>}
                    {card.balance && <div><span className="text-muted-foreground text-xs">Balance:</span> ${Number(card.balance).toLocaleString()}</div>}
                  </div>
                  <div className="flex gap-1 ml-3 shrink-0">
                    <button type="button" onClick={() => startEditCard(card)} className="p-1.5 hover:bg-muted rounded" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {deleteConfirmId === card.id ? (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => deleteCard(card.id)} className="p-1.5 bg-destructive text-destructive-foreground rounded text-xs hover:bg-destructive/90" title="Confirm delete">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => setDeleteConfirmId(null)} className="p-1.5 hover:bg-muted rounded" title="Cancel">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setDeleteConfirmId(card.id)} className="p-1.5 hover:bg-muted rounded text-destructive" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {!cardsLoading && cards.length === 0 && !showNewCard && (
            <p className="text-sm text-muted-foreground">No cards yet. Click &quot;Add Card&quot; to add one.</p>
          )}

          {/* New card form */}
          {showNewCard && (
            <div className="border border-primary/30 rounded-lg p-4 bg-primary/5">
              <h4 className="text-sm font-medium mb-3">New Card</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {[
                  { label: "Bank/Issuer", key: "bank", type: "text" },
                  { label: "Card Type", key: "cardType", type: "text", placeholder: "e.g. Visa Credit" },
                  { label: "Name on Card", key: "noc", type: "text" },
                  { label: "Card Number", key: "ccn", type: "text" },
                  { label: "CVC", key: "cvc", type: "text", placeholder: "3-4 digits" },
                  { label: "Expiry (MM/YY)", key: "expDate", type: "text", placeholder: "MM/YY" },
                  { label: "Credit Limit", key: "creditLimit", type: "number" },
                  { label: "Balance", key: "balance", type: "number" },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{f.label}</label>
                    <input
                      type={f.type}
                      value={newCardForm[f.key] || ""}
                      onChange={(e) => setNewCardForm((prev: Record<string, any>) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full h-8 px-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={saveNewCard}
                  disabled={cardSaving}
                  className="h-8 px-3 bg-primary text-primary-foreground rounded text-xs font-medium flex items-center gap-1 hover:bg-primary/90 disabled:opacity-50"
                >
                  {cardSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save Card
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewCard(false)}
                  className="h-8 px-3 border border-border rounded text-xs font-medium flex items-center gap-1 hover:bg-muted"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-entities — edit mode only */}
      {isEdit && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Related Entities</h3>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/leads/${initialData.id}?tab=related`}
              className="inline-flex items-center gap-2 h-9 px-4 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
            >
              <Users className="w-4 h-4" />
              Cosigners{subCounts.cosigners ? ` (${subCounts.cosigners})` : ""}
            </Link>
            <Link
              href={`/leads/${initialData.id}?tab=related`}
              className="inline-flex items-center gap-2 h-9 px-4 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
            >
              <Briefcase className="w-4 h-4" />
              Employers{subCounts.employers ? ` (${subCounts.employers})` : ""}
            </Link>
            <Link
              href={`/leads/${initialData.id}?tab=related`}
              className="inline-flex items-center gap-2 h-9 px-4 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
            >
              <Car className="w-4 h-4" />
              Vehicles{subCounts.vehicles ? ` (${subCounts.vehicles})` : ""}
            </Link>
            <Link
              href={`/leads/${initialData.id}?tab=related`}
              className="inline-flex items-center gap-2 h-9 px-4 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
            >
              <Users className="w-4 h-4" />
              Relatives{subCounts.relatives ? ` (${subCounts.relatives})` : ""}
            </Link>
          </div>
          {(subCounts.cosigners || subCounts.employers || subCounts.vehicles || subCounts.relatives) ? (
            <p className="text-xs text-muted-foreground mt-3">
              {[
                subCounts.cosigners && `${subCounts.cosigners} Cosigner${subCounts.cosigners > 1 ? "s" : ""}`,
                subCounts.employers && `${subCounts.employers} Employer${subCounts.employers > 1 ? "s" : ""}`,
                subCounts.vehicles && `${subCounts.vehicles} Vehicle${subCounts.vehicles > 1 ? "s" : ""}`,
                subCounts.relatives && `${subCounts.relatives} Relative${subCounts.relatives > 1 ? "s" : ""}`,
              ].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      )}

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
