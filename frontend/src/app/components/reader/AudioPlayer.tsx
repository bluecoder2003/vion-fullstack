import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  X,
  ChevronDown,
  ChevronLeft,
  Volume2,
  Loader2,
  Key,
  ExternalLink,
  Sparkles,
  TreePine,
  Mic,
  User,
  Server,
} from "lucide-react";
import { motion } from "motion/react";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";
import { buildSentenceMap } from "./audioUtils";
import {
  AmbientEngine,
  SceneHysteresis,
  detectScene,
  buildContextWindow,
  getSceneInfo,
  ALL_SCENES,
  type SceneType,
  type SceneDetectionResult,
} from "./ambientSounds";
import {
  textToSpeech as openaiTextToSpeech,
  OPENAI_VOICES,
  DEFAULT_VOICE_ID,
  buildNarrationInstructions,
  buildPersonalVoiceInstructions,
  validateApiKey as openaiValidateKey,
  getSessionApiKey,
  setSessionApiKey,
  getSessionVoiceId,
  setSessionVoiceId,
  streamTts,
  fetchTtsChunks,
} from "./openaiTtsApi";
import { VoiceRecorder, type VoiceProfile } from "./VoiceRecorder";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ── Session-persisted preferences ──
let _engine: "browser" | "openai" | "personal" = "openai"; // Default to local TTS server
let _browserVoiceURI = "";

// ─────────────────────────────────────────────────────
// Score browser voices for expressiveness / quality
// ─────────────────────────────────────────────────────
function scoreBrowserVoice(v: SpeechSynthesisVoice): number {
  if (!v.lang.toLowerCase().startsWith("en")) return -1000;
  let s = 0;
  const n = v.name.toLowerCase();
  if (n.includes("google")) s += 200;
  if (n.includes("online") || n.includes("neural")) s += 150;
  if (n.includes("samantha")) s += 120;
  if (n.includes("ava") && n.includes("premium")) s += 115;
  if (n.includes("zoe") && n.includes("premium")) s += 110;
  if (n.includes("karen")) s += 95;
  if (n.includes("moira")) s += 95;
  if (n.includes("daniel") && !n.includes("google")) s += 90;
  if (n.includes("tessa")) s += 85;
  if (n.includes("fiona")) s += 85;
  if (n.includes("serena")) s += 85;
  if (n.includes("enhanced") || n.includes("premium")) s += 40;
  if (v.default) s += 15;
  if (n.includes("compact")) s -= 50;
  return s;
}

// ══════════��══════════════════════════════════════════════
// CLAUSE-LEVEL EXPRESSIVE PROSODY ENGINE
//
// The Web Speech API applies one flat pitch & rate per
// SpeechSynthesisUtterance.  Whole-sentence utterances
// therefore sound monotone.
//
// Solution: split every sentence into CLAUSES (at commas,
// semicolons, dashes, conjunctions) and speak each clause
// as its own utterance with a DIFFERENT pitch, rate, and a
// tiny inter-clause pause.  This creates genuine prosodic
// movement — the pitch rises, falls, speeds up and slows
// down — making it sound far more like a human reading.
// ═════════════════════════════════════════════════════════

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

type SentenceType =
  | "question" | "exclamation" | "ellipsis" | "dash"
  | "whisper" | "shout" | "dialogue" | "short" | "normal";

function detectSentenceType(s: string): SentenceType {
  const t = s.trim();
  const isDialogue =
    /^["'"'\u201C\u2018]/.test(t) || /["'"'\u201D\u2019][.!?]?\s*$/.test(t);
  if (isDialogue && /whisper|murmur|softly/i.test(t)) return "whisper";
  if (isDialogue && /shout|scream|yell|cried out/i.test(t)) return "shout";
  if (/\.{3,}$/.test(t) || t.endsWith("\u2026")) return "ellipsis";
  if (t.endsWith("?")) return "question";
  if (t.endsWith("!")) return "exclamation";
  if (t.endsWith("\u2014") || t.endsWith("\u2013")) return "dash";
  if (isDialogue) return "dialogue";
  if (t.split(/\s+/).length <= 5) return "short";
  return "normal";
}

/** Split sentence at clause boundaries, keeping delimiters with text. */
function splitIntoClauses(sentence: string): string[] {
  // Split at: comma+space, semicolon, colon, em-dash, en-dash, ellipsis
  const raw = sentence.split(
    /(?<=[,;:\u2014\u2013])\s+|(?<=\.\.\.)\s+|(?<=\u2026)\s+/
  );

  // Also split long clauses at conjunctions
  const expanded: string[] = [];
  for (const part of raw) {
    if (part.split(/\s+/).length > 10) {
      const m = part.match(
        /^(.{15,}?)\s+(but|and|or|yet|so|for|nor|while|although|because|however|though|when|where|who|which)\s+(.{10,})$/i
      );
      if (m) { expanded.push(m[1]); expanded.push(m[2] + " " + m[3]); }
      else expanded.push(part);
    } else {
      expanded.push(part);
    }
  }

  // Merge very short fragments with a neighbour
  const merged: string[] = [];
  let buf = "";
  for (let i = 0; i < expanded.length; i++) {
    buf += (buf ? " " : "") + expanded[i];
    if (buf.trim().split(/\s+/).length >= 3 || i === expanded.length - 1) {
      merged.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) {
    if (merged.length > 0) merged[merged.length - 1] += " " + buf.trim();
    else merged.push(buf.trim());
  }
  return merged.length > 0 ? merged : [sentence];
}

interface ClauseInfo {
  text: string;
  pitch: number;
  rateMul: number;
  pauseAfterMs: number;
}

function buildClausePlan(
  sentence: string,
  sentenceIdx: number,
  isParagraphEnd: boolean,
  isChapterOpener: boolean
): ClauseInfo[] {
  const type = detectSentenceType(sentence);
  const clauses = splitIntoClauses(sentence);
  const n = clauses.length;
  const hasAllCaps = /\b[A-Z]{3,}\b/.test(sentence);

  // Sentence-level modifiers
  let basePitchOff = 0;
  let baseRate = 1.0;
  let sentencePause = 200;

  switch (type) {
    case "question":    basePitchOff = 0.08;  baseRate = 0.96; sentencePause = 380; break;
    case "exclamation": basePitchOff = 0.06;  baseRate = 1.05; sentencePause = 300; break;
    case "ellipsis":    basePitchOff = -0.08; baseRate = 0.85; sentencePause = 650; break;
    case "dash":        basePitchOff = 0.02;  baseRate = 0.94; sentencePause = 450; break;
    case "whisper":     basePitchOff = -0.12; baseRate = 0.82; sentencePause = 420; break;
    case "shout":       basePitchOff = 0.15;  baseRate = 1.10; sentencePause = 320; break;
    case "dialogue":    basePitchOff = 0.04;  baseRate = 0.95; sentencePause = 250; break;
    case "short":       basePitchOff = 0;     baseRate = 0.88; sentencePause = 400; break;
    default: break;
  }
  if (isChapterOpener) { baseRate *= 0.92; sentencePause = Math.max(sentencePause, 450); }
  if (hasAllCaps) baseRate *= 0.93;
  if (isParagraphEnd) sentencePause += 350;

  return clauses.map((clause, i) => {
    const isFirst = i === 0;
    const isLast = i === n - 1;
    const pos = n > 1 ? i / (n - 1) : 0.5;

    // ── Pitch contour (the key to expressiveness!) ──
    let pitchC: number;
    if (type === "question") {
      pitchC = 0.98 + pos * 0.18;                     // steadily rising
    } else if (type === "exclamation" || type === "shout") {
      pitchC = 1.12 - pos * 0.08;                     // start high, slight fall
    } else if (type === "ellipsis") {
      pitchC = 1.02 - pos * 0.12;                     // trailing off
    } else if (type === "whisper") {
      pitchC = 0.88 + pos * 0.03;                     // low, nearly flat
    } else {
      // Declarative arc: rise to ~40% then fall
      const peak = 0.4;
      pitchC = pos <= peak
        ? 0.96 + (pos / peak) * 0.12                  // rise to 1.08
        : 1.08 - ((pos - peak) / (1 - peak)) * 0.14;  // fall to 0.94
    }
    let pitch = pitchC + basePitchOff;

    // ── Rate contour ──
    let rateMul = baseRate;
    if (isFirst) rateMul *= 0.94;
    if (isLast && type !== "question") rateMul *= 0.91;
    if (!isFirst && !isLast && n > 2) rateMul *= 1.04;

    // ── Inter-clause vs inter-sentence pause ──
    let pause: number;
    if (isLast) {
      pause = sentencePause;
    } else {
      const end = clause.trim();
      if (/[;:]$/.test(end)) pause = 110;
      else if (/[,\u2014\u2013]$/.test(end)) pause = 70;
      else pause = 45;
    }

    // ── Seeded micro-variation ±3 % ──
    const r = seededRandom(sentenceIdx * 100 + i + 7);
    pitch *= 0.97 + r * 0.06;
    rateMul *= 0.98 + r * 0.04;
    pause += Math.round((r - 0.5) * 30);

    pitch = Math.max(0.5, Math.min(2.0, pitch));
    rateMul = Math.max(0.5, Math.min(2.0, rateMul));
    pause = Math.max(15, Math.min(900, pause));

    return { text: clause, pitch, rateMul, pauseAfterMs: pause };
  });
}

// ═══════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════

export function AudioPlayer() {
  const {
    book,
    currentChapterIndex,
    setCurrentChapterIndex,
    theme,
    audioPlaying,
    setAudioPlaying,
    audioSentenceIndex,
    setAudioSentenceIndex,
    audioSpeed,
    setAudioSpeed,
    setIsAudioMode,
    voiceProfile,
    setVoiceProfile,
    activeVoiceType,
    setActiveVoiceType,
  } = useReader();

  const t = themes[theme];
  const chapter = book?.chapters[currentChapterIndex];

  // ── Engine state ──
  const [engine, setEngine] = useState<"browser" | "openai" | "personal">(_engine);

  // ── Personal voice state ──
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

  // ── Browser voice state ──
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [browserVoiceURI, setBrowserVoiceURI] = useState(_browserVoiceURI);

  // ── OpenAI TTS state ──
  const [oaiApiKey, setOaiApiKey] = useState(getSessionApiKey());
  const [oaiKeyInput, setOaiKeyInput] = useState("");
  const [oaiConnected, setOaiConnected] = useState(true); // Auto-connected: local TTS server needs no API key
  const [oaiConnecting, setOaiConnecting] = useState(false);
  const [oaiConnectError, setOaiConnectError] = useState("");
  const [oaiVoiceId, setOaiVoiceId] = useState(getSessionVoiceId() || DEFAULT_VOICE_ID);

  // ── UI state ──
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [voiceMenuView, setVoiceMenuView] = useState<"list" | "oai-setup">("list");
  const [isBuffering, setIsBuffering] = useState(false);
  const [ttsError, setTtsError] = useState("");

  // ── Ambient sound state ──
  const ambientRef = useRef<AmbientEngine | null>(null);
  const hysteresisRef = useRef<SceneHysteresis>(new SceneHysteresis(3, 8));
  const [ambientEnabled, setAmbientEnabled] = useState(false);
  const [ambientVolume, setAmbientVolume] = useState(0.35);
  const [currentSceneType, setCurrentSceneType] = useState<SceneType>("silence");
  const [secondarySceneType, setSecondarySceneType] = useState<SceneType | null>(null);
  const [sceneConfidence, setSceneConfidence] = useState(0);
  const [showAmbientMenu, setShowAmbientMenu] = useState(false);
  const [ambientMode, setAmbientMode] = useState<"auto" | "manual">("auto");
  const [manualScene, setManualScene] = useState<SceneType>("nature");
  const [sceneTransitioning, setSceneTransitioning] = useState(false);

  // ── Refs ──
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef("");
  const audioCacheRef = useRef<Map<string, Blob>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const autoContinueRef = useRef(false);
  const playingRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether clause chain is still active (prevents stale closures from continuing)
  const clauseGenRef = useRef(0);

  // ── WebSocket streaming refs ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wsAbortRef = useRef<(() => void) | null>(null);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const wsCacheRef = useRef<Map<string, AudioBuffer[]>>(new Map());
  const wsStoppedRef = useRef(false); // true when stopAll was called, prevents onended from advancing

  useEffect(() => { playingRef.current = audioPlaying; }, [audioPlaying]);
  useEffect(() => { _engine = engine; }, [engine]);
  useEffect(() => { _browserVoiceURI = browserVoiceURI; }, [browserVoiceURI]);

  // ── Lazy-init AudioContext (Web Audio API) ──
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // ── Sentence map ──
  const sentenceMap = useMemo(
    () => (chapter ? buildSentenceMap(chapter.content) : null),
    [chapter]
  );
  const sentences = sentenceMap?.flat ?? [];
  const totalSentences = sentenceMap?.total ?? 0;

  // Paragraph-ending indices
  const paragraphEndIndices = useMemo(() => {
    if (!sentenceMap) return new Set<number>();
    const s = new Set<number>();
    for (const para of sentenceMap.paragraphs) {
      if (para.sentences.length > 0) s.add(para.startIdx + para.sentences.length - 1);
    }
    return s;
  }, [sentenceMap]);

  // ───────────────────────────────────────────────────
  //  BROWSER VOICES: load, score, auto-select best
  // ───────────────────────────────────────────────────

  useEffect(() => {
    const load = () => {
      const all = speechSynthesis.getVoices();
      const english = all
        .filter((v) => v.lang.toLowerCase().startsWith("en"))
        .sort((a, b) => scoreBrowserVoice(b) - scoreBrowserVoice(a));
      setBrowserVoices(english.length > 0 ? english : all);
      if (!browserVoiceURI && english.length > 0) {
        setBrowserVoiceURI(english[0].voiceURI);
        _browserVoiceURI = english[0].voiceURI;
      }
    };
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, [browserVoiceURI]);

  // ───────────────────────────────────────────────────
  //  OPENAI TTS CONNECTION
  // ───────────────────────────────────────────────────

  const handleOaiConnect = useCallback(async () => {
    const key = oaiKeyInput.trim();
    if (!key) return;
    setOaiConnecting(true);
    setOaiConnectError("");
    try {
      const valid = await openaiValidateKey(key);
      if (!valid) throw new Error("INVALID_KEY");
      setOaiApiKey(key);
      setSessionApiKey(key);
      setOaiConnected(true);
      setVoiceMenuView("list");
    } catch (err: any) {
      setOaiConnectError(
        err?.message === "INVALID_KEY"
          ? "Invalid API key. Check and try again."
          : "Connection failed. Check your network."
      );
    } finally {
      setOaiConnecting(false);
    }
  }, [oaiKeyInput]);

  // Auto-connect if session key exists
  useEffect(() => {
    const key = getSessionApiKey();
    if (key) {
      setOaiApiKey(key);
      setOaiConnected(true);
      // Restore engine preference
      if (_engine === "openai") setEngine("openai");
    }
  }, []);

  // ───────────────────────────────────────────────────
  //  STOP ALL
  // ───────────────────────────────────────────────────

  const bridgeBrowserRef = useRef(false);

  const stopAll = useCallback(() => {
    clauseGenRef.current++;
    bridgeBrowserRef.current = false;
    speechSynthesis.cancel();
    if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = ""; }
    // ── WebSocket / Web Audio cleanup ──
    wsAbortRef.current?.(); wsAbortRef.current = null;
    wsStoppedRef.current = true;
    scheduledSourcesRef.current.forEach(s => { try { s.stop(); s.disconnect(); } catch {} });
    scheduledSourcesRef.current = [];
  }, []);

  useEffect(() => { audioCacheRef.current.clear(); wsCacheRef.current.clear(); }, [currentChapterIndex, oaiVoiceId]);

  // ── Eager prefetch: start fetching the first few sentences as soon as
  //    the audio panel mounts, the chapter changes, or the engine switches
  //    to OpenAI.  This means audio is often cached before the user taps play.
  const eagerPrefetchedRef = useRef<string>("");
  useEffect(() => {
    if ((engine !== "openai" && engine !== "personal") || !oaiConnected || !oaiApiKey || sentences.length === 0) return;
    const voice = oaiVoiceId || DEFAULT_VOICE_ID;
    // Dedupe: only prefetch once per chapter+voice combo
    const sig = `${currentChapterIndex}:${voice}:${audioSentenceIndex}`;
    if (eagerPrefetchedRef.current === sig) return;
    eagerPrefetchedRef.current = sig;
    // Prefetch current sentence and next 2
    const isLocal = oaiApiKey === "local-tts";
    for (let i = 0; i < 3; i++) {
      const idx = audioSentenceIndex + i;
      if (idx >= sentences.length) break;
      const ck = `${voice}:${idx}`;

      if (isLocal) {
        // WebSocket prefetch → decode + cache AudioBuffer[]
        if (!wsCacheRef.current.has(ck)) {
          wsCacheRef.current.set(ck, []); // placeholder to prevent duplicates
          const { promise } = fetchTtsChunks(sentences[idx]);
          promise.then(async (chunks) => {
            try {
              const ctx = getAudioCtx();
              const bufs: AudioBuffer[] = [];
              for (const chunk of chunks) {
                bufs.push(await ctx.decodeAudioData(chunk));
              }
              wsCacheRef.current.set(ck, bufs);
            } catch { wsCacheRef.current.delete(ck); }
          }, () => { wsCacheRef.current.delete(ck); });
        }
      } else {
        // HTTP prefetch (real OpenAI API)
        if (!audioCacheRef.current.has(ck)) {
          const instr = buildNarrationInstructions(sentences[idx]);
          openaiTextToSpeech(oaiApiKey, voice, sentences[idx], instr).then(
            (b) => audioCacheRef.current.set(ck, b),
            () => {}
          );
        }
      }
    }
  }, [engine, oaiConnected, oaiApiKey, oaiVoiceId, sentences, currentChapterIndex, audioSentenceIndex, getAudioCtx]);

  // ═══════════════════════════════════════════════════
  //  BROWSER TTS — CLAUSE-LEVEL PLAYBACK
  //
  //  Each sentence is split into clauses. Each clause
  //  becomes its own SpeechSynthesisUtterance with a
  //  unique pitch + rate, chained with micro-pauses.
  //  This creates real prosodic movement inside every
  //  sentence, making the voice sound expressive.
  // ═══════════════════════════════════════════════════

  const speakBrowser = useCallback(
    (sentIdx: number) => {
      speechSynthesis.cancel();
      if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }

      if (sentIdx < 0 || sentIdx >= sentences.length) {
        setAudioPlaying(false);
        return;
      }

      // Build clause plan for this sentence
      const plan = buildClausePlan(
        sentences[sentIdx],
        sentIdx,
        paragraphEndIndices.has(sentIdx),
        sentIdx === 0
      );

      // Capture current generation to detect stop/skip
      const gen = ++clauseGenRef.current;

      const getVoice = () =>
        speechSynthesis.getVoices().find((v) => v.voiceURI === browserVoiceURI);

      // Chain clauses sequentially
      const speakClause = (ci: number) => {
        // Bail if generation changed (user stopped/skipped)
        if (clauseGenRef.current !== gen) return;

        if (ci >= plan.length) {
          // All clauses done → next sentence
          const nextSent = sentIdx + 1;
          if (nextSent < sentences.length) {
            const lastPause = plan[plan.length - 1].pauseAfterMs;
            const scaledPause = Math.round(lastPause / Math.max(audioSpeed, 0.5));
            pauseTimerRef.current = setTimeout(() => {
              pauseTimerRef.current = null;
              if (clauseGenRef.current === gen) speakBrowser(nextSent);
            }, scaledPause);
          } else if (book && currentChapterIndex < book.chapters.length - 1) {
            autoContinueRef.current = true;
            setCurrentChapterIndex(currentChapterIndex + 1);
          } else {
            setAudioPlaying(false);
          }
          return;
        }

        const c = plan[ci];
        const u = new SpeechSynthesisUtterance(c.text);
        u.rate = audioSpeed * c.rateMul;
        u.pitch = c.pitch;
        u.volume = 1.0;
        const voice = getVoice();
        if (voice) u.voice = voice;

        // Mark playing on first clause
        if (ci === 0) {
          u.onstart = () => {
            setAudioSentenceIndex(sentIdx);
            setAudioPlaying(true);
          };
        }

        u.onend = () => {
          if (clauseGenRef.current !== gen) return;
          const nextClause = ci + 1;
          if (nextClause < plan.length) {
            // Inter-clause micro-pause
            const pause = Math.round(c.pauseAfterMs / Math.max(audioSpeed, 0.5));
            if (pause > 10) {
              pauseTimerRef.current = setTimeout(() => {
                pauseTimerRef.current = null;
                speakClause(nextClause);
              }, pause);
            } else {
              speakClause(nextClause);
            }
          } else {
            // Last clause done → trigger next sentence via recursion
            speakClause(plan.length);
          }
        };

        u.onerror = (e) => {
          if (e.error !== "canceled" && e.error !== "interrupted") {
            setAudioPlaying(false);
          }
        };

        speechSynthesis.speak(u);
      };

      speakClause(0);
    },
    [
      sentences,
      audioSpeed,
      browserVoiceURI,
      paragraphEndIndices,
      book,
      currentChapterIndex,
      setAudioPlaying,
      setAudioSentenceIndex,
      setCurrentChapterIndex,
    ]
  );

  // ───────────────────────────────────────────────────
  //  OPENAI TTS ENGINE (gpt-4o-mini-tts)
  // ───────────────────────────────────────────��───────

  // ───────────────────────────────────────────────────
  //  WEBSOCKET STREAMING TTS (local server)
  //  Uses Web Audio API: AudioContext + BufferSourceNode
  // ───────────────────────────────────────────────────

  /** Play an array of decoded AudioBuffers in sequence via Web Audio API.
   *  When the last buffer finishes, advances to the next sentence. */
  const playWsBuffers = useCallback(
    (buffers: AudioBuffer[], idx: number, personalInstr?: string) => {
      // Stop any prior scheduled sources
      scheduledSourcesRef.current.forEach(s => { try { s.stop(); s.disconnect(); } catch {} });
      scheduledSourcesRef.current = [];
      wsStoppedRef.current = false;

      const ctx = getAudioCtx();
      let startTime = ctx.currentTime;
      let lastSource: AudioBufferSourceNode | null = null;

      for (const buffer of buffers) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = audioSpeed;
        src.connect(ctx.destination);
        src.start(startTime);
        startTime += buffer.duration / audioSpeed;
        scheduledSourcesRef.current.push(src);
        lastSource = src;
      }

      setIsBuffering(false);
      setAudioPlaying(true);
      setTtsError("");

      if (lastSource) {
        lastSource.onended = () => {
          if (wsStoppedRef.current) return; // stopAll was called
          scheduledSourcesRef.current = [];
          const next = idx + 1;
          if (next < sentences.length) {
            speakOpenAIRef.current(next, personalInstr);
          } else if (book && currentChapterIndex < book.chapters.length - 1) {
            autoContinueRef.current = true;
            setCurrentChapterIndex(currentChapterIndex + 1);
          } else {
            setAudioPlaying(false);
          }
        };
      }
    },
    [audioSpeed, sentences, book, currentChapterIndex, setAudioPlaying, setCurrentChapterIndex, getAudioCtx]
  );

  /** Prefetch next 2 sentences via WebSocket, decode & cache. */
  const prefetchWs = useCallback(
    (fromIdx: number) => {
      const voice = oaiVoiceId || DEFAULT_VOICE_ID;
      for (let i = 1; i <= 2; i++) {
        const n = fromIdx + i;
        if (n >= sentences.length) break;
        const ck = `${voice}:${n}`;
        if (wsCacheRef.current.has(ck)) continue;
        wsCacheRef.current.set(ck, []); // placeholder
        const { promise } = fetchTtsChunks(sentences[n]);
        promise.then(async (chunks) => {
          try {
            const ctx = getAudioCtx();
            const bufs: AudioBuffer[] = [];
            for (const chunk of chunks) {
              bufs.push(await ctx.decodeAudioData(chunk));
            }
            wsCacheRef.current.set(ck, bufs);
          } catch { wsCacheRef.current.delete(ck); }
        }, () => { wsCacheRef.current.delete(ck); });
      }
    },
    [oaiVoiceId, sentences, getAudioCtx]
  );

  // ── HTTP path helpers (real OpenAI API / fallback) ──

  const fetchOaiAudio = useCallback(
    async (idx: number, voice: string, personalInstr?: string, signal?: AbortSignal): Promise<Blob | null> => {
      const ck = `${voice}:${idx}`;
      const cached = audioCacheRef.current.get(ck);
      if (cached) return cached;
      if (idx < 0 || idx >= sentences.length) return null;
      try {
        const instructions = buildNarrationInstructions(sentences[idx], undefined, personalInstr);
        const blob = await openaiTextToSpeech(oaiApiKey, voice, sentences[idx], instructions, signal);
        audioCacheRef.current.set(ck, blob);
        return blob;
      } catch (err: any) {
        if (err?.name === "AbortError") return null;
        throw err;
      }
    },
    [oaiApiKey, sentences]
  );

  const prefetchOai = useCallback(
    (fromIdx: number, voice: string, personalInstr?: string) => {
      // Prefetch next 2 sentences (concurrency limiter in openaiTtsApi queues safely)
      for (let i = 1; i <= 2; i++) {
        const n = fromIdx + i;
        if (n < sentences.length) {
          const ck = `${voice}:${n}`;
          if (!audioCacheRef.current.has(ck)) {
            const instr = buildNarrationInstructions(sentences[n], undefined, personalInstr);
            openaiTextToSpeech(oaiApiKey, voice, sentences[n], instr).then(
              (b) => audioCacheRef.current.set(ck, b),
              () => {}
            );
          }
        }
      }
    },
    [oaiApiKey, sentences]
  );

  // Ref to always access the latest speakOpenAI — breaks the circular
  // dependency between playOaiBlob → speakOpenAI → playOaiBlob.
  const speakOpenAIRef = useRef<(idx: number, personalInstr?: string) => void>(() => {});

  // ── Helper: play a single OpenAI blob ──
  const playOaiBlob = useCallback(
    (blob: Blob, idx: number, personalInstr: string | undefined, ctrl: AbortController) => {
      if (ctrl.signal.aborted) return;
      const voice = oaiVoiceId || DEFAULT_VOICE_ID;
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const audio = new Audio(url);
      audio.playbackRate = audioSpeed;
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        blobUrlRef.current = "";
        const next = idx + 1;
        if (next < sentences.length) {
          speakOpenAIRef.current(next, personalInstr);
        } else if (book && currentChapterIndex < book.chapters.length - 1) {
          autoContinueRef.current = true;
          setCurrentChapterIndex(currentChapterIndex + 1);
        } else {
          setAudioPlaying(false);
        }
      };
      audio.onerror = () => {
        if (!ctrl.signal.aborted) {
          setIsBuffering(false);
          setAudioPlaying(false);
          setTtsError("Audio playback failed — try a different voice");
        }
      };
      setIsBuffering(false);
      setAudioPlaying(true);
      audio.play().then(() => {
        setTtsError("");
        prefetchOai(idx, voice, personalInstr);
      }).catch(() => {});
    },
    [sentences, audioSpeed, oaiVoiceId, prefetchOai, book, currentChapterIndex, setAudioPlaying, setCurrentChapterIndex]
  );

  // ── Browser TTS bridge: speak one sentence instantly via browser while
  //    OpenAI fetches the *next* sentence in the background. When the
  //    browser finishes, hand off to the AI voice from sentence idx+1.
  const bridgeSpeakBrowser = useCallback(
    (idx: number, personalInstr: string | undefined, ctrl: AbortController) => {
      bridgeBrowserRef.current = true;
      const voice = oaiVoiceId || DEFAULT_VOICE_ID;
      speechSynthesis.cancel();
      if (idx < 0 || idx >= sentences.length) { setAudioPlaying(false); return; }

      // Kick off background fetch for this sentence + next so it's cached by the time we need it
      for (let i = 0; i < 3; i++) {
        const n = idx + i;
        if (n < sentences.length) {
          const ck = `${voice}:${n}`;
          if (!audioCacheRef.current.has(ck)) {
            const instr = buildNarrationInstructions(sentences[n], undefined, personalInstr);
            openaiTextToSpeech(oaiApiKey, voice, sentences[n], instr).then(
              (b) => audioCacheRef.current.set(ck, b),
              () => {}
            );
          }
        }
      }

      const plan = buildClausePlan(sentences[idx], idx, paragraphEndIndices.has(idx), idx === 0);
      const gen = ++clauseGenRef.current;
      const getVoice = () => speechSynthesis.getVoices().find((v) => v.voiceURI === browserVoiceURI);

      const speakClause = (ci: number) => {
        if (clauseGenRef.current !== gen || ctrl.signal.aborted) return;
        if (ci >= plan.length) {
          // Bridge sentence done — hand off to OpenAI from next sentence
          bridgeBrowserRef.current = false;
          const next = idx + 1;
          if (next < sentences.length) {
            speakOpenAIRef.current(next, personalInstr);
          } else if (book && currentChapterIndex < book.chapters.length - 1) {
            autoContinueRef.current = true;
            setCurrentChapterIndex(currentChapterIndex + 1);
          } else {
            setAudioPlaying(false);
          }
          return;
        }
        const c = plan[ci];
        const u = new SpeechSynthesisUtterance(c.text);
        u.rate = audioSpeed * c.rateMul;
        u.pitch = c.pitch;
        u.volume = 1.0;
        const v = getVoice();
        if (v) u.voice = v;
        if (ci === 0) {
          u.onstart = () => { setAudioSentenceIndex(idx); setAudioPlaying(true); setIsBuffering(false); };
        }
        u.onend = () => {
          if (clauseGenRef.current !== gen) return;
          const next = ci + 1;
          if (next < plan.length) {
            const pause = Math.round(c.pauseAfterMs / Math.max(audioSpeed, 0.5));
            if (pause > 10) {
              pauseTimerRef.current = setTimeout(() => { pauseTimerRef.current = null; speakClause(next); }, pause);
            } else speakClause(next);
          } else speakClause(plan.length);
        };
        u.onerror = (e) => { if (e.error !== "canceled" && e.error !== "interrupted") setAudioPlaying(false); };
        speechSynthesis.speak(u);
      };
      speakClause(0);
    },
    [sentences, audioSpeed, oaiApiKey, oaiVoiceId, browserVoiceURI, paragraphEndIndices, book, currentChapterIndex, setAudioPlaying, setAudioSentenceIndex, setCurrentChapterIndex]
  );

  const speakOpenAI = useCallback(
    (idx: number, personalInstr?: string) => {
      // ── Common cleanup ──
      if (bridgeBrowserRef.current) {
        clauseGenRef.current++;
        speechSynthesis.cancel();
        if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
        bridgeBrowserRef.current = false;
      }
      abortRef.current?.abort();
      wsAbortRef.current?.(); wsAbortRef.current = null;
      wsStoppedRef.current = true; // prevent stale onended from prior play
      scheduledSourcesRef.current.forEach(s => { try { s.stop(); s.disconnect(); } catch {} });
      scheduledSourcesRef.current = [];
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; audioRef.current = null; }
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = ""; }
      if (idx < 0 || idx >= sentences.length) { setAudioPlaying(false); return; }

      const voice = oaiVoiceId || DEFAULT_VOICE_ID;
      const ck = `${voice}:${idx}`;
      setAudioSentenceIndex(idx);
      setTtsError("");

      // ═══════════════════════════════════════════════════
      //  LOCAL TTS → WebSocket streaming + Web Audio API
      // ═══════════════════════════════════════════════════
      if (oaiApiKey === "local-tts") {
        // Reset the stop flag — cleanup above set it to prevent stale
        // onended from the *prior* sentence; this new stream is fresh.
        wsStoppedRef.current = false;

        // Fast path: cached AudioBuffer[]
        const cached = wsCacheRef.current.get(ck);
        if (cached && cached.length > 0) {
          playWsBuffers(cached, idx, personalInstr);
          prefetchWs(idx);
          return;
        }

        // Streaming path: open WebSocket, collect chunks, decode, play
        setIsBuffering(true);
        const ctx = getAudioCtx();
        const chunks: ArrayBuffer[] = [];
        let firstChunk = true;
        let completed = false;

        const abort = streamTts(sentences[idx], {
          onChunk: (data) => {
            if (completed) return;
            chunks.push(data);
            if (firstChunk) { firstChunk = false; /* buffering indicator stays until we play */ }
          },
          onComplete: async () => {
            if (completed) return;
            completed = true;
            if (chunks.length === 0) {
              setIsBuffering(false);
              setAudioPlaying(false);
              setTtsError("No audio received — is the TTS server running?");
              return;
            }
            try {
              const bufs: AudioBuffer[] = [];
              for (const chunk of chunks) {
                bufs.push(await ctx.decodeAudioData(chunk));
              }
              wsCacheRef.current.set(ck, bufs);
              // Guard: if stopAll was called while we were decoding, don't play
              if (wsStoppedRef.current) return;
              playWsBuffers(bufs, idx, personalInstr);
              prefetchWs(idx);
            } catch {
              setIsBuffering(false);
              setAudioPlaying(false);
              setTtsError("Failed to decode TTS audio");
            }
          },
          onError: () => {
            if (completed) return;
            completed = true;
            setIsBuffering(false);
            setAudioPlaying(false);
            setTtsError("WebSocket TTS failed — is ws://127.0.0.1:8000/stream running?");
          },
        });
        wsAbortRef.current = abort;
        return;
      }

      // ═══════════════════════════════════════════════════
      //  REAL OPENAI API → HTTP fetch + HTML Audio element
      // ═══════════════════════════════════════════════════
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const cached = audioCacheRef.current.get(ck);
      if (cached) {
        playOaiBlob(cached, idx, personalInstr, ctrl);
        return;
      }

      setIsBuffering(true);
      fetchOaiAudio(idx, voice, personalInstr, ctrl.signal)
        .then((blob) => {
          if (ctrl.signal.aborted) return;
          if (blob) {
            playOaiBlob(blob, idx, personalInstr, ctrl);
          } else {
            setIsBuffering(false);
            setAudioPlaying(false);
            setTtsError("Failed to generate audio — is the TTS server running?");
          }
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          setIsBuffering(false);
          setAudioPlaying(false);
          setTtsError("TTS server error — check http://127.0.0.1:8000");
        });
    },
    [sentences, oaiVoiceId, oaiApiKey, playOaiBlob, fetchOaiAudio, playWsBuffers, prefetchWs, getAudioCtx, setAudioPlaying, setAudioSentenceIndex]
  );

  // Keep ref in sync so callbacks always call the latest version
  useEffect(() => { speakOpenAIRef.current = speakOpenAI; }, [speakOpenAI]);

  // ───────────────────────────────────────────────────
  //  PERSONAL VOICE TTS — OpenAI TTS with custom instructions
  //  (falls back to browser SpeechSynthesis if no API key)
  // ───────────────────────────────────────────────────

  const speakPersonalVoice = useCallback(
    (sentIdx: number) => {
      if (!voiceProfile) { setAudioPlaying(false); return; }

      // If OpenAI API key is available, use gpt-4o-mini-tts with personal voice instructions
      if (oaiConnected && oaiApiKey) {
        const personalInstr = buildPersonalVoiceInstructions(voiceProfile);
        speakOpenAI(sentIdx, personalInstr);
        return;
      }

      // Fallback: browser SpeechSynthesis with pitch/rate from profile
      speechSynthesis.cancel();
      if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
      if (sentIdx < 0 || sentIdx >= sentences.length) { setAudioPlaying(false); return; }

      const plan = buildClausePlan(sentences[sentIdx], sentIdx, paragraphEndIndices.has(sentIdx), sentIdx === 0);
      const gen = ++clauseGenRef.current;
      const pPitch = voiceProfile.pitch;
      const pRate = voiceProfile.rate;
      const getVoice = () => speechSynthesis.getVoices().find((v) => v.voiceURI === browserVoiceURI) || speechSynthesis.getVoices()[0];

      const speakClause = (ci: number) => {
        if (clauseGenRef.current !== gen) return;
        if (ci >= plan.length) {
          const nextSent = sentIdx + 1;
          if (nextSent < sentences.length) {
            const scaledPause = Math.round(plan[plan.length - 1].pauseAfterMs / Math.max(audioSpeed, 0.5));
            pauseTimerRef.current = setTimeout(() => { pauseTimerRef.current = null; if (clauseGenRef.current === gen) speakPersonalVoice(nextSent); }, scaledPause);
          } else if (book && currentChapterIndex < book.chapters.length - 1) {
            autoContinueRef.current = true; setCurrentChapterIndex(currentChapterIndex + 1);
          } else { setAudioPlaying(false); }
          return;
        }
        const c = plan[ci];
        const u = new SpeechSynthesisUtterance(c.text);
        u.rate = audioSpeed * c.rateMul * pRate;
        u.pitch = Math.max(0.5, Math.min(2.0, c.pitch * pPitch));
        u.volume = 1.0;
        const voice = getVoice(); if (voice) u.voice = voice;
        if (ci === 0) { u.onstart = () => { setAudioSentenceIndex(sentIdx); setAudioPlaying(true); }; }
        u.onend = () => {
          if (clauseGenRef.current !== gen) return;
          const next = ci + 1;
          if (next < plan.length) {
            const pause = Math.round(c.pauseAfterMs / Math.max(audioSpeed, 0.5));
            if (pause > 10) { pauseTimerRef.current = setTimeout(() => { pauseTimerRef.current = null; speakClause(next); }, pause); }
            else speakClause(next);
          } else { speakClause(plan.length); }
        };
        u.onerror = (e) => { if (e.error !== "canceled" && e.error !== "interrupted") setAudioPlaying(false); };
        speechSynthesis.speak(u);
      };
      speakClause(0);
    },
    [sentences, audioSpeed, browserVoiceURI, voiceProfile, paragraphEndIndices, book, currentChapterIndex, oaiConnected, oaiApiKey, speakOpenAI, setAudioPlaying, setAudioSentenceIndex, setCurrentChapterIndex]
  );

  // ───────────────────────────────────────────────────
  //  ENGINE-AGNOSTIC PLAY
  // ───────────────────────────────────────────────────

  const playSentence = useCallback(
    (idx: number) => {
      if (engine === "personal" && voiceProfile) speakPersonalVoice(idx);
      else if (engine === "openai") speakOpenAI(idx);
      else speakBrowser(idx);
    },
    [engine, voiceProfile, speakPersonalVoice, speakOpenAI, speakBrowser]
  );

  // Auto-continue into next chapter
  useEffect(() => {
    if (autoContinueRef.current) {
      autoContinueRef.current = false;
      setAudioSentenceIndex(0);
      const timer = setTimeout(() => playSentence(0), 300);
      return () => clearTimeout(timer);
    } else if (!playingRef.current) {
      setAudioSentenceIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapterIndex]);

  // ───────────────────────────────────────────────────
  //  TRANSPORT CONTROLS
  // ───────────────────────────────────────────────────

  const handlePlayPause = useCallback(() => {
    if (audioPlaying) {
      if (engine === "browser" || engine === "personal" || bridgeBrowserRef.current) {
        clauseGenRef.current++;
        bridgeBrowserRef.current = false;
        speechSynthesis.cancel();
        if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
      }
      if (engine === "openai" && !bridgeBrowserRef.current) {
        audioRef.current?.pause();
      }
      setAudioPlaying(false);
    } else {
      if (engine === "openai" && audioRef.current && !audioRef.current.ended) {
        audioRef.current.play();
        setAudioPlaying(true);
      } else {
        playSentence(audioSentenceIndex);
      }
    }
  }, [audioPlaying, engine, audioSentenceIndex, playSentence, setAudioPlaying]);

  const handleSkipBack = useCallback(() => {
    const prev = Math.max(0, audioSentenceIndex - 1);
    stopAll();
    if (audioPlaying || isBuffering) playSentence(prev);
    else setAudioSentenceIndex(prev);
  }, [audioSentenceIndex, audioPlaying, isBuffering, stopAll, playSentence, setAudioSentenceIndex]);

  const handleSkipForward = useCallback(() => {
    const next = Math.min(totalSentences - 1, audioSentenceIndex + 1);
    stopAll();
    if (audioPlaying || isBuffering) playSentence(next);
    else setAudioSentenceIndex(next);
  }, [audioSentenceIndex, totalSentences, audioPlaying, isBuffering, stopAll, playSentence, setAudioSentenceIndex]);

  const cycleSpeed = useCallback(() => {
    const i = SPEED_OPTIONS.indexOf(audioSpeed);
    const next = SPEED_OPTIONS[(i + 1) % SPEED_OPTIONS.length];
    setAudioSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
    // WebSocket/Web Audio: restart to re-schedule with new rate
    if (engine === "openai" && oaiApiKey === "local-tts" && audioPlaying) {
      stopAll();
      setTimeout(() => speakOpenAI(audioSentenceIndex), 40);
    }
    // Browser/Personal (browser fallback): restart at new speed
    else if (engine === "browser" && audioPlaying) {
      stopAll();
      setTimeout(() => speakBrowser(audioSentenceIndex), 40);
    }
  }, [audioSpeed, engine, oaiApiKey, audioPlaying, audioSentenceIndex, setAudioSpeed, stopAll, speakBrowser, speakOpenAI]);

  // ── Voice selection ──
  const selectBrowserVoice = useCallback(
    (uri: string) => {
      const wasPlaying = audioPlaying;
      stopAll();
      setEngine("browser"); _engine = "browser";
      setBrowserVoiceURI(uri); _browserVoiceURI = uri;
      setShowVoiceMenu(false);
      if (wasPlaying) setTimeout(() => speakBrowser(audioSentenceIndex), 80);
    },
    [audioPlaying, stopAll, audioSentenceIndex, speakBrowser]
  );

  const selectOaiVoice = useCallback(
    (voiceId: string) => {
      const wasPlaying = audioPlaying;
      stopAll();
      setEngine("openai"); _engine = "openai";
      setOaiVoiceId(voiceId); setSessionVoiceId(voiceId);
      audioCacheRef.current.clear();
      setShowVoiceMenu(false);
      if (wasPlaying) setTimeout(() => speakOpenAI(audioSentenceIndex), 80);
    },
    [audioPlaying, stopAll, audioSentenceIndex, speakOpenAI]
  );

  const selectLocalTts = useCallback(() => {
    const wasPlaying = audioPlaying;
    stopAll();
    setEngine("openai"); _engine = "openai";
    setOaiApiKey("local-tts");
    setSessionApiKey("local-tts");
    setOaiConnected(true);
    audioCacheRef.current.clear();
    setShowVoiceMenu(false);
    if (wasPlaying) setTimeout(() => speakOpenAI(audioSentenceIndex), 80);
  }, [audioPlaying, stopAll, audioSentenceIndex, speakOpenAI]);

  // ── Personal voice selection ──
  const selectPersonalVoice = useCallback(() => {
    if (!voiceProfile) return;
    const wasPlaying = audioPlaying;
    stopAll();
    setEngine("personal");
    setActiveVoiceType("personal");
    setShowVoiceMenu(false);
    if (wasPlaying) setTimeout(() => speakPersonalVoice(audioSentenceIndex), 80);
  }, [audioPlaying, stopAll, audioSentenceIndex, speakPersonalVoice, voiceProfile, setActiveVoiceType]);

  const handleSaveVoiceProfile = useCallback((profile: VoiceProfile) => {
    setVoiceProfile(profile);
    setActiveVoiceType("personal");
  }, [setVoiceProfile, setActiveVoiceType]);

  const handleClose = useCallback(() => {
    stopAll(); setAudioPlaying(false); setIsAudioMode(false);
    ambientRef.current?.stop();
    // Close AudioContext to free system audio resources
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, [stopAll, setAudioPlaying, setIsAudioMode]);

  useEffect(() => {
    return () => {
      clauseGenRef.current++;
      speechSynthesis.cancel();
      abortRef.current?.abort();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlePlayPause]);

  // ───────────────────────────────────────────────────
  //  AMBIENT SOUND ENGINE
  // ───────────────────────────────────────────────────

  // Initialise / dispose ambient engine
  useEffect(() => {
    ambientRef.current = new AmbientEngine();
    return () => {
      ambientRef.current?.dispose();
      ambientRef.current = null;
    };
  }, []);

  // Start / stop ambient when toggled or when audio playback changes
  useEffect(() => {
    const eng = ambientRef.current;
    if (!eng) return;
    if (ambientEnabled && audioPlaying) {
      eng.setVolume(ambientVolume);
      const scene = ambientMode === "manual" ? manualScene : currentSceneType;
      eng.start(scene === "silence" ? "indoor" : scene);
    } else {
      eng.stop();
    }
  }, [ambientEnabled, audioPlaying, ambientVolume, ambientMode, manualScene, currentSceneType]);

  // Update volume live
  useEffect(() => {
    ambientRef.current?.setVolume(ambientVolume);
  }, [ambientVolume]);

  // Scene detection — runs every time audioSentenceIndex changes
  useEffect(() => {
    if (!ambientEnabled || ambientMode !== "auto" || sentences.length === 0) return;
    const context = buildContextWindow(sentences, audioSentenceIndex, 9);
    const result: SceneDetectionResult = detectScene(context);

    // Apply hysteresis to prevent rapid flickering
    const stableScene = hysteresisRef.current.update(result.primary);

    // Show transition animation when scene changes
    if (stableScene !== currentSceneType) {
      setSceneTransitioning(true);
      setTimeout(() => setSceneTransitioning(false), 2500);
    }

    setCurrentSceneType(stableScene);
    setSecondarySceneType(result.secondary);
    setSceneConfidence(result.confidence);

    if (ambientRef.current?.running) {
      const primaryScene = stableScene === "silence" ? "indoor" : stableScene;
      ambientRef.current.transitionTo(
        primaryScene,
        result.secondary,
        result.secondaryWeight,
      );
    }
  }, [audioSentenceIndex, ambientEnabled, ambientMode, sentences, currentSceneType]);

  // Manual scene change
  useEffect(() => {
    if (ambientMode === "manual" && ambientRef.current?.running) {
      ambientRef.current.transitionTo(manualScene);
    }
  }, [manualScene, ambientMode]);

  const toggleAmbient = useCallback(() => {
    setAmbientEnabled(prev => !prev);
  }, []);

  // ───────────────────────────────────────────────────
  if (!chapter || !sentenceMap) return null;

  const progress = totalSentences > 0 ? ((audioSentenceIndex + 1) / totalSentences) * 100 : 0;
  const isLocalTts = engine === "openai" && oaiApiKey === "local-tts";
  const activeVoiceName =
    engine === "personal" && voiceProfile
      ? voiceProfile.name
      : isLocalTts
      ? "Local TTS"
      : engine === "openai"
      ? OPENAI_VOICES.find((v) => v.id === oaiVoiceId)?.name ?? "AI Voice"
      : browserVoices.find((v) => v.voiceURI === browserVoiceURI)?.name ?? "System Voice";

  // ───────────────────────────────────────────────────
  //  RENDER
  // ───────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute bottom-0 left-0 right-0 z-[9999]"
    >
      {/* Error banner */}
      {ttsError && (
        <div
          className="px-4 py-1.5 flex items-center justify-between"
          style={{ backgroundColor: "#fef2f2", borderBottom: `1px solid #fecaca`, fontSize: 12, color: "#991b1b" }}
        >
          <span>{ttsError}</span>
          <button onClick={() => setTtsError("")} className="ml-2 opacity-60 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="h-[2px] w-full" style={{ backgroundColor: `${t.border}66` }}>
        <div
          className="h-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%`, backgroundColor: t.accent }}
        />
      </div>

      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ backgroundColor: t.toolbar, borderTop: `1px solid ${t.border}` }}
      >
        {/* Transport */}
        <div className="flex items-center gap-0.5">
          <button onClick={handleSkipBack} disabled={isBuffering} className="p-2 rounded-lg transition-colors hover:opacity-70 disabled:opacity-30" style={{ color: t.toolbarText }} title="Previous sentence">
            <SkipBack size={15} />
          </button>
          <button onClick={handlePlayPause} disabled={isBuffering && !audioPlaying} className="p-2.5 rounded-full transition-all hover:scale-105 disabled:opacity-60" style={{ backgroundColor: t.accent, color: "#fff" }} title={audioPlaying ? "Pause" : "Play"}>
            {isBuffering && !audioPlaying ? <Loader2 size={16} className="animate-spin" /> : audioPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
          <button onClick={handleSkipForward} disabled={isBuffering} className="p-2 rounded-lg transition-colors hover:opacity-70 disabled:opacity-30" style={{ color: t.toolbarText }} title="Next sentence">
            <SkipForward size={15} />
          </button>
        </div>

        {/* Speed + Voice */}
        <div className="flex items-center gap-2">
          <button onClick={cycleSpeed} className="px-2.5 py-1 rounded-md transition-colors hover:opacity-70 tabular-nums" style={{ color: t.toolbarText, fontSize: 12, fontWeight: 500, backgroundColor: `${t.border}44` }} title="Playback speed">
            {audioSpeed}x
          </button>
          <div className="relative">
            <button onClick={() => { setShowVoiceMenu(!showVoiceMenu); setVoiceMenuView("list"); }} className="px-2.5 py-1 rounded-md transition-colors hover:opacity-70 flex items-center gap-1.5 max-w-[180px]" style={{ color: t.toolbarText, fontSize: 12, backgroundColor: `${t.border}44` }} title="Select voice">
              {engine === "personal" && <User size={11} style={{ color: t.accent, flexShrink: 0 }} />}
              {engine === "openai" && isLocalTts && <Server size={11} style={{ color: t.accent, flexShrink: 0 }} />}
              {engine === "openai" && !isLocalTts && <Sparkles size={11} style={{ color: t.accent, flexShrink: 0 }} />}
              <Volume2 size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
              <span className="truncate">{activeVoiceName}</span>
              <ChevronDown size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
            </button>
            {showVoiceMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowVoiceMenu(false)} />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 rounded-xl shadow-2xl overflow-hidden z-50" style={{ backgroundColor: t.popover, border: `1px solid ${t.border}`, width: 300 }}>
                  {voiceMenuView === "list" ? (
                    <VoiceListView t={t} engine={engine} browserVoices={browserVoices} browserVoiceURI={browserVoiceURI} oaiConnected={oaiConnected} oaiVoiceId={oaiVoiceId} oaiApiKey={oaiApiKey} onSelectBrowser={selectBrowserVoice} onSelectOai={selectOaiVoice} onSelectLocalTts={selectLocalTts} onShowOaiSetup={() => setVoiceMenuView("oai-setup")} voiceProfile={voiceProfile} onSelectPersonal={selectPersonalVoice} onOpenRecorder={() => { setShowVoiceMenu(false); setShowVoiceRecorder(true); }} />
                  ) : (
                    <OaiSetupView t={t} keyInput={oaiKeyInput} setKeyInput={setOaiKeyInput} onConnect={handleOaiConnect} connecting={oaiConnecting} error={oaiConnectError} setError={setOaiConnectError} onBack={() => setVoiceMenuView("list")} />
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Ambient Sounds ── */}
          <div className="relative">
            <button
              onClick={() => { setShowAmbientMenu(!showAmbientMenu); setShowVoiceMenu(false); }}
              className="px-2 py-1 rounded-md transition-colors hover:opacity-70 flex items-center gap-1.5"
              style={{
                color: ambientEnabled ? t.accent : t.toolbarText,
                fontSize: 12,
                backgroundColor: ambientEnabled ? `${t.accent}18` : `${t.border}44`,
              }}
              title="Ambient Sounds"
            >
              <TreePine size={13} style={{ flexShrink: 0 }} />
              {ambientEnabled && (
                <span style={{ fontSize: 11 }}>
                  {ambientMode === "auto"
                    ? getSceneInfo(currentSceneType).emoji
                    : getSceneInfo(manualScene).emoji}
                </span>
              )}
            </button>
            {showAmbientMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAmbientMenu(false)} />
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 rounded-xl shadow-2xl overflow-hidden z-50"
                  style={{ backgroundColor: t.popover, border: `1px solid ${t.border}`, width: 280 }}
                >
                  {/* Header */}
                  <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${t.border}` }}>
                    <div className="flex items-center gap-2">
                      <TreePine size={14} style={{ color: t.accent }} />
                      <span style={{ color: t.popoverText, fontSize: 13, fontWeight: 500 }}>Ambient Sounds</span>
                    </div>
                    <button
                      onClick={toggleAmbient}
                      className="px-2.5 py-1 rounded-md transition-all"
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        backgroundColor: ambientEnabled ? `${t.accent}` : `${t.border}66`,
                        color: ambientEnabled ? "#fff" : t.popoverText,
                      }}
                    >
                      {ambientEnabled ? "ON" : "OFF"}
                    </button>
                  </div>

                  {/* Volume slider */}
                  <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${t.border}` }}>
                    <span style={{ fontSize: 11, color: t.popoverText, opacity: 0.5 }}>Vol</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(ambientVolume * 100)}
                      onChange={(e) => setAmbientVolume(parseInt(e.target.value) / 100)}
                      className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                      style={{
                        accentColor: t.accent,
                        background: `linear-gradient(to right, ${t.accent} ${ambientVolume * 100}%, ${t.border}66 ${ambientVolume * 100}%)`,
                      }}
                    />
                    <span className="tabular-nums" style={{ fontSize: 11, color: t.popoverText, opacity: 0.5, minWidth: 28, textAlign: "right" }}>
                      {Math.round(ambientVolume * 100)}%
                    </span>
                  </div>

                  {/* Mode selector */}
                  <div className="px-3 py-2 flex items-center gap-1" style={{ borderBottom: `1px solid ${t.border}` }}>
                    <button
                      onClick={() => setAmbientMode("auto")}
                      className="flex-1 py-1.5 rounded-md transition-all"
                      style={{
                        fontSize: 12,
                        fontWeight: ambientMode === "auto" ? 500 : 400,
                        backgroundColor: ambientMode === "auto" ? `${t.accent}15` : "transparent",
                        color: ambientMode === "auto" ? t.accent : t.popoverText,
                        opacity: ambientMode === "auto" ? 1 : 0.6,
                      }}
                    >
                      Auto-detect
                    </button>
                    <button
                      onClick={() => setAmbientMode("manual")}
                      className="flex-1 py-1.5 rounded-md transition-all"
                      style={{
                        fontSize: 12,
                        fontWeight: ambientMode === "manual" ? 500 : 400,
                        backgroundColor: ambientMode === "manual" ? `${t.accent}15` : "transparent",
                        color: ambientMode === "manual" ? t.accent : t.popoverText,
                        opacity: ambientMode === "manual" ? 1 : 0.6,
                      }}
                    >
                      Manual
                    </button>
                  </div>

                  {/* Auto mode: current detected scene */}
                  {ambientMode === "auto" && (
                    <div className="px-3 py-2.5" style={{ color: t.popoverText, fontSize: 12 }}>
                      <div style={{ opacity: 0.5, marginBottom: 4 }}>Detected scene:</div>
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            fontSize: 20,
                            transition: "transform 0.6s ease",
                            transform: sceneTransitioning ? "scale(1.3)" : "scale(1)",
                            display: "inline-block",
                          }}
                        >
                          {getSceneInfo(currentSceneType).emoji}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span style={{ fontWeight: 500 }}>{getSceneInfo(currentSceneType).label}</span>
                            {currentSceneType === "silence" && (
                              <span style={{ opacity: 0.4, fontSize: 11 }}>(quiet room)</span>
                            )}
                          </div>
                          {/* Confidence bar */}
                          <div className="flex items-center gap-1.5 mt-1">
                            <div
                              className="h-1 rounded-full overflow-hidden flex-1"
                              style={{ backgroundColor: `${t.border}44`, maxWidth: 80 }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.round(sceneConfidence * 100)}%`,
                                  backgroundColor: t.accent,
                                  opacity: 0.7,
                                  transition: "width 0.5s ease",
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 10, opacity: 0.35 }}>
                              {Math.round(sceneConfidence * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Secondary blend scene */}
                      {secondarySceneType && secondarySceneType !== "silence" && (
                        <div
                          className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-md"
                          style={{ backgroundColor: `${t.border}22`, fontSize: 11 }}
                        >
                          <span style={{ fontSize: 13 }}>{getSceneInfo(secondarySceneType).emoji}</span>
                          <span style={{ opacity: 0.5 }}>+ {getSceneInfo(secondarySceneType).label} blend</span>
                        </div>
                      )}
                      <div style={{ opacity: 0.35, fontSize: 11, marginTop: 6 }}>
                        Analyses text context and smoothly crossfades between environments
                      </div>
                    </div>
                  )}

                  {/* Manual mode: scene grid */}
                  {ambientMode === "manual" && (
                    <div className="px-2 py-2">
                      <div className="grid grid-cols-4 gap-1">
                        {ALL_SCENES.map((scene) => {
                          const info = getSceneInfo(scene);
                          const active = manualScene === scene;
                          return (
                            <button
                              key={scene}
                              onClick={() => setManualScene(scene)}
                              className="flex flex-col items-center gap-0.5 py-2 rounded-lg transition-all hover:scale-105"
                              style={{
                                backgroundColor: active ? `${t.accent}15` : "transparent",
                                border: active ? `1px solid ${t.accent}40` : "1px solid transparent",
                                color: active ? t.accent : t.popoverText,
                              }}
                              title={info.description}
                            >
                              <span style={{ fontSize: 16 }}>{info.emoji}</span>
                              <span style={{ fontSize: 9, fontWeight: active ? 500 : 400 }}>{info.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Progress + Close */}
        <div className="flex items-center gap-2">
          {isBuffering && <Loader2 size={12} className="animate-spin" style={{ color: t.accent, opacity: 0.7 }} />}
          <span className="tabular-nums" style={{ color: t.toolbarText, fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>
            {audioSentenceIndex + 1}/{totalSentences}
          </span>
          <button onClick={handleClose} className="p-1.5 rounded-md transition-colors hover:opacity-70" style={{ color: t.toolbarText }} title="Close Audio Mode">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Voice Recorder Modal */}
      <VoiceRecorder
        open={showVoiceRecorder}
        onClose={() => setShowVoiceRecorder(false)}
        onSave={handleSaveVoiceProfile}
        existingProfile={voiceProfile}
      />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════
//  VOICE LIST VIEW
// ═══════════════════════════════════════════════════════

function VoiceListView({ t, engine, browserVoices, browserVoiceURI, oaiConnected, oaiVoiceId, oaiApiKey, onSelectBrowser, onSelectOai, onSelectLocalTts, onShowOaiSetup, voiceProfile, onSelectPersonal, onOpenRecorder }: {
  t: any; engine: string; browserVoices: SpeechSynthesisVoice[]; browserVoiceURI: string;
  oaiConnected: boolean; oaiVoiceId: string; oaiApiKey: string;
  onSelectBrowser: (uri: string) => void; onSelectOai: (id: string) => void; onSelectLocalTts: () => void; onShowOaiSetup: () => void;
  voiceProfile?: VoiceProfile | null; onSelectPersonal?: () => void; onOpenRecorder?: () => void;
}) {
  const isLocalTts = engine === "openai" && oaiApiKey === "local-tts";
  const hasRealOaiKey = oaiApiKey && oaiApiKey !== "local-tts";

  return (
    <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
      {/* Local TTS Server — primary voice */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${t.border}` }}>
        <Server size={12} style={{ color: t.accent }} />
        <span style={{ fontSize: 11, color: t.popoverText, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.8, flex: 1 }}>Local TTS Server</span>
        <span style={{ fontSize: 9, color: t.popoverText, opacity: 0.3 }}>127.0.0.1:8000</span>
      </div>
      <button
        onClick={onSelectLocalTts}
        className="w-full text-left px-3 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
        style={{ color: isLocalTts ? t.accent : t.popoverText, fontWeight: isLocalTts ? 500 : 400 }}
      >
        <Dot active={isLocalTts} color={t.accent} />
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.accent}20` }}>
          <Server size={14} style={{ color: t.accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate" style={{ fontSize: 13 }}>Local Voice</div>
          <div className="truncate" style={{ fontSize: 11, opacity: 0.4 }}>Custom TTS via local server</div>
        </div>
        {isLocalTts && <span style={{ fontSize: 10, color: "#22c55e" }}>Active</span>}
      </button>

      {/* Personal Voice section */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${t.border}` }}>
        <User size={12} style={{ color: t.accent }} />
        <span style={{ fontSize: 11, color: t.popoverText, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.8, flex: 1 }}>Personal Voice</span>
      </div>
      {voiceProfile ? (
        <button
          onClick={onSelectPersonal}
          className="w-full text-left px-3 py-2.5 transition-colors hover:bg-white/5 flex items-center gap-2"
          style={{ color: engine === "personal" ? t.accent : t.popoverText, fontWeight: engine === "personal" ? 500 : 400 }}
        >
          <Dot active={engine === "personal"} color={t.accent} />
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.accent}20` }}>
            <User size={14} style={{ color: t.accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate" style={{ fontSize: 13 }}>{voiceProfile.name}</div>
            <div className="truncate" style={{ fontSize: 11, opacity: 0.4 }}>Personal Voice Profile</div>
          </div>
          {engine === "personal" && <span style={{ fontSize: 10, color: "#22c55e" }}>Active</span>}
        </button>
      ) : (
        <button
          onClick={onOpenRecorder}
          className="w-full text-left px-3 py-3 transition-colors hover:bg-white/5 flex items-center gap-2.5"
          style={{ color: t.accent, fontSize: 13 }}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.accent}15` }}>
            <Mic size={14} style={{ color: t.accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <div style={{ fontWeight: 500 }}>Record Your Voice</div>
            <div style={{ fontSize: 11, opacity: 0.5, color: t.popoverText }}>Create a personal narration profile</div>
          </div>
          <ChevronDown size={12} className="-rotate-90" style={{ opacity: 0.5 }} />
        </button>
      )}
      {voiceProfile && (
        <button
          onClick={onOpenRecorder}
          className="w-full text-left px-3 py-1.5 transition-colors hover:bg-white/5 flex items-center gap-2"
          style={{ color: t.popoverText, fontSize: 12, opacity: 0.5, borderBottom: `1px solid ${t.border}` }}
        >
          <div style={{ width: 6 }} />
          <Mic size={11} />
          <span>Re-record voice</span>
        </button>
      )}

      {/* OpenAI AI Voices — connect with API key */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${t.border}` }}>
        <Sparkles size={12} style={{ color: t.accent }} />
        <span style={{ fontSize: 11, color: t.popoverText, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.8, flex: 1 }}>OpenAI Voices</span>
        {hasRealOaiKey && <span style={{ fontSize: 9, color: t.popoverText, opacity: 0.3 }}>gpt-4o-mini-tts</span>}
      </div>

      {hasRealOaiKey ? (
        <>
          {OPENAI_VOICES.map((voice) => {
            const active = engine === "openai" && !isLocalTts && voice.id === oaiVoiceId;
            return (
              <button
                key={voice.id}
                onClick={() => onSelectOai(voice.id)}
                className="w-full text-left px-3 py-2 transition-colors hover:bg-white/5 flex items-center gap-2"
                style={{ color: active ? t.accent : t.popoverText, fontWeight: active ? 500 : 400 }}
              >
                <Dot active={active} color={t.accent} />
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ fontSize: 13 }}>{voice.name}</div>
                  <div className="truncate" style={{ fontSize: 11, opacity: 0.4 }}>{voice.description} · {voice.gender}</div>
                </div>
                {voice.recommended && <span style={{ fontSize: 10, color: t.accent, opacity: 0.7 }}>Best</span>}
              </button>
            );
          })}
        </>
      ) : (
        <button onClick={onShowOaiSetup} className="w-full text-left px-3 py-3 transition-colors hover:bg-white/5 flex items-center gap-2" style={{ color: t.popoverText, fontSize: 13, opacity: 0.6 }}>
          <Key size={13} style={{ opacity: 0.5 }} />
          <span>Connect with OpenAI API key</span>
          <ChevronDown size={12} className="-rotate-90 ml-auto" style={{ opacity: 0.5 }} />
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  OPENAI API KEY SETUP VIEW
// ═══════════════════════════════════════════════════════

function OaiSetupView({ t, keyInput, setKeyInput, onConnect, connecting, error, setError, onBack }: {
  t: any; keyInput: string; setKeyInput: (v: string) => void; onConnect: () => void;
  connecting: boolean; error: string; setError: (v: string) => void; onBack: () => void;
}) {
  return (
    <div className="p-3">
      <button onClick={onBack} className="flex items-center gap-1 mb-3 transition-colors hover:opacity-70" style={{ color: t.accent, fontSize: 12 }}>
        <ChevronLeft size={14} /><span>Back to voices</span>
      </button>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={14} style={{ color: t.accent }} />
        <span style={{ color: t.popoverText, fontSize: 14, fontWeight: 500 }}>OpenAI AI Voices</span>
      </div>
      <div style={{ color: t.popoverText, fontSize: 12, opacity: 0.5, marginBottom: 4 }}>
        High-quality AI narration powered by <strong>gpt-4o-mini-tts</strong>.
      </div>
      <div style={{ color: t.popoverText, fontSize: 11, opacity: 0.4, marginBottom: 12 }}>
        13 expressive voices with context-aware tone, emotion, and pacing.
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2" style={{ backgroundColor: `${t.border}33`, border: `1px solid ${t.border}` }}>
        <Key size={13} style={{ color: t.popoverText, opacity: 0.4 }} />
        <input type="password" placeholder="Paste your OpenAI API key\u2026" value={keyInput} onChange={(e) => { setKeyInput(e.target.value); setError(""); }} onKeyDown={(e) => { if (e.key === "Enter") onConnect(); }} className="flex-1 bg-transparent outline-none placeholder:opacity-40" style={{ color: t.popoverText, fontSize: 13 }} autoFocus />
      </div>
      <button onClick={onConnect} disabled={connecting || !keyInput.trim()} className="w-full py-2 rounded-lg transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2" style={{ backgroundColor: t.accent, color: "#fff", fontSize: 13 }}>
        {connecting && <Loader2 size={13} className="animate-spin" />}Connect
      </button>
      {error && <div className="mt-2" style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
      <div className="mt-2 flex items-center gap-1 flex-wrap" style={{ fontSize: 11, color: t.popoverText, opacity: 0.4 }}>
        <span>Get a key at</span>
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5 hover:opacity-80" style={{ color: t.accent }}>platform.openai.com<ExternalLink size={9} /></a>
        <span>&middot; Key stored in memory only</span>
      </div>
      <div className="mt-2 px-2 py-1.5 rounded-md" style={{ backgroundColor: `${t.border}22`, fontSize: 10, color: t.popoverText, opacity: 0.5 }}>
        This voice is AI-generated, not a human voice.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  SHARED UI
// ═══════════════════════════════════════════════════════

function SectionHeader({ t, label }: { t: any; label: string }) {
  return <div className="px-3 py-2" style={{ borderBottom: `1px solid ${t.border}`, fontSize: 11, color: t.popoverText, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>;
}

function Dot({ active, color }: { active: boolean; color: string }) {
  return <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active ? color : "transparent" }} />;
}