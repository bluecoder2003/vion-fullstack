import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Book } from "./ReaderContext";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function parsePdf(
  source: ArrayBuffer,
  fallbackTitle?: string
): Promise<Book> {
  const pdf = await pdfjsLib.getDocument({ data: source }).promise;
  const pageTexts: { page: number; text: string }[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str?: string; hasEOL?: boolean }>;

    let text = "";
    for (const item of items) {
      const part = item.str ?? "";
      if (!part) continue;
      text += part;
      text += item.hasEOL ? "\n" : " ";
    }

    text = text
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text.length > 20) {
      pageTexts.push({ page: pageNumber, text });
    }
  }

  if (pageTexts.length === 0) {
    throw new Error("Could not extract readable text from this PDF.");
  }

  const targetChapters = Math.min(12, pageTexts.length);
  const chunkSize = Math.max(1, Math.ceil(pageTexts.length / targetChapters));

  const chapters: Book["chapters"] = [];
  for (let i = 0; i < pageTexts.length; i += chunkSize) {
    const chunk = pageTexts.slice(i, i + chunkSize);
    chapters.push({
      id: `pdf-ch-${i}`,
      title:
        chunk.length === 1
          ? `Page ${chunk[0].page}`
          : `Pages ${chunk[0].page}-${chunk[chunk.length - 1].page}`,
      page: chunk[0].page,
      content: chunk.map((entry) => entry.text).join("\n\n"),
    });
  }

  return {
    id: `pdf-${Date.now()}`,
    title: fallbackTitle || "Untitled PDF",
    author: "Unknown",
    chapters,
    totalPages: pdf.numPages,
  };
}
