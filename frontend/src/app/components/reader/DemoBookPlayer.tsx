"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Play, Pause, RotateCcw, RotateCw, X, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";
import { buildTimedDemoCues, type DemoCue } from "./demoAudiobookCues";

const AUDIO_SRC = "http://127.0.0.1:8000/tts/epub-1773481150127-1773481567.mp3";
const SEEK_SECONDS = 10;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export function FrankensteinDemoPlayer() {
  const {
    book,
    setCurrentChapterIndex,
    theme,
    audioPlaying,
    setAudioPlaying,
    setAudioSentenceIndex,
    setAudioWordIndex,
    audioSpeed,
    setAudioSpeed,
    setIsAudioMode,
  } = useReader();

  const t = themes[theme];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeCueRef = useRef(-1);

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const cues = useMemo(
    () => (book && duration > 0 ? buildTimedDemoCues(book, duration) : []),
    [book, duration]
  );

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const syncCueForTime = useCallback(
    (currentTime: number, totalDuration: number) => {
      if (!cues.length || totalDuration <= 0) return;

      setProgress((currentTime / totalDuration) * 100);

      const nextCueIndex = findCueIndexForTime(cues, currentTime);
      if (nextCueIndex === activeCueRef.current || nextCueIndex < 0) return;

      activeCueRef.current = nextCueIndex;
      const cue = cues[nextCueIndex];
      setCurrentChapterIndex(cue.chapterIndex);
      setAudioSentenceIndex(cue.sentenceIndex);
      setAudioWordIndex(-1);
    },
    [cues, setAudioSentenceIndex, setAudioWordIndex, setCurrentChapterIndex]
  );

  const startRaf = useCallback(() => {
    stopRaf();

    const loop = () => {
      const audio = audioRef.current;
      if (!audio) return;

      if (audio.duration && !Number.isNaN(audio.duration)) {
        syncCueForTime(audio.currentTime, audio.duration);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [stopRaf, syncCueForTime]);

  useEffect(() => {
    if (!book) return;

    setIsReady(false);
    setDuration(0);
    setProgress(0);
    activeCueRef.current = -1;

    const audio = new Audio(AUDIO_SRC);
    audio.preload = "auto";
    audioRef.current = audio;

    const handleMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleCanPlay = () => {
      setIsReady(true);
    };

    const handleEnded = () => {
      stopRaf();
      setAudioPlaying(false);
      setAudioWordIndex(-1);
      setProgress(100);
    };

    audio.addEventListener("loadedmetadata", handleMetadata);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("ended", handleEnded);
    audio.load();

    return () => {
      stopRaf();
      audio.pause();
      audio.src = "";
      audio.removeEventListener("loadedmetadata", handleMetadata);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("ended", handleEnded);
      audioRef.current = null;
    };
  }, [book, setAudioPlaying, setAudioWordIndex, stopRaf]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = audioSpeed;
    }
  }, [audioSpeed]);

  useEffect(() => {
    if (!cues.length) return;
    activeCueRef.current = -1;
    syncCueForTime(audioRef.current?.currentTime || 0, duration);
  }, [cues, duration, syncCueForTime]);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !isReady) return;

    if (audioPlaying) {
      audio.pause();
      stopRaf();
      setAudioPlaying(false);
      return;
    }

    audio.playbackRate = audioSpeed;
    startRaf();
    audio.play().then(() => {
      setAudioPlaying(true);
    }).catch(() => {
      stopRaf();
      setAudioPlaying(false);
    });
  }, [audioPlaying, audioSpeed, isReady, setAudioPlaying, startRaf, stopRaf]);

  const seekTo = useCallback(
    (nextTime: number) => {
      const audio = audioRef.current;
      if (!audio || !audio.duration) return;

      audio.currentTime = nextTime;
      activeCueRef.current = -1;
      syncCueForTime(nextTime, audio.duration);
    },
    [syncCueForTime]
  );

  const seekBy = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio || !audio.duration) return;

      seekTo(Math.max(0, Math.min(audio.duration, audio.currentTime + delta)));
    },
    [seekTo]
  );

  const handleProgressChange = useCallback(
    (value: number) => {
      const audio = audioRef.current;
      if (!audio || !audio.duration) return;

      seekTo((value / 100) * audio.duration);
    },
    [seekTo]
  );

  const cycleSpeed = useCallback(() => {
    const i = SPEEDS.indexOf(audioSpeed);
    const next = SPEEDS[(i + 1) % SPEEDS.length];

    setAudioSpeed(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  }, [audioSpeed, setAudioSpeed]);

  const handleClose = useCallback(() => {
    stopRaf();
    audioRef.current?.pause();
    setAudioPlaying(false);
    setAudioWordIndex(-1);
    setIsAudioMode(false);
  }, [setAudioPlaying, setAudioWordIndex, setIsAudioMode, stopRaf]);

  if (!book) return null;

  const timeLabel = `${formatTime((progress / 100) * duration)} / ${formatTime(duration)}`;
  const showSpinner = !isReady && !audioPlaying;

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute bottom-0 left-0 right-0 z-50"
    >
      <div className="h-[2px] w-full" style={{ backgroundColor: `${t.border}66` }}>
        <div
          className="h-full"
          style={{
            width: `${progress}%`,
            backgroundColor: t.accent,
            transition: "width 0.12s linear",
          }}
        />
      </div>

      <div className="px-4 pt-2" style={{ backgroundColor: t.toolbar }}>
        <input
          type="range"
          min={0}
          max={100}
          step={0.05}
          value={progress}
          onChange={(e) => handleProgressChange(Number(e.target.value))}
          className="w-full accent-current"
          style={{ color: t.accent }}
          aria-label="Audiobook progress"
        />
      </div>

      <div
        className="relative flex items-center px-4 py-2 min-h-[52px]"
        style={{
          backgroundColor: t.toolbar,
          borderTop: `1px solid ${t.border}`,
          color: t.toolbarText,
        }}
      >
        <div className="flex items-center gap-3 pr-20">
          <button
            onClick={cycleSpeed}
            className="px-2 py-1 rounded-md"
            style={{ background: `${t.border}44`, fontSize: 12, color: t.toolbarText }}
          >
            {audioSpeed}x
          </button>

          <span style={{ fontSize: 11, opacity: 0.85, color: t.toolbarText }}>
            {timeLabel}
          </span>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          <button onClick={() => seekBy(-SEEK_SECONDS)} title={`Back ${SEEK_SECONDS}s`}>
            <RotateCcw size={16} style={{ color: t.toolbarText }} />
          </button>

          <button
            onClick={handlePlayPause}
            disabled={showSpinner}
            className="p-2 rounded-full flex items-center justify-center"
            style={{ background: t.accent, color: "#fff", opacity: showSpinner ? 0.6 : 1 }}
          >
            {showSpinner ? (
              <Loader2 size={16} className="animate-spin text-white" />
            ) : audioPlaying ? (
              <Pause size={16} className="text-white" />
            ) : (
              <Play size={16} className="text-white" />
            )}
          </button>

          <button onClick={() => seekBy(SEEK_SECONDS)} title={`Forward ${SEEK_SECONDS}s`}>
            <RotateCw size={16} style={{ color: t.toolbarText }} />
          </button>
        </div>

        <button onClick={handleClose} className="ml-auto">
          <X size={16} style={{ color: t.toolbarText }} />
        </button>
      </div>
    </motion.div>
  );
}

function findCueIndexForTime(cues: DemoCue[], time: number): number {
  let low = 0;
  let high = cues.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (cues[mid].startTime <= time) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const totalSeconds = Math.floor(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
