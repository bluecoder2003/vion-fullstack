import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, ChevronDown, Check, Volume2, Sparkles, Music, Sliders, Wind } from "lucide-react";
import { MusicEngine, GENRES, type MusicGenre } from "./musicEngine";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";
import { motion, AnimatePresence } from "motion/react";
import { ALL_SCENES, getSceneInfo, type SceneType } from "./ambientSounds";
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
  const {
    theme,
    ambientMode,
    setAmbientMode,
    ambientScene,
    setAmbientScene,
    ambientVolume,
    setAmbientVolume,
    currentPlayingAmbient,
  } = useReader();

  const t = themes[theme] || themes.quiet || themes.original;

  const [activeTab, setActiveTab] = useState<"ambient" | "music">("ambient");

  // Music Engine State (Tab 2)
  const engineRef = useRef<MusicEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [genre, setGenre] = useState<MusicGenre>("acoustic");
  const [musicVolume, setMusicVolume] = useState(0.35);

  // Initialize music engine lazily
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
      engine.volume = musicVolume;
      engine.start(genre);
      setPlaying(true);
    }
  };

  const selectGenre = (g: MusicGenre) => {
    setGenre(g);
    if (playing) {
      const engine = getEngine();
      engine.volume = musicVolume;
      engine.start(g);
    }
  };

  const handleMusicVolumeChange = (v: number) => {
    setMusicVolume(v);
    if (engineRef.current) {
      engineRef.current.volume = v;
    }
  };

  const currentGenre = GENRES.find((g) => g.type === genre)!;
  const activeSceneInfo = currentPlayingAmbient !== "silence" ? getSceneInfo(currentPlayingAmbient) : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute right-4 top-full mt-2 z-50"
          style={{ width: 340 }}
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{
              backgroundColor: t.popover,
              border: `1px solid ${t.border}`,
            }}
          >
            {/* Header Tabs */}
            <div className="flex border-b select-none" style={{ borderColor: t.border }}>
              <button
                onClick={() => setActiveTab("ambient")}
                className="flex-1 py-3 text-center relative font-medium flex items-center justify-center gap-1.5 transition-all"
                style={{
                  color: activeTab === "ambient" ? t.accent : t.popoverText,
                  opacity: activeTab === "ambient" ? 1 : 0.6,
                  fontSize: 12.5,
                }}
              >
                <Wind size={14} />
                Soundscapes
                {activeTab === "ambient" && (
                  <motion.div
                    layoutId="activeAudioTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-[2px]"
                    style={{ backgroundColor: t.accent }}
                  />
                )}
              </button>
              <button
                onClick={() => setActiveTab("music")}
                className="flex-1 py-3 text-center relative font-medium flex items-center justify-center gap-1.5 transition-all"
                style={{
                  color: activeTab === "music" ? t.accent : t.popoverText,
                  opacity: activeTab === "music" ? 1 : 0.6,
                  fontSize: 12.5,
                }}
              >
                <Music size={14} />
                Background Music
                {activeTab === "music" && (
                  <motion.div
                    layoutId="activeAudioTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-[2px]"
                    style={{ backgroundColor: t.accent }}
                  />
                )}
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-4 flex flex-col">
              {activeTab === "ambient" ? (
                // TAB 1: AMBIENT SOUNDSCAPES
                <div className="flex flex-col">
                  {/* Mode Selector */}
                  <div
                    className="flex rounded-xl p-1 mb-4"
                    style={{
                      backgroundColor: `${t.border}44`,
                      border: `1px solid ${t.border}`,
                    }}
                  >
                    {(["off", "adaptive", "manual"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setAmbientMode(mode)}
                        className="flex-1 py-1.5 rounded-lg text-center transition-all font-medium text-xs capitalize"
                        style={{
                          backgroundColor: ambientMode === mode ? t.popover : "transparent",
                          color: ambientMode === mode ? t.accent : t.popoverText,
                          opacity: ambientMode === mode ? 1 : 0.6,
                          boxShadow: ambientMode === mode ? "0 2px 6px rgba(0,0,0,0.15)" : "none",
                        }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  {/* Mode details */}
                  {ambientMode === "off" && (
                    <div
                      className="flex flex-col items-center justify-center py-6 text-center rounded-2xl border"
                      style={{
                        backgroundColor: `${t.border}11`,
                        borderColor: t.border,
                      }}
                    >
                      <Volume2 size={24} className="mb-2 opacity-30" style={{ color: t.popoverText }} />
                      <div style={{ fontSize: 12, fontWeight: 500, color: t.popoverText, opacity: 0.7 }}>
                        Soundscapes are Disabled
                      </div>
                      <div style={{ fontSize: 10, color: t.popoverText, opacity: 0.5, marginTop: 2 }}>
                        Select Adaptive or Manual mode to enable
                      </div>
                    </div>
                  )}

                  {ambientMode === "adaptive" && (
                    <div
                      className="flex flex-col gap-3 rounded-2xl p-4 mb-3 border relative overflow-hidden transition-all duration-300"
                      style={{
                        backgroundColor: `${t.border}22`,
                        borderColor: t.border,
                      }}
                    >
                      {activeSceneInfo ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl select-none">{activeSceneInfo.emoji}</span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: t.popoverText }}>
                                {activeSceneInfo.label}
                              </div>
                              <div style={{ fontSize: 11, color: t.popoverText, opacity: 0.6 }} className="line-clamp-1">
                                {activeSceneInfo.description}
                              </div>
                            </div>
                          </div>
                          {/* Equalizer */}
                          <div className="flex items-end gap-[3px] h-6 pr-1 select-none">
                            {[0.4, 0.8, 0.6, 0.9, 0.5].map((h, i) => (
                              <motion.div
                                key={i}
                                animate={{
                                  height: ["6px", "24px", "6px"],
                                }}
                                transition={{
                                  duration: 0.8 + i * 0.15,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                                className="w-[3px] rounded-full"
                                style={{ backgroundColor: t.accent }}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-4 text-center">
                          <Sparkles size={20} className="mb-2 animate-pulse" style={{ color: t.accent }} />
                          <div style={{ fontSize: 12, fontWeight: 500, color: t.popoverText }}>
                            Listening to narration...
                          </div>
                          <div style={{ fontSize: 10, color: t.popoverText, opacity: 0.5, marginTop: 2 }}>
                            Soundscapes adapt dynamically to text
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {ambientMode === "manual" && (
                    <div className="flex flex-col mb-3">
                      <div className="grid grid-cols-4 gap-1.5 overflow-y-auto max-h-[160px] pr-1 scrollbar-thin">
                        {ALL_SCENES.map((scene) => {
                          const info = getSceneInfo(scene);
                          const isSelected = ambientScene === scene;
                          return (
                            <button
                              key={scene}
                              onClick={() => setAmbientScene(scene)}
                              className="flex flex-col items-center justify-center p-2 rounded-xl border transition-all hover:scale-[1.03]"
                              style={{
                                backgroundColor: isSelected ? `${t.accent}18` : `${t.border}18`,
                                borderColor: isSelected ? t.accent : t.border,
                                boxShadow: isSelected ? `0 0 8px ${t.accent}22` : "none",
                              }}
                            >
                              <span className="text-xl mb-1 select-none">{info.emoji}</span>
                              <span
                                style={{
                                  fontSize: 10,
                                  color: t.popoverText,
                                  fontWeight: isSelected ? 600 : 400,
                                }}
                                className="truncate w-full text-center"
                              >
                                {info.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Volume Slider for Ambient */}
                  {ambientMode !== "off" && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: `${t.border}44` }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span style={{ fontSize: 11, color: t.popoverText, opacity: 0.6 }}>
                          Soundscape Volume
                        </span>
                        <span style={{ fontSize: 11, color: t.popoverText, opacity: 0.8, fontWeight: 600 }}>
                          {Math.round(ambientVolume * 100)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Volume2 size={13} style={{ color: t.popoverText, opacity: 0.5 }} />
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={ambientVolume}
                          onChange={(e) => setAmbientVolume(parseFloat(e.target.value))}
                          className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, ${t.accent} ${ambientVolume * 100}%, ${t.border} ${ambientVolume * 100}%)`,
                            accentColor: t.accent,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // TAB 2: BACKGROUND MUSIC
                <div className="flex flex-col">
                  {/* Genre selector + Play button */}
                  <div className="flex items-center gap-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="flex-1 flex items-center justify-between px-3.5 py-2 rounded-xl transition-all hover:opacity-95"
                          style={{
                            backgroundColor: `${t.border}33`,
                            color: t.popoverText,
                            border: `1px solid ${t.border}`,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="flex items-center justify-center rounded-lg select-none"
                              style={{
                                width: 24,
                                height: 24,
                                backgroundColor: currentGenre.color,
                                fontSize: 13,
                              }}
                            >
                              {currentGenre.icon}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{currentGenre.label}</span>
                          </div>
                          <ChevronDown size={14} style={{ color: t.popoverText, opacity: 0.5 }} />
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
                        {GENRES.map((g) => (
                          <DropdownMenuItem
                            key={g.type}
                            onClick={() => selectGenre(g.type)}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                            style={{
                              backgroundColor: genre === g.type ? `${t.accent}22` : "transparent",
                              color: t.popoverText,
                            }}
                          >
                            <div style={{ width: 14, textAlign: "center" }}>
                              {genre === g.type && <Check size={13} style={{ color: t.accent }} />}
                            </div>
                            <span
                              className="flex items-center justify-center rounded-lg select-none"
                              style={{
                                width: 28,
                                height: 28,
                                backgroundColor: g.color,
                                fontSize: 14,
                                flexShrink: 0,
                              }}
                            >
                              {g.icon}
                            </span>
                            <span style={{ fontSize: 13 }}>{g.label}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Play/Pause button */}
                    <button
                      onClick={togglePlay}
                      className="flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
                      style={{
                        width: 40,
                        height: 40,
                        backgroundColor: t.accent,
                        color: "#fff",
                        flexShrink: 0,
                        boxShadow: `0 4px 12px ${t.accent}33`,
                      }}
                    >
                      {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                    </button>
                  </div>

                  {/* Volume slider */}
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: `${t.border}44` }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span style={{ fontSize: 11, color: t.popoverText, opacity: 0.6 }}>
                        Music Volume
                      </span>
                      <span style={{ fontSize: 11, color: t.popoverText, opacity: 0.8, fontWeight: 600 }}>
                        {Math.round(musicVolume * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Volume2 size={13} style={{ color: t.popoverText, opacity: 0.5 }} />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={musicVolume}
                        onChange={(e) => handleMusicVolumeChange(parseFloat(e.target.value))}
                        className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, ${t.accent} ${musicVolume * 100}%, ${t.border} ${musicVolume * 100}%)`,
                          accentColor: t.accent,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}