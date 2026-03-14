import React, { createContext, useContext, useState, useCallback } from "react";
import type { VoiceProfile } from "./VoiceRecorder";

export type ThemeType = "original" | "quiet" | "paper" | "bold" | "calm" | "focus";

export interface Chapter {
  id: string;
  title: string;
  page: number;
  content: string;
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
  audioSpeed: number;
  setAudioSpeed: (speed: number) => void;

  // ── Personal voice ──
  voiceProfile: VoiceProfile | null;
  setVoiceProfile: (profile: VoiceProfile | null) => void;
  activeVoiceType: "browser" | "openai" | "personal";
  setActiveVoiceType: (type: "browser" | "openai" | "personal") => void;
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
  const [audioSpeed, setAudioSpeed] = useState(1);

  // Personal voice state
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [activeVoiceType, setActiveVoiceType] = useState<"browser" | "openai" | "personal">("browser");

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
        audioSpeed,
        setAudioSpeed,
        // Personal voice
        voiceProfile,
        setVoiceProfile,
        activeVoiceType,
        setActiveVoiceType,
      }}
    >
      {children}
    </ReaderContext.Provider>
  );
}