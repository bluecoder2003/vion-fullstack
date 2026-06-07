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
    audioSentenceIndex,
    setAudioSentenceIndex,
    setAudioWordIndex,
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
  const playUrlRef = useRef<(urls: string[], idx: number, initialSentenceIdx?: number) => void>(() => {});

  const cuesRef = useRef<SentenceCue[]>([]);
  const lastIndexRef = useRef(audioSentenceIndex);

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

  const fetchWordTimestamps = async (relPath: string): Promise<any[] | null> => {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/word-timestamps/${relPath}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
      return null;
    } catch (err) {
      console.warn("Could not fetch Whisper timestamps, falling back to estimation:", err);
      return null;
    }
  };

  const playUrlAtIndex = useCallback((urls: string[], idx: number, initialSentenceIdx?: number) => {
    destroyAudio();
    const url = urls[idx];
    if (!url) return;

    const audio = new Audio(url);
    audioRef.current = audio;

    let cues: SentenceCue[] = [];

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

    // Start fetching word-level timestamps immediately if generated
    const isGenerated = url.includes("/tts/");
    const ttsIndex = url.indexOf("/tts/");
    const relativePath = ttsIndex !== -1 ? url.substring(ttsIndex + 5) : "";
    const timestampsPromise = isGenerated && relativePath ? fetchWordTimestamps(relativePath) : Promise.resolve(null);

    audio.addEventListener("loadedmetadata", async () => {
      let content = "";
      if (paraIndex !== null) {
        const chapterContent = book?.chapters[chapterIndex]?.content || "";
        const paragraphs = groupParagraphs(chapterContent);
        content = paragraphs[paraIndex] || "";
      } else {
        content = book?.chapters[chapterIndex]?.content || "";
      }

      if (!content || !audio.duration) return;

      const sentenceMap = buildSentenceMap(content);
      const sentences = sentenceMap.flat;
      if (sentences.length === 0) return;

      const whisperWords = await timestampsPromise;
      if (whisperWords && whisperWords.length > 0) {
        cues = alignSentencesWithWhisper(sentences, whisperWords, audio.duration);
      } else {
        cues = estimateSentenceAndWordCues(sentences, audio.duration);
      }
      cuesRef.current = cues;

      if (initialSentenceIdx !== undefined && initialSentenceIdx < cues.length) {
        const targetCue = cues[initialSentenceIdx];
        audio.currentTime = targetCue.startTime;
        const globalSentenceIdx = sentenceOffset + initialSentenceIdx;
        lastIndexRef.current = globalSentenceIdx;
        setAudioSentenceIndex(globalSentenceIdx);
        setAudioWordIndex(0);
      }
    });

    audio.addEventListener("timeupdate", () => {
      if (!audio.duration || Number.isNaN(audio.duration)) return;
      setPlaybackPct((audio.currentTime / audio.duration) * 100);

      if (cues.length > 0) {
        const nextCueIndex = findCueIndexForTime(cues, audio.currentTime);
        if (nextCueIndex >= 0) {
          const globalSentenceIdx = sentenceOffset + cues[nextCueIndex].sentenceIndex;
          if (lastIndexRef.current !== globalSentenceIdx) {
            lastIndexRef.current = globalSentenceIdx;
            setAudioSentenceIndex(globalSentenceIdx);
          }
          
          const wordCues = cues[nextCueIndex].wordCues || [];
          let activeWordIdx = -1;
          for (let w = 0; w < wordCues.length; w++) {
            if (audio.currentTime >= wordCues[w].start && audio.currentTime <= wordCues[w].end) {
              activeWordIdx = w;
              break;
            }
          }
          if (activeWordIdx === -1 && wordCues.length > 0) {
            if (audio.currentTime >= wordCues[wordCues.length - 1].end) {
              activeWordIdx = wordCues.length - 1;
            } else if (audio.currentTime < wordCues[0].start) {
              activeWordIdx = 0;
            }
          }
          setAudioWordIndex(activeWordIdx);
        }
      }
    });

    audio.addEventListener("ended", () => {
      setPlaybackPct(0);
      setAudioWordIndex(-1);
      const nextIdx = idx + 1;
      setCurrentIndex(nextIdx);
      const current = audioUrlsRef.current;
      if (nextIdx < current.length) {
        playUrlRef.current(current, nextIdx);
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
      setAudioWordIndex(-1);
    });

    audio
      .play()
      .then(() => {
        setCurrentIndex(idx);
        setAudioPlaying(true);
        const startIdx = initialSentenceIdx !== undefined ? initialSentenceIdx : 0;
        const globalSentenceIdx = sentenceOffset + startIdx;
        lastIndexRef.current = globalSentenceIdx;
        setAudioSentenceIndex(globalSentenceIdx);
        setAudioWordIndex(-1);
        if (setCurrentChapterIndex) {
          setCurrentChapterIndex(chapterIndex);
        }
      })
      .catch(() => setError("Unable to start playback"));
  }, [book, setAudioPlaying, setAudioSentenceIndex, setAudioWordIndex, setCurrentChapterIndex]);

  useEffect(() => {
    playUrlRef.current = playUrlAtIndex;
  }, [playUrlAtIndex]);

  const getPartForSentenceIndex = useCallback((targetIdx: number) => {
    if (!book) return null;
    
    const current = audioUrlsRef.current;
    
    let offset = 0;
    for (let idx = 0; idx < current.length; idx++) {
      const url = current[idx];
      const filename = url.split("/").pop() || "";
      const match = filename.match(/chapter-(.+?)-part-(\d+)\.wav/i);
      
      let chIdx = idx;
      let pIdx: number | null = null;
      
      if (match) {
        const chId = match[1];
        pIdx = parseInt(match[2], 10);
        const foundIdx = book.chapters.findIndex((ch) => ch.id === chId);
        if (foundIdx !== -1) chIdx = foundIdx;
      }
      
      let content = "";
      if (pIdx !== null) {
        const chapterContent = book.chapters[chIdx]?.content || "";
        const paragraphs = groupParagraphs(chapterContent);
        content = paragraphs[pIdx] || "";
      } else {
        content = book.chapters[chIdx]?.content || "";
      }
      
      const sMap = buildSentenceMap(content);
      const sentenceCount = sMap.flat.length;
      
      if (targetIdx >= offset && targetIdx < offset + sentenceCount) {
        return {
          urlIndex: idx,
          sentenceOffset: offset,
          sentenceIndexInPart: targetIdx - offset,
          content
        };
      }
      offset += sentenceCount;
    }
    
    return null;
  }, [book]);

  const seekToSentenceIndex = useCallback((targetIdx: number) => {
    if (!book) return;
    
    const partInfo = getPartForSentenceIndex(targetIdx);
    if (!partInfo) return;
    
    const currentUrls = audioUrlsRef.current;
    
    if (partInfo.urlIndex === currentIndex && audioRef.current) {
      const targetCue = cuesRef.current[partInfo.sentenceIndexInPart];
      if (targetCue) {
        audioRef.current.currentTime = targetCue.startTime;
        if (audioRef.current.paused) {
          audioRef.current.play().then(() => setAudioPlaying(true)).catch(() => {});
        }
        lastIndexRef.current = targetIdx;
        setAudioSentenceIndex(targetIdx);
        setAudioWordIndex(-1);
      }
    } else {
      playUrlRef.current(currentUrls, partInfo.urlIndex, partInfo.sentenceIndexInPart);
    }
  }, [book, currentIndex, getPartForSentenceIndex, setAudioPlaying, setAudioSentenceIndex, setAudioWordIndex]);

  useEffect(() => {
    if (audioSentenceIndex === lastIndexRef.current) return;
    seekToSentenceIndex(audioSentenceIndex);
  }, [audioSentenceIndex, seekToSentenceIndex]);

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
        playUrlRef.current(merged, currentUrls.length);
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
    const current = audioUrlsRef.current;
    if (current.length > 0) {
      seekToSentenceIndex(audioSentenceIndex);
    }
  }, [setAudioPlaying, audioSentenceIndex, seekToSentenceIndex]);

  const handleClose = useCallback(() => {
    clearPoll();
    destroyAudio();
    cancelActiveJob();
    setAudioPlaying(false);
    setIsAudioMode(false);
    setAudioWordIndex(-1);
  }, [setAudioPlaying, setIsAudioMode, cancelActiveJob, setAudioWordIndex]);

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

interface WordCue {
  word: string;
  start: number;
  end: number;
}

interface SentenceCue {
  startTime: number;
  endTime: number;
  sentenceIndex: number;
  wordCues: WordCue[];
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function alignSentencesWithWhisper(
  sentences: string[],
  whisperWords: { word: string; start: number; end: number }[],
  audioDuration: number
): SentenceCue[] {
  const sentenceWordsNormalized = sentences.map((s) =>
    s.split(/\s+/).map(normalizeWord).filter(Boolean)
  );
  const whisperWordsNormalized = whisperWords.map((w) => normalizeWord(w.word));

  let wIdx = 0;
  const sentenceCues: SentenceCue[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sWords = sentenceWordsNormalized[i];
    if (sWords.length === 0) {
      const prevEndTime = sentenceCues[i - 1]?.endTime || 0;
      sentenceCues.push({
        startTime: prevEndTime,
        endTime: prevEndTime,
        sentenceIndex: i,
        wordCues: [],
      });
      continue;
    }

    let sWordPointer = 0;
    let currentWIdx = wIdx;
    let lastMatchedWIdx = wIdx;

    while (sWordPointer < sWords.length && currentWIdx < whisperWordsNormalized.length) {
      const target = sWords[sWordPointer];
      let found = false;
      for (let win = 0; win < 5; win++) {
        if (
          currentWIdx + win < whisperWordsNormalized.length &&
          whisperWordsNormalized[currentWIdx + win] === target
        ) {
          currentWIdx += win + 1;
          sWordPointer++;
          lastMatchedWIdx = currentWIdx - 1;
          found = true;
          break;
        }
      }
      if (!found) {
        sWordPointer++;
      }
    }

    const startWordIdx = wIdx;
    const endWordIdx = Math.max(wIdx, lastMatchedWIdx);

    const slice = whisperWords.slice(startWordIdx, endWordIdx + 1);
    const startTime = slice.length > 0 ? slice[0].start : (whisperWords[startWordIdx]?.start ?? 0);
    const endTime = slice.length > 0 ? slice[slice.length - 1].end : (whisperWords[startWordIdx]?.end ?? audioDuration);

    const wordCues: WordCue[] = [];
    const rawWords = sentences[i].split(/\s+/).filter(Boolean);

    let sliceIdx = 0;
    for (let rwIdx = 0; rwIdx < rawWords.length; rwIdx++) {
      const rwNorm = normalizeWord(rawWords[rwIdx]);
      let matchedWord = null;
      for (let look = 0; look < 4; look++) {
        if (sliceIdx + look < slice.length) {
          if (normalizeWord(slice[sliceIdx + look].word) === rwNorm) {
            matchedWord = slice[sliceIdx + look];
            sliceIdx += look + 1;
            break;
          }
        }
      }

      if (matchedWord) {
        wordCues.push({
          word: rawWords[rwIdx],
          start: matchedWord.start,
          end: matchedWord.end,
        });
      } else {
        const fractionStart = rwIdx / rawWords.length;
        const fractionEnd = (rwIdx + 1) / rawWords.length;
        wordCues.push({
          word: rawWords[rwIdx],
          start: startTime + fractionStart * (endTime - startTime),
          end: startTime + fractionEnd * (endTime - startTime),
        });
      }
    }

    sentenceCues.push({
      startTime,
      endTime,
      sentenceIndex: i,
      wordCues,
    });

    wIdx = endWordIdx + 1;
  }

  return sentenceCues;
}

function estimateSentenceAndWordCues(sentences: string[], audioDuration: number): SentenceCue[] {
  const weights = sentences.map((text) => {
    const words = text.split(/\s+/).filter(Boolean).length;
    const pauses = (text.match(/[,:;—-]/g) || []).length;
    return 8 + words * 1.35 + pauses * 1.75;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let cumulativeWeight = 0;
  const sentenceCues: SentenceCue[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const startTime = (cumulativeWeight / totalWeight) * audioDuration;
    cumulativeWeight += weights[i];
    const endTime = (cumulativeWeight / totalWeight) * audioDuration;

    const rawWords = sentences[i].split(/\s+/).filter(Boolean);
    const duration = endTime - startTime;

    const wordWeights = rawWords.map((w) => {
      const charCount = w.replace(/[^a-zA-Z0-9]/g, "").length;
      let weight = charCount + 3;
      if (/[.,:;?!—-]/.test(w)) {
        weight += 4;
      }
      return weight;
    });

    const totalWordWeight = wordWeights.reduce((sum, w) => sum + w, 0);
    let currentWordStart = startTime;

    const wordCues: WordCue[] = rawWords.map((word, wIdx) => {
      const wDuration = totalWordWeight > 0 ? (wordWeights[wIdx] / totalWordWeight) * duration : duration / rawWords.length;
      const wEnd = currentWordStart + wDuration;
      const cue = {
        word,
        start: currentWordStart,
        end: wEnd,
      };
      currentWordStart = wEnd;
      return cue;
    });

    sentenceCues.push({
      startTime,
      endTime,
      sentenceIndex: i,
      wordCues,
    });
  }

  return sentenceCues;
}
