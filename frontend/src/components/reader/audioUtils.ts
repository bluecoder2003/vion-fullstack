/**
 * Sentence-splitting utilities for the Audio Reader.
 *
 * Both AudioPlayer and ReaderContent must agree on the exact sentence
 * boundaries, so they both call `buildSentenceMap(chapter.content)`.
 */

export interface SentenceMap {
  /** Per-paragraph sentence breakdown */
  paragraphs: { sentences: string[]; startIdx: number; isSpecial?: boolean; rawText: string }[];
  /** Total number of sentences in the chapter */
  total: number;
  /** Flat array of every sentence, in order */
  flat: string[];
}

export function isSpecialParagraph(text: string): boolean {
  let trimmed = text.trim();
  if (!trimmed) return true;
  // Strip surrounding underscores/asterisks that Gutenberg uses for formatting
  trimmed = trimmed.replace(/^[_*\s]+|[_*\s]+$/g, "");
  // Illustration/Frontispiece/Image/Cover Art
  if (/^\[illustration\b/i.test(trimmed)) return true;
  if (/^\[frontispiece\b/i.test(trimmed)) return true;
  if (/^\[image\b/i.test(trimmed)) return true;
  if (/^\[cover art\]/i.test(trimmed)) return true;
  // Page numbers like [page 123]
  if (/^\[page\s+\d+\]/i.test(trimmed)) return true;
  // Dividers like * * * or ---
  if (/^\*[ \t*]*\*[ \t*]*\*/.test(trimmed)) return true;
  if (/^[-_]{3,}$/.test(trimmed)) return true;

  return false;
}

/**
 * Split chapter content (paragraphs separated by `\n\n`) into sentences.
 */
export function buildSentenceMap(
  content: string,
  preSplitParagraphs?: { sentences: string[]; isSpecial?: boolean; rawText: string }[]
): SentenceMap {
  if (preSplitParagraphs && preSplitParagraphs.length > 0) {
    let idx = 0;
    const flat: string[] = [];
    const paragraphs = preSplitParagraphs.map((p) => {
      const startIdx = idx;
      if (!p.isSpecial) {
        idx += p.sentences.length;
        flat.push(...p.sentences);
      }
      return {
        sentences: p.sentences,
        startIdx,
        isSpecial: p.isSpecial,
        rawText: p.rawText,
      };
    });
    return { paragraphs, total: idx, flat };
  }

  const rawParagraphs = content.split("\n\n").filter((p) => p.trim());
  let idx = 0;
  const flat: string[] = [];

  const paragraphs = rawParagraphs.map((text) => {
    const trimmed = text.trim();
    if (isSpecialParagraph(trimmed)) {
      return { sentences: [], startIdx: idx, isSpecial: true, rawText: trimmed };
    }
    const sentences = splitSentences(trimmed);
    const startIdx = idx;
    idx += sentences.length;
    flat.push(...sentences);
    return { sentences, startIdx, rawText: trimmed };
  });

  return { paragraphs, total: idx, flat };
}

// ── internal ────────────────────────────────────────

function splitSentences(text: string): string[] {
  if (!text) return [];

  const abbreviations = new Set([
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "etc", "eg", "ie", "al",
    "col", "gen", "lt", "capt", "sgt", "st", "ave", "rd", "jan", "feb", "mar",
    "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec"
  ]);

  const parts = text.split(/([.!?]+[\s"')\]}\u201D\u2019]*)/);
  const sentences: string[] = [];
  let current = "";

  for (let i = 0; i < parts.length - 1; i += 2) {
    const chunk = parts[i];
    const punct = parts[i + 1];
    current += chunk + punct;

    const words = chunk.match(/[a-zA-Z]+/g);
    const lastWord = words ? words[words.length - 1] : "";
    const lastWordLower = lastWord.toLowerCase();
    const isPeriod = punct.startsWith(".");

    if (isPeriod && abbreviations.has(lastWordLower)) {
      continue;
    }

    if (isPeriod && lastWord.length === 1 && lastWord === lastWord.toUpperCase()) {
      continue;
    }

    const nextChunk = parts[i + 2] || "";
    if (isPeriod && nextChunk && /^\d/.test(nextChunk)) {
      continue;
    }

    sentences.push(current.trim());
    current = "";
  }

  if (parts.length % 2 !== 0) {
    current += parts[parts.length - 1];
  }
  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences.filter(Boolean);
}
