/**
 * Sentence-splitting utilities for the Audio Reader.
 *
 * Both AudioPlayer and ReaderContent must agree on the exact sentence
 * boundaries, so they both call `buildSentenceMap(chapter.content)`.
 */

export interface SentenceMap {
  /** Per-paragraph sentence breakdown */
  paragraphs: { sentences: string[]; startIdx: number }[];
  /** Total number of sentences in the chapter */
  total: number;
  /** Flat array of every sentence, in order */
  flat: string[];
}

/**
 * Split chapter content (paragraphs separated by `\n\n`) into sentences.
 */
export function buildSentenceMap(content: string): SentenceMap {
  const rawParagraphs = content.split("\n\n").filter((p) => p.trim());
  let idx = 0;
  const flat: string[] = [];

  const paragraphs = rawParagraphs.map((text) => {
    const sentences = splitSentences(text.trim());
    const startIdx = idx;
    idx += sentences.length;
    flat.push(...sentences);
    return { sentences, startIdx };
  });

  return { paragraphs, total: idx, flat };
}

// ── internal ────────────────────────────────────────

function splitSentences(text: string): string[] {
  if (!text) return [];

  // Match text chunks that end with sentence-terminating punctuation
  // (period, exclamation, question mark) plus optional trailing quotes /
  // parentheses / whitespace.
  const matches = text.match(/[^.!?]*[.!?]+[\s"')\]}\u201D\u2019]*/g);

  if (!matches) return [text];

  // Merge very short fragments (<20 chars) – they're almost certainly
  // caused by abbreviations like "Mr.", "Dr.", "St." etc.
  const merged: string[] = [];
  let buffer = "";

  for (let i = 0; i < matches.length; i++) {
    buffer += matches[i];
    if (buffer.trim().length >= 20 || i === matches.length - 1) {
      merged.push(buffer.trim());
      buffer = "";
    }
  }

  if (buffer.trim()) {
    if (merged.length > 0) {
      merged[merged.length - 1] += " " + buffer.trim();
    } else {
      merged.push(buffer.trim());
    }
  }

  // Handle any trailing text after the last punctuation mark
  const totalMatched = matches.join("").length;
  if (totalMatched < text.length) {
    const remainder = text.slice(totalMatched).trim();
    if (remainder) {
      if (merged.length > 0) {
        merged[merged.length - 1] += " " + remainder;
      } else {
        merged.push(remainder);
      }
    }
  }

  return merged.filter((s) => s.length > 0);
}
