"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Phone, PhoneOff, PhoneCall, Mic, MicOff, Pause, Play,
  X, ChevronRight, Trash2, Clock, User, Volume2,
} from "lucide-react";
import { cn, formatPhone } from "@/lib/utils";

interface QueueItem {
  id: number;
  leadId: number;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  state: string | null;
  refNumber: string;
  cardBrand: string | null;
  cardIssuer: string | null;
}

interface Props {
  initialQueue: QueueItem[];
  sipUsername: string;
  currentUser: { id: number; fullName: string };
}

const outcomes = [
  { value: "picked_up", label: "Picked Up", color: "bg-green-500" },
  { value: "no_answer", label: "No Answer", color: "bg-yellow-500" },
  { value: "voicemail", label: "Voicemail", color: "bg-blue-500" },
  { value: "callback", label: "Callback", color: "bg-purple-500" },
  { value: "wrong_number", label: "Wrong Number", color: "bg-orange-500" },
  { value: "do_not_call", label: "Do Not Call", color: "bg-red-500" },
];

export function CallQueueClient({ initialQueue, sipUsername, currentUser }: Props) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [callState, setCallState] = useState<"idle" | "connecting" | "ringing" | "active" | "ended">("idle");
  const [muted, setMuted] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [showDisposition, setShowDisposition] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callStartRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const currentLead = queue[currentIdx];

  // Call timer
  useEffect(() => {
    if (callState === "active") {
      callStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setCallTimer(Math.floor((Date.now() - callStartRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (callState !== "ended") setCallTimer(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  function formatTimer(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  async function startCall() {
    if (!currentLead?.phone) return;
    setCallState("connecting");

    // In production, this would use Telnyx WebRTC SDK
    // For now, simulate the call flow
    setTimeout(() => setCallState("ringing"), 1000);
    setTimeout(() => {
      // Simulate: either connect or no answer
      setCallState("active");
    }, 3000);
  }

  function endCall() {
    setCallState("ended");
    setShowDisposition(true);
  }

  async function logOutcome(outcome: string) {
    if (!currentLead) return;

    await fetch("/api/call-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: currentLead.leadId,
        outcome,
        notes: callNotes,
        callDuration: callTimer,
        phoneDialed: currentLead.phone,
      }),
    });

    // Remove from queue
    await fetch("/api/call-queue", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: currentLead.leadId }),
    });

    setShowDisposition(false);
    setCallNotes("");
    setCallState("idle");
    setCallTimer(0);

    // Move to next lead
    const newQueue = queue.filter((_, i) => i !== currentIdx);
    setQueue(newQueue);
    if (currentIdx >= newQueue.length && newQueue.length > 0) {
      setCurrentIdx(newQueue.length - 1);
    }
  }

  async function removeFromQueue(leadId: number) {
    await fetch("/api/call-queue", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    setQueue(queue.filter((q) => q.leadId !== leadId));
  }

  async function clearQueue() {
    if (!confirm("Clear all leads from queue?")) return;
    await fetch("/api/call-queue", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearAll: true }),
    });
    setQueue([]);
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <audio ref={audioRef} autoPlay />

      {/* Queue list (left side) */}
      <div className="w-80 border-r border-border bg-card flex flex-col">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold">{queue.length} in queue</span>
          {queue.length > 0 && (
            <button onClick={clearQueue} className="text-xs text-destructive hover:underline">
              Clear All
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {queue.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              <Phone className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Queue is empty</p>
              <p className="text-xs mt-1">Add leads from the Leads page</p>
            </div>
          ) : (
            queue.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => callState === "idle" && setCurrentIdx(idx)}
                className={cn(
                  "p-3 border-b border-border/50 cursor-pointer transition-colors group",
                  idx === currentIdx ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {[item.firstName, item.lastName].filter(Boolean).join(" ") || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.phone ? formatPhone(item.phone) : "No phone"}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.refNumber}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFromQueue(item.leadId); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main call area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {!currentLead ? (
          <div className="text-center text-muted-foreground">
            <PhoneCall className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">No leads in queue</p>
            <p className="text-sm mt-1">Go to Leads and add leads to your call queue</p>
          </div>
        ) : (
          <div className="w-full max-w-md text-center space-y-6">
            {/* Lead info */}
            <div>
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center text-2xl font-bold text-primary mx-auto mb-4">
                {(currentLead.firstName?.[0] || "?").toUpperCase()}
              </div>
              <h2 className="text-2xl font-bold">
                {[currentLead.firstName, currentLead.lastName].filter(Boolean).join(" ") || "Unknown"}
              </h2>
              <p className="text-lg text-muted-foreground mt-1">
                {currentLead.phone ? formatPhone(currentLead.phone) : "No phone number"}
              </p>
              <p className="text-sm text-muted-foreground">{currentLead.refNumber} · {currentLead.state || ""}</p>
              {currentLead.cardBrand && (
                <p className="text-sm text-muted-foreground mt-1">
                  {currentLead.cardBrand} {currentLead.cardIssuer && `· ${currentLead.cardIssuer}`}
                </p>
              )}
            </div>

            {/* Call status */}
            {callState !== "idle" && callState !== "ended" && (
              <div className="space-y-2">
                <p className={cn(
                  "text-sm font-medium",
                  callState === "connecting" && "text-yellow-500",
                  callState === "ringing" && "text-blue-500 animate-pulse",
                  callState === "active" && "text-green-500",
                )}>
                  {callState === "connecting" && "Connecting..."}
                  {callState === "ringing" && "Ringing..."}
                  {callState === "active" && `In Call — ${formatTimer(callTimer)}`}
                </p>
              </div>
            )}

            {/* Call controls */}
            <div className="flex items-center justify-center gap-4">
              {callState === "idle" && (
                <button
                  onClick={startCall}
                  disabled={!currentLead.phone}
                  className="w-16 h-16 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <Phone className="w-7 h-7" />
                </button>
              )}

              {(callState === "connecting" || callState === "ringing" || callState === "active") && (
                <>
                  {callState === "active" && (
                    <button
                      onClick={() => setMuted(!muted)}
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                        muted ? "bg-red-500/20 text-red-500" : "bg-muted text-foreground"
                      )}
                    >
                      {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  )}
                  <button
                    onClick={endCall}
                    className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors"
                  >
                    <PhoneOff className="w-7 h-7" />
                  </button>
                </>
              )}
            </div>

            {/* Skip to next */}
            {callState === "idle" && queue.length > 1 && (
              <button
                onClick={() => setCurrentIdx((currentIdx + 1) % queue.length)}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
              >
                Skip to next <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {/* Disposition modal */}
            {showDisposition && (
              <div className="bg-card border border-border rounded-xl p-5 text-left space-y-4">
                <h3 className="font-semibold">Call Outcome</h3>
                <div className="grid grid-cols-2 gap-2">
                  {outcomes.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => logOutcome(o.value)}
                      className="h-10 px-3 bg-muted border border-border rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors text-left"
                    >
                      <span className={cn("inline-block w-2 h-2 rounded-full mr-2", o.color)} />
                      {o.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Notes (optional)..."
                  className="w-full h-16 px-3 py-2 bg-muted border border-border rounded-lg text-sm resize-none"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
