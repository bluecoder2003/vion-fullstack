import { useState } from "react";
import { Search, X } from "lucide-react";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";

export function SearchPanel() {
  const { book, searchOpen, setSearchOpen, setCurrentChapterIndex, setSidebarType, theme } =
    useReader();
  const t = themes[theme];
  const [query, setQuery] = useState("");

  if (!searchOpen || !book) return null;

  const results: { chapterIdx: number; title: string; snippet: string }[] = [];
  if (query.length >= 2) {
    book.chapters.forEach((chapter, idx) => {
      const lower = chapter.content.toLowerCase();
      const qLower = query.toLowerCase();
      const pos = lower.indexOf(qLower);
      if (pos >= 0) {
        const start = Math.max(0, pos - 40);
        const end = Math.min(chapter.content.length, pos + query.length + 40);
        const snippet =
          (start > 0 ? "..." : "") +
          chapter.content.slice(start, end) +
          (end < chapter.content.length ? "..." : "");
        results.push({ chapterIdx: idx, title: chapter.title, snippet });
      }
    });
  }

  return (
    <div
      className="absolute right-28 top-14 z-50 rounded-2xl shadow-2xl overflow-hidden"
      style={{
        backgroundColor: t.popover,
        border: `1px solid ${t.border}`,
        width: 360,
      }}
    >
      <div
        className="absolute -top-2 right-12 w-4 h-4 rotate-45"
        style={{
          backgroundColor: t.popover,
          border: `1px solid ${t.border}`,
          borderBottom: "none",
          borderRight: "none",
        }}
      />

      <div className="p-4" style={{ color: t.popoverText }}>
        <div className="flex items-center gap-2 mb-3">
          <div
            className="flex items-center flex-1 gap-2 px-3 py-2 rounded-lg"
            style={{
              backgroundColor: `${t.border}50`,
              border: `1px solid ${t.border}`,
            }}
          >
            <Search size={14} style={{ opacity: 0.5 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in book..."
              autoFocus
              className="flex-1 bg-transparent outline-none"
              style={{
                color: t.popoverText,
                fontSize: 14,
              }}
            />
            {query && (
              <button onClick={() => setQuery("")}>
                <X size={14} style={{ opacity: 0.5 }} />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {query.length >= 2 && results.length === 0 && (
            <div className="py-4 text-center" style={{ opacity: 0.5, fontSize: 13 }}>
              No results found
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={i}
              onClick={() => {
                setCurrentChapterIndex(r.chapterIdx);
                setSearchOpen(false);
                setSidebarType(null);
              }}
              className="px-3 py-3 rounded-lg cursor-pointer transition-colors hover:opacity-80"
              style={{
                borderBottom: `1px solid ${t.border}30`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                {r.title}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.4 }}>
                {r.snippet}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
