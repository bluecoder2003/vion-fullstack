import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";
import { ScrollArea } from "../ui/scroll-area";
import { X, Download, Share2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export function HighlightsSidebar() {
  const {
    highlights,
    removeHighlight,
    theme,
    book,
    setCurrentChapterIndex,
    setSidebarType,
  } = useReader();
  const t = themes[theme];

  const exportHighlights = () => {
    if (highlights.length === 0) {
      toast.error("No highlights to export");
      return;
    }
    let text = `Highlights from "${book?.title || "Book"}"\n`;
    text += `By ${book?.author || "Unknown"}\n`;
    text += "═".repeat(50) + "\n\n";
    highlights.forEach((h, i) => {
      text += `${i + 1}. [${h.chapterTitle}]\n`;
      text += `"${h.text}"\n`;
      text += `— ${format(h.timestamp, "MMMM d, yyyy")}\n\n`;
    });

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${book?.title || "highlights"}-highlights.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Highlights exported!");
  };

  const shareHighlights = () => {
    if (highlights.length === 0) {
      toast.error("No highlights to share");
      return;
    }
    let text = highlights
      .map((h) => `"${h.text}" — ${h.chapterTitle}`)
      .join("\n\n");
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success("Highlights copied to clipboard!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div
      className="w-[300px] flex flex-col shrink-0 h-full"
      style={{
        backgroundColor: t.sidebar,
        borderLeft: `1px solid ${t.border}`,
      }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: `1px solid ${t.border}` }}
      >
        <span style={{ color: t.sidebarText, opacity: 0.7 }}>
          Highlights ({highlights.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={shareHighlights}
            className="p-1.5 rounded-lg transition-colors hover:opacity-70"
            style={{ color: t.sidebarText }}
            title="Copy all highlights"
          >
            <Share2 size={14} />
          </button>
          <button
            onClick={exportHighlights}
            className="p-1.5 rounded-lg transition-colors hover:opacity-70"
            style={{ color: t.sidebarText }}
            title="Export highlights"
          >
            <Download size={14} />
          </button>
          <button
            onClick={() => setSidebarType(null)}
            className="p-1.5 rounded-lg transition-colors hover:opacity-70"
            style={{ color: t.sidebarText }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="py-2">
          {highlights.length === 0 ? (
            <div
              className="px-4 py-8 text-center"
              style={{ color: t.sidebarText, opacity: 0.5, fontSize: 13 }}
            >
              Select text while reading to create highlights
            </div>
          ) : (
            highlights.map((h) => (
              <div
                key={h.id}
                className="px-4 py-3 cursor-pointer group transition-colors"
                style={{ borderBottom: `1px solid ${t.border}30` }}
                onClick={() => {
                  if (book) {
                    const idx = book.chapters.findIndex(
                      (c) => c.id === h.chapterId
                    );
                    if (idx >= 0) setCurrentChapterIndex(idx);
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="w-1 shrink-0 rounded-full self-stretch"
                    style={{ backgroundColor: h.color, minHeight: 20 }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      style={{
                        color: t.sidebarText,
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                      className="line-clamp-3"
                    >
                      "{h.text}"
                    </div>
                    <div
                      className="flex items-center justify-between mt-2"
                      style={{
                        color: t.sidebarText,
                        opacity: 0.5,
                        fontSize: 11,
                      }}
                    >
                      <span>{h.chapterTitle}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeHighlight(h.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}