import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, X, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";

const BACKEND_BASE_URL = "http://127.0.0.1:8000";
const POLL_MS = 2500;

export function AudiobookPlayer() {
  const { book, theme, setIsAudioMode, audioPlaying, setAudioPlaying, setAudioSentenceIndex } =
    useReader();

  const t = themes[theme];

  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackPct, setPlaybackPct] = useState(0);
  const [readyCount, setReadyCount] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [jobStatus, setJobStatus] = useState<"idle" | "queued" | "processing" | "complete" | "error">("idle");
  const [waitingForNext, setWaitingForNext] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenUrls = useRef<Set<string>>(new Set());
  // Set to true when playback reaches the end of a chapter but the next
  // chapter hasn't finished generating yet. The polling loop clears this
  // and auto-plays as soon as the next URL arrives.
  const pendingAdvance = useRef(false);

  useEffect(() => {
    return () => {
      clearPoll();
      destroyAudio();
    };
  }, []);

  function clearPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function destroyAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }

  function playUrlAtIndex(urls: string[], idx: number) {
    destroyAudio();
    const url = urls[idx];
    if (!url) return;

    const audio = new Audio(url);
    audioRef.current = audio;

    audio.addEventListener("timeupdate", () => {
      if (!audio.duration || Number.isNaN(audio.duration)) return;
      setPlaybackPct((audio.currentTime / audio.duration) * 100);
    });

    audio.addEventListener("ended", () => {
      setPlaybackPct(0);
      const nextIdx = idx + 1;
      setCurrentIndex(nextIdx);
      setAudioUrls((current) => {
        if (nextIdx < current.length) {
          playUrlAtIndex(current, nextIdx);
        } else {
          pendingAdvance.current = true;
          setWaitingForNext(true);
          setAudioPlaying(false);
        }
        return current;
      });
    });

    audio
      .play()
      .then(() => {
        setCurrentIndex(idx);
        setAudioPlaying(true);
        setAudioSentenceIndex(0);
      })
      .catch(() => setError("Unable to start playback"));
  }

  // ── Job lifecycle ─────────────────────────────────────────────

  useEffect(() => {
    if (!book) return;
    if (book.audioUrls?.length) {
      // Pre-recorded audio from LibriVox / IA — no backend needed
      loadPrerecordedAudio(book.audioUrls);
    } else {
      startJob();
    }
    // runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadPrerecordedAudio(urls: string[]) {
    for (const url of urls) {
      if (!seenUrls.current.has(url)) {
        seenUrls.current.add(url);
      }
    }
    setAudioUrls(urls);
    setReadyCount(urls.length);
    setTotalChapters(urls.length);
    setJobStatus("complete");
  }

  async function startJob() {
    if (!book) return;
    setIsStarting(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/audiobook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book_id: book.id,
          title: book.title,
          author: book.author,
          voice: "af_heart",
          chapters: book.chapters.map((ch) => ({
            id: ch.id,
            title: ch.title,
            page: ch.page,
            content: ch.content,
          })),
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      applyUpdate(data);
      if (data.status !== "complete" && data.status !== "error") {
        beginPolling(data.job_id as string);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to start audiobook job");
      setJobStatus("error");
    } finally {
      setIsStarting(false);
    }
  }

  function beginPolling(jobId: string) {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/api/audiobook/${jobId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        applyUpdate(data);
        if (data.status === "complete" || data.status === "error") clearPoll();
      } catch {
        // keep trying on transient network errors
      }
    }, POLL_MS);
  }

  function applyUpdate(data: {
    status: string;
    ready_files: string[];
    total: number;
    error?: string | null;
  }) {
    setJobStatus(data.status as any);
    setTotalChapters(data.total);
    setReadyCount(data.ready_files.length);

    const incoming: string[] = [];
    for (const f of data.ready_files) {
      const url = `${BACKEND_BASE_URL}/tts/${f}`;
      if (!seenUrls.current.has(url)) {
        seenUrls.current.add(url);
        incoming.push(url);
      }
    }

    if (incoming.length > 0) {
      setAudioUrls((prev) => {
        const merged = [...prev, ...incoming];
        if (pendingAdvance.current) {
          pendingAdvance.current = false;
          setWaitingForNext(false);
          playUrlAtIndex(merged, prev.length);
        }
        return merged;
      });
    }

    if (data.error) setError(data.error);
  }

  // ── Controls ──────────────────────────────────────────────────

  const handlePlayPause = useCallback(() => {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current
          .play()
          .then(() => setAudioPlaying(true))
          .catch(() => setError("Playback failed"));
      } else {
        audioRef.current.pause();
        setAudioPlaying(false);
      }
      return;
    }
    // Start from beginning
    setAudioUrls((current) => {
      if (current.length > 0) playUrlAtIndex(current, 0);
      return current;
    });
  }, [setAudioPlaying]);

  const handleClose = useCallback(() => {
    clearPoll();
    destroyAudio();
    setAudioPlaying(false);
    setIsAudioMode(false);
  }, [setAudioPlaying, setIsAudioMode]);

  if (!book) return null;

  const isGenerating = jobStatus === "queued" || jobStatus === "processing";
  const canPlay = audioUrls.length > 0 && !isStarting && !waitingForNext;
  const genPct = totalChapters > 0 ? (readyCount / totalChapters) * 100 : 0;

  const isLibriVox = !!(book?.audioUrls?.length);
  let statusLabel = isLibriVox ? "LibriVox recording" : "Listen to full audiobook";
  if (isStarting) statusLabel = "Starting…";
  else if (waitingForNext) statusLabel = isLibriVox ? "Loading next chapter…" : "Generating next chapter…";
  else if (isGenerating && readyCount === 0) statusLabel = "Generating audio…";
  else if (isGenerating) statusLabel = `${readyCount} / ${totalChapters} chapters ready`;
  else if (jobStatus === "complete" && totalChapters > 0)
    statusLabel = isLibriVox
      ? `LibriVox · ${totalChapters} chapter${totalChapters === 1 ? "" : "s"}`
      : `${totalChapters} chapter${totalChapters === 1 ? "" : "s"} ready`;

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="absolute bottom-0 left-0 right-0 z-30"
    >
      {error && (
        <div
          className="px-4 py-1.5 flex items-center justify-between"
          style={{
            backgroundColor: "#fef2f2",
            borderBottom: "1px solid #fecaca",
            fontSize: 12,
            color: "#991b1b",
          }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 opacity-60 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Generation progress (faint, behind playback bar) */}
      {isGenerating && totalChapters > 1 && (
        <div className="h-[2px] w-full" style={{ backgroundColor: `${t.border}33` }}>
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{ width: `${genPct}%`, backgroundColor: t.accent, opacity: 0.4 }}
          />
        </div>
      )}

      {/* Playback progress */}
      <div className="h-[2px] w-full" style={{ backgroundColor: `${t.border}66` }}>
        <div
          className="h-full transition-all duration-300 ease-out"
          style={{ width: `${playbackPct}%`, backgroundColor: t.accent }}
        />
      </div>

      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ backgroundColor: t.toolbar, borderTop: `1px solid ${t.border}` }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            disabled={!canPlay}
            className="p-2.5 rounded-full transition-all hover:scale-105 disabled:opacity-60"
            style={{ backgroundColor: t.accent, color: "#fff" }}
            title={audioPlaying ? "Pause" : "Play audiobook"}
          >
            {isStarting || waitingForNext ? (
              <Loader2 size={16} className="animate-spin" />
            ) : audioPlaying ? (
              <Pause size={16} />
            ) : (
              <Play size={16} className="ml-0.5" />
            )}
          </button>

          <div style={{ color: t.toolbarText, fontSize: 13, opacity: 0.8 }}>
            {statusLabel}
          </div>

          {isGenerating && readyCount > 0 && (
            <Loader2
              size={12}
              className="animate-spin"
              style={{ color: t.accent, opacity: 0.5 }}
            />
          )}
        </div>

        <button
          onClick={handleClose}
          className="p-1.5 rounded-md transition-colors hover:opacity-70"
          style={{ color: t.toolbarText }}
          title="Close Audio"
        >
          <X size={15} />
        </button>
      </div>
    </motion.div>
  );
}
