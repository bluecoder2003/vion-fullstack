// Internet Archive API integration for fetching public domain books

export interface ArchiveSearchResult {
  identifier: string;
  title: string;
  creator?: string;
  year?: string;
  cover_i?: number;
}

export interface ArchiveSearchResponse {
  response: {
    numFound: number;
    start: number;
    docs: ArchiveSearchResult[];
  };
}

export interface ArchiveFile {
  name: string;
  format: string;
  size?: string;
  source?: string;
}

export interface ArchiveMetadata {
  metadata: {
    identifier: string;
    title: string;
    creator?: string;
    description?: string;
    subject?: string | string[];
    date?: string;
    language?: string;
  };
  files: ArchiveFile[];
}

const BASE = "https://archive.org";

export async function searchBooks(
  query: string,
  page = 1,
  rows = 20
): Promise<ArchiveSearchResponse> {
  const q = query.trim()
    ? `${query} AND mediatype:texts AND collection:gutenberg`
    : "mediatype:texts AND collection:gutenberg";

  const params = new URLSearchParams({
    q,
    "fl[]": "identifier",
    output: "json",
    rows: String(rows),
    page: String(page),
  });

  // Need multiple fl[] params
  const url = `${BASE}/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&rows=${rows}&page=${page}&output=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

/**
 * Enrich IA search results with Open Library cover images.
 * Does a single batch query to Open Library and matches by title.
 */
export async function enrichWithCovers(
  results: ArchiveSearchResult[]
): Promise<ArchiveSearchResult[]> {
  if (results.length === 0) return results;

  // Build a combined title query for Open Library
  // Use the first few words of each title for matching
  const titles = results.map((r) => r.title).filter(Boolean);
  if (titles.length === 0) return results;

  try {
    // Search Open Library with the first result's general category
    // We'll do individual quick lookups for better accuracy
    const enriched = await Promise.all(
      results.map(async (result) => {
        try {
          const searchTitle = result.title
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .slice(0, 4)
            .join("+");
          const olUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(searchTitle)}&fields=title,cover_i&limit=1`;
          const res = await fetch(olUrl);
          if (!res.ok) return result;
          const data = await res.json();
          if (data.docs?.[0]?.cover_i) {
            return { ...result, cover_i: data.docs[0].cover_i };
          }
          return result;
        } catch {
          return result;
        }
      })
    );
    return enriched;
  } catch {
    return results;
  }
}

export async function fetchMetadata(
  identifier: string
): Promise<ArchiveMetadata> {
  const res = await fetch(`${BASE}/metadata/${identifier}`);
  if (!res.ok) throw new Error(`Metadata fetch failed: ${res.status}`);
  return res.json();
}

export function getCoverUrl(identifier: string, cover_i?: number): string {
  if (cover_i) {
    return `https://covers.openlibrary.org/b/id/${cover_i}-M.jpg`;
  }
  return `${BASE}/services/img/${identifier}`;
}

export function getDownloadUrl(
  identifier: string,
  filename: string
): string {
  return `${BASE}/download/${identifier}/${encodeURIComponent(filename)}`;
}

/**
 * Find the best readable text file from archive metadata.
 * Picks the LARGEST suitable .txt file — small files are almost always
 * readme / license / metadata, not the actual book.
 * Minimum 10 KB to qualify as a plausible full book.
 */
export function findTextFile(files: ArchiveFile[]): ArchiveFile | null {
  // Filter to only .txt files that aren't clearly metadata
  const txtFiles = files.filter((f) => {
    const lower = f.name.toLowerCase();
    return (
      lower.endsWith(".txt") &&
      !lower.includes("readme") &&
      !lower.includes("license") &&
      !lower.includes("encoding") &&
      !lower.includes("metadata") &&
      !lower.includes("filelist")
    );
  });

  // Sort by file size descending — the largest .txt is the full book
  const withSize = txtFiles
    .map((f) => ({ file: f, bytes: parseInt(f.size || "0", 10) }))
    .filter((f) => f.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);

  // Minimum 10 KB to be considered a real book
  const MIN_BOOK_BYTES = 10_000;

  // Prefer UTF-8 among the large files
  const largeUtf8 = withSize.find(
    (f) =>
      f.bytes >= MIN_BOOK_BYTES &&
      (f.file.name.includes("utf-8") || f.file.name.includes("utf8"))
  );
  if (largeUtf8) return largeUtf8.file;

  // Otherwise the largest file above threshold
  const largest = withSize.find((f) => f.bytes >= MIN_BOOK_BYTES);
  if (largest) return largest.file;

  // Fallback: look for HTML files above threshold
  const htmlFiles = files
    .filter((f) => {
      const lower = f.name.toLowerCase();
      return (
        (lower.endsWith(".htm") || lower.endsWith(".html")) &&
        !lower.includes("readme")
      );
    })
    .map((f) => ({ file: f, bytes: parseInt(f.size || "0", 10) }))
    .filter((f) => f.bytes >= MIN_BOOK_BYTES)
    .sort((a, b) => b.bytes - a.bytes);

  if (htmlFiles.length > 0) return htmlFiles[0].file;

  return null;
}

/**
 * Find the best EPUB file from archive metadata.
 * EPUBs contain complete books with proper chapter structure.
 */
export function findEpubFile(files: ArchiveFile[]): ArchiveFile | null {
  const epubFiles = files
    .filter((f) => {
      const lower = f.name.toLowerCase();
      return (
        lower.endsWith(".epub") &&
        !lower.includes("readme") &&
        !lower.includes("sample")
      );
    })
    .map((f) => ({ file: f, bytes: parseInt(f.size || "0", 10) }))
    .sort((a, b) => b.bytes - a.bytes);

  // Prefer the largest EPUB file (most likely the complete book)
  if (epubFiles.length > 0) return epubFiles[0].file;
  return null;
}

/**
 * Download and parse a text file into chapters.
 * Throws if the downloaded content is too short to be a real book.
 */
export async function downloadAndParseBook(
  identifier: string,
  file: ArchiveFile,
  title: string,
  author: string
) {
  const url = getDownloadUrl(identifier, file.name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  let text = await res.text();

  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // If HTML, strip tags
  if (file.name.endsWith(".htm") || file.name.endsWith(".html")) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    text = doc.body.textContent || text;
  }

  const book = parseTextIntoChapters(text, identifier, title, author);

  // Validate: reject books with too little actual content.
  // A real full-length book should have at least ~5 000 chars after
  // stripping Gutenberg headers/footers.
  const totalChars = book.chapters.reduce(
    (sum, ch) => sum + ch.content.length,
    0
  );
  if (totalChars < 5_000) {
    throw new Error("CONTENT_TOO_SHORT");
  }

  return book;
}

/**
 * Attempt to split text into chapters using common headings.
 */
function parseTextIntoChapters(
  text: string,
  identifier: string,
  title: string,
  author: string
) {
  // Normalize line endings
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Try to strip Project Gutenberg header/footer
  const startMarkers = [
    "*** START OF THE PROJECT GUTENBERG",
    "*** START OF THIS PROJECT GUTENBERG",
    "*END*THE SMALL PRINT",
  ];
  const endMarkers = [
    "*** END OF THE PROJECT GUTENBERG",
    "*** END OF THIS PROJECT GUTENBERG",
    "End of the Project Gutenberg",
    "End of Project Gutenberg",
  ];

  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      const lineEnd = text.indexOf("\n", idx);
      text = text.slice(lineEnd + 1);
      break;
    }
  }
  for (const marker of endMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      text = text.slice(0, idx);
      break;
    }
  }

  text = text.trim();

  // Try to detect chapter breaks
  const chapterRegex =
    /^(CHAPTER|Chapter|chapter|BOOK|Book|PART|Part|LETTER|Letter|ACT|Act|VOLUME|Volume|CANTO|Canto|SCENE|Scene|SECTION|Section|STAVE|Stave)\s+[IVXLCDM\d]+[.:\s—\-]*/gm;

  const matches: { index: number; heading: string }[] = [];
  let match;
  while ((match = chapterRegex.exec(text)) !== null) {
    // Grab the full line as heading
    const lineEnd = text.indexOf("\n", match.index);
    const heading = text
      .slice(match.index, lineEnd > -1 ? lineEnd : match.index + 80)
      .trim();
    matches.push({ index: match.index, heading });
  }

  const chapters: {
    id: string;
    title: string;
    page: number;
    content: string;
  }[] = [];

  if (matches.length >= 3) {
    // We found chapter breaks
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end =
        i + 1 < matches.length ? matches[i + 1].index : text.length;
      const content = text.slice(start, end).trim();
      if (content.length < 50) continue; // skip tiny fragments

      chapters.push({
        id: `ch-${i}`,
        title:
          matches[i].heading.length > 60
            ? matches[i].heading.slice(0, 60) + "…"
            : matches[i].heading,
        page: i + 1,
        content,
      });
    }

    // If there's significant text before the first chapter, add it as a preface
    if (matches[0].index > 500) {
      const preface = text.slice(0, matches[0].index).trim();
      if (preface.length > 100) {
        chapters.unshift({
          id: "preface",
          title: "Preface",
          page: 0,
          content: preface,
        });
        // Re-number pages
        chapters.forEach((ch, i) => (ch.page = i + 1));
      }
    }
  }

  // Fallback: split by character count to produce substantial chapters
  // Aim for ~5000 chars per chapter (roughly 2-3 printed pages each)
  if (chapters.length === 0) {
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
    const CHARS_PER_CHAPTER = 5000;
    let currentChapter: string[] = [];
    let currentLen = 0;
    let chIdx = 1;

    for (const para of paragraphs) {
      currentChapter.push(para);
      currentLen += para.length;

      if (currentLen >= CHARS_PER_CHAPTER) {
        chapters.push({
          id: `section-${chIdx}`,
          title: `Section ${chIdx}`,
          page: chIdx,
          content: currentChapter.join("\n\n"),
        });
        chIdx++;
        currentChapter = [];
        currentLen = 0;
      }
    }

    // Push remaining content as the last chapter
    if (currentChapter.length > 0) {
      chapters.push({
        id: `section-${chIdx}`,
        title: `Section ${chIdx}`,
        page: chIdx,
        content: currentChapter.join("\n\n"),
      });
    }
  }

  // Ensure we have at least 1 chapter
  if (chapters.length === 0) {
    chapters.push({
      id: "full",
      title: title,
      page: 1,
      content: text, // no cap — include the full text
    });
  }

  return {
    id: identifier,
    title,
    author: author || "Unknown",
    chapters,
    totalPages: chapters.length,
  };
}