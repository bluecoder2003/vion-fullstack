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
    audioWordIndex,
    // Translation
    language,
    translations,
    translatingKeys,
    addTranslation,
    setTranslating,
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

  const [colOriginalPages, setColOriginalPages] = useState<(number | null)[]>([]);

  /*
   * hintColWidth – the CSS column-width value we REQUEST.
   */
  const [hintColWidth, setHintColWidth] = useState(400);

  const chapter = book?.chapters[currentChapterIndex];

  // Translation lookup — swaps in translated content when a non-English language
  // is active and the translation is cached. Falls back to original text otherwise.
  const translatedContent = useMemo(() => {
    if (!chapter || language === "en") return null;
    return translations.get(`${chapter.id}:${language}`) ?? null;
  }, [chapter, language, translations]);

  const isTranslating = useMemo(() => {
    if (!chapter || language === "en") return false;
    return translatingKeys.has(`${chapter.id}:${language}`);
  }, [chapter, language, translatingKeys]);

  // ── Sentence map (shared with AudioPlayer for identical indexing) ──
  // When translated, we build a NEW sentence map from the translated text.
  // Audio still uses the English map — highlighting is approximate in translation mode.
  const sentenceMap = useMemo(() => {
    if (!chapter) return null;
    if (translatedContent) return buildSentenceMap(translatedContent);
    return buildSentenceMap(chapter.content, chapter.paragraphs);
  }, [chapter, translatedContent]);

  const paragraphOriginalPages = useMemo(() => {
    if (!sentenceMap) return [];
    
    // Find the first page marker in the chapter to use as a baseline
    let firstPageNum: number | null = null;
    for (const para of sentenceMap.paragraphs) {
      if (para.isSpecial) {
        const match = para.rawText.match(/^\[page\s+(\d+)\]/i);
        if (match) {
          firstPageNum = parseInt(match[1], 10);
          break;
        }
      }
    }
    
    let currentPageNum = firstPageNum !== null ? Math.max(1, firstPageNum - 1) : null;
    
    return sentenceMap.paragraphs.map((para) => {
      if (para.isSpecial) {
        const match = para.rawText.match(/^\[page\s+(\d+)\]/i);
        if (match) {
          currentPageNum = parseInt(match[1], 10);
        }
      }
      return currentPageNum;
    });
  }, [sentenceMap]);

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

  // Auto-translate the current chapter when the language changes or when
  // navigating to a chapter whose translation is not yet cached.
  useEffect(() => {
    if (!chapter || language === "en") return;
    const key = `${chapter.id}:${language}`;
    if (translations.has(key) || translatingKeys.has(key)) return;

    let cancelled = false;
    setTranslating(key, true);
    (async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chapter.content, target_lang: language }),
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = await res.json();
        if (!cancelled) addTranslation(chapter.id, language, data.translated);
      } catch (err) {
        console.error("Translation failed:", err);
      } finally {
        if (!cancelled) setTranslating(key, false);
      }
    })();
    return () => { cancelled = true; };
  }, [chapter, language, translations, translatingKeys, addTranslation, setTranslating]);

  const leftPageOriginal = colOriginalPages[spreadIndex * 2] ?? (spreadIndex * 2 + 1);
  const rightPageOriginal = colOriginalPages[spreadIndex * 2 + 1] ?? Math.min(spreadIndex * 2 + 2, totalColumns);

  useEffect(() => {
    setCurrentPage(leftPageOriginal);
  }, [leftPageOriginal, setCurrentPage]);

  const measure = useCallback(() => {
    const container = columnsRef.current;
    if (!container) return;

    const paragraphs = container.querySelectorAll("p");
    if (paragraphs.length === 0) {
      setTotalSpreads(1);
      setTotalColumns(1);
      setSpreadWidth(0);
      setColOriginalPages([]);
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
      setColOriginalPages([]);
      return;
    }

    const lastRect = lastRects[lastRects.length - 1];
    const contentLeft = lastRect.left - containerRect.left - PAD_X;
    const lastColIdx = Math.max(0, Math.round(contentLeft / colSlot));
    const cols = lastColIdx + 1;
    const spreads = Math.max(1, Math.ceil(cols / 2));

    // Calculate original page numbers per column
    const childElems = Array.from(container.children) as HTMLElement[];
    const colOriginals: (number | null)[] = new Array(cols).fill(null);
    childElems.forEach((elem, pIdx) => {
      const rects = elem.getClientRects();
      if (rects.length === 0) return;
      const rect = rects[0];
      const elemLeft = rect.left - containerRect.left - PAD_X;
      const elemColIdx = Math.max(0, Math.round(elemLeft / colSlot));
      
      const origPage = paragraphOriginalPages[pIdx];
      if (origPage !== null && origPage !== undefined) {
        if (elemColIdx < colOriginals.length) {
          colOriginals[elemColIdx] = origPage;
        }
      }
    });

    // Fill forward
    let lastPage: number | null = null;
    for (let c = 0; c < colOriginals.length; c++) {
      if (colOriginals[c] !== null) {
        lastPage = colOriginals[c];
      } else {
        colOriginals[c] = lastPage;
      }
    }

    // Fill backward
    let firstKnownPage: number | null = null;
    for (let c = 0; c < colOriginals.length; c++) {
      if (colOriginals[c] !== null) {
        firstKnownPage = colOriginals[c];
        break;
      }
    }
    if (firstKnownPage !== null) {
      for (let c = 0; c < colOriginals.length; c++) {
        if (colOriginals[c] === null) {
          colOriginals[c] = Math.max(1, firstKnownPage - 1);
        } else {
          break;
        }
      }
    }

    setSpreadWidth(sw);
    setTotalColumns(cols);
    setTotalSpreads(spreads);
    setColOriginalPages(colOriginals);
  }, [paragraphOriginalPages]);

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

  // Count [Illustration:] markers in all chapters before the current one so
  // that illustIdx correctly continues from where the previous chapter left off.
  const illustStartIdx = useMemo(() => {
    if (!book) return 0;
    let count = 0;
    for (let i = 0; i < currentChapterIndex; i++) {
      const content = book.chapters[i]?.content ?? "";
      const matches = content.split("\n\n").filter(p => {
        const t = p.trim();
        return /^\[(illustration|frontispiece|image|cover art)\b/i.test(t);
      });
      count += matches.length;
    }
    return count;
  }, [book, currentChapterIndex]);

  const renderContent = useCallback(() => {
    if (!chapter || !sentenceMap) return null;

    let illustIdx = illustStartIdx;

    return sentenceMap.paragraphs.map((para, pIdx) => {
      if (para.isSpecial) {
        const textToMatch = para.rawText;
        if (/^\[(illustration|frontispiece|image|cover art)\b/i.test(textToMatch)) {
          const descMatch = textToMatch.match(/^\[(?:illustration|frontispiece|image|cover art):?\s*(.*?)\]?\s*$/i);
          const altText = descMatch?.[1]?.trim() ?? "Illustration";
          const imgUrl = book?.illustrations?.[illustIdx];
          illustIdx++;

          if (imgUrl) {
            return (
              <figure
                key={pIdx}
                style={{
                  breakInside: "avoid",
                  margin: "1.5em 0",
                  textAlign: "center",
                }}
              >
                <img
                  src={imgUrl}
                  alt={altText}
                  loading="lazy"
                  style={{
                    maxWidth: "100%",
                    height: "auto",
                    borderRadius: 4,
                    display: "block",
                    margin: "0 auto",
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    e.currentTarget.nextElementSibling?.setAttribute(
                      "data-load-failed",
                      "1"
                    );
                  }}
                />
                {altText && (
                  <figcaption
                    style={{
                      fontSize: "0.75em",
                      fontStyle: "italic",
                      opacity: 0.55,
                      marginTop: 6,
                      color: t.text,
                    }}
                  >
                    {altText}
                  </figcaption>
                )}
              </figure>
            );
          }

          // No image URL — render a styled placeholder with the description
          return (
            <div
              key={pIdx}
              style={{
                breakInside: "avoid",
                margin: "1.5em 0",
                padding: "0.6em 1em",
                borderRadius: 6,
                border: `1px dashed ${t.border}`,
                backgroundColor: `${t.border}22`,
                fontSize: "0.8em",
                fontStyle: "italic",
                color: t.text,
                opacity: 0.55,
                textAlign: "center",
              }}
            >
              {altText || "Illustration"}
            </div>
          );
        } else if (/^\*[ \t*]*\*[ \t*]*\*/.test(textToMatch) || /^[-_]{3,}$/.test(textToMatch)) {
          return (
            <div
              key={pIdx}
              style={{
                textAlign: "center",
                margin: "1.5em 0",
                fontSize: "1.2em",
                letterSpacing: "0.5em",
                opacity: 0.5,
                color: t.text,
              }}
            >
              * * *
            </div>
          );
        } else if (/^\[page\s+\d+\]/i.test(textToMatch)) {
          const match = textToMatch.match(/^\[page\s+(\d+)\]/i);
          const pageNum = match?.[1] ?? "";
          return (
            <div
              key={pIdx}
              style={{
                textAlign: "center",
                fontSize: "0.75em",
                color: t.text,
                opacity: 0.4,
                margin: "1em 0",
                userSelect: "none",
              }}
            >
              Page {pageNum}
            </div>
          );
        }

        // Fallback for other special paragraphs
        return (
          <p
            key={pIdx}
            className="mb-6 italic"
            style={{
              textAlign: "justify",
              textIndent: pIdx > 0 ? "2em" : undefined,
              lineHeight: 1.8,
              opacity: 0.7,
            }}
          >
            {para.rawText}
          </p>
        );
      }

      return (
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

            let sentenceHighlightColor: string | null = null;
            const matchingHighlights = chapterHighlights.filter(
              (hl) => sentence.includes(hl.text) || hl.text.includes(sentence.trim())
            );
            if (matchingHighlights.length > 0) {
              sentenceHighlightColor = matchingHighlights[0].color;
            }

            let content: React.ReactNode = sentence;

            if (isActiveSentence && audioWordIndex >= 0) {
              // Word-by-word active sentence rendering
              const words = sentence.split(/(\s+)/);
              let wordCounter = 0;
              content = words.map((word, wIdx) => {
                const isWord = /\S/.test(word);
                if (isWord) {
                  const currentWordIdx = wordCounter;
                  wordCounter++;
                  const isCurrentWord = currentWordIdx === audioWordIndex;
                  return (
                    <span
                      key={wIdx}
                      style={{
                        backgroundColor: isCurrentWord ? `${t.accent}44` : "transparent",
                        color: isCurrentWord ? t.accent : "inherit",
                        fontWeight: isCurrentWord ? 600 : "inherit",
                        borderRadius: 2,
                        padding: "0 2px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {word}
                    </span>
                  );
                } else {
                  return word;
                }
              });
            } else {
              // Standard static highlights rendering
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
            }

            const bgColor =
              isActiveSentence && sentenceHighlightColor
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
                onClick={() => {
                  if (isAudioMode) {
                    setAudioSentenceIndex(globalIdx);
                  }
                }}
                style={{
                  backgroundColor: bgColor,
                  borderRadius: isActiveSentence || sentenceHighlightColor ? 3 : 0,
                  padding: isActiveSentence || sentenceHighlightColor ? "2px 0" : 0,
                  transition: "background-color 0.35s ease",
                  boxDecorationBreak: "clone" as React.CSSProperties["boxDecorationBreak"],
                  WebkitBoxDecorationBreak: "clone",
                  cursor: isAudioMode ? "pointer" : "inherit",
                }}
              >
                {content}
                {sIdx < para.sentences.length - 1 ? " " : ""}
              </span>
            );
          })}
        </p>
      );
    });
  }, [chapter, sentenceMap, chapterHighlights, isAudioMode, audioSentenceIndex, audioWordIndex, t.accent, t.text, t.border, book]);

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
      {/* Translation loading overlay */}
      {isTranslating && (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none"
          style={{ backgroundColor: `${t.bg}e6` }}
        >
          <div
            className="animate-spin rounded-full h-8 w-8 border-2 mb-3"
            style={{
              borderColor: `${t.border}`,
              borderTopColor: t.accent,
            }}
          />
          <div style={{ color: t.text, fontSize: 14, fontWeight: 500 }}>
            Translating…
          </div>
          <div style={{ color: t.text, fontSize: 11, opacity: 0.5, marginTop: 4 }}>
            First-time translation loads the language model
          </div>
        </div>
      )}

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
            fontFamily:
              language === "bn"
                ? `"Noto Sans Bengali", "Hind Siliguri", ${t.fontFamily}`
                : language === "hi"
                ? `"Noto Sans Devanagari", "Hind", ${t.fontFamily}`
                : t.fontFamily,
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
        {colOriginalPages.length > 0 && colOriginalPages[spreadIndex * 2] !== null && colOriginalPages[spreadIndex * 2] !== undefined
          ? leftPageOriginal === rightPageOriginal
            ? `Page ${leftPageOriginal}`
            : `Pages ${leftPageOriginal}\u2013${rightPageOriginal}`
          : totalSpreads > 1
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
