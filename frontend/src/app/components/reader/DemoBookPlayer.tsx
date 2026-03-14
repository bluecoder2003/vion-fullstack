"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, SkipForward, SkipBack, X } from "lucide-react";
import { motion } from "motion/react";
import { useReader } from "./ReaderContext";
import { buildSentenceMap } from "./audioUtils";
import { themes } from "./themeStyles";

const AUDIO_SRC = "http://127.0.0.1:8000/outputs/epub-1773481150127-1773481567.mp3";

export function FrankensteinDemoPlayer() {
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
  } = useReader();

  const t = themes[theme];
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const chapter = book?.chapters[currentChapterIndex];

  const sentenceMap = chapter
    ? buildSentenceMap(chapter.content)
    : null;

  const sentences = sentenceMap?.flat ?? [];
  const totalSentences = sentences.length;

  const [progress, setProgress] = useState(0);

  // ─────────────────────────────
  // Initialize audio
  // ─────────────────────────────

  useEffect(() => {
    const audio = new Audio(AUDIO_SRC);
    audioRef.current = audio;

    audio.addEventListener("timeupdate", () => {
      if (!audio.duration) return;

      const ratio = audio.currentTime / audio.duration;

      setProgress(ratio * 100);

      const sentenceIndex = Math.floor(ratio * totalSentences);

      setAudioSentenceIndex(sentenceIndex);
    });

    audio.addEventListener("ended", () => {
      setAudioPlaying(false);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [totalSentences, setAudioSentenceIndex, setAudioPlaying]);

  // ─────────────────────────────
  // Play / Pause
  // ─────────────────────────────

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audioPlaying) {
      audio.pause();
      setAudioPlaying(false);
    } else {
      audio.playbackRate = audioSpeed;
      audio.play();
      setAudioPlaying(true);
    }
  }, [audioPlaying, audioSpeed, setAudioPlaying]);

  // ─────────────────────────────
  // Skip sentence
  // ─────────────────────────────

  const jumpToSentence = useCallback(
    (index: number) => {
      const audio = audioRef.current;
      if (!audio || !audio.duration) return;

      const ratio = index / totalSentences;

      audio.currentTime = ratio * audio.duration;

      setAudioSentenceIndex(index);
    },
    [totalSentences, setAudioSentenceIndex]
  );

  const handleSkipBack = () => {
    const prev = Math.max(0, audioSentenceIndex - 1);
    jumpToSentence(prev);
  };

  const handleSkipForward = () => {
    const next = Math.min(totalSentences - 1, audioSentenceIndex + 1);
    jumpToSentence(next);
  };

  // ─────────────────────────────
  // Speed
  // ─────────────────────────────

  const cycleSpeed = () => {
    const speeds = [0.75, 1, 1.25, 1.5, 2];
    const i = speeds.indexOf(audioSpeed);
    const next = speeds[(i + 1) % speeds.length];

    setAudioSpeed(next);

    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  // ─────────────────────────────
  // Close
  // ─────────────────────────────

  const handleClose = () => {
    audioRef.current?.pause();
    setAudioPlaying(false);
    setIsAudioMode(false);
  };

  if (!chapter) return null;

  // ─────────────────────────────
  // UI
  // ─────────────────────────────

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute bottom-0 left-0 right-0 z-50"
    >
      {/* Progress */}
      <div
        className="h-[2px] w-full"
        style={{ backgroundColor: `${t.border}66` }}
      >
        <div
          className="h-full transition-all duration-200"
          style={{
            width: `${progress}%`,
            backgroundColor: t.accent,
          }}
        />
      </div>

      {/* Controls */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{
          backgroundColor: t.toolbar,
          borderTop: `1px solid ${t.border}`,
        }}
      >
        {/* Transport */}
        <div className="flex items-center gap-1">
          <button onClick={handleSkipBack}>
            <SkipBack size={16} />
          </button>

          <button
            onClick={handlePlayPause}
            className="p-2 rounded-full"
            style={{ background: t.accent, color: "#fff" }}
          >
            {audioPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <button onClick={handleSkipForward}>
            <SkipForward size={16} />
          </button>
        </div>

        {/* Speed */}
        <button
          onClick={cycleSpeed}
          className="px-2 py-1 rounded-md"
          style={{
            background: `${t.border}44`,
            fontSize: 12,
          }}
        >
          {audioSpeed}x
        </button>

        {/* Progress text */}
        <span
          style={{
            fontSize: 11,
            opacity: 0.6,
          }}
        >
          {audioSentenceIndex + 1}/{totalSentences}
        </span>

        {/* Close */}
        <button onClick={handleClose}>
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
}