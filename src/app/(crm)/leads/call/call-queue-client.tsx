"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Phone, PhoneOff, PhoneCall, Mic, MicOff,
  X, ChevronRight, Trash2, Clock, Volume2, Wifi, WifiOff,
  Hash,
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

interface SipCredentials {
  username: string;
  password: string;
  authUser: string;
  displayName: string;
}

interface Props {
  initialQueue: QueueItem[];
  sipCredentials: SipCredentials;
  currentUser: { id: number; fullName: string };
}

const SIP_DOMAIN = "sip.osetec.net";

const outcomes = [
  { value: "picked_up", label: "Picked Up", color: "bg-green-500" },
  { value: "no_answer", label: "No Answer", color: "bg-yellow-500" },
  { value: "voicemail", label: "Voicemail", color: "bg-blue-500" },
  { value: "callback", label: "Callback", color: "bg-purple-500" },
  { value: "wrong_number", label: "Wrong Number", color: "bg-orange-500" },
  { value: "do_not_call", label: "Do Not Call", color: "bg-red-500" },
];

const dtmfTones = ["1","2","3","4","5","6","7","8","9","*","0","#"];

export function CallQueueClient({ initialQueue, sipCredentials, currentUser }: Props) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [callState, setCallState] = useState<"idle" | "connecting" | "ringing" | "active" | "ended">("idle");
  const [registered, setRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [muted, setMuted] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [showDisposition, setShowDisposition] = useState(false);
  const [showDtmf, setShowDtmf] = useState(false);
  const [manualDial, setManualDial] = useState("");
  const [callNotes, setCallNotes] = useState("");
  const [sipLog, setSipLog] = useState<string[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callStartRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const telnyxClientRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);

  const currentLead = queue[currentIdx];

  function log(msg: string) {
    const ts = new Date().toLocaleTimeString();
    setSipLog(prev => [`[${ts}] ${msg}`, ...prev.slice(0, 49)]);
    console.log(`[SIP] ${msg}`);
  }

  // Initialize Telnyx WebRTC client
  useEffect(() => {
    if (!sipCredentials.username || !sipCredentials.password) {
      log("No SIP credentials configured. Set them in your user profile.");
      return;
    }

    async function initTelnyx() {
      try {
        setRegistering(true);
        log(`Connecting as ${sipCredentials.username}@${SIP_DOMAIN}...`);

        const { TelnyxRTC } = await import("@telnyx/webrtc");

        const client = new TelnyxRTC({
          login: sipCredentials.username,
          password: sipCredentials.password,
          ringtoneFile: undefined,
          ringbackFile: undefined,
        });

        client.on("telnyx.ready", () => {
          log("Registered successfully");
          setRegistered(true);
          setRegistering(false);
        });

        client.on("telnyx.error", (error: any) => {
          log(`Error: ${error?.message || JSON.stringify(error)}`);
          setRegistered(false);
          setRegistering(false);
        });

        client.on("telnyx.socket.close", () => {
          log("Connection closed");
          setRegistered(false);
        });

        client.on("telnyx.notification", (notification: any) => {
          const call = notification.call;
          if (!call) return;

          switch (notification.type) {
            case "callUpdate":
              handleCallState(call);
              break;
          }
        });

        await client.connect();
        telnyxClientRef.current = client;
      } catch (e: any) {
        log(`Init failed: ${e.message}`);
        setRegistering(false);
      }
    }

    initTelnyx();

    return () => {
      if (telnyxClientRef.current) {
        try { telnyxClientRef.current.disconnect(); } catch {}
      }
    };
  }, [sipCredentials.username, sipCredentials.password]);

  function handleCallState(call: any) {
    const state = call.state;
    log(`Call state: ${state}`);

    switch (state) {
      case "trying":
      case "requesting":
        setCallState("connecting");
        break;
      case "ringing":
      case "early":
        setCallState("ringing");
        break;
      case "active":
        setCallState("active");
        // Attach remote audio
        if (audioRef.current && call.remoteStream) {
          audioRef.current.srcObject = call.remoteStream;
        }
        break;
      case "hangup":
      case "destroy":
      case "purge":
        setCallState("ended");
        setShowDisposition(true);
        activeCallRef.current = null;
        if (audioRef.current) {
          audioRef.current.srcObject = null;
        }
        break;
    }
  }

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

  function formatDialNumber(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    // Add +1 for US numbers if 10 digits
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
    return `+${digits}`;
  }

  async function startCall(phoneOverride?: string) {
    const phoneRaw = phoneOverride || currentLead?.phone;
    if (!phoneRaw) return;
    if (!registered || !telnyxClientRef.current) {
      log("Not registered — cannot make calls");
      return;
    }

    const dialNum = formatDialNumber(phoneRaw);
    log(`Dialing ${dialNum}...`);
    setCallState("connecting");

    try {
      const call = telnyxClientRef.current.newCall({
        destinationNumber: dialNum,
        callerName: sipCredentials.displayName,
        callerNumber: sipCredentials.username,
        audio: true,
        video: false,
      });
      activeCallRef.current = call;
    } catch (e: any) {
      log(`Call failed: ${e.message}`);
      setCallState("idle");
    }
  }

  function endCall() {
    if (activeCallRef.current) {
      try {
        activeCallRef.current.hangup();
      } catch (e: any) {
        log(`Hangup error: ${e.message}`);
      }
    }
    setCallState("ended");
    setShowDisposition(true);
  }

  function toggleMute() {
    if (activeCallRef.current) {
      if (muted) {
        activeCallRef.current.unmuteAudio();
      } else {
        activeCallRef.current.muteAudio();
      }
      setMuted(!muted);
    }
  }

  function sendDtmf(digit: string) {
    if (activeCallRef.current) {
      try {
        activeCallRef.current.dtmf(digit);
        log(`DTMF: ${digit}`);
      } catch (e: any) {
        log(`DTMF error: ${e.message}`);
      }
    }
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
    setShowDtmf(false);
    setCallNotes("");
    setCallState("idle");
    setCallTimer(0);

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
        {/* Registration status */}
        <div className={cn(
          "px-3 py-2 border-b border-border flex items-center gap-2 text-xs",
          registered ? "text-green-500" : registering ? "text-yellow-500" : "text-red-500"
        )}>
          {registered ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {registered ? `Online: ${sipCredentials.username}` : registering ? "Connecting..." : "Offline"}
        </div>

        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold">{queue.length} in queue</span>
          {queue.length > 0 && (
            <button onClick={clearQueue} className="text-xs text-destructive hover:underline">Clear All</button>
          )}
        </div>

        {/* Manual dial */}
        <div className="p-2 border-b border-border">
          <div className="flex gap-1">
            <input
              type="tel"
              value={manualDial}
              onChange={(e) => setManualDial(e.target.value)}
              placeholder="Manual dial..."
              className="flex-1 h-8 px-2 bg-muted border border-border rounded-md text-xs"
            />
            <button
              onClick={() => { if (manualDial) startCall(manualDial); }}
              disabled={!registered || !manualDial || callState !== "idle"}
              className="h-8 w-8 bg-green-500 text-white rounded-md flex items-center justify-center disabled:opacity-50"
            >
              <Phone className="w-3.5 h-3.5" />
            </button>
          </div>
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
                    <p className="text-xs text-muted-foreground">{item.refNumber} · {item.state || ""}</p>
                    {(item.cardBrand || item.cardIssuer) && (
                      <p className="text-xs text-muted-foreground">{item.cardBrand} {item.cardIssuer}</p>
                    )}
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

        {/* SIP log */}
        <div className="border-t border-border max-h-32 overflow-y-auto p-2">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1">SIP Log</p>
          {sipLog.map((msg, i) => (
            <p key={i} className="text-[10px] text-muted-foreground font-mono leading-tight">{msg}</p>
          ))}
        </div>
      </div>

      {/* Main call area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {!currentLead && callState === "idle" ? (
          <div className="text-center text-muted-foreground">
            <PhoneCall className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">No leads in queue</p>
            <p className="text-sm mt-1">Go to Leads and add leads to your call queue</p>
          </div>
        ) : (
          <div className="w-full max-w-md text-center space-y-6">
            {/* Lead info */}
            {currentLead && (
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
              </div>
            )}

            {/* Call status */}
            {callState !== "idle" && callState !== "ended" && (
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
            )}

            {/* Call controls */}
            <div className="flex items-center justify-center gap-4">
              {callState === "idle" && (
                <button
                  onClick={() => startCall()}
                  disabled={!currentLead?.phone || !registered}
                  className="w-16 h-16 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
                  title={!registered ? "Not registered — configure SIP credentials" : "Call"}
                >
                  <Phone className="w-7 h-7" />
                </button>
              )}

              {(callState === "connecting" || callState === "ringing" || callState === "active") && (
                <>
                  {callState === "active" && (
                    <>
                      <button
                        onClick={toggleMute}
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                          muted ? "bg-red-500/20 text-red-500" : "bg-muted text-foreground"
                        )}
                      >
                        {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => setShowDtmf(!showDtmf)}
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                          showDtmf ? "bg-primary/20 text-primary" : "bg-muted text-foreground"
                        )}
                      >
                        <Hash className="w-5 h-5" />
                      </button>
                    </>
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

            {/* DTMF pad */}
            {showDtmf && callState === "active" && (
              <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
                {dtmfTones.map((digit) => (
                  <button
                    key={digit}
                    onClick={() => sendDtmf(digit)}
                    className="h-12 bg-muted border border-border rounded-lg text-lg font-semibold hover:bg-muted/80 transition-colors"
                  >
                    {digit}
                  </button>
                ))}
              </div>
            )}

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
