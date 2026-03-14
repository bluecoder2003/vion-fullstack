import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, ChevronDown, Check, Volume2 } from "lucide-react";
import { MusicEngine, GENRES, type MusicGenre } from "./musicEngine";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";
import { motion, AnimatePresence } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";

interface MusicPlayerProps {
  open: boolean;
  onClose: () => void;
}

export function MusicPlayer({ open, onClose }: MusicPlayerProps) {
  const { theme } = useReader();
  const t = themes[theme];

  const engineRef = useRef<MusicEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [genre, setGenre] = useState<MusicGenre>("acoustic");
  const [volume, setVolume] = useState(0.35);

  // Initialize engine lazily
  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new MusicEngine();
    }
    return engineRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  // Stop music when panel closes
  useEffect(() => {
    if (!open && playing) {
      engineRef.current?.stop();
      setPlaying(false);
    }
  }, [open, playing]);

  const togglePlay = () => {
    const engine = getEngine();
    if (playing) {
      engine.stop();
      setPlaying(false);
    } else {
      engine.volume = volume;
      engine.start(genre);
      setPlaying(true);
    }
  };

  const selectGenre = (g: MusicGenre) => {
    setGenre(g);
    if (playing) {
      const engine = getEngine();
      engine.volume = volume;
      engine.start(g);
    }
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    if (engineRef.current) {
      engineRef.current.volume = v;
    }
  };

  const currentGenre = GENRES.find(g => g.type === genre)!;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute right-4 top-full mt-2 z-50"
          style={{ width: 320 }}
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl"
            style={{
              backgroundColor: t.popover,
              border: `1px solid ${t.border}`,
            }}
          >
            {/* Controls */}
            <div className="px-4 py-4">
              {/* Genre selector + Play button */}
              <div className="flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex-1 flex items-center justify-between px-4 py-2.5 rounded-xl transition-colors hover:opacity-80"
                      style={{
                        backgroundColor: `${t.border}55`,
                        color: t.popoverText,
                        border: `1px solid ${t.border}`,
                      }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex items-center justify-center rounded-lg"
                          style={{
                            width: 28,
                            height: 28,
                            backgroundColor: currentGenre.color,
                            fontSize: 15,
                          }}
                        >
                          {currentGenre.icon}
                        </span>
                        <span style={{ fontSize: 14 }}>{currentGenre.label}</span>
                      </div>
                      <ChevronDown
                        size={16}
                        style={{ color: t.popoverText, opacity: 0.5 }}
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl p-1"
                    style={{
                      backgroundColor: t.popover,
                      borderColor: t.border,
                      color: t.popoverText,
                    }}
                  >
                    {GENRES.map(g => (
                      <DropdownMenuItem
                        key={g.type}
                        onClick={() => selectGenre(g.type)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
                        style={{
                          backgroundColor:
                            genre === g.type ? `${t.accent}22` : "transparent",
                          color: t.popoverText,
                        }}
                      >
                        <div style={{ width: 20, textAlign: "center" }}>
                          {genre === g.type && (
                            <Check size={14} style={{ color: t.accent }} />
                          )}
                        </div>
                        <span
                          className="flex items-center justify-center rounded-lg"
                          style={{
                            width: 32,
                            height: 32,
                            backgroundColor: g.color,
                            fontSize: 16,
                            flexShrink: 0,
                          }}
                        >
                          {g.icon}
                        </span>
                        <span style={{ fontSize: 14 }}>{g.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Play/Pause button */}
                <button
                  onClick={togglePlay}
                  className="flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: "#7c3aed",
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {playing ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
                </button>
              </div>

              {/* Volume slider */}
              <div className="flex items-center gap-3 mt-3 px-1">
                <Volume2 size={14} style={{ color: t.popoverText, opacity: 0.5, flexShrink: 0 }} />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={e => handleVolumeChange(parseFloat(e.target.value))}
                  className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #7c3aed ${volume * 100}%, ${t.border} ${volume * 100}%)`,
                    accentColor: "#7c3aed",
                  }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}