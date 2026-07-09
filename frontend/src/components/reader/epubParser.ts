/**
 * EPUB Parser — uses epubjs to extract chapters from .epub files.
 *
 * Works with both ArrayBuffer (local uploads) and remote URLs.
 *
 * Strategy: use epubjs for metadata/TOC/spine parsing, then read
 * raw XHTML directly from the underlying JSZip archive (which is
 * reliable regardless of how section URLs are resolved internally).
 */
import ePub from "epubjs";
import type { Book } from "./ReaderContext";

/** Strip HTML tags and decode common entities, returning clean text. */
function htmlToText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Remove <style>, <script>, and image elements
  doc
    .querySelectorAll("style, script, img, svg, figure, figcaption, image")
    .forEach((el) => el.remove());

  // Walk through block elements and add paragraph breaks
  const blocks = doc.querySelectorAll(
    "p, div, h1, h2, h3, h4, h5, h6, li, blockquote, br"
  );
  blocks.forEach((el) => {
    if (el.tagName !== "BR") {
      el.insertAdjacentText("beforebegin", "\n\n");
    } else {
      el.replaceWith("\n");
    }
  });

  let text = doc.body.textContent || "";

  // Normalize whitespace
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/**
 * Try multiple path variants to find a file in the JSZip archive.
 * EPUBs can have files at "OEBPS/chapter1.xhtml", "chapter1.xhtml",
 * "OPS/chapter1.xhtml", etc. — and the href might or might not include
 * a directory prefix.
 */
function findInZip(zip: any, href: string): any | null {
  // Decode URI components
  const decoded = decodeURIComponent(href);

  // Try direct match first
  let entry = zip.file(decoded);
  if (entry) return entry;

  // Try without leading slash
  if (decoded.startsWith("/")) {
    entry = zip.file(decoded.slice(1));
    if (entry) return entry;
  }

  // Try a case-insensitive search through all files
  const lower = decoded.toLowerCase().replace(/^\//, "");
  const allFiles: string[] = [];
  zip.forEach((relativePath: string) => {
    allFiles.push(relativePath);
  });

  // Exact match on basename
  const match = allFiles.find(
    (f) => f.toLowerCase() === lower || f.toLowerCase().endsWith("/" + lower)
  );
  if (match) return zip.file(match);

  return null;
}

/**
 * Parse an EPUB into our Book format.
 */
export async function parseEpub(
  source: ArrayBuffer | string,
  fallbackTitle?: string
): Promise<Book> {
  const epub = ePub(source as any);
  await epub.ready;

  // Get metadata
  const meta = await epub.loaded.metadata;
  const title = meta.title || fallbackTitle || "Untitled";
  const author = (meta as any).creator || "Unknown";

  // Get table of contents
  const nav = await epub.loaded.navigation;
  const toc = nav?.toc ?? [];

  // Build a map of href → toc label for chapter titles
  const tocMap = new Map<string, string>();
  const flattenToc = (items: typeof toc) => {
    for (const item of items) {
      const href = item.href?.split("#")[0];
      if (href && item.label) {
        tocMap.set(href, item.label.trim());
        // Also store just the filename for fuzzy matching
        const basename = href.split("/").pop() || "";
        if (basename) tocMap.set(basename, item.label.trim());
      }
      if (item.subitems?.length) flattenToc(item.subitems);
    }
  };
  flattenToc(toc);

  // Access the underlying JSZip archive
  const archive = (epub as any).archive;
  const zip = archive?.zip;

  // Collect spine items
  const spine = epub.spine as any;
  const spineItems: any[] = [];
  spine.each((section: any) => {
    spineItems.push(section);
  });

  const chapters: Book["chapters"] = [];
  const illustrations: string[] = [];

  for (let i = 0; i < spineItems.length; i++) {
    const section = spineItems[i];
    const href = section.href;
    if (!href) continue;

    try {
      let html: string | null = null;

      // Strategy 1: Read directly from the ZIP archive (most reliable)
      if (zip) {
        const zipEntry = findInZip(zip, href);
        if (zipEntry) {
          html = await zipEntry.async("string");
        }
      }

      // Strategy 2: Try section.render() with book's load function
      if (!html) {
        try {
          html = await section.render(epub.load.bind(epub));
        } catch {
          // ignore
        }
      }

      // Strategy 3: Try section.render() with no arguments
      if (!html) {
        try {
          html = await section.render();
        } catch {
          // ignore
        }
      }

      if (!html) continue;

      // ── Extract illustration images from this chapter's HTML ──
      if (zip) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const chapterDir = href.includes("/")
          ? href.substring(0, href.lastIndexOf("/") + 1)
          : "";

        for (const img of Array.from(doc.querySelectorAll("img, image"))) {
          // SVG <image> uses xlink:href or href; HTML <img> uses src
          const src =
            img.getAttribute("src") ||
            img.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
            img.getAttribute("href");
          if (!src || src.startsWith("data:") || /\blogo\b|\bbullet\b|\bbanner\b/i.test(src)) continue;

          // Resolve relative path against the chapter's directory and normalise ../
          const raw = src.startsWith("/") ? src.slice(1) : chapterDir + src.replace(/^\.\//, "");
          const resolved = raw
            .split("/")
            .reduce<string[]>((acc, seg) => {
              if (seg === "..") acc.pop();
              else if (seg !== ".") acc.push(seg);
              return acc;
            }, [])
            .join("/");

          const entry = findInZip(zip, resolved);
          if (!entry) continue;

          try {
            const blob: Blob = await entry.async("blob");
            illustrations.push(URL.createObjectURL(blob));
          } catch {
            // ignore single image failures
          }
        }
      }

      const text = htmlToText(html);
      if (text.length < 30) continue;

      // Find TOC label for this section
      const sectionHref = href.split("#")[0];
      const sectionBasename = sectionHref.split("/").pop() || "";
      let chapterTitle =
        tocMap.get(sectionHref) || tocMap.get(sectionBasename);

      // If no TOC entry, try to extract from first heading in HTML
      if (!chapterTitle) {
        const headingMatch = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i);
        if (headingMatch) {
          const tmp = document.createElement("div");
          tmp.innerHTML = headingMatch[1];
          chapterTitle = tmp.textContent?.trim();
        }
      }

      if (!chapterTitle) {
        chapterTitle = `Chapter ${chapters.length + 1}`;
      }

      chapters.push({
        id: `epub-ch-${i}`,
        title: chapterTitle,
        page: chapters.length + 1,
        content: text,
      });
    } catch (err) {
      console.warn(`Skipped spine item ${i} (${href}):`, err);
    }
  }

  if (chapters.length === 0) {
    // Last resort: dump ALL xhtml/html files from the ZIP
    if (zip) {
      const htmlFiles: { name: string; content: string }[] = [];
      const promises: Promise<void>[] = [];

      zip.forEach((path: string, file: any) => {
        if (
          /\.(xhtml|html|htm|xml)$/i.test(path) &&
          !file.dir &&
          !/nav|toc|ncx|opf|metadata/i.test(path)
        ) {
          promises.push(
            file.async("string").then((content: string) => {
              htmlFiles.push({ name: path, content });
            })
          );
        }
      });

      await Promise.all(promises);
      htmlFiles.sort((a, b) => a.name.localeCompare(b.name));

      for (const { name, content } of htmlFiles) {
        const text = htmlToText(content);
        if (text.length < 50) continue;

        const basename = name.split("/").pop()?.replace(/\.\w+$/, "") || "";
        const chapterTitle = tocMap.get(basename) || `Section ${chapters.length + 1}`;

        chapters.push({
          id: `epub-zip-${chapters.length}`,
          title: chapterTitle,
          page: chapters.length + 1,
          content: text,
        });
      }
    }
  }

  if (chapters.length === 0) {
    throw new Error("Could not extract any readable content from this EPUB.");
  }

  // Drop front-matter spine items (cover, title page, copyright, etc.) that
  // appear before the first real chapter.  A "real" chapter either has a title
  // matching common chapter keywords, or has enough content to be substantive.
  const FRONT_MATTER_TITLE =
    /^(cover|title[\s\-]?page?|copyright(\s*page)?|half[\s\-]title|frontispiece|colophon|also[\s\-]by|about[\s\-]the|publisher|credits?)$/i;

  const hasRealChapters = chapters.some(
    (ch) => ch.content.trim().length > 300 && !FRONT_MATTER_TITLE.test(ch.title.trim())
  );

  const finalChapters = hasRealChapters
    ? chapters.filter((ch) => {
        const isFrontMatter =
          FRONT_MATTER_TITLE.test(ch.title.trim()) || ch.content.trim().length < 100;
        return !isFrontMatter;
      })
    : chapters;

  // Re-number pages
  finalChapters.forEach((ch, idx) => (ch.page = idx + 1));

  epub.destroy();

  console.debug(`[illustrations] EPUB extracted ${illustrations.length} images from "${title}"`);

  return {
    id: `epub-${Date.now()}`,
    title,
    author,
    chapters: finalChapters,
    totalPages: finalChapters.length,
    illustrations: illustrations.length > 0 ? illustrations : undefined,
  };
}

/**
 * Fetch an EPUB from a URL and parse it.
 */
export async function parseEpubFromUrl(
  url: string,
  fallbackTitle?: string
): Promise<Book> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch EPUB: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return parseEpub(buffer, fallbackTitle);
}
