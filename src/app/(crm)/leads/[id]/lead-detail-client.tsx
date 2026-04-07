"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User, CreditCard, MessageSquare, Paperclip, Clock, Phone,
  MapPin, Mail, Briefcase, Car, Users as UsersIcon, Shield, ArrowLeft,
  Edit, Save, X,
} from "lucide-react";
import { cn, formatPhone, timeAgo } from "@/lib/utils";

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
  const { lead, cards, comments, attachments, followups, calls, cosigners, employers, vehicles, relatives, addresses, emails, licenses, agentName } = data;

  async function addComment() {
    if (!commentText.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/leads/${lead.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText }),
      });
      setCommentText("");
      router.refresh();
    } finally {
      setSaving(false);
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
              {agentName && <span className="text-xs text-muted-foreground">Agent: {agentName}</span>}
            </div>
          </div>
        </div>
        <Link
          href={`/leads/${lead.id}/edit`}
          className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
        >
          <Edit className="w-4 h-4" />
          Edit
        </Link>
      </div>

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
            <InfoRow label="Phone" value={lead.phone ? formatPhone(lead.phone) : null} />
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
            <InfoRow label="BIN" value={lead.cardNumberBin} />
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
        </div>
      )}

      {activeTab === "cards" && (
        <div className="space-y-4">
          {cards.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">No cards on file</p>
          ) : (
            cards.map((card: any) => (
              <div key={card.id} className="bg-card border border-border rounded-xl p-5">
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
                    <p className="text-xs text-muted-foreground">Number</p>
                    <p className="font-medium font-mono">{card.ccn || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expiry</p>
                    <p className="font-medium">{card.expDate || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">CVC</p>
                    <p className="font-medium">{card.cvc || "—"}</p>
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
                    <p className="text-xs text-muted-foreground">Name on Card</p>
                    <p className="font-medium">{card.noc || "—"}</p>
                  </div>
                </div>
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
        <div className="space-y-3">
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
                  {f.isDone && <span className="text-xs text-green-500 font-medium">Done</span>}
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
          {cosigners.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold mb-3">Co-signers ({cosigners.length})</h3>
              {cosigners.map((c: any) => (
                <div key={c.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                  <p className="font-medium">{c.fullName}</p>
                  {c.phone && <p className="text-muted-foreground">{formatPhone(c.phone)}</p>}
                </div>
              ))}
            </div>
          )}
          {employers.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold mb-3">Employers ({employers.length})</h3>
              {employers.map((e: any) => (
                <div key={e.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                  <p className="font-medium">{e.employer} {e.isCurrent && <span className="text-green-500 text-xs">(Current)</span>}</p>
                  {e.position && <p className="text-muted-foreground">{e.position}</p>}
                </div>
              ))}
            </div>
          )}
          {vehicles.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold mb-3">Vehicles ({vehicles.length})</h3>
              {vehicles.map((v: any) => (
                <div key={v.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                  <p className="font-medium">{[v.year, v.make, v.model].filter(Boolean).join(" ")}</p>
                  {v.color && <p className="text-muted-foreground">{v.color}</p>}
                </div>
              ))}
            </div>
          )}
          {relatives.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold mb-3">Relatives ({relatives.length})</h3>
              {relatives.map((r: any) => (
                <div key={r.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                  <p className="font-medium">{r.fullName} <span className="text-muted-foreground">({r.relation})</span></p>
                </div>
              ))}
            </div>
          )}
          {addresses.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold mb-3">Addresses ({addresses.length})</h3>
              {addresses.map((a: any) => (
                <div key={a.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                  <p className="font-medium">{a.address}, {a.city}, {a.state} {a.zip} {a.isCurrent && <span className="text-green-500 text-xs">(Current)</span>}</p>
                </div>
              ))}
            </div>
          )}
          {emails.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold mb-3">Emails ({emails.length})</h3>
              {emails.map((e: any) => (
                <div key={e.id} className="py-2 border-b border-border/50 last:border-0 text-sm">
                  <p className="font-medium">{e.email} {e.label && <span className="text-muted-foreground">({e.label})</span>}</p>
                </div>
              ))}
            </div>
          )}
          {cosigners.length === 0 && employers.length === 0 && vehicles.length === 0 && relatives.length === 0 && addresses.length === 0 && emails.length === 0 && (
            <p className="text-center py-12 text-muted-foreground col-span-2">No related records</p>
          )}
        </div>
      )}
    </div>
  );
}
