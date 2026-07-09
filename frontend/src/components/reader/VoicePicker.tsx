"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause, Loader2, Check, Headphones } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";

const BACKEND = "http://127.0.0.1:8000";

const PREVIEW_SENTENCE =
  "The storm broke before midnight, and the wind swept down from the mountains like a living thing.";

interface Voice {
  id: string;
  name: string;
  description: string;
  tag: string;
}

const VOICES: Voice[] = [
  { id: "bm_george", name: "George", description: "Deep British male", tag: "Male · British" },
  { id: "bm_lewis",  name: "Lewis",  description: "Measured British tone", tag: "Male · British" },
  { id: "af_heart",  name: "Heart",  description: "Warm, gentle narration", tag: "Female · American" },
  { id: "af_bella",  name: "Bella",  description: "Bright, expressive", tag: "Female · American" },
  { id: "af_nicole", name: "Nicole", description: "Dramatic, sharp", tag: "Female · American" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onStart: () => void;
}

export function VoicePicker({ open, onClose, onStart }: Props) {
  const { theme, audioVoice, setAudioVoice, isAudioMode, setIsAudioMode, setAudioPlaying } = useReader();
  const t = themes[theme];

  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [readyVoices, setReadyVoices] = useState<Set<string>>(new Set());
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const previewCache = useRef<Map<string, string>>(new Map());
  const warmingRef = useRef(false);

  // Pre-warm all voice previews the first time the picker opens
  useEffect(() => {
    if (!open || warmingRef.current) return;
    warmingRef.current = true;

    const warm = async (voice: Voice) => {
      if (previewCache.current.has(voice.id)) {
        setReadyVoices((prev) => new Set([...prev, voice.id]));
        return;
      }
      try {
        const res = await fetch(`${BACKEND}/api/scene-demo/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: PREVIEW_SENTENCE, voice: voice.id }),
        });
        if (!res.ok) return;
        const data = await res.json();
        previewCache.current.set(voice.id, data.url);
        setReadyVoices((prev) => new Set([...prev, voice.id]));
      } catch {
        // ignore — user can still click and wait
      }
    };

    VOICES.forEach(warm);
  }, [open]);

  const stopPreview = useCallback(() => {
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current = null;
    }
    setPreviewingId(null);
  }, []);

  const handlePreview = useCallback(async (voiceId: string) => {
    if (previewingId === voiceId) {
      stopPreview();
      return;
    }
    stopPreview();

    const cached = previewCache.current.get(voiceId);
    if (cached) {
      const audio = new Audio(`${BACKEND}${cached}`);
      previewRef.current = audio;
      setPreviewingId(voiceId);
      audio.addEventListener("ended", () => setPreviewingId(null));
      audio.play().catch(() => setPreviewingId(null));
      return;
    }

    setLoadingId(voiceId);
    try {
      const res = await fetch(`${BACKEND}/api/scene-demo/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: PREVIEW_SENTENCE, voice: voiceId }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const data = await res.json();
      previewCache.current.set(voiceId, data.url);

      const audio = new Audio(`${BACKEND}${data.url}`);
      previewRef.current = audio;
      setPreviewingId(voiceId);
      audio.addEventListener("ended", () => setPreviewingId(null));
      audio.play().catch(() => setPreviewingId(null));
    } catch {
      setPreviewingId(null);
    } finally {
      setLoadingId(null);
    }
  }, [previewingId, stopPreview]);

  const handleStart = useCallback(() => {
    stopPreview();
    onClose();
    onStart();
  }, [stopPreview, onClose, onStart]);

  const handleStop = useCallback(() => {
    stopPreview();
    setAudioPlaying(false);
    setIsAudioMode(false);
    onClose();
  }, [stopPreview, setAudioPlaying, setIsAudioMode, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="absolute right-4 top-full mt-2 z-50"
          style={{ width: 320 }}
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ backgroundColor: t.popover, border: `1px solid ${t.border}` }}
          >
            {/* Header */}
            <div
              className="px-4 py-3 border-b flex items-center gap-2"
              style={{ borderColor: t.border }}
            >
              <Headphones size={14} style={{ color: t.accent }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: t.popoverText }}>
                Choose Narration Voice
              </span>
            </div>

            {/* Voice list */}
            <div className="flex flex-col p-2 gap-1">
              {VOICES.map((voice) => {
                const isSelected = audioVoice === voice.id;
                const isPreviewing = previewingId === voice.id;
                const isLoading = loadingId === voice.id;
                const isReady = readyVoices.has(voice.id);

                return (
                  <div
                    key={voice.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer"
                    style={{
                      backgroundColor: isSelected ? `${t.accent}15` : "transparent",
                      border: `1px solid ${isSelected ? t.accent + "40" : "transparent"}`,
                    }}
                    onClick={() => setAudioVoice(voice.id)}
                  >
                    {/* Selected check */}
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: isSelected ? t.accent : `${t.border}66`,
                      }}
                    >
                      {isSelected && <Check size={10} color="#fff" strokeWidth={3} />}
                    </div>

                    {/* Voice info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: isSelected ? t.accent : t.popoverText,
                          }}
                        >
                          {voice.name}
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                          style={{
                            backgroundColor: `${t.border}44`,
                            color: t.popoverText,
                            opacity: 0.6,
                          }}
                        >
                          {voice.tag}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: t.popoverText, opacity: 0.5 }}>
                        {voice.description}
                      </div>
                    </div>

                    {/* Preview button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePreview(voice.id); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all hover:opacity-90"
                      style={{
                        backgroundColor: isPreviewing ? t.accent : `${t.border}55`,
                        color: isPreviewing ? "#fff" : t.popoverText,
                      }}
                      title={isPreviewing ? "Stop preview" : isReady ? "Play preview" : "Generating preview…"}
                    >
                      {isLoading || (!isReady && !isPreviewing) ? (
                        <Loader2 size={11} className="animate-spin" style={{ opacity: isLoading ? 1 : 0.4 }} />
                      ) : isPreviewing ? (
                        <Pause size={11} />
                      ) : (
                        <Play size={11} className="ml-0.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Preview label */}
            <div
              className="px-4 pb-1"
              style={{ fontSize: 10, color: t.popoverText, opacity: 0.35 }}
            >
              Preview: &ldquo;{PREVIEW_SENTENCE.slice(0, 50)}…&rdquo;
            </div>

            {/* Action button */}
            <div className="p-3 border-t" style={{ borderColor: t.border }}>
              {isAudioMode ? (
                <button
                  onClick={handleStop}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: "#ef444422", color: "#ef4444", border: "1px solid #ef444440" }}
                >
                  Stop Narration
                </button>
              ) : (
                <button
                  onClick={handleStart}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: t.accent, color: "#fff" }}
                >
                  Start Narration with {VOICES.find((v) => v.id === audioVoice)?.name ?? "George"}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
