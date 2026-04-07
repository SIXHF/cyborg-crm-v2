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
  const [dialedNumber, setDialedNumber] = useState<string | null>(null); // track manual dial number
  const dialedNumberRef = useRef<string | null>(null); // ref for delegate callbacks
  const [wasManualCall, setWasManualCall] = useState(false); // survives all handler races
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
            // No remote audio element — we attach it manually in onCallAnswered.
            // Passing it here lets SIP.js call setupRemoteMedia/cleanupMedia
            // which interferes with audio elements during call setup.
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
              log("Call created — INVITE sent");
              setCallState("ringing");
              // Do NOT start ringback here — onCallCreated fires BEFORE getUserMedia.
              // getUserMedia would kill the audio. Ringback starts in onProgress.
            },
            onCallAnswered: () => {
              log("Call answered");
              stopRingback();
              setCallState("active");
              // Manually attach remote audio (we don't pass audio element to SimpleUser)
              try {
                const client = telnyxClientRef.current;
                const pc = client?.session?.sessionDescriptionHandler?.peerConnection as RTCPeerConnection | undefined;
                if (pc && audioRef.current) {
                  const track = pc.getReceivers().find((r: any) => r.track?.kind === "audio")?.track;
                  if (track) {
                    audioRef.current.srcObject = new MediaStream([track]);
                    audioRef.current.play().catch(() => {});
                    log("Remote audio attached");
                  }
                }
              } catch (e: any) {
                log("Remote audio error: " + e.message);
              }
            },
            onCallReceived: async () => {
              log("Incoming call — auto-answer disabled");
            },
            onCallHangup: () => {
              log("Call ended by remote");
              stopRingback();
              activeCallRef.current = null;
              // Skip disposition for manual dials — just go back to idle
              if (dialedNumberRef.current) {
                setDialedNumber(null);
                dialedNumberRef.current = null;
                setCallState("idle");
              } else {
                setCallState("ended");
                setShowDisposition(true);
              }
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

        // Pre-acquire microphone AND monkey-patch getUserMedia so SIP.js
        // reuses this stream instead of calling getUserMedia again.
        // Each getUserMedia call triggers Windows audio ducking which
        // mutes all non-communications audio. By preventing the second
        // call during simpleUser.call(), the ringback stays audible.
        try {
          const originalGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          const micStream = await originalGUM({ audio: true });
          log("Mic pre-acquired");

          // Monkey-patch: return pre-acquired stream for audio requests
          navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
            if (constraints?.audio) {
              log("getUserMedia intercepted — reusing pre-acquired mic");
              return micStream;
            }
            return originalGUM(constraints);
          };
        } catch (e: any) {
          log("Mic pre-acquire failed: " + e.message);
        }
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

  // ── Ringback tone ──
  // ctx.destination goes to wrong output after getUserMedia.
  // <audio src> goes to wrong output after getUserMedia.
  // ONLY srcObject on the SIP audio element routes correctly because
  // Chrome treats it as WebRTC/communications audio.
  //
  // Solution: AudioContext → MediaStreamDestination → audioRef.srcObject
  // Created AFTER getUserMedia (await call() resolved).
  // When call connects, onCallAnswered replaces srcObject with remote stream.
  const ringbackCtxRef = useRef<AudioContext | null>(null);
  const ringbackPlayingRef = useRef(false);

  function startRingback() {
    if (ringbackPlayingRef.current) return;
    ringbackPlayingRef.current = true;
    try {
      // Windows audio ducking is already active (mic pre-acquired at registration).
      // Simple <audio> at max volume — ducked to ~20% but still audible.
      const audio = document.createElement("audio");
      audio.id = "ringback-audio";
      audio.src = "/ringback.wav";
      audio.loop = true;
      audio.volume = 1.0;
      document.body.appendChild(audio);
      audio.play().then(() => log("Ringback playing")).catch(e => log("Ringback failed: " + e.message));
    } catch (e: any) {
      log("Ringback error: " + e.message);
    }
  }

  function stopRingback() {
    if (!ringbackPlayingRef.current) return;
    ringbackPlayingRef.current = false;
    // Remove detached audio element
    const el = document.getElementById("ringback-audio") as HTMLAudioElement;
    if (el) { el.pause(); el.remove(); }
    if (ringbackCtxRef.current) {
      ringbackCtxRef.current.close().catch(() => {});
      ringbackCtxRef.current = null;
    }
    log("Ringback stopped");
  }

  // Safety net: stop ringback when call becomes active/ended/idle
  // Also: if a manual call ends, force-clear disposition
  useEffect(() => {
    if (callState === "active" || callState === "ended" || callState === "idle") {
      stopRingback();
    }
    if ((callState === "ended" || callState === "idle") && wasManualCall) {
      setShowDisposition(false);
      setWasManualCall(false);
      setDialedNumber(null);
      dialedNumberRef.current = null;
      if (callState === "ended") setCallState("idle");
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

  async function startCall(phoneOverride?: string, isManual = false) {
    const phoneRaw = phoneOverride || currentLead?.phone;
    if (!phoneRaw) return;
    if (!registered || !telnyxClientRef.current) {
      log("Not registered — cannot make calls");
      return;
    }

    // Cancel any pending auto-dial timer
    if (autoDialTimerRef.current) {
      clearTimeout(autoDialTimerRef.current);
      autoDialTimerRef.current = null;
    }

    const manualNum = isManual ? phoneRaw : null;
    setDialedNumber(manualNum);
    dialedNumberRef.current = manualNum;
    setWasManualCall(isManual);

    const dialNum = formatDialNumber(phoneRaw).replace("+", "");
    const target = `sip:${dialNum}@${SIP_DOMAIN}`;
    log(`Dialing ${target}...`);
    setCallState("connecting");

    // Start ringback NOW — mic was pre-acquired at SIP registration,
    // so Windows audio ducking is already active. No new getUserMedia
    // transition will kill this audio.
    startRingback();

    try {
      const simpleUser = telnyxClientRef.current;

      // Clean up any stale session from a previous call
      // SimpleUser only allows one call at a time — "Session already exists" error
      if (simpleUser.session) {
        log("Cleaning up stale session before new call");
        // Save and restore dialedNumberRef around cleanup — hangup() triggers
        // onCallHangup which would clear it and show disposition for the WRONG call
        const savedManual = dialedNumberRef.current;
        try { await simpleUser.hangup(); } catch {}
        await new Promise(r => setTimeout(r, 200));
        dialedNumberRef.current = savedManual;
        setDialedNumber(savedManual);
        // Reset call state back to connecting (onCallHangup may have changed it)
        setCallState("connecting");
        setShowDisposition(false);
      }

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
              setCallState("ringing");
              // Start ringback HERE — getUserMedia has already completed by now,
              // Chrome is in "communications mode", audio won't be interrupted
              startRingback();
            },
            onReject: (response: any) => {
              const code = response?.message?.statusCode;
              log(`Call rejected: SIP ${code}`);
              stopRingback();
              // Don't handle disposition here — onCallHangup handles it
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
            activeCallRef.current = null;
            // onCallHangup fires before Terminated and already handles disposition.
            // Only act here if onCallHangup didn't fire (edge case).

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
    stopRingback();
    if (telnyxClientRef.current) {
      try {
        telnyxClientRef.current.hangup();
      } catch (e: any) {
        log(`Hangup error: ${e.message}`);
      }
    }
    activeCallRef.current = null;
    if (dialedNumberRef.current) {
      setDialedNumber(null);
      dialedNumberRef.current = null;
      setCallState("idle");
    } else {
      setCallState("ended");
      setShowDisposition(true);
    }
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

    // Check BEFORE clearing state
    const wasManualDial = !!dialedNumberRef.current;

    setShowDisposition(false);
    setShowDtmf(false);
    setShowDtmfCapture(false);
    setCallNotes("");
    setSsnRevealed(false);
    setDialedNumber(null);
    dialedNumberRef.current = null;
    setWasManualCall(false);
    setDtmfCcn(""); setDtmfExp(""); setDtmfCvc(""); setDtmfSsn("");
    setCallState("idle");
    setCallTimer(0);
    if (!wasManualDial) {
      const newQueue = queue.filter((_, i) => i !== currentIdx);
      setQueue(newQueue);
      const newIdx = currentIdx >= newQueue.length ? Math.max(0, newQueue.length - 1) : currentIdx;
      setCurrentIdx(newIdx);

      // Auto-dialer: start next call after delay
      // IMPORTANT: pass the next lead's phone explicitly — React state updates
      // haven't applied yet, so currentLead would still reference the OLD lead
      if (autoDialEnabled && !autoDialPaused && newQueue.length > 0) {
        const nextLead = newQueue[newIdx];
        if (nextLead?.phone) {
          log(`Auto-dial: calling ${nextLead.firstName} ${nextLead.lastName} in ${autoDialDelay}s...`);
          autoDialTimerRef.current = setTimeout(() => {
            if (!autoDialPaused) startCall(nextLead.phone!);
          }, autoDialDelay * 1000);
        }
      }
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
              onClick={() => { if (manualDial) { startCall(manualDial, true); setManualDial(""); } }}
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
            {/* Lead info / Manual dial info */}
            {dialedNumber && callState !== "idle" ? (
              <div>
                <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center text-2xl font-bold text-yellow-500 mx-auto mb-4">
                  <Phone className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold">Manual Dial</h2>
                <p className="text-lg text-muted-foreground mt-1">{formatPhone(dialedNumber)}</p>
              </div>
            ) : currentLead ? (
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
            ) : null}

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

            {/* Lead Detail Panel — visible during ringing/active, hidden for manual dial */}
            {currentLead && !dialedNumber && (callState === "ringing" || callState === "active") && (
              <div className="w-full bg-card border border-border rounded-xl p-4 text-left space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-base">Lead Details</h4>
                  <a
                    href={`/leads/${currentLead.leadId}/edit`}
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
            {showDisposition && !wasManualCall && (
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
