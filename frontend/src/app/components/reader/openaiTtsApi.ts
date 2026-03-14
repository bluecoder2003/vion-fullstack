/**
 * OpenAI Text-to-Speech API integration (gpt-4o-mini-tts).
 *
 * Calls the REST endpoint directly via browser-native fetch.
 * Supports all 13 built-in voices with the `instructions` parameter
 * for context-aware expressive audiobook narration.
 *
 * Model:  gpt-4o-mini-tts (prompted speech, emotion / tone control)
 * Format: mp3 (default, good quality + small size for caching)
 */

const BASE = "https://api.openai.com/v1";

// ── Local TTS server endpoints ──────────────────────────────
// HTTP endpoint (legacy fallback)
const LOCAL_TTS_URL = "http://127.0.0.1:8000/generate";
// WebSocket endpoint — streams audio chunks in real-time
const WS_TTS_URL = "ws://127.0.0.1:8000/stream";

// ── Voice definitions ──────────────────────────────────────

export interface OpenAIVoice {
  id: string;
  name: string;
  description: string;
  gender: "female" | "male" | "neutral";
  recommended?: boolean;
}

export const OPENAI_VOICES: OpenAIVoice[] = [
  { id: "marin",   name: "Marin",   description: "Clear, natural",       gender: "female", recommended: true },
  { id: "cedar",   name: "Cedar",   description: "Rich, grounded",       gender: "male",   recommended: true },
  { id: "coral",   name: "Coral",   description: "Clear, engaging",      gender: "female" },
  { id: "sage",    name: "Sage",    description: "Calm, thoughtful",     gender: "female" },
  { id: "nova",    name: "Nova",    description: "Warm, friendly",       gender: "female" },
  { id: "shimmer", name: "Shimmer", description: "Bright, energetic",    gender: "female" },
  { id: "alloy",   name: "Alloy",   description: "Neutral, balanced",    gender: "neutral" },
  { id: "ash",     name: "Ash",     description: "Warm, conversational", gender: "male" },
  { id: "ballad",  name: "Ballad",  description: "Gentle, soothing",     gender: "male" },
  { id: "echo",    name: "Echo",    description: "Smooth, resonant",     gender: "male" },
  { id: "fable",   name: "Fable",   description: "Expressive, dynamic",  gender: "male" },
  { id: "onyx",    name: "Onyx",    description: "Deep, authoritative",  gender: "male" },
  { id: "verse",   name: "Verse",   description: "Melodic, expressive",  gender: "male" },
];

export const DEFAULT_VOICE_ID = "coral";

// ── Context-aware narration instructions ───────────────────

export type SentenceContext = "dialogue" | "question" | "exclamation" | "whisper" | "shout" | "narration" | "dramatic" | "reflective";

/**
 * Generate `instructions` for gpt-4o-mini-tts based on sentence context.
 * The model supports prompted speech — this controls tone, pacing, emotion.
 */
export function buildNarrationInstructions(
  text: string,
  context?: SentenceContext,
  personalVoiceDesc?: string
): string {
  const base = "You are narrating an audiobook. Speak clearly and expressively with natural pacing. Use appropriate pauses at punctuation.";

  let contextInstr = "";
  const detected = context || detectContext(text);

  switch (detected) {
    case "dialogue":
      contextInstr = " This is character dialogue — give it a natural, conversational quality with subtle emotion matching the words.";
      break;
    case "question":
      contextInstr = " This is a question — use a natural rising intonation.";
      break;
    case "exclamation":
      contextInstr = " This is an exclamation — convey the energy and emotion with emphasis.";
      break;
    case "whisper":
      contextInstr = " This should be spoken softly, almost in a whisper, with quiet intimacy.";
      break;
    case "shout":
      contextInstr = " This is shouted or exclaimed loudly — convey urgency and volume.";
      break;
    case "dramatic":
      contextInstr = " This is a dramatic moment — speak with weight, gravity, and measured pacing.";
      break;
    case "reflective":
      contextInstr = " This is reflective, introspective prose — speak with a gentle, contemplative tone.";
      break;
    default:
      contextInstr = " This is narrative prose — maintain a steady, engaging reading pace.";
  }

  const personalInstr = personalVoiceDesc ? ` ${personalVoiceDesc}` : "";

  return base + contextInstr + personalInstr;
}

function detectContext(text: string): SentenceContext {
  const t = text.trim();
  const isDialogue =
    /^[""'\u201C\u2018]/.test(t) || /[""'\u201D\u2019][.!?]?\s*$/.test(t);

  if (isDialogue && /whisper|murmur|softly|quietly/i.test(t)) return "whisper";
  if (isDialogue && /shout|scream|yell|cried out|roar/i.test(t)) return "shout";
  if (isDialogue) return "dialogue";
  if (t.endsWith("?")) return "question";
  if (t.endsWith("!")) return "exclamation";
  if (/death|darkness|shadow|fate|doom|grave/i.test(t)) return "dramatic";
  if (/remember|thought|wondered|heart|soul|silence|memory/i.test(t)) return "reflective";
  return "narration";
}

// ── Personal voice instruction builder ─────────────────────

/**
 * Generate a personal voice description from a VoiceProfile's analysis
 * to inject into the instructions parameter. Since custom voice cloning
 * requires enterprise API access, we approximate by guiding the model's
 * delivery style.
 */
export function buildPersonalVoiceInstructions(profile: {
  pitch: number;
  rate: number;
  avgFrequency: number;
}): string {
  const parts: string[] = [];

  // Map pitch analysis to delivery style
  if (profile.pitch < 0.9) {
    parts.push("Speak with a deeper, lower-pitched voice.");
  } else if (profile.pitch > 1.1) {
    parts.push("Speak with a slightly higher, brighter voice.");
  } else {
    parts.push("Speak with a natural, medium-pitched voice.");
  }

  // Map rate to pacing
  if (profile.rate < 0.9) {
    parts.push("Use a calm, measured pace — don't rush.");
  } else if (profile.rate > 1.05) {
    parts.push("Speak with slightly brisk, energetic pacing.");
  } else {
    parts.push("Maintain a comfortable, natural reading pace.");
  }

  // Frequency-based warmth
  if (profile.avgFrequency < 150) {
    parts.push("Add warmth and resonance to the delivery.");
  } else if (profile.avgFrequency > 220) {
    parts.push("Keep the tone bright and clear.");
  }

  return parts.join(" ");
}

// ── Concurrency limiter ────────────────────────────────────
// Serialises requests so at most MAX_CONCURRENT are in-flight,
// which is the single biggest lever against 429s.

const MAX_CONCURRENT = 2;
let _inFlight = 0;
const _queue: Array<{ resolve: () => void }> = [];

function acquireSlot(): Promise<void> {
  if (_inFlight < MAX_CONCURRENT) {
    _inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => _queue.push({ resolve }));
}

function releaseSlot() {
  _inFlight = Math.max(0, _inFlight - 1);
  const next = _queue.shift();
  if (next) {
    _inFlight++;
    next.resolve();
  }
}

// ── Helpers ────────────────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new DOMException("Aborted", "AbortError")); return; }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(id); reject(signal.reason ?? new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

// ── TTS API call with retry + backoff ──────────────────────

const MAX_RETRIES = 4;           // up to 4 retries → 5 total attempts
const INITIAL_BACKOFF_MS = 1200; // 1.2 s → 2.4 s → 4.8 s → 9.6 s

/**
 * Generate speech audio via local TTS server.
 * The local server at http://127.0.0.1:8000/generate accepts a `text`
 * query parameter and returns an audio blob directly.
 * Voice/instructions/format parameters are accepted for API compatibility
 * but ignored — the local server handles all synthesis.
 * Still uses the concurrency limiter and retry logic for robustness.
 */
export async function textToSpeech(
  apiKey: string,
  voice: string,
  text: string,
  instructions?: string,
  signal?: AbortSignal,
  _format: "mp3" | "wav" | "opus" | "aac" | "flac" = "mp3"
): Promise<Blob> {
  // Wait for a concurrency slot
  await acquireSlot();

  let lastErr: Error | null = null;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      try {
        const res = await fetch(
          `${LOCAL_TTS_URL}?text=${encodeURIComponent(text)}`,
          { signal }
        );

        if (!res.ok) {
          lastErr = new Error(`TTS_FAILED:${res.status}`);
          if (res.status >= 500 && attempt < MAX_RETRIES) {
            await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt), signal);
            continue;
          }
          throw lastErr;
        }

        const blob = await res.blob();
        if (!blob || blob.size === 0) throw new Error("TTS_EMPTY_RESPONSE");
        return blob;
      } catch (err: any) {
        if (err?.name === "AbortError") throw err;
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt), signal);
          continue;
        }
        throw lastErr;
      }
    }

    throw lastErr ?? new Error("TTS_FAILED:unknown");
  } finally {
    releaseSlot();
  }
}

/**
 * Validate connection to the local TTS server.
 * The apiKey parameter is ignored — we just check if the server is reachable.
 */
export async function validateApiKey(_apiKey: string): Promise<boolean> {
  // For local TTS, verify the WebSocket endpoint is reachable
  if (_apiKey === "local-tts") {
    return new Promise<boolean>((resolve) => {
      let resolved = false;
      const done = (val: boolean) => { if (resolved) return; resolved = true; clearTimeout(timeout); resolve(val); };
      const timeout = setTimeout(() => done(false), 5000);
      try {
        const ws = new WebSocket(WS_TTS_URL);
        ws.binaryType = "arraybuffer";
        ws.onopen = () => { ws.close(); done(true); };
        ws.onerror = () => done(false);
        ws.onclose = () => done(false); // fallback — resolves false if onopen never fired
      } catch {
        done(false);
      }
    });
  }
  // For real OpenAI API keys, use the HTTP endpoint
  try {
    const res = await fetch(`${LOCAL_TTS_URL}?text=${encodeURIComponent("test")}`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Session-level state ────────────────────────────────────

let _apiKey = "local-tts"; // Placeholder — local TTS server needs no API key
let _voiceId = DEFAULT_VOICE_ID;

export function getSessionApiKey() { return _apiKey; }
export function setSessionApiKey(key: string) { _apiKey = key; }

export function getSessionVoiceId() { return _voiceId; }
export function setSessionVoiceId(id: string) { _voiceId = id; }

// ═══════════════════════════════════════════════════════════
//  WEBSOCKET STREAMING TTS
//  Opens a WebSocket to ws://127.0.0.1:8000/stream, sends
//  sentence text, receives binary audio chunks (ArrayBuffer)
//  that are individually decodable via AudioContext.
// ═══════════════════════════════════════════════════════════

export interface WsStreamCallbacks {
  /** Called for each binary audio chunk received */
  onChunk: (audioData: ArrayBuffer) => void;
  /** Called when all chunks for the sentence have been sent */
  onComplete: () => void;
  /** Called on connection or protocol error */
  onError: (err: Error) => void;
}

/**
 * Stream TTS audio for a single sentence via WebSocket.
 *
 * Protocol:
 *   client → server : text string (the sentence)
 *   server → client : 1+ binary messages (audio chunks)
 *   server closes the connection when done, OR sends a text "END" message.
 *
 * Returns an abort function that tears down the socket.
 */
export function streamTts(
  text: string,
  callbacks: WsStreamCallbacks
): () => void {
  let closed = false;
  let socket: WebSocket | null = null;

  try {
    socket = new WebSocket(WS_TTS_URL);
    socket.binaryType = "arraybuffer";
  } catch (err) {
    // Synchronous constructor error (e.g. blocked by CSP)
    setTimeout(() => {
      if (!closed) {
        closed = true;
        callbacks.onError(new Error("WebSocket constructor failed"));
      }
    }, 0);
    return () => { closed = true; };
  }

  socket.onopen = () => {
    if (!closed && socket) socket.send(text);
  };

  socket.onmessage = (event: MessageEvent) => {
    if (closed) return;
    // Binary message → audio chunk
    if (event.data instanceof ArrayBuffer) {
      callbacks.onChunk(event.data);
      return;
    }
    // Text "END" signal → server explicitly marks end-of-stream
    if (typeof event.data === "string") {
      const msg = event.data.trim().toUpperCase();
      if (msg === "END" || msg === "DONE" || msg === "") {
        closed = true;
        try { socket?.close(); } catch {}
        callbacks.onComplete();
      }
    }
  };

  socket.onclose = () => {
    if (!closed) {
      closed = true;
      callbacks.onComplete();
    }
  };

  socket.onerror = () => {
    if (!closed) {
      closed = true;
      callbacks.onError(new Error("WebSocket TTS connection failed"));
    }
  };

  // Abort function — tears down the socket immediately
  return () => {
    if (closed) return;
    closed = true;
    try {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    } catch {}
  };
}

/**
 * Collect all audio chunks for a sentence via WebSocket.
 * Useful for prefetching — resolves with the raw ArrayBuffer[]
 * once the server finishes streaming.
 */
export function fetchTtsChunks(text: string): { promise: Promise<ArrayBuffer[]>; abort: () => void } {
  const chunks: ArrayBuffer[] = [];
  let abortFn: () => void = () => {};

  const promise = new Promise<ArrayBuffer[]>((resolve, reject) => {
    abortFn = streamTts(text, {
      onChunk: (data) => chunks.push(data),
      onComplete: () => resolve(chunks),
      onError: reject,
    });
  });

  return { promise, abort: abortFn };
}