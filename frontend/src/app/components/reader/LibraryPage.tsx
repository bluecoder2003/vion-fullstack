import { useCallback, useRef, useState, useEffect } from "react";
import {
  Upload,
  BookOpen,
  Plus,
  Library,
  Search,
  Loader2,
  Globe,
  X,
  ChevronLeft,
  ChevronRight,
  BookOpenCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import { useReader } from "./ReaderContext";
import { sampleBook } from "./sampleBook";
import type { Book } from "./ReaderContext";
import { toast } from "sonner";
import {
  searchBooks,
  fetchMetadata,
  getCoverUrl,
  findTextFile,
  findEpubFile,
  downloadAndParseBook,
  enrichWithCovers,
  getDownloadUrl,
  type ArchiveSearchResult,
} from "./archiveApi";
import { parseEpub, parseEpubFromUrl } from "./epubParser";
import { parsePdf } from "./pdfParser";
import { ImageWithFallback } from "../figma/ImageWithFallback";

interface LibraryPageProps {
  onOpenBook: () => void;
  onOpenSceneDemo?: () => void;
}

// URL for the real Frankenstein EPUB
const FRANKENSTEIN_EPUB_URL =
  "https://raw.githubusercontent.com/bluecoder2003/books-exclusive/main/frankenstein.epub";

// Curated categories for browse
const CATEGORIES = [
  { label: "Popular Classics", query: "subject:fiction AND language:eng" },
  { label: "Science Fiction", query: "subject:science fiction AND language:eng" },
  { label: "Adventure", query: "subject:adventure AND language:eng" },
  { label: "Philosophy", query: "subject:philosophy AND language:eng" },
  { label: "Poetry", query: "subject:poetry AND language:eng" },
  { label: "Horror & Gothic", query: "subject:horror AND language:eng" },
  { label: "History", query: "subject:history AND language:eng" },
  { label: "Romance", query: "subject:love AND language:eng" },
];

export function LibraryPage({ onOpenBook, onOpenSceneDemo }: LibraryPageProps) {
  const { setBook, setCurrentChapterIndex } = useReader();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ArchiveSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [totalFound, setTotalFound] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  // Browse state
  const [browseCategory, setBrowseCategory] = useState(CATEGORIES[0]);
  const [browseResults, setBrowseResults] = useState<ArchiveSearchResult[]>([]);
  const [isBrowsing, setIsBrowsing] = useState(false);

  // Loading a specific book
  const [loadingBook, setLoadingBook] = useState<string | null>(null);

  // Loading sample EPUB
  const [loadingSample, setLoadingSample] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<"browse" | "search" | "local">("browse");

  // Load browse results on mount and category change
  useEffect(() => {
    let cancelled = false;
    const loadBrowse = async () => {
      setIsBrowsing(true);
      try {
        const data = await searchBooks(browseCategory.query, 1, 20);
        if (!cancelled) {
          // Show results immediately, then enrich with covers in background
          setBrowseResults(data.response.docs);
          // Fetch Open Library covers in background
          enrichWithCovers(data.response.docs).then((enriched) => {
            if (!cancelled) setBrowseResults(enriched);
          });
        }
      } catch {
        if (!cancelled) {
          toast.error("Failed to load books. Check your connection.");
        }
      } finally {
        if (!cancelled) setIsBrowsing(false);
      }
    };
    loadBrowse();
    return () => {
      cancelled = true;
    };
  }, [browseCategory]);

  // Search handler
  const handleSearch = useCallback(
    async (page = 1, overrideQuery?: string) => {
      const q = (overrideQuery ?? searchQuery).trim();
      if (!q) return;
      setIsSearching(true);
      setHasSearched(true);
      setSearchPage(page);
      try {
        const data = await searchBooks(q, page, 20);
        setSearchResults(data.response.docs);
        setTotalFound(data.response.numFound);
        // Enrich with Open Library covers in background
        enrichWithCovers(data.response.docs).then((enriched) => {
          setSearchResults(enriched);
        });
      } catch {
        toast.error("Search failed. Please try again.");
      } finally {
        setIsSearching(false);
      }
    },
    [searchQuery]
  );

  // Open a book from Internet Archive
  const openArchiveBook = useCallback(
    async (result: ArchiveSearchResult) => {
      setLoadingBook(result.identifier);
      try {
        const metadata = await fetchMetadata(result.identifier);
        const title = metadata.metadata.title || result.title || "Untitled";
        const author = metadata.metadata.creator || result.creator || "Unknown";

        const epubFile = findEpubFile(metadata.files);
        const textFile = findTextFile(metadata.files);

        if (!epubFile && !textFile) {
          toast.error(
            "No readable file found for this book. Try another title."
          );
          setLoadingBook(null);
          return;
        }

        // Race EPUB and text downloads in parallel.
        // EPUB gives full-book structure but may be CORS-blocked on some
        // IA servers, so we fire both and take whichever succeeds first
        // (preferring EPUB when both resolve).
        type BookResult = Awaited<ReturnType<typeof downloadAndParseBook>>;

        const epubPromise: Promise<BookResult | null> = epubFile
          ? (async () => {
              try {
                const epubUrl = getDownloadUrl(result.identifier, epubFile.name);
                const bookData = await parseEpubFromUrl(epubUrl, title);
                if (author && author !== "Unknown") {
                  (bookData as any).author = author;
                }
                return bookData;
              } catch {
                return null; // silently fall through
              }
            })()
          : Promise.resolve(null);

        const textPromise: Promise<BookResult | null> = textFile
          ? (async () => {
              try {
                return await downloadAndParseBook(
                  result.identifier,
                  textFile,
                  title,
                  author
                );
              } catch {
                return null;
              }
            })()
          : Promise.resolve(null);

        const [epubResult, textResult] = await Promise.all([
          epubPromise,
          textPromise,
        ]);

        // Prefer EPUB (better structure), fall back to text
        const bookData = epubResult || textResult;

        if (!bookData) {
          toast.error(
            "Could not parse this book. Try another edition or title."
          );
          setLoadingBook(null);
          return;
        }

        setBook(bookData);
        setCurrentChapterIndex(0);
        onOpenBook();
        toast.success(
          `Opened "${bookData.title}" (${bookData.chapters.length} chapters)`
        );
      } catch (err: any) {
        console.error("Failed to load book:", err);
        if (err?.message === "CONTENT_TOO_SHORT") {
          toast.error(
            "This book only has a short excerpt available, not the full text. Try another edition."
          );
        } else {
          toast.error("Failed to load this book. Please try another.");
        }
      } finally {
        setLoadingBook(null);
      }
    },
    [setBook, setCurrentChapterIndex, onOpenBook]
  );

  // Open the Frankenstein EPUB from GitHub
  const openSampleBook = useCallback(async () => {
    setLoadingSample(true);
    try {
      toast.info("Fetching Frankenstein EPUB...");
      const bookData = await parseEpubFromUrl(FRANKENSTEIN_EPUB_URL, "Frankenstein");
      bookData.id = "frankenstein-demo";
      setBook(bookData);
      setCurrentChapterIndex(0);
      onOpenBook();
      toast.success(`Opened "${bookData.title}" (${bookData.chapters.length} chapters)`);
    } catch (err) {
      console.error("Failed to load Frankenstein EPUB:", err);
      // Fallback to hardcoded sample
      toast.info("EPUB fetch failed, using built-in sample.");
      setBook(sampleBook);
      setCurrentChapterIndex(0);
      onOpenBook();
    } finally {
      setLoadingSample(false);
    }
  }, [setBook, setCurrentChapterIndex, onOpenBook]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase();

      if (name.endsWith(".txt")) {
        const text = await file.text();
        const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
        const chunkSize = Math.max(1, Math.ceil(paragraphs.length / 10));
        const chapters: Book["chapters"] = [];
        for (let i = 0; i < paragraphs.length; i += chunkSize) {
          const chunk = paragraphs.slice(i, i + chunkSize);
          chapters.push({
            id: `ch-${i}`,
            title: `Chapter ${Math.floor(i / chunkSize) + 1}`,
            page: Math.floor(i / chunkSize) + 1,
            content: chunk.join("\n\n"),
          });
        }
        setBook({
          id: crypto.randomUUID(),
          title: file.name.replace(/\.txt$/i, ""),
          author: "Unknown",
          chapters,
          totalPages: chapters.length,
        });
        setCurrentChapterIndex(0);
        onOpenBook();
        toast.success(`Opened "${file.name}"`);
      } else if (name.endsWith(".epub")) {
        toast.info("Parsing EPUB file...");
        try {
          const buffer = await file.arrayBuffer();
          const bookData = await parseEpub(buffer, file.name.replace(/\.epub$/i, ""));
          setBook(bookData);
          setCurrentChapterIndex(0);
          onOpenBook();
          toast.success(`Opened "${bookData.title}" (${bookData.chapters.length} chapters)`);
        } catch (err) {
          console.error("EPUB parse error:", err);
          toast.error("Failed to parse EPUB. The file may be corrupted or unsupported.");
        }
      } else if (name.endsWith(".pdf")) {
        toast.info("Parsing PDF file...");
        try {
          const buffer = await file.arrayBuffer();
          const bookData = await parsePdf(
            buffer,
            file.name.replace(/\.pdf$/i, "")
          );
          setBook(bookData);
          setCurrentChapterIndex(0);
          onOpenBook();
          toast.success(
            `Opened "${bookData.title}" (${bookData.chapters.length} sections)`
          );
        } catch (err) {
          console.error("PDF parse error:", err);
          toast.error(
            "Failed to parse PDF. The file may be scanned or unsupported."
          );
        }
      } else {
        toast.error(
          "Unsupported file format. Please use PDF, EPUB, or TXT files."
        );
      }
    },
    [setBook, setCurrentChapterIndex, onOpenBook]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  // Book card component
  const BookCard = ({
    result,
    showCover = true,
  }: {
    result: ArchiveSearchResult;
    showCover?: boolean;
  }) => {
    const isLoading = loadingBook === result.identifier;
    return (
      <button
        onClick={() => openArchiveBook(result)}
        disabled={!!loadingBook}
        className="text-left cursor-pointer group transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:cursor-wait w-full"
      >
        <div
          className="aspect-[2/3] rounded-lg overflow-hidden mb-3 relative"
          style={{
            backgroundColor: "#2a2a35",
            borderTop: "1px solid #3a3a45",
            borderLeft: "1px solid #3a3a45",
            borderRight: "1px solid #3a3a45",
            borderBottom: "1px solid #3a3a45",
          }}
        >
          {showCover ? (
            <ImageWithFallback
              src={getCoverUrl(result.identifier, result.cover_i)}
              alt={result.title}
              className="w-full h-full object-cover transition-opacity group-hover:opacity-90"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
              <BookOpen
                size={28}
                className="mb-2"
                style={{ color: "#6b9fff", opacity: 0.6 }}
              />
              <div
                className="line-clamp-3"
                style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}
              >
                {result.title}
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 rounded-lg">
              <Loader2 size={24} className="animate-spin" style={{ color: "#6b9fff" }} />
              <span style={{ fontSize: 11, color: "#ccc" }}>Loading…</span>
            </div>
          )}

          {/* Hover overlay */}
          {!isLoading && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 backdrop-blur-sm rounded-full p-3">
                <BookOpenCheck size={20} style={{ color: "#fff" }} />
              </div>
            </div>
          )}
        </div>
        <div
          className="line-clamp-2"
          style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}
        >
          {result.title}
        </div>
        <div
          className="line-clamp-1 mt-0.5"
          style={{ fontSize: 11, opacity: 0.5 }}
        >
          {result.creator || "Unknown Author"}
          {result.year ? ` · ${result.year}` : ""}
        </div>
      </button>
    );
  };

  return (
    <div
      className="size-full flex flex-col"
      style={{ backgroundColor: "#1a1a1a", color: "#e0e0e0" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-8 py-4 shrink-0"
        style={{ borderBottom: "1px solid #333" }}
      >
        <div className="flex items-center gap-3">
          <Library size={24} style={{ color: "#6b9fff" }} />
          <span style={{ fontSize: 20, fontWeight: 500 }}>Book Reader</span>
        </div>
        <div className="flex items-center gap-2">
          {onOpenSceneDemo && (
            <button
              onClick={onOpenSceneDemo}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors hover:opacity-80"
              style={{ backgroundColor: "#333", color: "#d4d4d4", border: "1px solid #444", fontSize: 13 }}
            >
              <Waves size={14} />
              Scene Demo
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors hover:opacity-80"
            style={{ backgroundColor: "#6b9fff", color: "#fff" }}
          >
            <Plus size={16} />
            Add Book
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-0 px-8 shrink-0"
        style={{ borderBottom: "1px solid #333" }}
      >
        {(
          [
            { key: "browse", label: "Browse", icon: Globe },
            { key: "search", label: "Search Archive", icon: Search },
            { key: "local", label: "My Books", icon: BookOpen },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-2 px-5 py-3 transition-colors relative"
            style={{
              color: activeTab === tab.key ? "#6b9fff" : "#888",
              fontSize: 14,
            }}
          >
            <tab.icon size={16} />
            {tab.label}
            {activeTab === tab.key && (
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ backgroundColor: "#6b9fff" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Browse Tab */}
        {activeTab === "browse" && (
          <div className="p-8">
            {/* Category chips */}
            <div className="flex flex-wrap gap-2 mb-8">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => setBrowseCategory(cat)}
                  className="px-4 py-1.5 rounded-full transition-colors"
                  style={{
                    fontSize: 13,
                    backgroundColor:
                      browseCategory.label === cat.label
                        ? "#6b9fff"
                        : "#2a2a35",
                    color:
                      browseCategory.label === cat.label ? "#fff" : "#aaa",
                    borderTop: "1px solid",
                    borderLeft: "1px solid",
                    borderRight: "1px solid",
                    borderBottom: "1px solid",
                    borderColor:
                      browseCategory.label === cat.label
                        ? "#6b9fff"
                        : "#444",
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Results */}
            {isBrowsing ? (
              <div className="flex items-center justify-center py-20">
                <Loader2
                  size={32}
                  className="animate-spin"
                  style={{ color: "#6b9fff" }}
                />
                <span className="ml-3" style={{ color: "#888" }}>
                  Discovering books…
                </span>
              </div>
            ) : browseResults.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {browseResults.map((r) => (
                  <BookCard key={r.identifier} result={r} />
                ))}
              </div>
            ) : (
              <div
                className="text-center py-20"
                style={{ color: "#666" }}
              >
                No books found in this category.
              </div>
            )}
          </div>
        )}

        {/* Search Tab */}
        {activeTab === "search" && (
          <div className="p-8">
            {/* Search bar */}
            <div className="flex gap-3 mb-8 max-w-2xl mx-auto">
              <div
                className="flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl"
                style={{
                  backgroundColor: "#2a2a35",
                  borderTop: "1px solid #444",
                  borderLeft: "1px solid #444",
                  borderRight: "1px solid #444",
                  borderBottom: "1px solid #444",
                }}
              >
                <Search size={18} style={{ color: "#666" }} />
                <input
                  type="text"
                  placeholder="Search by title, author, or subject…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch(1);
                  }}
                  className="flex-1 bg-transparent outline-none placeholder:text-gray-500"
                  style={{ color: "#e0e0e0", fontSize: 15 }}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setHasSearched(false);
                    }}
                    className="p-1 rounded-full hover:bg-white/10"
                  >
                    <X size={14} style={{ color: "#888" }} />
                  </button>
                )}
              </div>
              <button
                onClick={() => handleSearch(1)}
                disabled={isSearching || !searchQuery.trim()}
                className="px-6 py-2.5 rounded-xl transition-colors hover:opacity-80 disabled:opacity-40 flex items-center gap-2"
                style={{ backgroundColor: "#6b9fff", color: "#fff" }}
              >
                {isSearching ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Search size={16} />
                )}
                Search
              </button>
            </div>

            {/* Hint */}
            {!hasSearched && (
              <div className="text-center py-12">
                <Globe
                  size={48}
                  className="mx-auto mb-4"
                  style={{ color: "#444" }}
                />
                <div style={{ color: "#888", fontSize: 15 }}>
                  Search thousands of public domain books from the Internet
                  Archive
                </div>
                <div
                  className="mt-2"
                  style={{ color: "#555", fontSize: 13 }}
                >
                  Try "pride and prejudice", "sherlock holmes", or "mark
                  twain"
                </div>

                {/* Quick search suggestions */}
                <div className="flex flex-wrap justify-center gap-2 mt-6">
                  {[
                    "Pride and Prejudice",
                    "Sherlock Holmes",
                    "Moby Dick",
                    "Dracula",
                    "Alice in Wonderland",
                    "The Odyssey",
                    "War and Peace",
                    "Jane Eyre",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setSearchQuery(suggestion);
                        handleSearch(1, suggestion);
                      }}
                      className="px-3 py-1.5 rounded-full transition-colors hover:bg-white/10 flex items-center gap-1.5"
                      style={{
                        fontSize: 12,
                        color: "#aaa",
                        borderTop: "1px solid #3a3a45",
                        borderLeft: "1px solid #3a3a45",
                        borderRight: "1px solid #3a3a45",
                        borderBottom: "1px solid #3a3a45",
                      }}
                    >
                      <Sparkles size={10} />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            {isSearching && (
              <div className="flex items-center justify-center py-20">
                <Loader2
                  size={32}
                  className="animate-spin"
                  style={{ color: "#6b9fff" }}
                />
                <span className="ml-3" style={{ color: "#888" }}>
                  Searching the archive…
                </span>
              </div>
            )}

            {!isSearching && hasSearched && searchResults.length === 0 && (
              <div
                className="text-center py-16"
                style={{ color: "#666" }}
              >
                No books found for "{searchQuery}". Try a different search.
              </div>
            )}

            {!isSearching && searchResults.length > 0 && (
              <>
                <div
                  className="mb-4 flex items-center justify-between"
                  style={{ fontSize: 13, color: "#888" }}
                >
                  <span>
                    {totalFound.toLocaleString()} results found
                  </span>
                  <span>Page {searchPage}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                  {searchResults.map((r) => (
                    <BookCard key={r.identifier} result={r} />
                  ))}
                </div>

                {/* Pagination */}
                {totalFound > 20 && (
                  <div className="flex items-center justify-center gap-4 mt-8">
                    <button
                      onClick={() => handleSearch(searchPage - 1)}
                      disabled={searchPage <= 1}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg transition-colors disabled:opacity-30 hover:bg-white/10"
                      style={{
                        color: "#aaa",
                        borderTop: "1px solid #444",
                        borderLeft: "1px solid #444",
                        borderRight: "1px solid #444",
                        borderBottom: "1px solid #444",
                      }}
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>
                    <span style={{ color: "#888", fontSize: 14 }}>
                      Page {searchPage} of{" "}
                      {Math.ceil(totalFound / 20)}
                    </span>
                    <button
                      onClick={() => handleSearch(searchPage + 1)}
                      disabled={searchPage >= Math.ceil(totalFound / 20)}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg transition-colors disabled:opacity-30 hover:bg-white/10"
                      style={{
                        color: "#aaa",
                        borderTop: "1px solid #444",
                        borderLeft: "1px solid #444",
                        borderRight: "1px solid #444",
                        borderBottom: "1px solid #444",
                      }}
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Local / My Books Tab */}
        {activeTab === "local" && (
          <div className="p-8">
            {/* Upload area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="mb-10 rounded-2xl border-2 border-dashed p-10 flex flex-col items-center justify-center cursor-pointer transition-all"
              style={{
                borderColor: dragOver ? "#6b9fff" : "#444",
                backgroundColor: dragOver
                  ? "rgba(107, 159, 255, 0.05)"
                  : "transparent",
              }}
            >
              <Upload
                size={36}
                className="mb-3"
                style={{ color: "#6b9fff", opacity: 0.7 }}
              />
              <div style={{ fontSize: 15, marginBottom: 4 }}>
                Drop a book here or click to upload
              </div>
              <div style={{ fontSize: 13, opacity: 0.5 }}>
                Supports PDF, EPUB, and TXT files
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.epub,.txt"
              className="hidden"
              onChange={handleInputChange}
            />

            {/* Sample library */}
            <div>
              <h3
                style={{
                  opacity: 0.6,
                  marginBottom: 16,
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Sample Library
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                <button
                  onClick={openSampleBook}
                  disabled={loadingSample}
                  className="text-left cursor-pointer group transition-transform hover:scale-[1.02] w-full disabled:cursor-wait"
                >
                  <div
                    className="aspect-[2/3] rounded-lg overflow-hidden mb-3 flex items-center justify-center relative"
                    style={{
                      backgroundColor: "#2a2a35",
                      borderTop: "1px solid #3a3a45",
                      borderLeft: "1px solid #3a3a45",
                      borderRight: "1px solid #3a3a45",
                      borderBottom: "1px solid #3a3a45",
                    }}
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                      {loadingSample ? (
                        <>
                          <Loader2
                            size={28}
                            className="mb-2 animate-spin"
                            style={{ color: "#6b9fff" }}
                          />
                          <div style={{ fontSize: 12, opacity: 0.6 }}>
                            Loading EPUB…
                          </div>
                        </>
                      ) : (
                        <>
                          <BookOpen
                            size={28}
                            className="mb-2"
                            style={{ color: "#6b9fff", opacity: 0.6 }}
                          />
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 500,
                              lineHeight: 1.3,
                            }}
                          >
                            Frankenstein
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              opacity: 0.5,
                              marginTop: 6,
                            }}
                          >
                            Mary Shelley
                          </div>
                        </>
                      )}
                    </div>
                    {!loadingSample && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 backdrop-blur-sm rounded-full p-3">
                          <BookOpenCheck
                            size={20}
                            style={{ color: "#fff" }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    Frankenstein
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>
                    Mary Shelley
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
