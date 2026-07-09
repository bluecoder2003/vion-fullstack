"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, Play, Pause, Loader2, Volume2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const BACKEND = "http://127.0.0.1:8000";

interface EmotionPreset {
  emotion: string;
  label: string;
  emoji: string;
  color: string;
  bg: string;
  sentence: string;
  description: string;
}

const PRESETS: EmotionPreset[] = [
  {
    emotion: "anger",
    label: "Anger",
    emoji: "😡",
    color: "#ef4444",
    bg: "#fef2f2",
    sentence:
      "He slammed his fist on the table and roared at the trembling men before him!",
    description: "1.38× · louder · urgent",
  },
  {
    emotion: "joy",
    label: "Joy",
    emoji: "😄",
    color: "#f59e0b",
    bg: "#fffbeb",
    sentence:
      "She burst out laughing and clapped her hands with pure, undeniable delight!",
    description: "1.22× · louder · energetic",
  },
  {
    emotion: "sadness",
    label: "Sadness",
    emoji: "😢",
    color: "#3b82f6",
    bg: "#eff6ff",
    sentence:
      "He sat alone in the empty room, weeping softly for everything he had lost.",
    description: "0.68× · −3.5 st · soft",
  },
  {
    emotion: "fear",
    label: "Fear",
    emoji: "😨",
    color: "#8b5cf6",
    bg: "#f5f3ff",
    sentence:
      "She crept through the pitch-black corridor, heart hammering in her chest.",
    description: "0.72× · −2 st · tremolo",
  },
  {
    emotion: "surprise",
    label: "Surprise",
    emoji: "😮",
    color: "#f97316",
    bg: "#fff7ed",
    sentence:
      "I cannot believe this is actually happening — this changes absolutely everything!",
    description: "1.42× · fastest · sharp",
  },
  {
    emotion: "neutral",
    label: "Neutral",
    emoji: "📖",
    color: "#6b7280",
    bg: "#f9fafb",
    sentence:
      "The morning train departs from the northern platform at half past seven.",
    description: "1.00× · no effects",
  },
];

const EMOTION_SPEED_LABEL: Record<string, string> = {
  anger: "↑ Faster — tense, urgent",
  joy: "↑ Slightly faster — lighter, brighter",
  surprise: "↑ Faster — sharp, shocked",
  fear: "↓ Slower — careful, hesitant",
  sadness: "↓ Slower — heavy, dragging",
  neutral: "Baseline pace",
};

interface Result {
  url: string;
  emotion: string;
  context: string;
  speed: number;
  pitch_semitones: number;
  has_tremolo: boolean;
}

export function EmotionDemoPage({ onBack }: { onBack: () => void }) {
  const [selectedPreset, setSelectedPreset] = useState<EmotionPreset>(PRESETS[0]);
  const [customText, setCustomText] = useState(PRESETS[0].sentence);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Which preset emotions have been pre-warmed (for UI indicator)
  const [warmedEmotions, setWarmedEmotions] = useState<Set<string>>(new Set());

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // In-memory URL cache: "emotion:text" → Result
  const urlCache = useRef<Map<string, Result>>(new Map());

  // ── Pre-warm all 6 default preset sentences on mount ──────────
  useEffect(() => {
    let cancelled = false;
    const prewarm = async (preset: EmotionPreset) => {
      const key = `${preset.emotion}:${preset.sentence}`;
      if (urlCache.current.has(key)) return;
      try {
        const res = await fetch(`${BACKEND}/api/emotion-demo/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: preset.sentence, emotion: preset.emotion }),
        });
        if (!res.ok || cancelled) return;
        const data: Result = await res.json();
        urlCache.current.set(key, data);
        if (!cancelled) setWarmedEmotions((prev) => new Set([...prev, preset.emotion]));
      } catch {
        // silent — user can still generate manually
      }
    };
    // Fire all in parallel — backend already caches to disk so these are fast after first run
    PRESETS.forEach(prewarm);
    return () => { cancelled = true; };
  }, []);

  const selectPreset = useCallback((preset: EmotionPreset) => {
    setSelectedPreset(preset);
    setCustomText(preset.sentence);
    setResult(null);
    setProgress(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(false);
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(false);
    setProgress(0);
  }, []);

  const playAudio = useCallback((url: string) => {
    stopAudio();
    const audio = new Audio(`${BACKEND}${url}`);
    audioRef.current = audio;

    audio.addEventListener("timeupdate", () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    });

    audio.addEventListener("ended", () => {
      setPlaying(false);
      setProgress(0);
      audioRef.current = null;
    });

    audio.play().then(() => setPlaying(true)).catch(() => {
      setError("Playback failed. Is the backend running?");
      setPlaying(false);
    });
  }, [stopAudio]);

  const handleGenerate = useCallback(async () => {
    const text = customText.trim();
    if (!text) return;

    stopAudio();
    setError(null);

    const cacheKey = `${selectedPreset.emotion}:${text}`;
    const cached = urlCache.current.get(cacheKey);
    if (cached) {
      // Already generated — play instantly from cache
      setResult(cached);
      playAudio(cached.url);
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${BACKEND}/api/emotion-demo/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, emotion: selectedPreset.emotion }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: Result = await res.json();
      urlCache.current.set(cacheKey, data);
      setWarmedEmotions((prev) => new Set([...prev, selectedPreset.emotion]));
      setResult(data);
      playAudio(data.url);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate audio");
    } finally {
      setLoading(false);
    }
  }, [customText, selectedPreset, stopAudio, playAudio]);

  const handleTogglePlay = useCallback(() => {
    if (!result) return;
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
    } else {
      if (audioRef.current) {
        audioRef.current.play().then(() => setPlaying(true));
      } else {
        playAudio(result.url);
      }
    }
  }, [result, playing, playAudio]);

  const activeColor = result
    ? (PRESETS.find((p) => p.emotion === result.emotion)?.color ?? "#6b7280")
    : selectedPreset.color;

  return (
    <div className="min-h-screen bg-[#0f0f13] text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-sm"
        >
          <ChevronLeft size={16} />
          Back to Library
        </button>
        <span className="text-white/20">·</span>
        <span className="text-white/80 font-semibold text-sm">
          Emotion-Aware Narration Demo
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start px-6 py-10 gap-8 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Feel Every Word.
          </h1>
          <p className="text-white/50 text-sm leading-relaxed">
            Anger, joy, sadness, fear — and everything in between.
            Every sentence is heard the way it was meant to be felt.
          </p>
        </div>

        {/* Emotion preset grid */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {PRESETS.map((preset) => {
            const isSelected = selectedPreset.emotion === preset.emotion;
            const isReady = warmedEmotions.has(preset.emotion);
            return (
              <button
                key={preset.emotion}
                onClick={() => selectPreset(preset)}
                className="flex flex-col items-center gap-1.5 rounded-2xl p-4 border transition-all duration-200 hover:scale-[1.02] relative"
                style={{
                  backgroundColor: isSelected ? `${preset.color}18` : "rgba(255,255,255,0.04)",
                  borderColor: isSelected ? preset.color : "rgba(255,255,255,0.08)",
                  boxShadow: isSelected ? `0 0 16px ${preset.color}22` : "none",
                }}
              >
                {isReady && (
                  <span
                    className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: preset.color, opacity: 0.7 }}
                    title="Ready to play"
                  />
                )}
                <span className="text-2xl select-none">{preset.emoji}</span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: isSelected ? preset.color : "rgba(255,255,255,0.6)" }}
                >
                  {preset.label}
                </span>
                <span className="text-[10px] text-white/30 text-center leading-tight">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>

        {/* Text input */}
        <div className="w-full">
          <label className="block text-xs text-white/40 mb-2 uppercase tracking-widest">
            Sentence to narrate
          </label>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={3}
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/20 resize-none focus:outline-none focus:border-white/30 transition-colors leading-relaxed"
            placeholder="Type any sentence…"
          />
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={loading || !customText.trim()}
          className="w-full rounded-xl py-3.5 font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
          style={{ backgroundColor: activeColor, color: "#fff" }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Generating…
            </span>
          ) : warmedEmotions.has(selectedPreset.emotion) && customText.trim() === selectedPreset.sentence ? (
            "▶  Play"
          ) : (
            "Generate & Play"
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="w-full rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Result card */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.25 }}
              className="w-full rounded-2xl border overflow-hidden"
              style={{
                backgroundColor: "rgba(255,255,255,0.04)",
                borderColor: `${activeColor}44`,
              }}
            >
              {/* Emotion + effects row */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${activeColor}22`, color: activeColor }}
                  >
                    {result.emotion}
                  </span>
                  {result.context !== "narration" && (
                    <span className="text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                      {result.context}
                    </span>
                  )}
                  {result.has_tremolo && (
                    <span className="text-[10px] text-purple-400/70 bg-purple-400/10 px-2 py-0.5 rounded-full">
                      tremolo
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-white/30">
                    speed <span style={{ color: activeColor }}>{result.speed.toFixed(2)}×</span>
                  </span>
                  <span className="text-white/30">
                    pitch{" "}
                    <span style={{ color: activeColor }}>
                      {result.pitch_semitones > 0 ? "+" : ""}{result.pitch_semitones.toFixed(1)} st
                    </span>
                  </span>
                </div>
              </div>

              {/* Progress bar + controls */}
              <div className="px-5 py-4 flex flex-col gap-3">
                {/* Progress bar */}
                <div
                  className="h-1.5 w-full rounded-full overflow-hidden"
                  style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: activeColor,
                      width: `${progress}%`,
                    }}
                    transition={{ duration: 0.1 }}
                  />
                </div>

                {/* Play / Pause */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTogglePlay}
                    className="flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: activeColor,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                  </button>
                  <div className="flex items-center gap-2 flex-1">
                    <Volume2 size={13} className="text-white/30" />
                    <div className="flex items-end gap-[3px] h-5">
                      {playing
                        ? [0.5, 0.9, 0.6, 1.0, 0.7, 0.85, 0.4].map((h, i) => (
                            <motion.div
                              key={i}
                              animate={{ height: ["3px", `${Math.round(h * 20)}px`, "3px"] }}
                              transition={{
                                duration: 0.6 + i * 0.1,
                                repeat: Infinity,
                                ease: "easeInOut",
                              }}
                              className="w-[3px] rounded-full"
                              style={{ backgroundColor: activeColor }}
                            />
                          ))
                        : [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3].map((_, i) => (
                            <div
                              key={i}
                              className="w-[3px] rounded-full"
                              style={{
                                height: "3px",
                                backgroundColor: "rgba(255,255,255,0.15)",
                              }}
                            />
                          ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* How it works note */}
        <div className="w-full rounded-xl bg-white/[0.03] border border-white/5 px-5 py-4 text-xs text-white/30 leading-relaxed">
          <span className="text-white/50 font-semibold">How it works: </span>
          DistilRoBERTa classifies the emotion (6 classes). Kokoro voice embeddings
          are then <span className="text-white/50">blended at the tensor level</span> before
          synthesis — anger mixes 45% of af_nicole&apos;s harder edge, surprise blends
          60% of af_bella&apos;s brightness. This changes the voice&apos;s fundamental timbre
          inside the model itself, not in post-processing.
          On top of that: <span className="text-white/50">speed</span> (Kokoro param),{" "}
          <span className="text-white/50">pitch shift</span> (scipy resample), and{" "}
          <span className="text-white/50">volume scaling</span>. Fear additionally gets a{" "}
          <span className="text-white/50">5 Hz tremolo</span> — amplitude modulation that makes
          the voice physically tremble.
        </div>
      </div>
    </div>
  );
}
