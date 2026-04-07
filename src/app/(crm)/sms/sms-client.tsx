"use client";

import { useState, useMemo } from "react";
import {
  MessageSquare, ArrowUpRight, ArrowDownLeft, Send, Plus, X, Search, User,
} from "lucide-react";
import { formatPhone, timeAgo } from "@/lib/utils";

interface Conversation {
  phone: string;
  lastMessage: string;
  lastDirection: string;
  lastStatus: string;
  lastAt: string;
  messageCount: number;
  leadId: number | null;
  leadName: string | null;
}

interface Message {
  id: number;
  phone: string;
  message: string;
  direction: string | null;
  status: string | null;
  provider: string | null;
  leadId: number | null;
  createdAt: string;
}

interface Lead {
  id: number;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export function SmsClient({
  conversations: initialConversations,
  allMessages: initialMessages,
  leads,
}: {
  conversations: Conversation[];
  allMessages: Message[];
  leads: Lead[];
}) {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendPhone, setSendPhone] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendLeadId, setSendLeadId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [allMessages, setAllMessages] = useState<Message[]>(initialMessages);

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.phone.includes(q) ||
        c.leadName?.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const conversationMessages = useMemo(() => {
    if (!selectedPhone) return [];
    return allMessages
      .filter((m) => m.phone === selectedPhone)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [selectedPhone, allMessages]);

  const selectedConvo = conversations.find((c) => c.phone === selectedPhone);

  async function handleSend() {
    if (!sendPhone || !sendMessage) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: sendPhone,
          message: sendMessage,
          leadId: sendLeadId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult({ ok: true, text: "SMS sent successfully!" });
        const newMsg: Message = {
          id: data.id || Date.now(),
          phone: sendPhone,
          message: sendMessage,
          direction: "outbound",
          status: "sent",
          provider: null,
          leadId: sendLeadId ? parseInt(sendLeadId) : null,
          createdAt: new Date().toISOString(),
        };
        setAllMessages(prev => [...prev, newMsg]);
        const lead = leads.find(l => l.id === (sendLeadId ? parseInt(sendLeadId) : 0));
        setConversations(prev => {
          const existing = prev.find(c => c.phone === sendPhone);
          if (existing) {
            return prev.map(c => c.phone === sendPhone ? {
              ...c,
              lastMessage: sendMessage,
              lastDirection: "outbound",
              lastStatus: "sent",
              lastAt: new Date().toISOString(),
              messageCount: c.messageCount + 1,
            } : c);
          }
          return [{
            phone: sendPhone,
            lastMessage: sendMessage,
            lastDirection: "outbound",
            lastStatus: "sent",
            lastAt: new Date().toISOString(),
            messageCount: 1,
            leadId: sendLeadId ? parseInt(sendLeadId) : null,
            leadName: lead ? `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || null : null,
          }, ...prev];
        });
        setSendMessage("");
        setTimeout(() => { setShowSendDialog(false); setSendResult(null); }, 1200);
      } else {
        setSendResult({ ok: false, text: data.error || "Failed to send SMS" });
      }
    } catch {
      setSendResult({ ok: false, text: "Network error" });
    } finally {
      setSending(false);
    }
  }

  async function handleQuickSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPhone || !sendMessage) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: selectedPhone,
          message: sendMessage,
          leadId: selectedConvo?.leadId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult({ ok: true, text: "Sent!" });
        const newMsg: Message = {
          id: data.id || Date.now(),
          phone: selectedPhone!,
          message: sendMessage,
          direction: "outbound",
          status: "sent",
          provider: null,
          leadId: selectedConvo?.leadId || null,
          createdAt: new Date().toISOString(),
        };
        setAllMessages(prev => [...prev, newMsg]);
        setConversations(prev => prev.map(c => c.phone === selectedPhone ? {
          ...c,
          lastMessage: sendMessage,
          lastDirection: "outbound",
          lastStatus: "sent",
          lastAt: new Date().toISOString(),
          messageCount: c.messageCount + 1,
        } : c));
        setSendMessage("");
        setTimeout(() => setSendResult(null), 2000);
      } else {
        setSendResult({ ok: false, text: data.error || "Failed" });
      }
    } catch {
      setSendResult({ ok: false, text: "Network error" });
    } finally {
      setSending(false);
    }
  }

  function selectLeadForSend(leadId: string) {
    setSendLeadId(leadId);
    const lead = leads.find((l) => l.id === parseInt(leadId));
    if (lead?.phone) {
      setSendPhone(lead.phone);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left panel: conversations list */}
      <div className="w-96 border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">Conversations</h2>
              <span className="text-xs text-muted-foreground">({conversations.length})</span>
            </div>
            <button
              onClick={() => setShowSendDialog(true)}
              className="h-8 px-3 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-3 bg-muted border border-border rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No conversations found
            </div>
          ) : (
            filteredConversations.map((c) => (
              <button
                key={c.phone}
                onClick={() => { setSelectedPhone(c.phone); setSendMessage(""); setSendResult(null); }}
                className={`w-full text-left p-4 border-b border-border/50 hover:bg-muted/50 transition-colors ${
                  selectedPhone === c.phone ? "bg-muted/70" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-medium">{formatPhone(c.phone)}</span>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(new Date(c.lastAt))}
                  </span>
                </div>
                {c.leadName && (
                  <div className="flex items-center gap-1 mb-1">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{c.leadName}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {c.lastDirection === "inbound" ? (
                    <ArrowDownLeft className="w-3 h-3 text-green-500 flex-shrink-0" />
                  ) : (
                    <ArrowUpRight className="w-3 h-3 text-blue-500 flex-shrink-0" />
                  )}
                  <p className="text-xs text-muted-foreground truncate">
                    {c.lastMessage.length > 60 ? c.lastMessage.slice(0, 60) + "..." : c.lastMessage}
                  </p>
                  <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">
                    {c.messageCount}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: conversation detail */}
      <div className="flex-1 flex flex-col">
        {!selectedPhone ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Select a conversation to view messages</p>
              <p className="text-sm mt-1">or click New to send an SMS</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
              <div>
                <span className="font-mono font-medium">{formatPhone(selectedPhone)}</span>
                {selectedConvo?.leadName && (
                  <span className="ml-3 text-sm text-muted-foreground">{selectedConvo.leadName}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {conversationMessages.length} messages
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {conversationMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-md px-4 py-2 rounded-xl text-sm ${
                      msg.direction === "outbound"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                    <div
                      className={`flex items-center gap-2 mt-1 text-[10px] ${
                        msg.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      <span>{new Date(msg.createdAt).toLocaleString()}</span>
                      {msg.status && <span>- {msg.status}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick reply */}
            <form onSubmit={handleQuickSend} className="border-t border-border p-4 bg-card">
              {sendResult && (
                <div
                  className={`mb-2 text-xs px-3 py-1.5 rounded-lg ${
                    sendResult.ok
                      ? "bg-green-500/10 text-green-500"
                      : "bg-red-500/10 text-red-500"
                  }`}
                >
                  {sendResult.text}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={sendMessage}
                  onChange={(e) => setSendMessage(e.target.value)}
                  className="flex-1 h-10 px-4 bg-muted border border-border rounded-lg text-sm"
                />
                <button
                  type="submit"
                  disabled={sending || !sendMessage}
                  className="h-10 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* Send SMS Dialog */}
      {showSendDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl w-full max-w-md mx-4 shadow-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">Send SMS</h3>
              <button
                onClick={() => { setShowSendDialog(false); setSendResult(null); }}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Select Lead (optional)
                </label>
                <select
                  value={sendLeadId}
                  onChange={(e) => selectLeadForSend(e.target.value)}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                >
                  <option value="">-- No lead --</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {`${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || `Lead #${l.id}`}
                      {l.phone ? ` (${l.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="+1234567890"
                  value={sendPhone}
                  onChange={(e) => setSendPhone(e.target.value)}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Message
                </label>
                <textarea
                  placeholder="Type your message..."
                  value={sendMessage}
                  onChange={(e) => setSendMessage(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm resize-none"
                />
              </div>
              {sendResult && (
                <div
                  className={`text-sm px-3 py-2 rounded-lg ${
                    sendResult.ok
                      ? "bg-green-500/10 text-green-500"
                      : "bg-red-500/10 text-red-500"
                  }`}
                >
                  {sendResult.text}
                </div>
              )}
              <button
                onClick={handleSend}
                disabled={sending || !sendPhone || !sendMessage}
                className="w-full h-10 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {sending ? "Sending..." : "Send SMS"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
