import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, X, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";

const BACKEND_BASE_URL = "http://127.0.0.1:8000";

export function AudiobookPlayer() {
  const {
    book,
    theme,
    setIsAudioMode,
    audioPlaying,
    setAudioPlaying,
    setAudioSentenceIndex,
  } = useReader();

  const t = themes[theme];
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  // Ensure audiobook segments exist on the backend and return their URLs
  const ensureAudiobook = useCallback(async (): Promise<string[] | null> => {
    if (!book) return null;
    if (audioUrls.length > 0) return audioUrls;

    try {
      setIsLoading(true);
      setError(null);

      const payload = {
        book_id: book.id,
        title: book.title,
        author: book.author,
        voice: "coral",
        chapters: book.chapters.map((ch) => ({
          id: ch.id,
          title: ch.title,
          page: ch.page,
          content: ch.content,
        })),
      };

      const res = await fetch(`${BACKEND_BASE_URL}/api/audiobook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || `Backend error ${res.status}`);
      }

      const data = await res.json();
      const files: string[] | undefined = data?.files;
      if (!files || !Array.isArray(files) || files.length === 0) {
        throw new Error("Backend response missing audio files");
      }

      const urls = files.map((f) => `${BACKEND_BASE_URL}/tts/${f}`);
      setAudioUrls(urls);
      setCurrentIndex(0);
      return urls;
    } catch (e: any) {
      setError(e?.message || "Failed to generate audiobook");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [book, audioUrls]);

  const handlePlayPause = useCallback(async () => {
    if (!book) return;

    // Get current URLs, generating them if needed
    let urls = audioUrls;
    if (urls.length === 0) {
      const fresh = await ensureAudiobook();
      if (!fresh || fresh.length === 0) return;
      urls = fresh;
    }

    const urlForCurrent = urls[currentIndex] ?? urls[0];
    if (!audioRef.current && urlForCurrent) {
      const audio = new Audio(urlForCurrent);
      audioRef.current = audio;

      audio.addEventListener("timeupdate", () => {
        if (!audio.duration || Number.isNaN(audio.duration)) return;
        setProgress((audio.currentTime / audio.duration) * 100);
      });

      audio.addEventListener("ended", () => {
        const nextIndex = currentIndex + 1;
        if (nextIndex < urls.length) {
          setCurrentIndex(nextIndex);
          setProgress(0);
          const nextUrl = urls[nextIndex];
          const next = new Audio(nextUrl);
          audioRef.current = next;

          next.addEventListener("timeupdate", () => {
            if (!next.duration || Number.isNaN(next.duration)) return;
            setProgress((next.currentTime / next.duration) * 100);
          });

          next.addEventListener("ended", () => {
            if (nextIndex + 1 < urls.length) {
              setCurrentIndex(nextIndex + 1);
              setProgress(0);
            } else {
              setAudioPlaying(false);
              setProgress(100);
            }
          });

          next.play().catch(() => {
            setAudioPlaying(false);
          });
        } else {
          setAudioPlaying(false);
          setProgress(100);
        }
      });
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (audioPlaying) {
      audio.pause();
      setAudioPlaying(false);
    } else {
      try {
        await audio.play();
        setAudioPlaying(true);
        setAudioSentenceIndex(0);
      } catch {
        setError("Unable to start playback");
      }
    }
  }, [
    book,
    audioUrls,
    currentIndex,
    audioPlaying,
    ensureAudiobook,
    setAudioPlaying,
    setAudioSentenceIndex,
  ]);

  const handleClose = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setAudioPlaying(false);
    setIsAudioMode(false);
  }, [setAudioPlaying, setIsAudioMode]);

  if (!book) return null;

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
          <button
            onClick={() => setError(null)}
            className="ml-2 opacity-60 hover:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div
        className="h-[2px] w-full"
        style={{ backgroundColor: `${t.border}66` }}
      >
        <div
          className="h-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%`, backgroundColor: t.accent }}
        />
      </div>

      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ backgroundColor: t.toolbar, borderTop: `1px solid ${t.border}` }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            disabled={isLoading}
            className="p-2.5 rounded-full transition-all hover:scale-105 disabled:opacity-60"
            style={{ backgroundColor: t.accent, color: "#fff" }}
            title={audioPlaying ? "Pause" : "Play audiobook"}
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : audioPlaying ? (
              <Pause size={16} />
            ) : (
              <Play size={16} className="ml-0.5" />
            )}
          </button>
          <div
            style={{
              color: t.toolbarText,
              fontSize: 13,
              opacity: 0.8,
            }}
          >
            Listen to full audiobook
          </div>
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