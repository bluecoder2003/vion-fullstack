/**
 * ElevenLabs Text-to-Speech API integration.
 *
 * Uses the same REST endpoints as the official @elevenlabs/elevenlabs-js SDK
 * but via browser-native fetch (the SDK's `play()` requires Node.js).
 *
 * Model: eleven_multilingual_v2  (highest quality, most expressive)
 * Format: mp3_44100_128          (CD-quality MP3)
 */

const BASE = "https://api.elevenlabs.io/v1";

// ── Pre-configured API key (auto-connects on app load) ──
const PRECONFIGURED_KEY = "sk_b17bd0a8da5c98ce359f1adae46cbc0ee46bd2a42bc5d202";

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

/**
 * Fetch the user's available voices.
 */
export async function fetchVoices(
  apiKey: string
): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
  });
  if (res.status === 401) throw new Error("INVALID_KEY");
  if (!res.ok) throw new Error(`Voice fetch failed: ${res.status}`);
  const data = await res.json();
  return data.voices ?? [];
}

/**
 * Generate speech audio for a text string.
 *
 * Uses eleven_multilingual_v2 with expressive voice settings tuned for
 * audiobook narration — lower stability for more dynamic expression,
 * high similarity boost for voice consistency, and style exaggeration
 * enabled for dramatic readings.
 */
export async function textToSpeech(
  apiKey: string,
  voiceId: string,
  text: string,
  signal?: AbortSignal
): Promise<Blob> {
  const res = await fetch(
    `${BASE}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.30,
          similarity_boost: 0.85,
          style: 0.65,
          use_speaker_boost: true,
        },
      }),
      signal,
    }
  );
  if (res.status === 401) throw new Error("INVALID_KEY");
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) {
    // Try to get error detail from response body
    let detail = "";
    try { const j = await res.json(); detail = j?.detail?.message || j?.detail || ""; } catch {}
    throw new Error(`TTS_FAILED:${res.status}:${detail}`);
  }
  const blob = await res.blob();
  if (!blob || blob.size === 0) throw new Error("TTS_EMPTY_RESPONSE");
  return blob;
}

// ── Session-level state ─────────────────────────────────────
// Pre-populated with the configured key so ElevenLabs is ready
// on first launch without the user needing to enter anything.

let _apiKey = PRECONFIGURED_KEY;
let _voiceId = "JBFqnCBsd6RMkjVDRZzb"; // George — warm, expressive narrator
let _voices: ElevenLabsVoice[] = [];

export function getSessionApiKey() {
  return _apiKey;
}
export function setSessionApiKey(key: string) {
  _apiKey = key;
}

export function getSessionVoiceId() {
  return _voiceId;
}
export function setSessionVoiceId(id: string) {
  _voiceId = id;
}

export function getSessionVoices() {
  return _voices;
}
export function setSessionVoices(v: ElevenLabsVoice[]) {
  _voices = v;
}

export function getPreconfiguredKey() {
  return PRECONFIGURED_KEY;
}