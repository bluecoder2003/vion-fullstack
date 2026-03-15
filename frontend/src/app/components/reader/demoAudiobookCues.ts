import type { Book } from "./ReaderContext";
import { buildSentenceMap } from "./audioUtils";

export interface DemoCue {
  startTime: number;
  chapterIndex: number;
  sentenceIndex: number;
}

interface CueSeed {
  chapterIndex: number;
  sentenceIndex: number;
  weight: number;
}

interface DemoCueOptions {
  chapterLimit?: number;
}

const BASE_PARAGRAPH_WEIGHT = 24;
const WORD_WEIGHT = 1.35;
const SENTENCE_WEIGHT = 9;
const PAUSE_WEIGHT = 1.75;

export function buildTimedDemoCues(
  book: Book,
  duration: number,
  options?: DemoCueOptions
): DemoCue[] {
  if (!book.chapters.length || duration <= 0) return [];

  const seeds: CueSeed[] = [];
  const chapterLimit = options?.chapterLimit ?? book.chapters.length;

  book.chapters.slice(0, chapterLimit).forEach((chapter, chapterIndex) => {
    const sentenceMap = buildSentenceMap(chapter.content);

    sentenceMap.paragraphs.forEach((paragraph) => {
      const paragraphText = paragraph.sentences.join(" ").trim();
      if (!paragraphText) return;

      seeds.push({
        chapterIndex,
        sentenceIndex: paragraph.startIdx,
        weight: estimateParagraphWeight(paragraphText, paragraph.sentences.length),
      });
    });
  });

  if (!seeds.length) return [];

  const totalWeight = seeds.reduce((sum, cue) => sum + cue.weight, 0);
  let cumulativeWeight = 0;

  return seeds.map((cue, index) => {
    const startTime =
      index === 0 ? 0 : (cumulativeWeight / totalWeight) * duration;
    cumulativeWeight += cue.weight;

    return {
      startTime,
      chapterIndex: cue.chapterIndex,
      sentenceIndex: cue.sentenceIndex,
    };
  });
}

function estimateParagraphWeight(text: string, sentenceCount: number): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const pauses = (text.match(/[,:;—-]/g) || []).length;

  return (
    BASE_PARAGRAPH_WEIGHT +
    words * WORD_WEIGHT +
    sentenceCount * SENTENCE_WEIGHT +
    pauses * PAUSE_WEIGHT
  );
}
