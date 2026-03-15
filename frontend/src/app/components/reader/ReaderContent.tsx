import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";
import { HighlightToolbar } from "./HighlightToolbar";
import { AudiobookPlayer } from "./AudiobookPlayer";
import { DemoBookPlayer } from "./DemoBookPlayer";
import { buildSentenceMap } from "./audioUtils";
import { ChevronLeft, ChevronRight, Highlighter } from "lucide-react";
import { AnimatePresence } from "motion/react";

/*
 * Layout constants.
 *   PAD_X   – horizontal padding inside each two-page spread
 *   PAD_Y   – vertical padding (top / bottom of the column area)
 *   COL_GAP – exact gap between every pair of adjacent CSS columns
 */
const PAD_X = 48;
const PAD_Y = 40;
const COL_GAP = 64;

export function ReaderContent() {
  const {
    book,
    currentChapterIndex,
    setCurrentChapterIndex,
    setCurrentPage,
    theme,
    fontSize,
    highlights,
    addHighlight,
    sidebarType,
    setSidebarType,
    setSearchOpen,
    setThemeOpen,
    // Audio
    isAudioMode,
    audioPlaying,
    audioSentenceIndex,
    setAudioSentenceIndex,
  } = useReader();

  const t = themes[theme];
  const outerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  const [selectedText, setSelectedText] = useState("");
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [showToolbar, setShowToolbar] = useState(false);

  /*
   * "spread" = one two-page view (left column + right column).
   * spreadIndex 0 → columns 0-1, spreadIndex 1 → columns 2-3, etc.
   */
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [totalSpreads, setTotalSpreads] = useState(1);
  const [totalColumns, setTotalColumns] = useState(2);

  /*
   * spreadWidth – the exact pixel distance we translate per spread.
   * Measured from the actual browser layout, not a calculation.
   */
  const [spreadWidth, setSpreadWidth] = useState(0);

  /*
   * hintColWidth – the CSS column-width value we REQUEST.
   */
  const [hintColWidth, setHintColWidth] = useState(400);

  const chapter = book?.chapters[currentChapterIndex];

  // ── Sentence map (shared with AudioPlayer for identical indexing) ──
  const sentenceMap = useMemo(
    () => (chapter ? buildSentenceMap(chapter.content) : null),
    [chapter]
  );

  // ──────────────────────────────────────────────
  //  1.  Compute the CSS column-width HINT
  // ──────────────────────────────────────────────

  const updateHint = useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const w = outer.clientWidth;
    const cw = Math.max(60, (w - 2 * PAD_X - COL_GAP) / 2);
    setHintColWidth(cw);
  }, []);

  useEffect(() => {
    updateHint();
  }, [updateHint, sidebarType, fontSize]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(updateHint);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [updateHint]);

  // ──────────────────────────────────────────────
  //  2.  Reset to first spread on chapter change
  // ──────────────────────────────────────────────

  useEffect(() => {
    setSpreadIndex(0);
  }, [currentChapterIndex]);

  useEffect(() => {
    setCurrentPage(spreadIndex * 2 + 1);
  }, [spreadIndex, setCurrentPage]);

  // ──────────────────────────────────────────────
  //  3.  MEASURE the actual column layout
  // ──────────────────────────────────────────────

  const measure = useCallback(() => {
    const container = columnsRef.current;
    if (!container) return;

    const paragraphs = container.querySelectorAll("p");
    if (paragraphs.length === 0) {
      setTotalSpreads(1);
      setTotalColumns(1);
      setSpreadWidth(0);
      return;
    }

    const actualColWidth = paragraphs[0].offsetWidth;
    if (actualColWidth <= 0) return;

    const colSlot = actualColWidth + COL_GAP;
    const sw = 2 * colSlot;

    const containerRect = container.getBoundingClientRect();
    const lastP = paragraphs[paragraphs.length - 1];
    const lastRects = lastP.getClientRects();
    if (lastRects.length === 0) {
      setSpreadWidth(sw);
      setTotalSpreads(1);
      setTotalColumns(1);
      return;
    }

    const lastRect = lastRects[lastRects.length - 1];
    const contentLeft = lastRect.left - containerRect.left - PAD_X;
    const lastColIdx = Math.max(0, Math.round(contentLeft / colSlot));
    const cols = lastColIdx + 1;
    const spreads = Math.max(1, Math.ceil(cols / 2));

    setSpreadWidth(sw);
    setTotalColumns(cols);
    setTotalSpreads(spreads);
  }, []);

  useEffect(() => {
    if (!chapter) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) measure();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [measure, chapter, fontSize, hintColWidth, currentChapterIndex]);

  // ──────────────────────────────────────────────
  //  4.  Clamp spreadIndex
  // ──────────────────────────────────────────────

  useEffect(() => {
    if (spreadIndex >= totalSpreads) {
      setSpreadIndex(Math.max(0, totalSpreads - 1));
    }
  }, [totalSpreads, spreadIndex]);

  // ──────────────────────────────────────────────
  //  5.  Navigation (always ±1 spread = ±2 pages)
  // ──────────────────────────────────────────────

  const canGoPrev = spreadIndex > 0 || currentChapterIndex > 0;
  const canGoNext =
    spreadIndex < totalSpreads - 1 ||
    (book ? currentChapterIndex < book.chapters.length - 1 : false);

  const goToPrev = useCallback(() => {
    if (spreadIndex > 0) {
      setSpreadIndex((s) => s - 1);
    } else if (currentChapterIndex > 0) {
      setCurrentChapterIndex(currentChapterIndex - 1);
      setSpreadIndex(99999);
    }
  }, [spreadIndex, currentChapterIndex, setCurrentChapterIndex]);

  const goToNext = useCallback(() => {
    if (spreadIndex < totalSpreads - 1) {
      setSpreadIndex((s) => s + 1);
    } else if (book && currentChapterIndex < book.chapters.length - 1) {
      setCurrentChapterIndex(currentChapterIndex + 1);
      setSpreadIndex(0);
    }
  }, [
    spreadIndex,
    totalSpreads,
    book,
    currentChapterIndex,
    setCurrentChapterIndex,
  ]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept arrow keys when audio mode is active (Space is handled by AudioPlayer)
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goToNext();
      } else if (e.key === "Escape") {
        setShowToolbar(false);
        setSelectedText("");
        window.getSelection()?.removeAllRanges();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrev, goToNext]);

  // ──────────────────────────────────────────────
  //  6.  AUTO-PAGE-TURN for audio mode
  //      When a sentence is spoken, ensure its spread is visible.
  //      Uses getClientRects() to handle spans that break across
  //      columns, and a double-rAF to wait for the DOM.
  // ──────────────────────────────────────────────

  useEffect(() => {
    if (!isAudioMode) return;
    if (spreadWidth <= 0) return;

    const container = columnsRef.current;
    const outer = outerRef.current;
    if (!container || !outer) return;

    // Double rAF ensures layout has settled after React commit
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        const el = container.querySelector(
          `[data-sentence-idx="${audioSentenceIndex}"]`
        );
        if (!el) return;

        const outerRect = outer.getBoundingClientRect();

        // Use getClientRects() to handle spans that wrap across columns.
        // We care about the FIRST rect — where the sentence starts.
        const rects = el.getClientRects();
        const firstRect = rects.length > 0 ? rects[0] : el.getBoundingClientRect();

        // Visible if the start of the sentence is within the viewport
        // (with a small tolerance for subpixel rounding)
        const tolerance = 4;
        if (
          firstRect.left >= outerRect.left - tolerance &&
          firstRect.left < outerRect.right - tolerance
        ) {
          return; // already visible
        }

        // Calculate target spread from absolute column position
        const containerRect = container.getBoundingClientRect();
        const relativeLeft = firstRect.left - containerRect.left - PAD_X;
        const colSlot = spreadWidth / 2;
        const colIdx = Math.max(0, Math.floor(relativeLeft / colSlot));
        const targetSpread = Math.floor(colIdx / 2);

        if (targetSpread !== spreadIndex && targetSpread >= 0 && targetSpread < totalSpreads) {
          setSpreadIndex(targetSpread);
        }
      });
    });

    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [
    audioSentenceIndex,
    isAudioMode,
    spreadWidth,
    spreadIndex,
    totalSpreads,
  ]);

  // ── When audio mode is first enabled, find the first visible sentence ──
  useEffect(() => {
    if (!isAudioMode || !sentenceMap) return;

    const container = columnsRef.current;
    const outer = outerRef.current;
    if (!container || !outer) return;

    // Small delay for DOM to be ready
    const timer = setTimeout(() => {
      const outerRect = outer.getBoundingClientRect();
      const allSentences = container.querySelectorAll("[data-sentence-idx]");

      for (let i = 0; i < allSentences.length; i++) {
        const rect = allSentences[i].getBoundingClientRect();
        if (rect.left >= outerRect.left - 10 && rect.left < outerRect.right) {
          const idx = parseInt(
            allSentences[i].getAttribute("data-sentence-idx") || "0"
          );
          setAudioSentenceIndex(idx);
          break;
        }
      }
    }, 100);

    return () => clearTimeout(timer);
    // Only run when audio mode is toggled ON
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAudioMode]);

  // ──────────────────────────────────────────────
  //  7.  Highlights
  // ──────────────────────────────────────────────

  const chapterHighlights = useMemo(
    () => highlights.filter((h) => chapter && h.chapterId === chapter.id),
    [highlights, chapter]
  );

  // ──────────────────────────────────────────────
  //  8.  Text selection
  // ──────────────────────────────────────────────

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        const text = selection.toString().trim();
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelectedText(text);
        setToolbarPos({ x: rect.left + rect.width / 2, y: rect.top });
        setShowToolbar(true);
      } else {
        setShowToolbar(false);
        setSelectedText("");
      }
    }, 10);
  }, []);

  const handleHighlight = useCallback(
    (color: string) => {
      if (!chapter || !selectedText) return;
      addHighlight({
        text: selectedText,
        color,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        page: chapter.page,
      });
      setShowToolbar(false);
      setSelectedText("");
      window.getSelection()?.removeAllRanges();
    },
    [chapter, selectedText, addHighlight]
  );

  const dismissToolbar = useCallback(() => {
    setShowToolbar(false);
    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleContentClick = useCallback(() => {
    setSearchOpen(false);
    setThemeOpen(false);
  }, [setSearchOpen, setThemeOpen]);

  // ──────────────────────────────────────────────
  //  9.  Render content with sentence-level spans
  // ──────────────────────────────────────────────

  const renderContent = useCallback(() => {
    if (!chapter || !sentenceMap) return null;

    return sentenceMap.paragraphs.map((para, pIdx) => (
      <p
        key={pIdx}
        className="mb-6"
        style={{
          textAlign: "justify",
          textIndent: pIdx > 0 ? "2em" : undefined,
          lineHeight: 1.8,
        }}
      >
        {para.sentences.map((sentence, sIdx) => {
          const globalIdx = para.startIdx + sIdx;
          const isActiveSentence = isAudioMode && audioSentenceIndex === globalIdx;

          // Sentence-level user highlight color
          let sentenceHighlightColor: string | null = null;
          const matchingHighlights = chapterHighlights.filter(
            (hl) => sentence.includes(hl.text) || hl.text.includes(sentence.trim())
          );
          if (matchingHighlights.length > 0) {
            sentenceHighlightColor = matchingHighlights[0].color;
          }

          let content: React.ReactNode = sentence;

          // Build inner highlighted spans for partial text matches
          for (const hl of chapterHighlights) {
            if (sentence.includes(hl.text)) {
              const parts = sentence.split(hl.text);
              content = (
                <>
                  {parts[0]}
                  <span
                    style={{
                      backgroundColor: `${hl.color}55`,
                      borderRadius: 2,
                      padding: "1px 0",
                      boxDecorationBreak: "clone" as React.CSSProperties["boxDecorationBreak"],
                      WebkitBoxDecorationBreak: "clone",
                    }}
                  >
                    {hl.text}
                  </span>
                  {parts.slice(1).join(hl.text)}
                </>
              );
              break;
            }
          }

          const bgColor = isActiveSentence && sentenceHighlightColor
            ? `${sentenceHighlightColor}30`
            : isActiveSentence
            ? `${t.accent}28`
            : sentenceHighlightColor
            ? `${sentenceHighlightColor}18`
            : "transparent";

          return (
            <span
              key={globalIdx}
              data-sentence-idx={globalIdx}
              style={{
                backgroundColor: bgColor,
                borderRadius: isActiveSentence || sentenceHighlightColor ? 3 : 0,
                padding: isActiveSentence || sentenceHighlightColor ? "2px 0" : 0,
                transition: "background-color 0.35s ease",
                boxDecorationBreak: "clone" as React.CSSProperties["boxDecorationBreak"],
                WebkitBoxDecorationBreak: "clone",
              }}
            >
              {content}
              {sIdx < para.sentences.length - 1 ? " " : ""}
            </span>
          );
        })}
      </p>
    ));
  }, [chapter, sentenceMap, chapterHighlights, isAudioMode, audioSentenceIndex, t.accent]);

  // ──────────────────────────────────────────────
  //  Early-exit
  // ──────────────────────────────────────────────

  if (!book || !chapter) return null;

  const translateX = -(spreadIndex * spreadWidth);

  const leftPage = spreadIndex * 2 + 1;
  const rightPage = Math.min(spreadIndex * 2 + 2, totalColumns);
  const totalPageCount = totalColumns;

  return (
    <div
      className="flex-1 flex flex-col h-full relative overflow-hidden"
      style={{ backgroundColor: t.bg }}
      onClick={handleContentClick}
    >
      {/* ── Paginated reading area ── */}
      <div
        ref={outerRef}
        className="flex-1 overflow-hidden relative"
        onMouseUp={handleMouseUp}
      >
        <div
          ref={columnsRef}
          style={{
            position: "absolute",
            top: PAD_Y,
            left: 0,
            width: "99999px",
            height: `calc(100% - ${PAD_Y * 2}px)`,
            paddingLeft: PAD_X,
            boxSizing: "border-box",
            columnWidth: `${hintColWidth}px`,
            columnGap: `${COL_GAP}px`,
            columnFill: "auto" as const,
            color: t.text,
            fontFamily: t.fontFamily,
            fontSize: `${fontSize}px`,
            transform: `translateX(${translateX}px)`,
            transition: "transform 0.3s cubic-bezier(.25,.1,.25,1)",
          }}
        >
          {renderContent()}
        </div>

        {/* Centre gutter divider */}
        <div
          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            width: 1,
            background: `linear-gradient(to bottom, transparent, ${t.border}44 15%, ${t.border}44 85%, transparent)`,
          }}
        />
      </div>

      {/* ── Page indicator ── */}
      <div
        className="text-center py-2 shrink-0 select-none"
        style={{
          color: t.pageNumColor,
          fontSize: 13,
          // Push up when audio player is open
          paddingBottom: isAudioMode ? 52 : undefined,
          transition: "padding-bottom 0.25s ease",
        }}
      >
        {totalSpreads > 1
          ? leftPage === rightPage
            ? `Page ${leftPage} of ${totalPageCount}`
            : `Pages ${leftPage}\u2013${rightPage} of ${totalPageCount}`
          : totalColumns > 1
            ? `Pages 1\u20132 of ${totalPageCount}`
            : "Page 1"}
      </div>

      {/* ── Navigation arrows ── */}
      <button
        onClick={goToPrev}
        disabled={!canGoPrev}
        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-opacity disabled:opacity-10 opacity-30 hover:opacity-70"
        style={{ color: t.text }}
      >
        <ChevronLeft size={24} />
      </button>
      <button
        onClick={goToNext}
        disabled={!canGoNext}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-opacity disabled:opacity-10 opacity-30 hover:opacity-70"
        style={{ color: t.text }}
      >
        <ChevronRight size={24} />
      </button>

      {/* ── Highlights sidebar toggle ── */}
      <button
        onClick={() =>
          setSidebarType(sidebarType === "highlights" ? null : "highlights")
        }
        className="absolute right-4 p-3 rounded-full shadow-lg transition-all hover:scale-105"
        style={{
          backgroundColor: t.toolbar,
          color: sidebarType === "highlights" ? t.accent : t.text,
          borderTop: `1px solid ${t.border}`,
          borderLeft: `1px solid ${t.border}`,
          borderRight: `1px solid ${t.border}`,
          borderBottom: `1px solid ${t.border}`,
          bottom: isAudioMode ? 60 : 40,
          transition: "bottom 0.25s ease",
        }}
        title="Saved Highlights"
      >
        <Highlighter size={18} />
        {highlights.length > 0 && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: t.accent,
              color: "#fff",
              fontSize: 10,
            }}
          >
            {highlights.length}
          </span>
        )}
      </button>

      {/* ── Highlight toolbar ── */}
      {showToolbar && selectedText && (
        <HighlightToolbar
          selectedText={selectedText}
          position={toolbarPos}
          onHighlight={handleHighlight}
          onDismiss={dismissToolbar}
        />
      )}

      {/* ── Audiobook Player (anchored to the bottom of this component) ── */}
      <AnimatePresence>
        {isAudioMode &&
          (book?.id === "frankenstein-demo" || book?.id === "pride-and-prejudice-demo" ? (
            <DemoBookPlayer />
          ) : (
            <AudiobookPlayer />
          ))}
      </AnimatePresence>
    </div>
  );
}
