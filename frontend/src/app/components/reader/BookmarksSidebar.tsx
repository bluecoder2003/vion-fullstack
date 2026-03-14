import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";
import { X } from "lucide-react";
import { format } from "date-fns";

export function BookmarksSidebar() {
  const {
    bookmarks,
    removeBookmark,
    theme,
    book,
    setCurrentChapterIndex,
    setSidebarType,
  } = useReader();
  const t = themes[theme];

  return (
    <div
      className="absolute left-0 top-12 z-50 rounded-b-lg shadow-2xl overflow-hidden"
      style={{
        backgroundColor: t.sidebar,
        borderBottom: `1px solid ${t.border}`,
        borderRight: `1px solid ${t.border}`,
        width: 240,
        maxHeight: 320,
      }}
    >
      <div
        className="px-4 py-2.5 text-center shrink-0"
        style={{
          borderBottom: `1px solid ${t.border}`,
          color: t.sidebarText,
          opacity: 0.7,
          fontSize: 13,
        }}
      >
        Bookmarks
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 270 }}>
        <div className="py-1">
          {bookmarks.length === 0 ? (
            <div
              className="px-4 py-6 text-center"
              style={{ color: t.sidebarText, opacity: 0.5, fontSize: 13 }}
            >
              No bookmarks yet
            </div>
          ) : (
            bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="flex items-start justify-between px-4 py-2.5 cursor-pointer transition-colors group hover:bg-white/5"
                style={{
                  borderBottom: `1px solid ${t.border}30`,
                }}
                onClick={() => {
                  if (book) {
                    const idx = book.chapters.findIndex(
                      (c) => c.id === bm.chapterId
                    );
                    if (idx >= 0) {
                      setCurrentChapterIndex(idx);
                      setSidebarType(null);
                    }
                  }
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: t.sidebarText,
                      fontWeight: 500,
                      fontSize: 13,
                    }}
                  >
                    {bm.chapterTitle}
                  </div>
                  <div
                    style={{
                      color: t.sidebarText,
                      opacity: 0.5,
                      fontSize: 11,
                      marginTop: 1,
                    }}
                  >
                    {format(bm.timestamp, "EEEE, d MMMM yyyy")}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span
                    style={{
                      color: t.sidebarText,
                      opacity: 0.5,
                      fontSize: 12,
                    }}
                  >
                    {bm.page}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBookmark(bm.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
                    style={{ color: t.sidebarText }}
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
