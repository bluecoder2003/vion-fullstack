"use client";

import { useCallback } from "react";
import { Check, Languages, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useReader, type LanguageType } from "./ReaderContext";
import { themes } from "./themeStyles";

const BACKEND = "http://127.0.0.1:8000";

interface LanguageOption {
  code: LanguageType;
  label: string;
  native: string;
  note?: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English",    native: "English",    note: "Original" },
  { code: "bn", label: "Bengali",    native: "বাংলা" },
  { code: "hi", label: "Hindi",      native: "हिन्दी" },
  { code: "fr", label: "French",     native: "Français" },
  { code: "es", label: "Spanish",    native: "Español" },
  { code: "de", label: "German",     native: "Deutsch" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LanguagePicker({ open, onClose }: Props) {
  const {
    theme,
    book,
    currentChapterIndex,
    language,
    setLanguage,
    translations,
    addTranslation,
    translatingKeys,
    setTranslating,
  } = useReader();
  const t = themes[theme];

  // Translate a full chapter — chunked into paragraph groups so no single
  // request exceeds Google's 5000-char cap. Same logic as ReaderContent's
  // auto-translation effect.
  const translateChapter = useCallback(
    async (chapter: { id: string; content: string }, lang: LanguageType) => {
      const cacheKey = `${chapter.id}:${lang}`;
      if (translations.has(cacheKey) || translatingKeys.has(cacheKey)) return;

      setTranslating(cacheKey, true);
      try {
        const paragraphs = chapter.content.split("\n\n").filter((p) => p.trim());
        const GROUP_CHARS = 4500;
        const groups: string[] = [];
        let current: string[] = [];
        let currentLen = 0;
        for (const p of paragraphs) {
          if (currentLen + p.length > GROUP_CHARS && current.length > 0) {
            groups.push(current.join("\n\n"));
            current = [p];
            currentLen = p.length;
          } else {
            current.push(p);
            currentLen += p.length;
          }
        }
        if (current.length > 0) groups.push(current.join("\n\n"));

        const translated: string[] = [];
        for (const group of groups) {
          const res = await fetch(`${BACKEND}/api/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: group, target_lang: lang }),
          });
          if (!res.ok) throw new Error(`Server error ${res.status}`);
          const data = await res.json();
          translated.push(data.translated);
          addTranslation(chapter.id, lang, translated.join("\n\n"));
        }
      } catch (err) {
        console.error(`Translation failed for ${chapter.id}:`, err);
      } finally {
        setTranslating(cacheKey, false);
      }
    },
    [translations, translatingKeys, addTranslation, setTranslating]
  );

  const handleSelect = useCallback(
    async (lang: LanguageType) => {
      setLanguage(lang);
      onClose();
      if (lang === "en" || !book) return;

      // 1. Translate current chapter FIRST (priority — the user is reading it now)
      const chapters = book.chapters;
      const currentIdx = currentChapterIndex;
      if (chapters[currentIdx]) {
        await translateChapter(chapters[currentIdx], lang);
      }

      // 2. Then background-translate every OTHER chapter, one at a time,
      //    so future navigation is instant. Serialized to respect Google's
      //    rate limits.
      let queue = Promise.resolve();
      for (let i = 0; i < chapters.length; i++) {
        if (i === currentIdx) continue;
        const ch = chapters[i];
        const key = `${ch.id}:${lang}`;
        if (translations.has(key) || translatingKeys.has(key)) continue;
        queue = queue.then(() => translateChapter(ch, lang));
      }
    },
    [book, currentChapterIndex, translations, translatingKeys, setLanguage, translateChapter, onClose]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="absolute right-4 top-full mt-2 z-50"
          style={{ width: 280 }}
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ backgroundColor: t.popover, border: `1px solid ${t.border}` }}
          >
            {/* Header */}
            <div
              className="px-4 py-3 border-b flex items-center gap-2"
              style={{ borderColor: t.border }}
            >
              <Languages size={14} style={{ color: t.accent }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: t.popoverText }}>
                Reading Language
              </span>
            </div>

            {/* Language list */}
            <div className="flex flex-col p-2 gap-1">
              {LANGUAGES.map((lang) => {
                const isSelected = language === lang.code;
                const chapter = book?.chapters[currentChapterIndex];
                const cacheKey = chapter ? `${chapter.id}:${lang.code}` : "";
                const isTranslating = translatingKeys.has(cacheKey);

                return (
                  <button
                    key={lang.code}
                    onClick={() => handleSelect(lang.code)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left hover:opacity-90"
                    style={{
                      backgroundColor: isSelected ? `${t.accent}15` : "transparent",
                      border: `1px solid ${isSelected ? t.accent + "40" : "transparent"}`,
                    }}
                  >
                    {/* Check indicator */}
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: isSelected ? t.accent : `${t.border}66` }}
                    >
                      {isSelected && <Check size={10} color="#fff" strokeWidth={3} />}
                    </div>

                    {/* Native label + English label */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: isSelected ? t.accent : t.popoverText,
                          }}
                        >
                          {lang.native}
                        </span>
                        {lang.note && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{
                              backgroundColor: `${t.border}44`,
                              color: t.popoverText,
                              opacity: 0.6,
                            }}
                          >
                            {lang.note}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: t.popoverText, opacity: 0.5 }}>
                        {lang.label}
                      </div>
                    </div>

                    {/* Translating spinner */}
                    {isTranslating && (
                      <Loader2 size={13} className="animate-spin" style={{ color: t.accent }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer note */}
            <div
              className="px-4 py-2 border-t"
              style={{
                borderColor: t.border,
                fontSize: 10,
                color: t.popoverText,
                opacity: 0.4,
              }}
            >
              First-time translation may take a minute while the model loads.
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
