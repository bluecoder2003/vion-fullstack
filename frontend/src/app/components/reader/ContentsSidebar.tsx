import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";
import { ScrollArea } from "../ui/scroll-area";

export function ContentsSidebar() {
  const { book, currentChapterIndex, setCurrentChapterIndex, theme, setSidebarType } =
    useReader();
  const t = themes[theme];

  if (!book) return null;

  return (
    <div
      className="w-[260px] flex flex-col shrink-0 h-full"
      style={{
        backgroundColor: t.sidebar,
        borderRight: `1px solid ${t.border}`,
      }}
    >
      <div
        className="px-4 py-3 text-center shrink-0"
        style={{
          borderBottom: `1px solid ${t.border}`,
          color: t.sidebarText,
          opacity: 0.7,
        }}
      >
        Contents
      </div>
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="py-1">
          {/* Book title entry */}
          <div
            className="flex items-center justify-between px-4 py-2 cursor-pointer transition-colors"
            style={{
              color: t.sidebarText,
            }}
          >
            <span style={{ fontWeight: 600 }}>{book.title}</span>
            <span style={{ opacity: 0.5 }}>1</span>
          </div>

          {book.chapters.map((chapter, idx) => (
            <div
              key={chapter.id}
              onClick={() => {
                setCurrentChapterIndex(idx);
                setSidebarType(null);
              }}
              className="flex items-center justify-between px-4 py-2 cursor-pointer transition-colors"
              style={{
                backgroundColor:
                  idx === currentChapterIndex
                    ? `${t.accent}22`
                    : "transparent",
                color: t.sidebarText,
                paddingLeft: chapter.title.startsWith("Letter") ? "24px" : "32px",
                borderRadius: 6,
                margin: "0 4px",
              }}
            >
              <span
                style={{
                  fontWeight: idx === currentChapterIndex ? 500 : 400,
                }}
              >
                {chapter.title}
              </span>
              <span style={{ opacity: 0.5 }}>{chapter.page}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}