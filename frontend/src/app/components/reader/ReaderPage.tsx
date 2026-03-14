import { useState } from "react";
import { useReader } from "./ReaderContext";
import { TopBar } from "./TopBar";
import { ContentsSidebar } from "./ContentsSidebar";
import { BookmarksSidebar } from "./BookmarksSidebar";
import { HighlightsSidebar } from "./HighlightsSidebar";
import { ThemePanel } from "./ThemePanel";
import { SearchPanel } from "./SearchPanel";
import { ReaderContent } from "./ReaderContent";
import { MusicPlayer } from "./MusicPlayer";
import { themes } from "./themeStyles";
import { motion, AnimatePresence } from "motion/react";

interface ReaderPageProps {
  onBack: () => void;
}

export function ReaderPage({ onBack }: ReaderPageProps) {
  const {
    sidebarType,
    theme,
    themeOpen,
    searchOpen,
    setThemeOpen,
    setSearchOpen,
    setSidebarType,
  } = useReader();
  const t = themes[theme];
  const [musicOpen, setMusicOpen] = useState(false);

  return (
    <div className="size-full flex flex-col" style={{ backgroundColor: t.bg }}>
      {/* Top toolbar */}
      <div className="relative">
        <TopBar
          onBack={onBack}
          musicOpen={musicOpen}
          onToggleMusic={() => {
            setMusicOpen(!musicOpen);
            setThemeOpen(false);
            setSearchOpen(false);
          }}
        />

        {/* Music player dropdown */}
        <MusicPlayer open={musicOpen} onClose={() => setMusicOpen(false)} />

        {/* Theme panel dropdown */}
        <ThemePanel />

        {/* Search panel dropdown */}
        <SearchPanel />

        {/* Bookmarks dropdown - top left corner */}
        <AnimatePresence>
          {sidebarType === "bookmarks" && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <BookmarksSidebar />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex h-[900px] overflow-hidden">
        {/* Left sidebar - Contents only */}
        <AnimatePresence>
          {sidebarType === "contents" && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden shrink-0"
            >
              <ContentsSidebar />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reader content */}
        <ReaderContent />

        {/* Right sidebar - Highlights */}
        <AnimatePresence>
          {sidebarType === "highlights" && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden shrink-0"
            >
              <HighlightsSidebar />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Click overlay to close dropdowns */}
      {(themeOpen || searchOpen || sidebarType === "bookmarks" || musicOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setThemeOpen(false);
            setSearchOpen(false);
            setMusicOpen(false);
            if (sidebarType === "bookmarks") setSidebarType(null);
          }}
        />
      )}
    </div>
  );
}