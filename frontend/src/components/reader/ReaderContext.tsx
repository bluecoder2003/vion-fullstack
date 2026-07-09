import React, { createContext, useContext, useState, useCallback } from "react";
import type { VoiceProfile } from "./VoiceRecorder";
import type { SceneType } from "./ambientSounds";

export type ThemeType = "original" | "quiet" | "paper" | "bold" | "calm" | "focus";
export type LanguageType = "en" | "bn" | "hi" | "fr" | "es" | "de";

export interface Chapter {
  id: string;
  title: string;
  page: number;
  content: string;
  paragraphs?: {
    sentences: string[];
    isSpecial?: boolean;
    rawText: string;
  }[];
}

export interface Highlight {
  id: string;
  text: string;
  color: string;
  chapterId: string;
  chapterTitle: string;
  page: number;
  timestamp: Date;
}

export interface Bookmark {
  id: string;
  chapterId: string;
  chapterTitle: string;
  page: number;
  timestamp: Date;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  chapters: Chapter[];
  totalPages: number;
  /** Ordered image URLs matching [Illustration: ...] markers in the text */
  illustrations?: string[];
  /** Pre-recorded chapter audio URLs from LibriVox / Internet Archive */
  audioUrls?: string[];
  /** Kokoro voice to use for TTS generation (default: "af_heart") */
  voice?: string;
}

export type SidebarType = "contents" | "bookmarks" | "highlights" | null;

interface ReaderContextType {
  book: Book | null;
  setBook: (book: Book | null) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  currentChapterIndex: number;
  setCurrentChapterIndex: (index: number) => void;
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  highlights: Highlight[];
  addHighlight: (highlight: Omit<Highlight, "id" | "timestamp">) => void;
  removeHighlight: (id: string) => void;
  bookmarks: Bookmark[];
  addBookmark: () => void;
  removeBookmark: (id: string) => void;
  isCurrentPageBookmarked: () => boolean;
  sidebarType: SidebarType;
  setSidebarType: (type: SidebarType) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  themeOpen: boolean;
  setThemeOpen: (open: boolean) => void;

  // ── Audio reading mode ──
  isAudioMode: boolean;
  setIsAudioMode: (on: boolean) => void;
  audioPlaying: boolean;
  setAudioPlaying: (playing: boolean) => void;
  audioSentenceIndex: number;
  setAudioSentenceIndex: (idx: number) => void;
  /** Word index within the currently active sentence (karaoke tracking). -1 = none */
  audioWordIndex: number;
  setAudioWordIndex: (idx: number) => void;
  audioSpeed: number;
  setAudioSpeed: (speed: number) => void;
  /** Kokoro voice chosen by the user in the voice picker */
  audioVoice: string;
  setAudioVoice: (voice: string) => void;

  // ── Reading language / translation ──
  language: LanguageType;
  setLanguage: (lang: LanguageType) => void;
  /** Map of `${chapterId}:${lang}` → translated content */
  translations: Map<string, string>;
  addTranslation: (chapterId: string, lang: LanguageType, text: string) => void;
  /** Set of chapters currently being translated (for loading UI) */
  translatingKeys: Set<string>;
  setTranslating: (key: string, on: boolean) => void;

  // ── Personal voice ──
  voiceProfile: VoiceProfile | null;
  setVoiceProfile: (profile: VoiceProfile | null) => void;
  activeVoiceType: "browser" | "openai" | "personal";
  setActiveVoiceType: (type: "browser" | "openai" | "personal") => void;

  // ── Ambient soundscapes ──
  ambientMode: "adaptive" | "manual" | "off";
  setAmbientMode: (mode: "adaptive" | "manual" | "off") => void;
  ambientScene: SceneType;
  setAmbientScene: (scene: SceneType) => void;
  ambientVolume: number;
  setAmbientVolume: (vol: number) => void;
  currentPlayingAmbient: SceneType;
  setCurrentPlayingAmbient: (scene: SceneType) => void;
}

const ReaderContext = createContext<ReaderContextType | null>(null);

export function useReader() {
  const ctx = useContext(ReaderContext);
  if (!ctx) throw new Error("useReader must be used within ReaderProvider");
  return ctx;
}

export function ReaderProvider({ children }: { children: React.ReactNode }) {
  const [book, setBook] = useState<Book | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [theme, setTheme] = useState<ThemeType>("quiet");
  const [fontSize, setFontSize] = useState(18);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [sidebarType, setSidebarType] = useState<SidebarType>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  // Audio state
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioSentenceIndex, setAudioSentenceIndex] = useState(0);
  const [audioWordIndex, setAudioWordIndex] = useState(-1);
  const [audioSpeed, setAudioSpeed] = useState(1);
  const [audioVoice, setAudioVoice] = useState("bm_george");

  // Language / translation
  // Persistent cache — translations survive page reloads via localStorage.
  const TRANSLATION_STORAGE_PREFIX = "vion:translation:";

  const [language, setLanguage] = useState<LanguageType>("en");
  const [translations, setTranslations] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    if (typeof window === "undefined") return map;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const rawKey = localStorage.key(i);
        if (rawKey && rawKey.startsWith(TRANSLATION_STORAGE_PREFIX)) {
          const value = localStorage.getItem(rawKey);
          if (value) map.set(rawKey.substring(TRANSLATION_STORAGE_PREFIX.length), value);
        }
      }
    } catch {
      // localStorage unavailable — proceed with empty map
    }
    return map;
  });
  const [translatingKeys, setTranslatingKeys] = useState<Set<string>>(new Set());

  const addTranslation = useCallback(
    (chapterId: string, lang: LanguageType, text: string) => {
      const key = `${chapterId}:${lang}`;
      setTranslations((prev) => {
        const next = new Map(prev);
        next.set(key, text);
        return next;
      });
      // Persist to localStorage so translations survive reloads / navigation
      try {
        localStorage.setItem(`${TRANSLATION_STORAGE_PREFIX}${key}`, text);
      } catch (err) {
        // Quota exceeded — drop silently. Full disk cache still lives on the backend.
        console.warn("Translation localStorage write failed:", err);
      }
    },
    []
  );

  const setTranslating = useCallback((key: string, on: boolean) => {
    setTranslatingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // Personal voice state
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [activeVoiceType, setActiveVoiceType] = useState<"browser" | "openai" | "personal">("browser");

  // Ambient soundscapes state
  const [ambientMode, setAmbientMode] = useState<"adaptive" | "manual" | "off">("off");
  const [ambientScene, setAmbientScene] = useState<SceneType>("indoor");
  const [ambientVolume, setAmbientVolume] = useState(0.35);
  const [currentPlayingAmbient, setCurrentPlayingAmbient] = useState<SceneType>("silence");

  const addHighlight = useCallback(
    (highlight: Omit<Highlight, "id" | "timestamp">) => {
      setHighlights((prev) => [
        ...prev,
        { ...highlight, id: crypto.randomUUID(), timestamp: new Date() },
      ]);
    },
    []
  );

  const removeHighlight = useCallback((id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const addBookmark = useCallback(() => {
    if (!book) return;
    const chapter = book.chapters[currentChapterIndex];
    if (!chapter) return;
    const exists = bookmarks.find(
      (b) => b.chapterId === chapter.id && b.page === currentPage
    );
    if (exists) return;
    setBookmarks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        page: currentPage,
        timestamp: new Date(),
      },
    ]);
  }, [book, currentChapterIndex, currentPage, bookmarks]);

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const isCurrentPageBookmarked = useCallback(() => {
    if (!book) return false;
    const chapter = book.chapters[currentChapterIndex];
    if (!chapter) return false;
    return bookmarks.some(
      (b) => b.chapterId === chapter.id && b.page === currentPage
    );
  }, [book, currentChapterIndex, currentPage, bookmarks]);

  return (
    <ReaderContext.Provider
      value={{
        book,
        setBook,
        currentPage,
        setCurrentPage,
        currentChapterIndex,
        setCurrentChapterIndex,
        theme,
        setTheme,
        fontSize,
        setFontSize,
        highlights,
        addHighlight,
        removeHighlight,
        bookmarks,
        addBookmark,
        removeBookmark,
        isCurrentPageBookmarked,
        sidebarType,
        setSidebarType,
        searchOpen,
        setSearchOpen,
        themeOpen,
        setThemeOpen,
        // Audio
        isAudioMode,
        setIsAudioMode,
        audioPlaying,
        setAudioPlaying,
        audioSentenceIndex,
        setAudioSentenceIndex,
        audioWordIndex,
        setAudioWordIndex,
        audioSpeed,
        setAudioSpeed,
        audioVoice,
        setAudioVoice,
        language,
        setLanguage,
        translations,
        addTranslation,
        translatingKeys,
        setTranslating,
        // Personal voice
        voiceProfile,
        setVoiceProfile,
        activeVoiceType,
        setActiveVoiceType,
        // Ambient soundscapes
        ambientMode,
        setAmbientMode,
        ambientScene,
        setAmbientScene,
        ambientVolume,
        setAmbientVolume,
        currentPlayingAmbient,
        setCurrentPlayingAmbient,
      }}
    >
      {children}
    </ReaderContext.Provider>
  );
}