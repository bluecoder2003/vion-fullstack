"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Play, Pause, RotateCcw, RotateCw, X } from "lucide-react";
import { motion } from "motion/react";
import { useReader } from "./ReaderContext";
import { buildSentenceMap } from "./audioUtils";
import { themes } from "./themeStyles";

const AUDIO_SRC = "http://127.0.0.1:8000/tts/epub-1773481150127-1773481567.mp3";
const SEEK_SECONDS = 10;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const BASE_SENTENCE_WEIGHT = 18;
const WORD_WEIGHT = 1.15;
const COMMA_WEIGHT = 1.5;
const PUNCTUATION_WEIGHT = 3;

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
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const syncModel = useMemo(() => {
    if (!book) return [];

    let cumulativeWeight = 0;
    return book.chapters.map((chapter) => {
      const sentenceMap = buildSentenceMap(chapter.content);
      const sentences = sentenceMap.flat.map((sentence, localIndex) => {
        const weight = estimateSentenceWeight(sentence);
        const item = {
          localIndex,
          startWeight: cumulativeWeight,
          endWeight: cumulativeWeight + weight,
          weight,
        };
        cumulativeWeight += weight;
        return item;
      });

      return {
        total: sentences.length,
        sentences,
      };
    });
  }, [book]);

  const totalWeight =
    syncModel[syncModel.length - 1]?.sentences[
      syncModel[syncModel.length - 1].sentences.length - 1
    ]?.endWeight ?? 0;

  const syncPlaybackPosition = useCallback(
    (currentTime: number, totalDuration: number) => {
      if (!book || totalWeight <= 0 || totalDuration <= 0) return;

      const ratio = Math.min(Math.max(currentTime / totalDuration, 0), 1);
      const targetWeight = ratio * totalWeight;

      let nextChapterIndex = 0;
      let localSentenceIndex = 0;

      outer:
      for (let chapterIndex = 0; chapterIndex < syncModel.length; chapterIndex++) {
        const chapter = syncModel[chapterIndex];
        for (let sentenceIndex = 0; sentenceIndex < chapter.sentences.length; sentenceIndex++) {
          const sentence = chapter.sentences[sentenceIndex];
          if (targetWeight <= sentence.endWeight || sentenceIndex === chapter.sentences.length - 1) {
            nextChapterIndex = chapterIndex;
            localSentenceIndex = sentence.localIndex;
            break outer;
          }
        }
      }

      if (nextChapterIndex !== currentChapterIndex) {
        setCurrentChapterIndex(nextChapterIndex);
      }
      setAudioSentenceIndex(localSentenceIndex);
      setProgress(ratio * 100);
    },
    [
      book,
      currentChapterIndex,
      setAudioSentenceIndex,
      setCurrentChapterIndex,
      syncModel,
      totalWeight,
    ]
  );

  // ─────────────────────────────
  // Initialize audio
  // ─────────────────────────────

  useEffect(() => {
    if (!book) return;

    const audio = new Audio(AUDIO_SRC);
    audio.preload = "auto";
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      syncPlaybackPosition(audio.currentTime, audio.duration || 0);
    };

    const handleTimeUpdate = () => {
      if (!audio.duration || Number.isNaN(audio.duration)) return;
      syncPlaybackPosition(audio.currentTime, audio.duration);
    };

    const handleEnded = () => {
      setAudioPlaying(false);
      setProgress(100);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audioRef.current = null;
    };
  }, [book, setAudioPlaying, syncPlaybackPosition]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = audioSpeed;
    }
  }, [audioSpeed]);

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
      audio.play().then(() => {
        setAudioPlaying(true);
      }).catch(() => {
        setAudioPlaying(false);
      });
    }
  }, [audioPlaying, audioSpeed, setAudioPlaying]);

  // ─────────────────────────────
  // Seek
  // ─────────────────────────────

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      if (!audio || !audio.duration) return;
      const nextTime = Math.max(0, Math.min(audio.duration, audio.currentTime + deltaSeconds));
      audio.currentTime = nextTime;
      syncPlaybackPosition(nextTime, audio.duration);
    },
    [syncPlaybackPosition]
  );

  const handleSeekBack = () => seekBy(-SEEK_SECONDS);
  const handleSeekForward = () => seekBy(SEEK_SECONDS);

  const handleProgressChange = useCallback(
    (value: number) => {
      const audio = audioRef.current;
      if (!audio || !audio.duration) return;
      const nextTime = (value / 100) * audio.duration;
      audio.currentTime = nextTime;
      syncPlaybackPosition(nextTime, audio.duration);
    },
    [syncPlaybackPosition]
  );

  // ─────────────────────────────
  // Speed
  // ─────────────────────────────

  const cycleSpeed = () => {
    const i = SPEEDS.indexOf(audioSpeed);
    const next = SPEEDS[(i + 1) % SPEEDS.length];

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

  if (!book) return null;

  const activeChapterMeta = syncModel[currentChapterIndex];
  const sentenceProgressLabel = activeChapterMeta
    ? `${audioSentenceIndex + 1}/${activeChapterMeta.total}`
    : "0/0";
  const timeLabel = `${formatTime((progress / 100) * duration)} / ${formatTime(duration)}`;

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

      <div
        className="px-4 pt-2"
        style={{ backgroundColor: t.toolbar }}
      >
        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={progress}
          onChange={(e) => handleProgressChange(Number(e.target.value))}
          className="w-full accent-current"
          style={{ color: t.accent }}
          aria-label="Audiobook progress"
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
          <button onClick={handleSeekBack} title={`Back ${SEEK_SECONDS}s`}>
            <RotateCcw size={16} />
          </button>

          <button
            onClick={handlePlayPause}
            className="p-2 rounded-full"
            style={{ background: t.accent, color: "#fff" }}
          >
            {audioPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <button onClick={handleSeekForward} title={`Forward ${SEEK_SECONDS}s`}>
            <RotateCw size={16} />
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
          {sentenceProgressLabel}
        </span>

        <span
          style={{
            fontSize: 11,
            opacity: 0.6,
          }}
        >
          {timeLabel}
        </span>

        {/* Close */}
        <button onClick={handleClose}>
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const totalSeconds = Math.floor(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function estimateSentenceWeight(sentence: string): number {
  const words = sentence.trim().split(/\s+/).filter(Boolean).length;
  const commas = (sentence.match(/[,;:]/g) || []).length;
  const punctuation = (sentence.match(/[.!?]/g) || []).length;

  return (
    BASE_SENTENCE_WEIGHT +
    words * WORD_WEIGHT +
    commas * COMMA_WEIGHT +
    punctuation * PUNCTUATION_WEIGHT
  );
}
