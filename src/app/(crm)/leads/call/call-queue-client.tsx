"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Phone, PhoneOff, PhoneCall, Mic, MicOff,
  X, ChevronRight, Trash2, Clock, Volume2, Wifi, WifiOff,
  Hash, ExternalLink,
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
  address: string | null;
  city: string | null;
  zip: string | null;
  dob: string | null;
  ssnLast4: string | null;
  annualIncome: string | null;
  employmentStatus: string | null;
  creditScoreRange: string | null;
  cardNumberBin: string | null;
  notes: string | null;
  leadScore: number | null;
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

const SIP_DOMAIN = "sip.osetec.com"; // Kamailio WSS proxy → routes to Magnus Billing

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
  // Auto-dialer
  const [autoDialEnabled, setAutoDialEnabled] = useState(false);
  const [autoDialDelay, setAutoDialDelay] = useState(3);
  const [autoDialPaused, setAutoDialPaused] = useState(false);
  const autoDialTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Session stats
  const [sessionStats, setSessionStats] = useState({ calls: 0, connected: 0, totalDuration: 0 });
  // DTMF capture
  const [showDtmfCapture, setShowDtmfCapture] = useState(false);
  const [dtmfCcn, setDtmfCcn] = useState("");
  const [dtmfExp, setDtmfExp] = useState("");
  const [dtmfCvc, setDtmfCvc] = useState("");
  const [dtmfSsn, setDtmfSsn] = useState("");
  const [dtmfSaving, setDtmfSaving] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callStartRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const telnyxClientRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);

  const [ssnRevealed, setSsnRevealed] = useState(false);
  const currentLead = queue[currentIdx];

  function log(msg: string) {
    const ts = new Date().toLocaleTimeString();
    setSipLog(prev => [`[${ts}] ${msg}`, ...prev.slice(0, 49)]);
    console.log(`[SIP] ${msg}`);
  }

  // Initialize SIP.js SimpleUser — connects to Magnus Billing via WSS
  useEffect(() => {
    if (!sipCredentials.username || !sipCredentials.password) {
      log("No SIP credentials configured. Set them in your user profile.");
      return;
    }

    async function initSipJs() {
      try {
        setRegistering(true);
        const authUser = sipCredentials.authUser || sipCredentials.username;
        log(`Connecting as ${sipCredentials.username}@${SIP_DOMAIN} via wss://${SIP_DOMAIN}/ws...`);

        const { SimpleUser } = await import("sip.js/lib/platform/web");

        const server = `wss://${SIP_DOMAIN}/ws`;
        const aor = `sip:${sipCredentials.username}@${SIP_DOMAIN}`;

        const simpleUser = new SimpleUser(server, {
          aor,
          media: {
            remote: { audio: audioRef.current! },
          },
          userAgentOptions: {
            authorizationUsername: authUser,
            authorizationPassword: sipCredentials.password,
            displayName: sipCredentials.displayName,
            contactParams: { transport: "wss" },
            sessionDescriptionHandlerFactoryOptions: {
              peerConnectionConfiguration: {
                iceServers: [
                  { urls: "stun:187.77.87.33:3478" },
                  { urls: "turn:187.77.87.33:3478", username: "osetec", credential: "CyborgTurn2026!" },
                  { urls: "turn:187.77.87.33:3478?transport=tcp", username: "osetec", credential: "CyborgTurn2026!" },
                  { urls: "turns:187.77.87.33:5349?transport=tcp", username: "osetec", credential: "CyborgTurn2026!" },
                ],
              },
            },
          },
          delegate: {
            onCallCreated: () => {
              log("Call created — starting ringback");
              setCallState("ringing");
              startRingback();
            },
            onCallAnswered: () => {
              log("Call answered");
              setCallState("active");
              stopRingback();
            },
            onCallReceived: async () => {
              log("Incoming call — auto-answer disabled");
            },
            onCallHangup: () => {
              log("Call ended by remote");
              stopRingback();
              setCallState("ended");
              setShowDisposition(true);
              activeCallRef.current = null;
            },
            onRegistered: () => {
              log("Registered successfully ✓");
              setRegistered(true);
              setRegistering(false);
            },
            onUnregistered: () => {
              log("Unregistered");
              setRegistered(false);
            },
            onServerConnect: () => {
              log("WebSocket connected");
            },
            onServerDisconnect: () => {
              log("WebSocket disconnected");
              setRegistered(false);
            },
          },
        });

        await simpleUser.connect();
        await simpleUser.register();
        telnyxClientRef.current = simpleUser;
      } catch (e: any) {
        log(`Init failed: ${e.message}`);
        setRegistering(false);
      }
    }

    initSipJs();

    return () => {
      const client = telnyxClientRef.current;
      if (client) {
        try { client.unregister(); } catch {}
        try { client.disconnect(); } catch {}
      }
    };
  }, [sipCredentials.username, sipCredentials.password]);

  // SIP.js handles call state via SimpleUser delegates (onCallHangup, session stateChange)

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

  // ── Ringback tone — short 2s WAV replayed on interval ──
  // Blob URL audio.loop is unreliable in Chrome when WebRTC media streams are active.
  // Instead: generate a short 2s tone, replay it every 6s via setInterval.
  const ringbackUrlRef = useRef<string | null>(null);
  const ringbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ringbackActiveRef = useRef(false);

  useEffect(() => {
    // Generate a SHORT 2-second US ringback tone WAV (440Hz + 480Hz)
    const sampleRate = 8000;
    const totalSamples = sampleRate * 2; // exactly 2 seconds
    const buf = new ArrayBuffer(44 + totalSamples * 2);
    const dv = new DataView(buf);
    const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, "RIFF"); dv.setUint32(4, 36 + totalSamples * 2, true);
    ws(8, "WAVE"); ws(12, "fmt "); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    ws(36, "data"); dv.setUint32(40, totalSamples * 2, true);
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const s = (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.2 * 32767;
      dv.setInt16(44 + i * 2, s | 0, true);
    }
    ringbackUrlRef.current = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
    return () => { if (ringbackUrlRef.current) URL.revokeObjectURL(ringbackUrlRef.current); };
  }, []);

  // Play one 2s ring burst
  function playRingBurst() {
    if (!ringbackUrlRef.current || !ringbackActiveRef.current) return;
    // Create a fresh Audio element each burst — avoids stale element issues
    const a = new Audio(ringbackUrlRef.current);
    a.volume = 0.6;
    a.play().catch(() => {});
  }

  // Start repeating ring: play immediately, then every 6 seconds (2s tone + 4s silence)
  function startRingback() {
    if (ringbackActiveRef.current) return; // already ringing
    ringbackActiveRef.current = true;
    log("Ringback started");
    playRingBurst(); // first ring immediately
    ringbackIntervalRef.current = setInterval(playRingBurst, 6000); // repeat every 6s
  }

  function stopRingback() {
    if (!ringbackActiveRef.current) return;
    ringbackActiveRef.current = false;
    if (ringbackIntervalRef.current) {
      clearInterval(ringbackIntervalRef.current);
      ringbackIntervalRef.current = null;
    }
    log("Ringback stopped");
  }

  // Safety net: stop ringback when call becomes active/ended/idle
  useEffect(() => {
    if (callState === "active" || callState === "ended" || callState === "idle") {
      stopRingback();
    }
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

    const dialNum = formatDialNumber(phoneRaw).replace("+", "");
    const target = `sip:${dialNum}@${SIP_DOMAIN}`;
    log(`Dialing ${target}...`);
    setCallState("connecting");

    try {
      const simpleUser = telnyxClientRef.current;

      // Use earlyMedia so 183 Session Progress auto-attaches remote audio
      // Use requestDelegate.onProgress to detect 180 Ringing vs 183 early media
      await simpleUser.call(
        target,
        {}, // InviterOptions
        {
          sessionDescriptionHandlerOptions: {
            constraints: { audio: true, video: false },
          },
          requestDelegate: {
            onProgress: (response: any) => {
              const code = response?.message?.statusCode;
              log(`SIP ${code} provisional response`);
              // Both 180 and 183: keep local ringback playing
              // (Server may or may not include early media — don't stop local tone)
              setCallState("ringing");
            },
            onReject: (response: any) => {
              const code = response?.message?.statusCode;
              log(`Call rejected: SIP ${code}`);
              stopRingback();
              setCallState("ended");
              setShowDisposition(true);
            },
          },
        },
      );
      activeCallRef.current = simpleUser.session;

      // Also attach session state listener as safety net
      if (simpleUser.session) {
        simpleUser.session.stateChange.addListener((state: any) => {
          log(`Session state: ${state}`);
          if (state === "Established") {
            stopRingback();
            setCallState("active");
          } else if (state === "Terminated") {
            stopRingback();
            setCallState("ended");
            setShowDisposition(true);
            activeCallRef.current = null;
          }
        });
      }
    } catch (e: any) {
      log(`Call failed: ${e.message}`);
      stopRingback();
      setCallState("idle");
    }
  }

  function endCall() {
    if (telnyxClientRef.current) {
      try {
        telnyxClientRef.current.hangup();
      } catch (e: any) {
        log(`Hangup error: ${e.message}`);
      }
    }
    setCallState("ended");
    setShowDisposition(true);
  }

  function toggleMute() {
    if (telnyxClientRef.current) {
      try {
        if (muted) {
          telnyxClientRef.current.unmute();
        } else {
          telnyxClientRef.current.mute();
        }
        setMuted(!muted);
      } catch (e: any) {
        log(`Mute error: ${e.message}`);
      }
    }
  }

  function sendDtmf(digit: string) {
    if (telnyxClientRef.current?.session) {
      try {
        const session = telnyxClientRef.current.session;
        if (session.sessionDescriptionHandler) {
          session.sessionDescriptionHandler.sendDtmf(digit);
          log(`DTMF: ${digit}`);
        }
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

    // Update session stats
    setSessionStats(prev => ({
      calls: prev.calls + 1,
      connected: outcome === "picked_up" ? prev.connected + 1 : prev.connected,
      totalDuration: prev.totalDuration + callTimer,
    }));

    setShowDisposition(false);
    setShowDtmf(false);
    setShowDtmfCapture(false);
    setCallNotes("");
    setSsnRevealed(false);
    setDtmfCcn(""); setDtmfExp(""); setDtmfCvc(""); setDtmfSsn("");
    setCallState("idle");
    setCallTimer(0);

    const newQueue = queue.filter((_, i) => i !== currentIdx);
    setQueue(newQueue);
    if (currentIdx >= newQueue.length && newQueue.length > 0) {
      setCurrentIdx(newQueue.length - 1);
    }

    // Auto-dialer: start next call after delay
    if (autoDialEnabled && !autoDialPaused && newQueue.length > 0) {
      log(`Auto-dial: next call in ${autoDialDelay}s...`);
      autoDialTimerRef.current = setTimeout(() => {
        if (!autoDialPaused) startCall();
      }, autoDialDelay * 1000);
    }
  }

  // DTMF capture: save card/SSN data collected during call
  async function saveDtmfCapture() {
    if (!currentLead) return;
    setDtmfSaving(true);
    try {
      // Save card data if CCN provided
      if (dtmfCcn) {
        const ccnClean = dtmfCcn.replace(/\D/g, "");
        const bin = ccnClean.slice(0, 6);
        let brand = "";
        if (bin[0] === "4") brand = "Visa";
        else if (bin[0] === "5" && bin[1] >= "1" && bin[1] <= "5") brand = "Mastercard";
        else if (bin[0] === "3" && (bin[1] === "4" || bin[1] === "7")) brand = "Amex";

        await fetch(`/api/leads/${currentLead.leadId}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ccn: ccnClean,
            expDate: dtmfExp,
            cvc: dtmfCvc,
            cardType: brand,
          }),
        });
        log(`Saved card: ****${ccnClean.slice(-4)}`);
      }

      // Save SSN if provided
      if (dtmfSsn) {
        const ssnClean = dtmfSsn.replace(/\D/g, "");
        await fetch(`/api/leads/${currentLead.leadId}/autosave`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "ssnLast4", value: ssnClean.slice(-4) }),
        });
        log(`Saved SSN last 4: ${ssnClean.slice(-4)}`);
      }

      setShowDtmfCapture(false);
      setDtmfCcn(""); setDtmfExp(""); setDtmfCvc(""); setDtmfSsn("");
    } catch (e: any) {
      log(`DTMF save error: ${e.message}`);
    } finally {
      setDtmfSaving(false);
    }
  }

  function stopAutoDial() {
    setAutoDialEnabled(false);
    setAutoDialPaused(false);
    if (autoDialTimerRef.current) {
      clearTimeout(autoDialTimerRef.current);
      autoDialTimerRef.current = null;
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
          <div className="w-full max-w-lg text-center space-y-6">
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

            {/* Lead Detail Panel — visible during ringing/active */}
            {currentLead && (callState === "ringing" || callState === "active") && (
              <div className="w-full bg-card border border-border rounded-xl p-4 text-left space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-base">Lead Details</h4>
                  <a
                    href={`/leads/${currentLead.id}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-3 bg-primary text-primary-foreground rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-primary/90"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Edit Lead
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{[currentLead.firstName, currentLead.lastName].filter(Boolean).join(" ") || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium">{currentLead.phone ? formatPhone(currentLead.phone) : "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium truncate max-w-[140px]">{currentLead.email || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium capitalize">{currentLead.status.replace("_", " ")}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Address</span>
                    <span className="font-medium truncate max-w-[140px]">{currentLead.address || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">City/State/ZIP</span>
                    <span className="font-medium">{[currentLead.city, currentLead.state, currentLead.zip].filter(Boolean).join(", ") || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Card Brand</span>
                    <span className="font-medium">{currentLead.cardBrand || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Card Issuer</span>
                    <span className="font-medium">{currentLead.cardIssuer || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Card BIN</span>
                    <span className="font-medium">{currentLead.cardNumberBin || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">SSN Last 4</span>
                    <span
                      className="font-medium cursor-pointer"
                      onClick={() => setSsnRevealed(!ssnRevealed)}
                      title="Click to reveal/hide"
                    >
                      {currentLead.ssnLast4 ? (ssnRevealed ? currentLead.ssnLast4 : "****") : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">DOB</span>
                    <span className="font-medium">{currentLead.dob || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Credit Score</span>
                    <span className="font-medium">{currentLead.creditScoreRange || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Annual Income</span>
                    <span className="font-medium">{currentLead.annualIncome || "—"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Employment</span>
                    <span className="font-medium">{currentLead.employmentStatus || "—"}</span>
                  </div>
                  {currentLead.leadScore != null && (
                    <div className="flex justify-between py-1 border-b border-border/30">
                      <span className="text-muted-foreground">Lead Score</span>
                      <span className="font-medium">{currentLead.leadScore}</span>
                    </div>
                  )}
                </div>
                {currentLead.notes && (
                  <div className="pt-1">
                    <span className="text-muted-foreground text-xs">Notes</span>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{currentLead.notes}</p>
                  </div>
                )}
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

            {/* DTMF Capture Form — save card/SSN data during call */}
            {(callState === "active" || showDisposition) && (
              <div className="w-full">
                <button
                  onClick={() => setShowDtmfCapture(!showDtmfCapture)}
                  className="text-sm text-muted-foreground hover:text-foreground mx-auto flex items-center gap-1 mb-2"
                >
                  {showDtmfCapture ? "Hide" : "Save"} Card/SSN Data
                </button>
                {showDtmfCapture && (
                  <div className="bg-card border border-border rounded-xl p-4 text-left space-y-3">
                    <h4 className="text-sm font-semibold">DTMF Capture</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Card Number</label>
                        <input type="text" value={dtmfCcn} onChange={(e) => setDtmfCcn(e.target.value)}
                          placeholder="4111111111111111" className="w-full h-8 px-2 bg-muted border border-border rounded text-xs font-mono" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Expiry</label>
                        <input type="text" value={dtmfExp} onChange={(e) => setDtmfExp(e.target.value)}
                          placeholder="MM/YY" className="w-full h-8 px-2 bg-muted border border-border rounded text-xs font-mono" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">CVC</label>
                        <input type="text" value={dtmfCvc} onChange={(e) => setDtmfCvc(e.target.value)}
                          placeholder="123" className="w-full h-8 px-2 bg-muted border border-border rounded text-xs font-mono" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">SSN</label>
                        <input type="text" value={dtmfSsn} onChange={(e) => setDtmfSsn(e.target.value)}
                          placeholder="XXX-XX-XXXX" className="w-full h-8 px-2 bg-muted border border-border rounded text-xs font-mono" />
                      </div>
                    </div>
                    <button onClick={saveDtmfCapture} disabled={dtmfSaving || (!dtmfCcn && !dtmfSsn)}
                      className="h-8 px-4 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50">
                      {dtmfSaving ? "Saving..." : "Save Card/SSN"}
                    </button>
                  </div>
                )}
              </div>
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

            {/* Auto-Dialer Controls */}
            {callState === "idle" && queue.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 text-left space-y-3 w-full">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Auto-Dialer</h4>
                  <div className="flex items-center gap-2">
                    <select value={autoDialDelay} onChange={(e) => setAutoDialDelay(parseInt(e.target.value))}
                      className="h-7 px-2 bg-muted border border-border rounded text-xs">
                      <option value={0}>No delay</option>
                      <option value={3}>3s delay</option>
                      <option value={5}>5s delay</option>
                      <option value={10}>10s delay</option>
                      <option value={15}>15s delay</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!autoDialEnabled ? (
                    <button onClick={() => { setAutoDialEnabled(true); setAutoDialPaused(false); startCall(); }}
                      disabled={!registered}
                      className="flex-1 h-9 bg-green-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-green-600">
                      Start Auto-Dial
                    </button>
                  ) : (
                    <>
                      <button onClick={() => { setAutoDialPaused(!autoDialPaused); if (autoDialTimerRef.current) clearTimeout(autoDialTimerRef.current); }}
                        className="flex-1 h-9 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600">
                        {autoDialPaused ? "Resume" : "Pause"}
                      </button>
                      <button onClick={stopAutoDial}
                        className="flex-1 h-9 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">
                        Stop
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Session Stats */}
            {sessionStats.calls > 0 && (
              <div className="flex gap-4 text-center text-xs text-muted-foreground w-full justify-center">
                <div><span className="font-semibold text-foreground">{sessionStats.calls}</span> calls</div>
                <div><span className="font-semibold text-green-500">{sessionStats.connected}</span> connected</div>
                <div><span className="font-semibold text-foreground">{formatTimer(sessionStats.totalDuration)}</span> total</div>
                <div><span className="font-semibold text-foreground">{sessionStats.calls > 0 ? ((sessionStats.connected / sessionStats.calls) * 100).toFixed(0) : 0}%</span> rate</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
