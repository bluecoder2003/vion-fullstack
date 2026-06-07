import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, X, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";
import { buildSentenceMap } from "./audioUtils";

const BACKEND_BASE_URL = "http://127.0.0.1:8000";
const POLL_MS = 2500;

function groupParagraphs(text: string, minChars = 400): string[] {
  const paras = text.split("\n\n").filter((p) => p.trim());
  const grouped: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const p of paras) {
    if (current.length > 0 && currentLen + p.length > minChars * 2.5) {
      grouped.push(current.join("\n\n"));
      current = [p];
      currentLen = p.length;
    } else if (currentLen >= minChars) {
      grouped.push(current.join("\n\n"));
      current = [p];
      currentLen = p.length;
    } else {
      current.push(p);
      currentLen += p.length;
    }
  }

  if (current.length > 0) {
    grouped.push(current.join("\n\n"));
  }

  return grouped;
}

export function AudiobookPlayer() {
  const {
    book,
    theme,
    setIsAudioMode,
    audioPlaying,
    setAudioPlaying,
    setAudioSentenceIndex,
    setCurrentChapterIndex,
  } = useReader();

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
  const activeJobIdRef = useRef<string | null>(null);
  const audioUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    audioUrlsRef.current = audioUrls;
  }, [audioUrls]);

  const cancelActiveJob = useCallback(() => {
    const activeId = activeJobIdRef.current;
    if (activeId) {
      fetch(`${BACKEND_BASE_URL}/api/audiobook/${activeId}/cancel`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    return () => {
      clearPoll();
      destroyAudio();
      cancelActiveJob();
    };
  }, [cancelActiveJob]);

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

    let cues: { startTime: number; sentenceIndex: number }[] = [];

    // Parse paragraph details from paragraph-level file names
    const filename = url.split("/").pop() || "";
    const match = filename.match(/chapter-(.+?)-part-(\d+)\.wav/i);

    let chapterIndex = idx;
    let paraIndex: number | null = null;

    if (match) {
      const chId = match[1];
      paraIndex = parseInt(match[2], 10);
      const foundIdx = book?.chapters.findIndex((ch) => ch.id === chId);
      if (foundIdx !== undefined && foundIdx !== -1) {
        chapterIndex = foundIdx;
      }
    }

    // Calculate sentence offset within this chapter
    let sentenceOffset = 0;
    if (paraIndex !== null && book?.chapters[chapterIndex]) {
      const chapterContent = book.chapters[chapterIndex].content || "";
      const paragraphs = groupParagraphs(chapterContent);
      const limit = Math.min(paraIndex, paragraphs.length);
      for (let p = 0; p < limit; p++) {
        const paraText = paragraphs[p];
        if (paraText) {
          const pMap = buildSentenceMap(paraText);
          sentenceOffset += pMap.flat.length;
        }
      }
    }

    audio.addEventListener("loadedmetadata", () => {
      let content = "";
      if (paraIndex !== null) {
        const chapterContent = book?.chapters[chapterIndex]?.content || "";
        const paragraphs = groupParagraphs(chapterContent);
        content = paragraphs[paraIndex] || "";
      } else {
        content = book?.chapters[chapterIndex]?.content || "";
      }

      if (content && audio.duration) {
        const sentenceMap = buildSentenceMap(content);
        const sentences = sentenceMap.flat;
        if (sentences.length > 0) {
          const weights = sentences.map((text) => {
            const words = text.split(/\s+/).filter(Boolean).length;
            const pauses = (text.match(/[,:;—-]/g) || []).length;
            return 8 + words * 1.35 + pauses * 1.75;
          });
          const totalWeight = weights.reduce((sum, w) => sum + w, 0);
          let cumulativeWeight = 0;
          cues = sentences.map((_, index) => {
            const startTime = (cumulativeWeight / totalWeight) * audio.duration;
            cumulativeWeight += weights[index];
            return { startTime, sentenceIndex: index };
          });
        }
      }
    });

    audio.addEventListener("timeupdate", () => {
      if (!audio.duration || Number.isNaN(audio.duration)) return;
      setPlaybackPct((audio.currentTime / audio.duration) * 100);

      if (cues.length > 0) {
        const nextCueIndex = findCueIndexForTime(cues, audio.currentTime);
        if (nextCueIndex >= 0) {
          setAudioSentenceIndex(sentenceOffset + cues[nextCueIndex].sentenceIndex);
        }
      }
    });

    audio.addEventListener("ended", () => {
      setPlaybackPct(0);
      const nextIdx = idx + 1;
      setCurrentIndex(nextIdx);
      const current = audioUrlsRef.current;
      if (nextIdx < current.length) {
        playUrlAtIndex(current, nextIdx);
      } else {
        pendingAdvance.current = true;
        setWaitingForNext(true);
        setAudioPlaying(false);
      }
    });

    audio.addEventListener("error", (e) => {
      console.error("Audio playback/load error:", e);
      setError("Audio playback failed or file not found");
      setAudioPlaying(false);
      setWaitingForNext(false);
    });

    audio
      .play()
      .then(() => {
        setCurrentIndex(idx);
        setAudioPlaying(true);
        setAudioSentenceIndex(sentenceOffset);
        if (setCurrentChapterIndex) {
          setCurrentChapterIndex(chapterIndex);
        }
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
          book_id: String(book.id || ""),
          title: Array.isArray(book.title) ? book.title.join(", ") : String(book.title || ""),
          author: Array.isArray(book.author) ? book.author.join(", ") : String(book.author || ""),
          voice: "af_heart",
          chapters: (book.chapters || []).map((ch) => ({
            id: String(ch.id || ""),
            title: Array.isArray(ch.title) ? ch.title.join(", ") : String(ch.title || ""),
            page: typeof ch.page === "number" ? ch.page : undefined,
            content: String(ch.content || ""),
          })),
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      if (data.job_id) {
        activeJobIdRef.current = data.job_id;
      }
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
    activeJobIdRef.current = jobId;
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
      const currentUrls = audioUrlsRef.current;
      const merged = [...currentUrls, ...incoming];
      const shouldAutoplay = currentUrls.length === 0 && merged.length > 0;
      setAudioUrls(merged);

      if (pendingAdvance.current || shouldAutoplay) {
        pendingAdvance.current = false;
        setWaitingForNext(false);
        playUrlAtIndex(merged, currentUrls.length);
      }
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
    const current = audioUrlsRef.current;
    if (current.length > 0) playUrlAtIndex(current, 0);
  }, [setAudioPlaying]);

  const handleClose = useCallback(() => {
    clearPoll();
    destroyAudio();
    cancelActiveJob();
    setAudioPlaying(false);
    setIsAudioMode(false);
  }, [setAudioPlaying, setIsAudioMode, cancelActiveJob]);

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

function findCueIndexForTime(cues: { startTime: number }[], time: number): number {
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
