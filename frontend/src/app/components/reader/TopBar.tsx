import {
  List,
  MonitorSmartphone,
  BookOpen,
  Search,
  Bookmark,
  BookmarkCheck,
  Headphones,
  ChevronLeft,
  Music,
} from "lucide-react";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";

export function TopBar({ onBack, musicOpen, onToggleMusic }: { onBack?: () => void; musicOpen?: boolean; onToggleMusic?: () => void }) {
  const {
    book,
    theme,
    sidebarType,
    setSidebarType,
    searchOpen,
    setSearchOpen,
    themeOpen,
    setThemeOpen,
    addBookmark,
    removeBookmark,
    isCurrentPageBookmarked,
    bookmarks,
    currentPage,
    currentChapterIndex,
    // Audio
    isAudioMode,
    setIsAudioMode,
    setAudioPlaying,
  } = useReader();

  const t = themes[theme];
  const bookmarked = isCurrentPageBookmarked();

  const handleBookmarkClick = () => {
    if (bookmarked) {
      const chapter = book?.chapters[currentChapterIndex];
      if (chapter) {
        const bm = bookmarks.find(
          (b) => b.chapterId === chapter.id && b.page === currentPage
        );
        if (bm) removeBookmark(bm.id);
      }
    } else {
      addBookmark();
    }
  };

  const cycleSidebar = (type: "contents" | "bookmarks") => {
    setSidebarType(sidebarType === type ? null : type);
  };

  const toggleAudioMode = () => {
    if (isAudioMode) {
      setAudioPlaying(false);
      setIsAudioMode(false);
    } else {
      setIsAudioMode(true);
    }
  };

  return (
    <div
      className="flex items-center justify-between h-12 px-4 select-none shrink-0"
      style={{
        backgroundColor: t.toolbar,
        borderBottom: `1px solid ${t.border}`,
      }}
    >
      {/* Left controls */}
      <div className="flex items-center gap-1">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-md transition-colors hover:opacity-70"
            style={{ color: t.toolbarText }}
            title="Back to Library"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <button
          onClick={() => cycleSidebar("contents")}
          className="p-2 rounded-md transition-colors hover:opacity-70"
          style={{
            color: sidebarType === "contents" ? t.accent : t.toolbarText,
          }}
          title="Table of Contents"
        >
          <List size={18} />
        </button>
        <button
          className="p-2 rounded-md transition-colors hover:opacity-70"
          style={{ color: t.toolbarText }}
          title="Page View"
        >
          <MonitorSmartphone size={18} />
        </button>
        <button
          onClick={() => cycleSidebar("bookmarks")}
          className="p-2 rounded-md transition-colors hover:opacity-70"
          style={{
            color: sidebarType === "bookmarks" ? t.accent : t.toolbarText,
          }}
          title="Bookmarks"
        >
          <BookOpen size={18} />
        </button>
      </div>

      {/* Center title */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ color: t.toolbarText }}
      >
        <span className="opacity-80">{book?.title || "Book Reader"}</span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1">
        {/* Audio mode toggle */}
        <button
          onClick={toggleAudioMode}
          className="p-2 rounded-md transition-colors hover:opacity-70"
          style={{ color: isAudioMode ? t.accent : t.toolbarText }}
          title={isAudioMode ? "Stop Audio" : "Listen to Book"}
        >
          <Headphones size={18} />
        </button>

        {/* Music player toggle */}
        {onToggleMusic && (
          <button
            onClick={onToggleMusic}
            className="p-2 rounded-md transition-colors hover:opacity-70"
            style={{ color: musicOpen ? t.accent : t.toolbarText }}
            title="Background Music"
          >
            <Music size={18} />
          </button>
        )}

        <button
          onClick={() => {
            setThemeOpen(!themeOpen);
            setSearchOpen(false);
          }}
          className="p-2 rounded-md transition-colors hover:opacity-70 flex items-center"
          style={{ color: themeOpen ? t.accent : t.toolbarText }}
          title="Themes & Settings"
        >
          <span style={{ fontSize: 14 }}>A</span>
          <span style={{ fontSize: 18 }}>A</span>
        </button>
        <button
          onClick={() => {
            setSearchOpen(!searchOpen);
            setThemeOpen(false);
          }}
          className="p-2 rounded-md transition-colors hover:opacity-70"
          style={{ color: searchOpen ? t.accent : t.toolbarText }}
          title="Search"
        >
          <Search size={18} />
        </button>
        <button
          onClick={handleBookmarkClick}
          className="p-2 rounded-md transition-colors hover:opacity-70"
          style={{ color: bookmarked ? t.accent : t.toolbarText }}
          title="Bookmark"
        >
          {bookmarked ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
        </button>
      </div>
    </div>
  );
}