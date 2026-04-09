"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User, CreditCard, MessageSquare, Paperclip, Clock, Phone,
  MapPin, Mail, Briefcase, Car, Users as UsersIcon, Shield, ArrowLeft,
  Edit, Save, X, PhoneForwarded, Send, Trash2, CheckCircle, Plus,
  Search, Loader2,
} from "lucide-react";
import { cn, formatPhone, timeAgo } from "@/lib/utils";

const cardFields = [
  { key: "bank", label: "Bank" },
  { key: "cardType", label: "Card Type" },
  { key: "noc", label: "Name on Card" },
  { key: "ccn", label: "Card Number" },
  { key: "cvc", label: "CVC" },
  { key: "expDate", label: "Exp Date" },
  { key: "creditLimit", label: "Credit Limit" },
  { key: "balance", label: "Balance" },
  { key: "available", label: "Available" },
  { key: "lastPayment", label: "Last Payment" },
  { key: "lastPayDate", label: "Last Pay Date" },
  { key: "lastPayFrom", label: "Last Pay From" },
  { key: "lastCharge", label: "Last Charge" },
  { key: "transactions", label: "Transactions" },
] as const;

const emptyCard: Record<string, string> = Object.fromEntries(cardFields.map(f => [f.key, ""]));


interface Props {
  data: any;
  currentUser: { id: number; role: string; fullName: string };
}

const statusColors: Record<string, string> = {
  new: "bg-green-500/10 text-green-500 border-green-500/20",
  in_review: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  approved: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  declined: "bg-red-500/10 text-red-500 border-red-500/20",
  forwarded: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  on_hold: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
};

const tabs = [
  { id: "overview", label: "Overview", icon: User },
  { id: "cards", label: "Cards", icon: CreditCard },
  { id: "comments", label: "Comments", icon: MessageSquare },
  { id: "attachments", label: "Files", icon: Paperclip },
  { id: "followups", label: "Follow-ups", icon: Clock },
  { id: "calls", label: "Calls", icon: Phone },
  { id: "related", label: "Related", icon: UsersIcon },
];

export function LeadDetailClient({ data, currentUser }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [commentText, setCommentText] = useState("");
  const [saving, setSaving] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsPhone, setSmsPhone] = useState(data.lead.phone || "");
  const [smsMessage, setSmsMessage] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [followupDate, setFollowupDate] = useState("");
  const [followupNote, setFollowupNote] = useState("");
  const [followupSaving, setFollowupSaving] = useState(false);

  // Card management state
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardFormData, setCardFormData] = useState<Record<string, string>>({ ...emptyCard });
  const [cardSaving, setCardSaving] = useState(false);
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [editCardData, setEditCardData] = useState<Record<string, string>>({});
  const [editCardSaving, setEditCardSaving] = useState(false);
  const [deleteCardConfirmId, setDeleteCardConfirmId] = useState<number | null>(null);

  // Forward lead state
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardUsers, setForwardUsers] = useState<{ id: number; fullName: string; role: string }[]>([]);
  const [forwardToUserId, setForwardToUserId] = useState("");
  const [forwardNotes, setForwardNotes] = useState("");
  const [forwardSaving, setForwardSaving] = useState(false);
  const [forwardUsersLoading, setForwardUsersLoading] = useState(false);

  // Related entity CRUD state
  const [relatedForm, setRelatedForm] = useState<{ type: string; mode: "add" | "edit"; editId?: number } | null>(null);
  const [relatedFormData, setRelatedFormData] = useState<Record<string, any>>({});
  const [relatedSaving, setRelatedSaving] = useState(false);
  const [relatedDeleteConfirm, setRelatedDeleteConfirm] = useState<{ type: string; id: number } | null>(null);

  // Carrier lookup state
  const [carrierLoading, setCarrierLoading] = useState(false);
  const [carrierResult, setCarrierResult] = useState<{ carrier: string; lineType: string } | null>(null);

  // BIN lookup state
  const [binLoading, setBinLoading] = useState(false);
  const [binResult, setBinResult] = useState<{ brand: string; type: string; issuer: string; country: string } | null>(null);

  const { lead, cards, comments, attachments, followups, calls, cosigners, employers, vehicles, relatives, addresses, emails, licenses, agentName } = data;

  async function addComment() {
    if (!commentText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText }),
      });
      if (res.ok) {
        setCommentText("");
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Failed to save comment");
      }
    } catch {
      alert("Failed to save comment");
    } finally {
      setSaving(false);
    }
  }

  const [queueLoading, setQueueLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function addToCallQueue() {
    if (queueLoading) return;
    setQueueLoading(true);
    try {
      const res = await fetch("/api/call-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("Added to call queue");
      } else {
        alert(data.error || "Failed to add to queue");
      }
    } catch {
      alert("Failed to add to call queue");
    } finally {
      setQueueLoading(false);
    }
  }

  async function sendSms() {
    if (!smsPhone.trim() || !smsMessage.trim()) return;
    setSmsSending(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, phone: smsPhone, message: smsMessage }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("SMS sent successfully");
        setSmsOpen(false);
        setSmsMessage("");
      } else {
        alert(data.error || "Failed to send SMS");
      }
    } catch {
      alert("Failed to send SMS");
    } finally {
      setSmsSending(false);
    }
  }

  async function deleteLead() {
    if (deleteLoading) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/leads");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete lead");
      }
    } catch {
      alert("Failed to delete lead");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function createFollowup() {
    if (!followupDate) return;
    setFollowupSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueAt: followupDate, note: followupNote }),
      });
      if (res.ok) {
        setFollowupDate("");
        setFollowupNote("");
        router.refresh();
      } else {
        alert("Failed to create follow-up");
      }
    } catch {
      alert("Failed to create follow-up");
    } finally {
      setFollowupSaving(false);
    }
  }

  async function markFollowupDone(followupId: number) {
    try {
      await fetch(`/api/leads/${lead.id}/followups`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: followupId, isDone: true }),
      });
      router.refresh();
    } catch {
      alert("Failed to update follow-up");
    }
  }

  async function addCard() {
    setCardSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cardFormData),
      });
      if (res.ok) {
        setCardFormData({ ...emptyCard });
        setShowCardForm(false);
        router.refresh();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to add card");
      }
    } catch {
      alert("Failed to add card");
    } finally {
      setCardSaving(false);
    }
  }

  async function saveEditCard() {
    if (editingCardId === null) return;
    setEditCardSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: editingCardId, ...editCardData }),
      });
      if (res.ok) {
        setEditingCardId(null);
        setEditCardData({});
        router.refresh();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to update card");
      }
    } catch {
      alert("Failed to update card");
    } finally {
      setEditCardSaving(false);
    }
  }

  const [deleteCardLoading, setDeleteCardLoading] = useState(false);

  async function deleteCard(cardId: number) {
    if (deleteCardLoading) return;
    setDeleteCardLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/cards`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      if (res.ok) {
        setDeleteCardConfirmId(null);
        router.refresh();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to delete card");
      }
    } catch {
      alert("Failed to delete card");
    } finally {
      setDeleteCardLoading(false);
    }
  }

  async function carrierLookup() {
    if (!lead.phone) return;
    setCarrierLoading(true);
    setCarrierResult(null);
    try {
      const res = await fetch(`/api/carrier-lookup?phone=${encodeURIComponent(lead.phone)}`);
      const d = await res.json();
      if (res.ok) {
        setCarrierResult({ carrier: d.carrier || d.name || "Unknown", lineType: d.lineType || d.type || "Unknown" });
      } else {
        alert(d.error || "Carrier lookup failed");
      }
    } catch {
      alert("Carrier lookup failed");
    } finally {
      setCarrierLoading(false);
    }
  }

  async function binLookup() {
    if (!lead.cardNumberBin) return;
    setBinLoading(true);
    setBinResult(null);
    try {
      const res = await fetch(`/api/bin-lookup?bin=${encodeURIComponent(lead.cardNumberBin)}`);
      const d = await res.json();
      if (res.ok) {
        setBinResult({ brand: d.brand || "Unknown", type: d.type || "Unknown", issuer: d.issuer || "Unknown", country: d.country || "Unknown" });
      } else {
        alert(d.error || "BIN lookup failed");
      }
    } catch {
      alert("BIN lookup failed");
    } finally {
      setBinLoading(false);
    }
  }

  function startEditCard(card: any) {
    setEditingCardId(card.id);
    const data: Record<string, string> = {};
    cardFields.forEach(f => { data[f.key] = card[f.key] || ""; });
    setEditCardData(data);
  }

  async function openForwardDialog() {
    setForwardOpen(true);
    setForwardUsersLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const users = await res.json();
        setForwardUsers(users.filter((u: any) => u.isActive && (u.role === "admin" || u.role === "processor")));
      }
    } catch { /* ignore */ }
    finally { setForwardUsersLoading(false); }
  }

  async function forwardLead() {
    if (!forwardToUserId) return;
    setForwardSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: forwardToUserId, notes: forwardNotes }),
      });
      if (res.ok) {
        alert("Lead forwarded successfully");
        setForwardOpen(false);
        setForwardToUserId("");
        setForwardNotes("");
        router.refresh();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to forward lead");
      }
    } catch {
      alert("Failed to forward lead");
    } finally {
      setForwardSaving(false);
    }
  }

  // Related entity definitions
  const relatedEntityConfig: Record<string, { fields: { key: string; label: string; type?: string }[]; idKey: string; endpoint: string }> = {
    cosigners: {
      fields: [
        { key: "fullName", label: "Full Name" },
        { key: "dob", label: "Date of Birth", type: "date" },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
        { key: "ssn", label: "SSN" },
        { key: "address", label: "Address" },
      ],
      idKey: "cosignerId",
      endpoint: "cosigners",
    },
    employers: {
      fields: [
        { key: "employer", label: "Employer" },
        { key: "position", label: "Position" },
        { key: "phone", label: "Phone" },
        { key: "yearFrom", label: "Year From" },
        { key: "yearTo", label: "Year To" },
        { key: "isCurrent", label: "Current?", type: "checkbox" },
      ],
      idKey: "employerId",
      endpoint: "employers",
    },
    vehicles: {
      fields: [
        { key: "year", label: "Year" },
        { key: "make", label: "Make" },
        { key: "model", label: "Model" },
        { key: "color", label: "Color" },
        { key: "vin", label: "VIN" },
      ],
      idKey: "vehicleId",
      endpoint: "vehicles",
    },
    relatives: {
      fields: [
        { key: "fullName", label: "Full Name" },
        { key: "relation", label: "Relation" },
        { key: "dob", label: "Date of Birth", type: "date" },
        { key: "phone", label: "Phone" },
      ],
      idKey: "relativeId",
      endpoint: "relatives",
    },
    addresses: {
      fields: [
        { key: "address", label: "Address" },
        { key: "city", label: "City" },
        { key: "state", label: "State" },
        { key: "zip", label: "ZIP" },
        { key: "yearFrom", label: "Year From" },
        { key: "yearTo", label: "Year To" },
        { key: "isCurrent", label: "Current?", type: "checkbox" },
      ],
      idKey: "addressId",
      endpoint: "addresses",
    },
    emails: {
      fields: [
        { key: "email", label: "Email" },
        { key: "label", label: "Label" },
      ],
      idKey: "emailId",
      endpoint: "emails",
    },
    licenses: {
      fields: [
        { key: "dlNumber", label: "DL Number" },
        { key: "dlState", label: "DL State" },
        { key: "dlExpiry", label: "DL Expiry", type: "date" },
        { key: "dlIssued", label: "DL Issued", type: "date" },
      ],
      idKey: "licenseId",
      endpoint: "licenses",
    },
  };

  function openRelatedAdd(type: string) {
    const config = relatedEntityConfig[type];
    const empty: Record<string, any> = {};
    config.fields.forEach(f => { empty[f.key] = f.type === "checkbox" ? false : ""; });
    setRelatedFormData(empty);
    setRelatedForm({ type, mode: "add" });
  }

  function openRelatedEdit(type: string, record: any) {
    const config = relatedEntityConfig[type];
    const data: Record<string, any> = {};
    config.fields.forEach(f => { data[f.key] = record[f.key] ?? (f.type === "checkbox" ? false : ""); });
    setRelatedFormData(data);
    setRelatedForm({ type, mode: "edit", editId: record.id });
  }

  async function saveRelatedEntity() {
    if (!relatedForm) return;
    setRelatedSaving(true);
    const config = relatedEntityConfig[relatedForm.type];
    try {
      const isEdit = relatedForm.mode === "edit";
      const body = isEdit
        ? { [config.idKey]: relatedForm.editId, ...relatedFormData }
        : relatedFormData;
      const res = await fetch(`/api/leads/${lead.id}/${config.endpoint}`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setRelatedForm(null);
        setRelatedFormData({});
        router.refresh();
      } else {
        const d = await res.json();
        alert(d.error || `Failed to ${isEdit ? "update" : "add"} record`);
      }
    } catch {
      alert("Failed to save record");
    } finally {
      setRelatedSaving(false);
    }
  }

  async function deleteRelatedEntity(type: string, recordId: number) {
    const config = relatedEntityConfig[type];
    try {
      const res = await fetch(`/api/leads/${lead.id}/${config.endpoint}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [config.idKey]: recordId }),
      });
      if (res.ok) {
        setRelatedDeleteConfirm(null);
        router.refresh();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to delete record");
      }
    } catch {
      alert("Failed to delete record");
    }
  }

  function InfoRow({ label, value }: { label: string; value: any }) {
    if (!value) return null;
    return (
      <div className="flex justify-between py-2 border-b border-border/50 last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-right max-w-[60%] truncate">{value}</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold">
              {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed Lead"}
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-muted-foreground">{lead.refNumber}</span>
              <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize border", statusColors[lead.status])}>
                {lead.status.replace("_", " ")}
              </span>
              {lead.leadScore != null && (
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border",
                  lead.leadScore >= 75 ? "bg-green-500/10 text-green-500 border-green-500/20" :
                  lead.leadScore >= 50 ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                  lead.leadScore >= 25 ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                  "bg-red-500/10 text-red-500 border-red-500/20"
                )}>
                  Score: {lead.leadScore}
                </span>
              )}
              {agentName && <span className="text-xs text-muted-foreground">Agent: {agentName}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addToCallQueue}
            disabled={queueLoading}
            className="h-9 px-3 bg-muted border border-border text-foreground rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-muted/80 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title="Add to Call Queue"
          >
            <PhoneForwarded className="w-4 h-4" />
            <span className="hidden sm:inline">{queueLoading ? "Adding..." : "Queue"}</span>
          </button>
          <button
            onClick={() => setSmsOpen(!smsOpen)}
            className="h-9 px-3 bg-muted border border-border text-foreground rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-muted/80 transition-colors"
            title="Send SMS"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">SMS</span>
          </button>
          <button
            onClick={openForwardDialog}
            className="h-9 px-3 bg-muted border border-border text-foreground rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-muted/80 transition-colors"
            title="Forward Lead"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
            <span className="hidden sm:inline">Forward</span>
          </button>
          <Link
            href={`/leads/${lead.id}/edit`}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Link>
          {currentUser.role === "admin" && (
            <>
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="h-9 px-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-red-500/20 transition-colors"
                  title="Delete Lead"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={deleteLead}
                    disabled={deleteLoading}
                    className="h-9 px-3 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {deleteLoading ? "Deleting..." : "Confirm Delete"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="h-9 px-2 bg-muted rounded-lg text-sm hover:bg-muted/80 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* SMS Dialog */}
      {smsOpen && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
            <Send className="w-4 h-4" /> Send SMS
          </h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Phone Number</label>
              <input
                type="tel"
                value={smsPhone}
                onChange={(e) => setSmsPhone(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Message</label>
              <textarea
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                className="w-full h-20 bg-muted border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Type your message..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSmsOpen(false)}
                className="h-8 px-3 bg-muted border border-border rounded-lg text-sm hover:bg-muted/80"
              >
                Cancel
              </button>
              <button
                onClick={sendSms}
                disabled={smsSending || !smsPhone.trim() || !smsMessage.trim()}
                className="h-8 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {smsSending ? "Sending..." : "Send SMS"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward Dialog */}
      {forwardOpen && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4 rotate-180" /> Forward Lead
          </h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Forward To</label>
              {forwardUsersLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading users...
                </div>
              ) : (
                <select
                  value={forwardToUserId}
                  onChange={(e) => setForwardToUserId(e.target.value)}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">-- Select User --</option>
                  {forwardUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.role})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Notes</label>
              <textarea
                value={forwardNotes}
                onChange={(e) => setForwardNotes(e.target.value)}
                className="w-full h-20 bg-muted border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Add notes for the recipient..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setForwardOpen(false); setForwardToUserId(""); setForwardNotes(""); }}
                className="h-8 px-3 bg-muted border border-border rounded-lg text-sm hover:bg-muted/80"
              >
                Cancel
              </button>
              <button
                onClick={forwardLead}
                disabled={forwardSaving || !forwardToUserId}
                className="h-8 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {forwardSaving ? "Forwarding..." : "Forward Lead"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.id === "cards" && cards.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-muted rounded-full text-xs">{cards.length}</span>
              )}
              {tab.id === "comments" && comments.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-muted rounded-full text-xs">{comments.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><User className="w-4 h-4" />Personal Info</h3>
            <InfoRow label="First Name" value={lead.firstName} />
            <InfoRow label="Last Name" value={lead.lastName} />
            <InfoRow label="Email" value={lead.email} />
            {lead.phone ? (
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Phone</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formatPhone(lead.phone)}</span>
                  <button
                    onClick={carrierLookup}
                    disabled={carrierLoading}
                    className="h-6 px-2 bg-muted border border-border rounded text-xs font-medium hover:bg-muted/80 transition-colors flex items-center gap-1 disabled:opacity-50"
                    title="Carrier Lookup"
                  >
                    {carrierLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                    Carrier
                  </button>
                </div>
              </div>
            ) : null}
            {carrierResult && (
              <div className="py-2 border-b border-border/50 bg-blue-500/5 px-2 rounded">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Carrier</span>
                  <span className="font-medium">{carrierResult.carrier}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Line Type</span>
                  <span className="font-medium capitalize">{carrierResult.lineType}</span>
                </div>
              </div>
            )}
            <InfoRow label="Landline" value={lead.landline ? formatPhone(lead.landline) : null} />
            <InfoRow label="Date of Birth" value={lead.dob} />
            <InfoRow label="SSN Last 4" value={lead.ssnLast4} />
            <InfoRow label="Mother's Maiden Name" value={lead.mmn} />
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" />Address</h3>
            <InfoRow label="Address" value={lead.address} />
            <InfoRow label="City" value={lead.city} />
            <InfoRow label="State" value={lead.state} />
            <InfoRow label="ZIP" value={lead.zip} />
            <InfoRow label="Country" value={lead.country} />
            <InfoRow label="County" value={lead.county} />
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><CreditCard className="w-4 h-4" />Financial</h3>
            <InfoRow label="Annual Income" value={lead.annualIncome} />
            <InfoRow label="Employment" value={lead.employmentStatus} />
            <InfoRow label="Credit Score" value={lead.creditScoreRange} />
            <InfoRow label="Requested Limit" value={lead.requestedLimit} />
            <InfoRow label="Card Brand" value={lead.cardBrand} />
            <InfoRow label="Card Issuer" value={lead.cardIssuer} />
            {lead.cardNumberBin ? (
              <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                <span className="text-sm text-muted-foreground">BIN</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{lead.cardNumberBin}</span>
                  <button
                    onClick={binLookup}
                    disabled={binLoading}
                    className="h-6 px-2 bg-muted border border-border rounded text-xs font-medium hover:bg-muted/80 transition-colors flex items-center gap-1 disabled:opacity-50"
                    title="BIN Lookup"
                  >
                    {binLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                    Lookup
                  </button>
                </div>
              </div>
            ) : null}
            {binResult && (
              <div className="py-2 border-b border-border/50 last:border-0 bg-blue-500/5 px-2 rounded">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Brand</span>
                  <span className="font-medium">{binResult.brand}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{binResult.type}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Issuer</span>
                  <span className="font-medium">{binResult.issuer}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Country</span>
                  <span className="font-medium">{binResult.country}</span>
                </div>
              </div>
            )}
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Briefcase className="w-4 h-4" />Business</h3>
            <InfoRow label="Business Name" value={lead.businessName} />
            <InfoRow label="EIN" value={lead.businessEin} />
            <InfoRow label="Mortgage Bank" value={lead.mortgageBank} />
            <InfoRow label="Mortgage Payment" value={lead.mortgagePayment} />
            <InfoRow label="V-Pass" value={lead.vpass} />
            <InfoRow label="Notes" value={lead.notes} />
          </div>
          {lead.customFields && typeof lead.customFields === "object" && Object.keys(lead.customFields).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Shield className="w-4 h-4" />Custom Fields</h3>
              {Object.entries(lead.customFields).map(([key, value]) => (
                <InfoRow key={key} label={key.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase())} value={String(value ?? "")} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "cards" && (
        <div className="space-y-4">
          {/* Add Card button / form */}
          {!showCardForm ? (
            <button
              onClick={() => setShowCardForm(true)}
              className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Card
            </button>
          ) : (
            <div className="bg-card border border-border rounded-xl p-5">
              <h4 className="font-medium text-sm mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4" /> New Card
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {cardFields.map(f => (
                  <div key={f.key}>
                    <label className="block text-xs text-muted-foreground mb-1">{f.label}</label>
                    <input
                      type="text"
                      value={cardFormData[f.key] || ""}
                      onChange={(e) => setCardFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder={f.label}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => { setShowCardForm(false); setCardFormData({ ...emptyCard }); }}
                  className="h-8 px-3 bg-muted border border-border rounded-lg text-sm hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  onClick={addCard}
                  disabled={cardSaving}
                  className="h-8 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {cardSaving ? "Saving..." : "Save Card"}
                </button>
              </div>
            </div>
          )}

          {/* Cards list */}
          {cards.length === 0 && !showCardForm ? (
            <p className="text-center py-12 text-muted-foreground">No cards on file</p>
          ) : (
            cards.map((card: any) => (
              <div key={card.id} className="bg-card border border-border rounded-xl p-5">
                {editingCardId === card.id ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {cardFields.map(f => (
                        <div key={f.key}>
                          <label className="block text-xs text-muted-foreground mb-1">{f.label}</label>
                          <input
                            type="text"
                            value={editCardData[f.key] || ""}
                            onChange={(e) => setEditCardData(prev => ({ ...prev, [f.key]: e.target.value }))}
                            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder={f.label}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                      <button
                        onClick={() => { setEditingCardId(null); setEditCardData({}); }}
                        className="h-8 px-3 bg-muted border border-border rounded-lg text-sm hover:bg-muted/80"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveEditCard}
                        disabled={editCardSaving}
                        className="h-8 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {editCardSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Bank</p>
                        <p className="font-medium">{card.bank || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Type</p>
                        <p className="font-medium">{card.cardType || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Name on Card</p>
                        <p className="font-medium">{card.noc || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Number</p>
                        <p className="font-medium font-mono">{card.ccn || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">CVC</p>
                        <p className="font-medium">{card.cvc || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Expiry</p>
                        <p className="font-medium">{card.expDate || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Credit Limit</p>
                        <p className="font-medium">{card.creditLimit ? `$${Number(card.creditLimit).toLocaleString()}` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Balance</p>
                        <p className="font-medium">{card.balance ? `$${Number(card.balance).toLocaleString()}` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Available</p>
                        <p className="font-medium">{card.available ? `$${Number(card.available).toLocaleString()}` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Last Payment</p>
                        <p className="font-medium">{card.lastPayment || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Last Pay Date</p>
                        <p className="font-medium">{card.lastPayDate || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Last Pay From</p>
                        <p className="font-medium">{card.lastPayFrom || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Last Charge</p>
                        <p className="font-medium">{card.lastCharge || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Transactions</p>
                        <p className="font-medium">{card.transactions || "—"}</p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border/50">
                      <button
                        onClick={() => startEditCard(card)}
                        className="h-7 px-3 bg-muted border border-border rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors flex items-center gap-1"
                      >
                        <Edit className="w-3.5 h-3.5" /> Edit
                      </button>
                      {deleteCardConfirmId === card.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteCard(card.id)}
                            className="h-7 px-3 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteCardConfirmId(null)}
                            className="h-7 px-2 bg-muted rounded-lg text-xs hover:bg-muted/80 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteCardConfirmId(card.id)}
                          className="h-7 px-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "comments" && (
        <div className="space-y-4">
          {/* Add comment */}
          <div className="bg-card border border-border rounded-xl p-4">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              className="w-full h-20 px-3 py-2 bg-muted border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={addComment}
                disabled={saving || !commentText.trim()}
                className="h-8 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add Comment"}
              </button>
            </div>
          </div>
          {/* Comments list */}
          {comments.map((c: any) => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-sm">{c.userName || "Unknown"}</span>
                <span className="text-xs text-muted-foreground capitalize">{c.userRole}</span>
                {c.isPrivate && (
                  <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded text-[10px] font-medium uppercase">Private</span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">{timeAgo(new Date(c.createdAt))}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-center py-8 text-muted-foreground">No comments yet</p>
          )}
        </div>
      )}

      {activeTab === "calls" && (
        <div className="space-y-3">
          {calls.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">No call history</p>
          ) : (
            calls.map((call: any) => (
              <div key={call.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                <Phone className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <span className="font-medium text-sm capitalize">{call.outcome?.replace("_", " ") || "Unknown"}</span>
                  {call.notes && <p className="text-xs text-muted-foreground mt-0.5">{call.notes}</p>}
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">{call.agentName}</span>
                  {call.callDuration && <span className="block text-xs text-muted-foreground">{call.callDuration}s</span>}
                </div>
                <span className="text-xs text-muted-foreground">{timeAgo(new Date(call.createdAt))}</span>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "followups" && (
        <div className="space-y-4">
          {/* Create follow-up form */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Follow-up
            </h4>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">Due Date & Time</label>
                <input
                  type="datetime-local"
                  value={followupDate}
                  onChange={(e) => setFollowupDate(e.target.value)}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex-[2]">
                <label className="block text-xs text-muted-foreground mb-1">Note</label>
                <input
                  type="text"
                  value={followupNote}
                  onChange={(e) => setFollowupNote(e.target.value)}
                  placeholder="Follow-up note..."
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={createFollowup}
                  disabled={followupSaving || !followupDate}
                  className="h-[38px] px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                >
                  {followupSaving ? "Saving..." : "Add"}
                </button>
              </div>
            </div>
          </div>

          {/* Follow-ups list */}
          {followups.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">No follow-ups</p>
          ) : (
            followups.map((f: any) => (
              <div key={f.id} className={cn("bg-card border rounded-xl p-4", f.isDone ? "border-border opacity-60" : "border-yellow-500/30")}>
                <div className="flex items-center gap-3">
                  <Clock className={cn("w-5 h-5", f.isDone ? "text-muted-foreground" : "text-yellow-500")} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{f.note || "Follow-up"}</p>
                    <p className="text-xs text-muted-foreground">Due: {new Date(f.dueAt).toLocaleString()}</p>
                  </div>
                  {f.isDone ? (
                    <span className="text-xs text-green-500 font-medium flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Done
                    </span>
                  ) : (
                    <button
                      onClick={() => markFollowupDone(f.id)}
                      className="h-7 px-3 bg-green-500/10 text-green-500 border border-green-500/20 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-colors flex items-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Mark Done
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "attachments" && (
        <div className="space-y-3">
          {attachments.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">No attachments</p>
          ) : (
            attachments.map((a: any) => (
              <div key={a.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                <Paperclip className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{a.filename}</p>
                  <p className="text-xs text-muted-foreground">{a.mimeType} · {a.fileSize ? `${(a.fileSize / 1024).toFixed(1)} KB` : ""}</p>
                </div>
                <span className="text-xs text-muted-foreground">{timeAgo(new Date(a.createdAt))}</span>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "related" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inline form for add/edit */}
          {relatedForm && (
            <div className="col-span-1 lg:col-span-2 bg-card border border-border rounded-xl p-5">
              <h4 className="font-medium text-sm mb-4 flex items-center gap-2">
                {relatedForm.mode === "add" ? <Plus className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
                {relatedForm.mode === "add" ? "Add" : "Edit"} {relatedForm.type.replace(/s$/, "").replace(/^./, (s: string) => s.toUpperCase())}
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {relatedEntityConfig[relatedForm.type].fields.map(f => (
                  <div key={f.key}>
                    <label className="block text-xs text-muted-foreground mb-1">{f.label}</label>
                    {f.type === "checkbox" ? (
                      <label className="flex items-center gap-2 h-[38px]">
                        <input
                          type="checkbox"
                          checked={!!relatedFormData[f.key]}
                          onChange={(e) => setRelatedFormData(prev => ({ ...prev, [f.key]: e.target.checked }))}
                          className="rounded border-border"
                        />
                        <span className="text-sm">Yes</span>
                      </label>
                    ) : (
                      <input
                        type={f.type || "text"}
                        value={relatedFormData[f.key] || ""}
                        onChange={(e) => setRelatedFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder={f.label}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => { setRelatedForm(null); setRelatedFormData({}); }}
                  className="h-8 px-3 bg-muted border border-border rounded-lg text-sm hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  onClick={saveRelatedEntity}
                  disabled={relatedSaving}
                  className="h-8 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  {relatedSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}

          {/* Cosigners */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Co-signers ({cosigners.length})</h3>
              <button onClick={() => openRelatedAdd("cosigners")} className="h-7 px-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-primary/90"><Plus className="w-3 h-3" /> Add</button>
            </div>
            {cosigners.length === 0 && <p className="text-sm text-muted-foreground py-2">None</p>}
            {cosigners.map((c: any) => (
              <div key={c.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{c.fullName}</p>
                    {c.phone && <p className="text-muted-foreground">{formatPhone(c.phone)}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openRelatedEdit("cosigners", c)} className="h-6 px-2 bg-muted border border-border rounded text-xs hover:bg-muted/80 flex items-center gap-1"><Edit className="w-3 h-3" /> Edit</button>
                    {relatedDeleteConfirm?.type === "cosigners" && relatedDeleteConfirm?.id === c.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteRelatedEntity("cosigners", c.id)} className="h-6 px-2 bg-red-500 text-white rounded text-xs">Confirm</button>
                        <button onClick={() => setRelatedDeleteConfirm(null)} className="h-6 px-1 bg-muted rounded text-xs"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setRelatedDeleteConfirm({ type: "cosigners", id: c.id })} className="h-6 px-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-xs hover:bg-red-500/20 flex items-center gap-1"><Trash2 className="w-3 h-3" /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Employers */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Employers ({employers.length})</h3>
              <button onClick={() => openRelatedAdd("employers")} className="h-7 px-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-primary/90"><Plus className="w-3 h-3" /> Add</button>
            </div>
            {employers.length === 0 && <p className="text-sm text-muted-foreground py-2">None</p>}
            {employers.map((e: any) => (
              <div key={e.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{e.employer} {e.isCurrent && <span className="text-green-500 text-xs">(Current)</span>}</p>
                    {e.position && <p className="text-muted-foreground">{e.position}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openRelatedEdit("employers", e)} className="h-6 px-2 bg-muted border border-border rounded text-xs hover:bg-muted/80 flex items-center gap-1"><Edit className="w-3 h-3" /> Edit</button>
                    {relatedDeleteConfirm?.type === "employers" && relatedDeleteConfirm?.id === e.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteRelatedEntity("employers", e.id)} className="h-6 px-2 bg-red-500 text-white rounded text-xs">Confirm</button>
                        <button onClick={() => setRelatedDeleteConfirm(null)} className="h-6 px-1 bg-muted rounded text-xs"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setRelatedDeleteConfirm({ type: "employers", id: e.id })} className="h-6 px-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-xs hover:bg-red-500/20 flex items-center gap-1"><Trash2 className="w-3 h-3" /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Vehicles */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Vehicles ({vehicles.length})</h3>
              <button onClick={() => openRelatedAdd("vehicles")} className="h-7 px-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-primary/90"><Plus className="w-3 h-3" /> Add</button>
            </div>
            {vehicles.length === 0 && <p className="text-sm text-muted-foreground py-2">None</p>}
            {vehicles.map((v: any) => (
              <div key={v.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{[v.year, v.make, v.model].filter(Boolean).join(" ")}</p>
                    {v.color && <p className="text-muted-foreground">{v.color}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openRelatedEdit("vehicles", v)} className="h-6 px-2 bg-muted border border-border rounded text-xs hover:bg-muted/80 flex items-center gap-1"><Edit className="w-3 h-3" /> Edit</button>
                    {relatedDeleteConfirm?.type === "vehicles" && relatedDeleteConfirm?.id === v.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteRelatedEntity("vehicles", v.id)} className="h-6 px-2 bg-red-500 text-white rounded text-xs">Confirm</button>
                        <button onClick={() => setRelatedDeleteConfirm(null)} className="h-6 px-1 bg-muted rounded text-xs"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setRelatedDeleteConfirm({ type: "vehicles", id: v.id })} className="h-6 px-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-xs hover:bg-red-500/20 flex items-center gap-1"><Trash2 className="w-3 h-3" /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Relatives */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Relatives ({relatives.length})</h3>
              <button onClick={() => openRelatedAdd("relatives")} className="h-7 px-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-primary/90"><Plus className="w-3 h-3" /> Add</button>
            </div>
            {relatives.length === 0 && <p className="text-sm text-muted-foreground py-2">None</p>}
            {relatives.map((r: any) => (
              <div key={r.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{r.fullName} <span className="text-muted-foreground">({r.relation})</span></p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openRelatedEdit("relatives", r)} className="h-6 px-2 bg-muted border border-border rounded text-xs hover:bg-muted/80 flex items-center gap-1"><Edit className="w-3 h-3" /> Edit</button>
                    {relatedDeleteConfirm?.type === "relatives" && relatedDeleteConfirm?.id === r.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteRelatedEntity("relatives", r.id)} className="h-6 px-2 bg-red-500 text-white rounded text-xs">Confirm</button>
                        <button onClick={() => setRelatedDeleteConfirm(null)} className="h-6 px-1 bg-muted rounded text-xs"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setRelatedDeleteConfirm({ type: "relatives", id: r.id })} className="h-6 px-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-xs hover:bg-red-500/20 flex items-center gap-1"><Trash2 className="w-3 h-3" /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Addresses */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Addresses ({addresses.length})</h3>
              <button onClick={() => openRelatedAdd("addresses")} className="h-7 px-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-primary/90"><Plus className="w-3 h-3" /> Add</button>
            </div>
            {addresses.length === 0 && <p className="text-sm text-muted-foreground py-2">None</p>}
            {addresses.map((a: any) => (
              <div key={a.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{a.address}, {a.city}, {a.state} {a.zip} {a.isCurrent && <span className="text-green-500 text-xs">(Current)</span>}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openRelatedEdit("addresses", a)} className="h-6 px-2 bg-muted border border-border rounded text-xs hover:bg-muted/80 flex items-center gap-1"><Edit className="w-3 h-3" /> Edit</button>
                    {relatedDeleteConfirm?.type === "addresses" && relatedDeleteConfirm?.id === a.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteRelatedEntity("addresses", a.id)} className="h-6 px-2 bg-red-500 text-white rounded text-xs">Confirm</button>
                        <button onClick={() => setRelatedDeleteConfirm(null)} className="h-6 px-1 bg-muted rounded text-xs"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setRelatedDeleteConfirm({ type: "addresses", id: a.id })} className="h-6 px-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-xs hover:bg-red-500/20 flex items-center gap-1"><Trash2 className="w-3 h-3" /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Emails */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Emails ({emails.length})</h3>
              <button onClick={() => openRelatedAdd("emails")} className="h-7 px-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-primary/90"><Plus className="w-3 h-3" /> Add</button>
            </div>
            {emails.length === 0 && <p className="text-sm text-muted-foreground py-2">None</p>}
            {emails.map((e: any) => (
              <div key={e.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{e.email} {e.label && <span className="text-muted-foreground">({e.label})</span>}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openRelatedEdit("emails", e)} className="h-6 px-2 bg-muted border border-border rounded text-xs hover:bg-muted/80 flex items-center gap-1"><Edit className="w-3 h-3" /> Edit</button>
                    {relatedDeleteConfirm?.type === "emails" && relatedDeleteConfirm?.id === e.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteRelatedEntity("emails", e.id)} className="h-6 px-2 bg-red-500 text-white rounded text-xs">Confirm</button>
                        <button onClick={() => setRelatedDeleteConfirm(null)} className="h-6 px-1 bg-muted rounded text-xs"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setRelatedDeleteConfirm({ type: "emails", id: e.id })} className="h-6 px-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-xs hover:bg-red-500/20 flex items-center gap-1"><Trash2 className="w-3 h-3" /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
