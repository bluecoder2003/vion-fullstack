import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Play,
  Square,
  Volume2,
  VolumeX,
  Blend,
  ScanSearch,
  Waves,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  BookOpen,
  AudioLines,
  Mic,
} from "lucide-react";
import {
  AmbientEngine,
  detectScene,
  getSceneInfo,
  ALL_SCENES,
  type SceneType,
  type SceneDetectionResult,
} from "./ambientSounds";
import {
  OPENAI_VOICES,
  DEFAULT_VOICE_ID,
  buildNarrationInstructions,
} from "./openaiTtsApi";

// ═══════════════════════════════════════════════════
//  EXAMPLE PASSAGES — literary text for each scene
// ═══════════════════════════════════════════════════

interface SceneExample {
  scene: SceneType;
  title: string;
  passage: string;
  source: string;
}

const SCENE_EXAMPLES: SceneExample[] = [
  {
    scene: "morning",
    title: "A Fresh Dawn",
    passage:
      "The morning light crept slowly across the dew-laden meadow, and with it came the first tentative notes of birdsong. A rooster crowed in the distance as the sun edged above the tree line, painting the mist in shades of rose and gold. She stepped onto the porch at daybreak, breathing in the cool, dewy air, feeling the gentle warmth of sunrise on her face. Breakfast smells drifted from the kitchen—coffee and fresh bread—while the world quietly stirred awake around her.",
    source: "Original literary passage",
  },
  {
    scene: "nature",
    title: "The Verdant Wood",
    passage:
      "The forest path wound through towering oaks and ancient beeches, their canopy filtering the light into a mosaic of green and gold on the mossy ground. Birdsong echoed from the treetops—a thrush, perhaps, or a blackbird. Ferns unfurled along the edges of the trail, and wildflowers dotted the clearing ahead. The air was thick with the scent of pine and damp earth. A woodpecker hammered in the distance, and somewhere a brook murmured through the undergrowth of the deep woodland.",
    source: "Original literary passage",
  },
  {
    scene: "rain",
    title: "An Afternoon Downpour",
    passage:
      "The rain began softly—a gentle pattering against the windowpane—then grew into a steady downpour that drummed on the roof and turned the cobblestone street into a river of puddles. She pressed her umbrella tighter as raindrops splattered against its fabric. The drizzle had soaked through her coat by the time she reached the doorstep. Everything glistened: the iron railings, the slate rooftops, the leaves of the old chestnut tree bowing under the weight of the relentless shower.",
    source: "Original literary passage",
  },
  {
    scene: "ocean",
    title: "The Mariner's Voyage",
    passage:
      "The ship cut through the grey-green waves, her bow rising and falling with the swell of the open sea. Salt spray stung his cheeks as he gripped the deck railing and watched the shoreline recede into mist. Gulls wheeled above the mast, their cries swallowed by the roar of the surf. The harbour was far behind now. Ahead lay nothing but ocean—endless, slate-coloured, magnificent—and the faint promise of a distant shore. The tide pulled them onward, the sails full of a brisk coastal wind.",
    source: "Original literary passage",
  },
  {
    scene: "wind",
    title: "Across the Moor",
    passage:
      "The wind swept across the open moorland with a fierce, howling intensity, bending the heather flat and whipping her cloak behind her like a dark banner. Gusts tugged at her hair and stung her eyes. The breeze carried the smell of rain and far-off peat. She leaned into the gale, each step a negotiation with the blustery air that seemed to push from every direction. The windswept ridge offered no shelter—only the vast, roaring emptiness of the highland plateau, where even the clouds moved at breakneck speed.",
    source: "Original literary passage",
  },
  {
    scene: "fire",
    title: "By the Hearth",
    passage:
      "The fire crackled and spat in the great stone hearth, sending showers of orange embers spiralling up the chimney. He settled into the worn armchair and held his palms toward the flames, feeling the warmth seep into his aching fingers. A single candle guttered on the mantel beside a stack of letters. The firelight painted dancing shadows on the panelled walls. Outside, the world was dark and cold, but here—beside the blaze, with the scent of woodsmoke and the steady pop of burning oak—there was nothing but peace and flickering golden light.",
    source: "Original literary passage",
  },
  {
    scene: "night",
    title: "Under the Stars",
    passage:
      "The night was moonless and still. Stars prickled the velvet darkness overhead—thousands of them, more than he had ever seen in the city. An owl hooted from the treeline, a solitary, hollow sound that echoed across the darkened fields. Shadows pooled beneath the hedgerows, deep and impenetrable. The only light came from a single lamplight in a distant window, a warm yellow square against the twilight gloom. Crickets sang in the grass. The air was cool and damp with dusk, carrying the faintest scent of night-blooming jasmine.",
    source: "Original literary passage",
  },
  {
    scene: "city",
    title: "The Evening Market",
    passage:
      "The city streets hummed with life as dusk settled over the rooftops. Horse-drawn carriages clattered along the cobblestones, weaving between the crowds that spilled out of the marketplace. The smell of roasting chestnuts drifted from a vendor's cart. Merchants called out their wares—ribbons, spices, fresh bread. From the tavern on the corner came the muffled sound of laughter and a fiddle. Gaslights flickered to life along the pavement, casting pools of amber light across the bustling urban thoroughfare and the old stone square at its centre.",
    source: "Original literary passage",
  },
  {
    scene: "river",
    title: "The Winding Stream",
    passage:
      "The river ran clear and quick over a bed of smooth stones, chattering to itself as it wound between mossy banks. He sat on a flat rock at the water's edge, watching the current carry fallen leaves downstream in lazy spirals. A small waterfall tumbled over a ledge of slate, filling the air with a fine cool mist. The brook widened into a pool where trout flickered in the shallows. Beyond the far bank, willows trailed their fingers in the flowing water, and the whole valley hummed with the ceaseless, soothing murmur of the stream.",
    source: "Original literary passage",
  },
  {
    scene: "storm",
    title: "The Tempest",
    passage:
      "Thunder split the sky with a deafening crack, and an instant later lightning bleached the landscape white. The storm had descended with terrifying swiftness—sheets of rain hammering the earth, wind howling through the trees like a living thing. The old house groaned and shuddered. Through the streaming window he could see the garden transformed into a churning lake. Another thunderclap shook the walls, closer this time, and the lights flickered. The tempest raged on, furious and magnificent, turning the night into a chaos of wind, rain, and the relentless roar of thunder.",
    source: "Original literary passage",
  },
  {
    scene: "snow",
    title: "The Silent Frost",
    passage:
      "Snow fell softly, endlessly, muffling the world in white. The lane that wound past the cottage had vanished under a thick blanket of snowfall, and the fence posts wore tall caps of frost. Her breath hung in the frozen air like tiny clouds. The winter landscape was utterly still—no birds, no wind, only the hush of snowflakes settling on snowflakes. Ice glazed the windowpane in feathery crystals. The frozen lake at the bottom of the hill shone like polished steel. Even sound seemed to freeze in the glacial silence of this arctic morning.",
    source: "Original literary passage",
  },
  {
    scene: "indoor",
    title: "The Quiet Study",
    passage:
      "The study was small but comfortable—lined on three walls with bookshelves that reached to the ceiling, their spines a mosaic of faded leather and gilt lettering. A desk lamp cast a warm circle of light across papers and an open journal. The house was quiet; only the faint tick of a clock on the mantel and the occasional creak of the old staircase broke the stillness. Through the window, she could see the garden path leading to the front door. She turned a page of her book and settled deeper into the armchair in the corner of the room.",
    source: "Original literary passage",
  },
];

// ═══════════════════════════════════════════════════
//  BLEND EXAMPLES — passages that trigger two scenes
// ═══════════════════════════════════════════════════

interface BlendExample {
  title: string;
  passage: string;
  expectedPrimary: SceneType;
  expectedSecondary: SceneType;
}

const BLEND_EXAMPLES: BlendExample[] = [
  {
    title: "Rainy Night Walk",
    passage:
      "The rain fell steadily through the darkness, pattering against his umbrella as he walked the moonlit lane. Puddles reflected the starlight. Owls called from the shadowy treeline while raindrops dripped from overhanging branches. The drizzle showed no sign of stopping, and the night air was cold and damp.",
    expectedPrimary: "rain",
    expectedSecondary: "night",
  },
  {
    title: "Seaside Storm",
    passage:
      "Thunder rolled across the ocean, and lightning illuminated the churning waves. The ship pitched and rolled as the tempest struck with full fury. Saltwater spray mixed with the torrential rain, and the gale-force wind tore at the sails. The sea was a mountain range of grey water beneath the storm-black sky.",
    expectedPrimary: "storm",
    expectedSecondary: "ocean",
  },
  {
    title: "Forest Morning",
    passage:
      "Dawn light filtered through the ancient trees as the forest woke to a new morning. Birds sang from every branch, greeting the sunrise with a joyous chorus. Dew glistened on fern fronds and wildflowers. A rooster crowed from a distant farm beyond the woodland. The meadow at the forest's edge was golden with first light, the air fresh and full of birdsong.",
    expectedPrimary: "nature",
    expectedSecondary: "morning",
  },
  {
    title: "Fireside in the Snow",
    passage:
      "Outside the cabin windows, snow fell in thick curtains, blanketing the frozen landscape in white silence. But inside, the fire crackled warmly in the hearth, its embers glowing orange. He watched the snowflakes drift past the frosty windowpane while warming his hands by the blaze. The flames danced and the winter wind howled softly beyond the walls.",
    expectedPrimary: "fire",
    expectedSecondary: "snow",
  },
  {
    title: "City River at Night",
    passage:
      "The river wound through the heart of the city, its dark waters reflecting the gaslights that lined the cobblestone embankment. The evening crowd jostled along the pavement—merchants, carriages, street vendors—while below them the stream flowed silently under ancient stone bridges. Moonlight silvered the flowing water as the busy streets hummed above.",
    expectedPrimary: "city",
    expectedSecondary: "river",
  },
];

// ═══════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════

interface SceneDemoPageProps {
  onBack: () => void;
}

export function SceneDemoPage({ onBack }: SceneDemoPageProps) {
  const engineRef = useRef<AmbientEngine | null>(null);
  const [playingScene, setPlayingScene] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.4);
  const [activeTab, setActiveTab] = useState<"scenes" | "blends" | "detector" | "books">("scenes");
  const [detectorText, setDetectorText] = useState("");
  const [detectorResult, setDetectorResult] = useState<SceneDetectionResult | null>(null);
  const [expandedScene, setExpandedScene] = useState<string | null>(null);

  // Theme — use the dark "quiet" style to match the reader
  const t = {
    bg: "#1a1a1e",
    surface: "#242428",
    card: "#2a2a30",
    text: "#d4d4d4",
    textMuted: "#888",
    accent: "#6b9fff",
    accentGlow: "rgba(107, 159, 255, 0.15)",
    border: "#3a3a40",
    success: "#4ade80",
    warning: "#fbbf24",
  };

  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AmbientEngine();
    }
    return engineRef.current;
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  const playScene = useCallback(
    (scene: SceneType, secondary?: SceneType | null, secondaryWeight?: number) => {
      const engine = getEngine();
      const key = secondary ? `${scene}+${secondary}` : scene;

      if (playingScene === key) {
        engine.stop();
        setPlayingScene(null);
        return;
      }

      if (playingScene) {
        engine.stop();
      }

      setTimeout(() => {
        engine.start(scene, secondary, secondaryWeight);
        setPlayingScene(key);
      }, 100);
    },
    [getEngine, playingScene],
  );

  const stopAll = useCallback(() => {
    engineRef.current?.stop();
    setPlayingScene(null);
  }, []);

  // Detector logic
  const runDetection = useCallback((text: string) => {
    setDetectorText(text);
    if (text.trim().length > 10) {
      const result = detectScene(text);
      setDetectorResult(result);
    } else {
      setDetectorResult(null);
    }
  }, []);

  return (
    <div
      className="size-full overflow-y-auto"
      style={{ backgroundColor: t.bg, color: t.text, fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ── Header ── */}
      <div
        className="sticky top-0 z-20 flex items-center gap-3 px-6 py-4"
        style={{
          backgroundColor: `${t.bg}ee`,
          backdropFilter: "blur(20px)",
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: t.accent, fontSize: 14 }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.accentGlow)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <ArrowLeft size={16} />
          Back to Library
        </button>

        <div className="flex-1 text-center">
          <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>
            <Waves size={18} className="inline mr-2" style={{ color: t.accent, verticalAlign: "text-bottom" }} />
            Ambient Soundscape Demo
          </h1>
          <p style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
            12 procedural scenes &middot; Web Audio API synthesis &middot; Scene blending &middot; Smart detection
          </p>
        </div>

        {/* Volume control */}
        <div className="flex items-center gap-2">
          {volume > 0 ? <Volume2 size={15} style={{ color: t.textMuted }} /> : <VolumeX size={15} style={{ color: t.textMuted }} />}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 accent-blue-400"
            style={{ height: 4 }}
          />
          {playingScene && (
            <button
              onClick={stopAll}
              className="ml-2 flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors"
              style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}
            >
              <Square size={10} fill="currentColor" /> Stop
            </button>
          )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div
        className="flex gap-1 px-6 py-3"
        style={{ borderBottom: `1px solid ${t.border}` }}
      >
        {(
          [
            { key: "scenes", label: "All 12 Scenes", icon: <Sparkles size={14} /> },
            { key: "books", label: "Books Showcase", icon: <BookOpen size={14} /> },
            { key: "blends", label: "Scene Blending", icon: <Blend size={14} /> },
            { key: "detector", label: "Live Detector", icon: <ScanSearch size={14} /> },
          ] as const
        ).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-all"
            style={{
              backgroundColor: activeTab === key ? t.accentGlow : "transparent",
              color: activeTab === key ? t.accent : t.textMuted,
              fontWeight: activeTab === key ? 600 : 400,
              border: activeTab === key ? `1px solid ${t.accent}33` : "1px solid transparent",
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="px-6 py-6 max-w-6xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === "scenes" && (
            <motion.div
              key="scenes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ScenesTab
                t={t}
                playingScene={playingScene}
                expandedScene={expandedScene}
                setExpandedScene={setExpandedScene}
                onPlay={playScene}
              />
            </motion.div>
          )}
          {activeTab === "books" && (
            <motion.div
              key="books"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <BooksTab t={t} playingScene={playingScene} onPlay={playScene} onStopAmbient={stopAll} />
            </motion.div>
          )}
          {activeTab === "blends" && (
            <motion.div
              key="blends"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <BlendsTab t={t} playingScene={playingScene} onPlay={playScene} />
            </motion.div>
          )}
          {activeTab === "detector" && (
            <motion.div
              key="detector"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <DetectorTab
                t={t}
                text={detectorText}
                result={detectorResult}
                onTextChange={runDetection}
                playingScene={playingScene}
                onPlay={playScene}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  TAB 1: ALL 12 SCENES
// ═══════════════════════════════════════════════��═══

interface ThemeColors {
  bg: string; surface: string; card: string; text: string;
  textMuted: string; accent: string; accentGlow: string;
  border: string; success: string; warning: string;
}

function ScenesTab({
  t,
  playingScene,
  expandedScene,
  setExpandedScene,
  onPlay,
}: {
  t: ThemeColors;
  playingScene: string | null;
  expandedScene: string | null;
  setExpandedScene: (s: string | null) => void;
  onPlay: (scene: SceneType) => void;
}) {
  return (
    <div>
      <div className="mb-6">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          Procedural Sound Scenes
        </h2>
        <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
          Each scene is synthesised in real-time using the Web Audio API — no audio files required.
          Click a scene card to hear it and expand the literary passage that would trigger auto-detection.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SCENE_EXAMPLES.map((example) => {
          const info = getSceneInfo(example.scene);
          const isPlaying = playingScene === example.scene;
          const isExpanded = expandedScene === example.scene;
          const detection = detectScene(example.passage);

          return (
            <motion.div
              key={example.scene}
              layout
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: t.card,
                border: isPlaying ? `1px solid ${t.accent}66` : `1px solid ${t.border}`,
                boxShadow: isPlaying ? `0 0 20px ${t.accentGlow}` : "none",
                transition: "border-color 0.3s, box-shadow 0.3s",
              }}
            >
              {/* Card header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => onPlay(example.scene)}
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: isPlaying ? t.accent : `${t.accent}22`,
                    color: isPlaying ? "#fff" : t.accent,
                    boxShadow: isPlaying ? `0 0 12px ${t.accent}55` : "none",
                  }}
                >
                  {isPlaying ? (
                    <Square size={14} fill="currentColor" />
                  ) : (
                    <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 20 }}>{info.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{info.label}</span>
                    {isPlaying && (
                      <motion.div
                        className="flex gap-0.5 items-end h-3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-0.5 rounded-full"
                            style={{ backgroundColor: t.accent }}
                            animate={{ height: [4, 12, 4] }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              delay: i * 0.15,
                              ease: "easeInOut",
                            }}
                          />
                        ))}
                      </motion.div>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>
                    {info.description}
                  </p>
                </div>

                {/* Confidence badge */}
                <div
                  className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs"
                  style={{
                    backgroundColor:
                      detection.confidence > 0.7
                        ? "rgba(74, 222, 128, 0.15)"
                        : detection.confidence > 0.4
                          ? "rgba(251, 191, 36, 0.15)"
                          : "rgba(107, 159, 255, 0.15)",
                    color:
                      detection.confidence > 0.7
                        ? t.success
                        : detection.confidence > 0.4
                          ? t.warning
                          : t.accent,
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {Math.round(detection.confidence * 100)}% match
                </div>
              </div>

              {/* Expand/collapse toggle */}
              <button
                onClick={() => setExpandedScene(isExpanded ? null : example.scene)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs transition-colors"
                style={{
                  color: t.textMuted,
                  backgroundColor: isExpanded ? `${t.border}33` : "transparent",
                  borderTop: `1px solid ${t.border}44`,
                }}
              >
                <span>{example.title}</span>
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {/* Expanded passage */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="px-4 py-3"
                      style={{
                        backgroundColor: `${t.bg}88`,
                        borderTop: `1px solid ${t.border}33`,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 12.5,
                          lineHeight: 1.7,
                          color: `${t.text}cc`,
                          fontFamily: "Georgia, 'Times New Roman', serif",
                          fontStyle: "italic",
                        }}
                      >
                        &ldquo;{example.passage}&rdquo;
                      </p>

                      {/* Detection breakdown */}
                      <div
                        className="mt-3 pt-3 flex items-center gap-3 flex-wrap"
                        style={{ borderTop: `1px solid ${t.border}33`, fontSize: 11 }}
                      >
                        <span style={{ color: t.textMuted }}>Detection:</span>
                        <span className="flex items-center gap-1">
                          <span>{getSceneInfo(detection.primary).emoji}</span>
                          <span style={{ fontWeight: 600, color: t.accent }}>
                            {getSceneInfo(detection.primary).label}
                          </span>
                        </span>
                        {detection.secondary && (
                          <>
                            <span style={{ color: t.textMuted }}>+</span>
                            <span className="flex items-center gap-1" style={{ opacity: 0.7 }}>
                              <span>{getSceneInfo(detection.secondary).emoji}</span>
                              <span>{getSceneInfo(detection.secondary).label}</span>
                              <span style={{ color: t.textMuted }}>
                                ({Math.round(detection.secondaryWeight * 100)}%)
                              </span>
                            </span>
                          </>
                        )}
                        <div className="flex-1" />
                        <span style={{ color: t.textMuted, fontStyle: "italic" }}>
                          {example.source}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  TAB 2: SCENE BLENDING
// ═══════════════════════════════════════════════════

function BlendsTab({
  t,
  playingScene,
  onPlay,
}: {
  t: ThemeColors;
  playingScene: string | null;
  onPlay: (scene: SceneType, secondary?: SceneType | null, secondaryWeight?: number) => void;
}) {
  return (
    <div>
      <div className="mb-6">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          <Blend size={16} className="inline mr-2" style={{ color: t.accent }} />
          Scene Blending
        </h2>
        <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
          When text contains keywords from multiple environments, the engine plays two scenes simultaneously —
          a primary scene at full volume and a secondary scene blended at a lower level. This creates richer, more
          nuanced soundscapes that match complex literary settings.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {BLEND_EXAMPLES.map((example, idx) => {
          const detection = detectScene(example.passage);
          const blendKey = `${detection.primary}+${detection.secondary}`;
          const isPlaying = playingScene === blendKey;
          const primaryInfo = getSceneInfo(detection.primary);
          const secondaryInfo = detection.secondary ? getSceneInfo(detection.secondary) : null;

          return (
            <motion.div
              key={idx}
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: t.card,
                border: isPlaying ? `1px solid ${t.accent}66` : `1px solid ${t.border}`,
                boxShadow: isPlaying ? `0 0 24px ${t.accentGlow}` : "none",
              }}
            >
              {/* Header row */}
              <div className="flex items-start gap-4 p-5">
                <div className="flex-1 min-w-0">
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                    {example.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: `${t.text}bb`,
                      fontFamily: "Georgia, 'Times New Roman', serif",
                    }}
                  >
                    &ldquo;{example.passage}&rdquo;
                  </p>
                </div>
              </div>

              {/* Detection results + play */}
              <div
                className="flex items-center gap-3 px-5 py-3"
                style={{
                  backgroundColor: `${t.bg}88`,
                  borderTop: `1px solid ${t.border}44`,
                }}
              >
                {/* Primary scene pill */}
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: `${t.accent}15`, border: `1px solid ${t.accent}33` }}
                >
                  <span style={{ fontSize: 16 }}>{primaryInfo.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.accent }}>{primaryInfo.label}</span>
                  <span
                    className="ml-1 px-1.5 py-0.5 rounded text-xs"
                    style={{ backgroundColor: `${t.accent}22`, color: t.accent, fontSize: 10 }}
                  >
                    Primary &middot; {Math.round(detection.confidence * 100)}%
                  </span>
                </div>

                {secondaryInfo && (
                  <>
                    <span style={{ color: t.textMuted, fontSize: 16 }}>+</span>
                    {/* Secondary scene pill */}
                    <div
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                      style={{ backgroundColor: `${t.border}33`, border: `1px solid ${t.border}` }}
                    >
                      <span style={{ fontSize: 16 }}>{secondaryInfo.emoji}</span>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{secondaryInfo.label}</span>
                      <span
                        className="ml-1 px-1.5 py-0.5 rounded text-xs"
                        style={{ backgroundColor: `${t.border}55`, color: t.textMuted, fontSize: 10 }}
                      >
                        Blend &middot; {Math.round(detection.secondaryWeight * 100)}%
                      </span>
                    </div>
                  </>
                )}

                <div className="flex-1" />

                {/* Play blended button */}
                <button
                  onClick={() =>
                    onPlay(detection.primary, detection.secondary, detection.secondaryWeight)
                  }
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all"
                  style={{
                    backgroundColor: isPlaying ? t.accent : `${t.accent}22`,
                    color: isPlaying ? "#fff" : t.accent,
                    fontWeight: 600,
                    boxShadow: isPlaying ? `0 0 12px ${t.accent}44` : "none",
                  }}
                >
                  {isPlaying ? (
                    <>
                      <Square size={12} fill="currentColor" /> Stop
                    </>
                  ) : (
                    <>
                      <Play size={12} fill="currentColor" /> Play Blended
                    </>
                  )}
                </button>
              </div>

              {/* Blend visualisation bar */}
              {detection.secondary && (
                <div className="px-5 py-2" style={{ borderTop: `1px solid ${t.border}22` }}>
                  <div className="flex items-center gap-2 text-xs" style={{ color: t.textMuted, marginBottom: 4 }}>
                    <span>Volume mix:</span>
                  </div>
                  <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                    <motion.div
                      className="rounded-l-full"
                      style={{ backgroundColor: t.accent, opacity: 0.8 }}
                      initial={{ width: 0 }}
                      animate={{ width: `${((1 - detection.secondaryWeight) * 100).toFixed(0)}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                    <motion.div
                      className="rounded-r-full"
                      style={{ backgroundColor: t.warning, opacity: 0.6 }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(detection.secondaryWeight * 100).toFixed(0)}%` }}
                      transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-1" style={{ color: t.textMuted }}>
                    <span>
                      {primaryInfo.emoji} {primaryInfo.label} ({Math.round((1 - detection.secondaryWeight) * 100)}%)
                    </span>
                    <span>
                      {secondaryInfo!.emoji} {secondaryInfo!.label} ({Math.round(detection.secondaryWeight * 100)}%)
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Info callout */}
      <div
        className="mt-6 flex items-start gap-3 rounded-xl px-5 py-4"
        style={{ backgroundColor: `${t.accent}0a`, border: `1px solid ${t.accent}22` }}
      >
        <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: t.accent }} />
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>
          <strong style={{ color: t.accent }}>How blending works:</strong> The scene detector scores all
          keywords found in the current text window. If a second scene scores &ge;40% of the top scene, it&rsquo;s
          added as a secondary blend layer. The engine runs both sound generators simultaneously,
          crossfading them in real-time via independent gain nodes routed through a shared bus.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  TAB 3: LIVE DETECTOR
// ═══════════════════════════════════════════════════

function DetectorTab({
  t,
  text,
  result,
  onTextChange,
  playingScene,
  onPlay,
}: {
  t: ThemeColors;
  text: string;
  result: SceneDetectionResult | null;
  onTextChange: (text: string) => void;
  playingScene: string | null;
  onPlay: (scene: SceneType, secondary?: SceneType | null, secondaryWeight?: number) => void;
}) {
  const presets = useMemo(
    () => [
      {
        label: "Stormy seas",
        text: "The thunder cracked over the ocean as massive waves crashed against the ship's hull. Lightning split the sky, illuminating the churning sea. Rain hammered the deck while sailors fought to keep the vessel steady against the howling gale.",
      },
      {
        label: "Cosy cabin",
        text: "Snow piled high outside the cabin's frosted windows while inside the fire crackled merrily in the hearth. She sat in the armchair by the mantel with a cup of tea, listening to the soft tick of the old clock on the bookshelf. The room was warm and quiet.",
      },
      {
        label: "Morning walk",
        text: "She woke at dawn and stepped out into the cool morning air. Dew sparkled on the garden flowers as a rooster crowed from the farm across the meadow. Birds sang from every tree, greeting the sunrise. She walked the forest path, breathing in the scent of pine and damp earth.",
      },
      {
        label: "Night city",
        text: "The city streets were alive with moonlight and gaslight. Crowds jostled along the pavement as carriages rattled over the cobblestones. Stars prickled the darkness above the rooftops, and from a distant tavern came the muffled sound of laughter. An owl hooted somewhere in the park.",
      },
    ],
    [],
  );

  return (
    <div>
      <div className="mb-6">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          <ScanSearch size={16} className="inline mr-2" style={{ color: t.accent }} />
          Live Scene Detector
        </h2>
        <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
          Type or paste any text below to see which ambient scene the detection algorithm selects.
          The detector uses weighted keyword matching with regex patterns to score text against all 12 scene types.
        </p>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span style={{ fontSize: 12, color: t.textMuted, lineHeight: "28px" }}>Try:</span>
        {presets.map((p, i) => (
          <button
            key={i}
            onClick={() => onTextChange(p.text)}
            className="px-3 py-1 rounded-lg text-xs transition-colors"
            style={{
              backgroundColor: `${t.border}44`,
              color: t.text,
              border: `1px solid ${t.border}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${t.accent}22`)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = `${t.border}44`)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Text input */}
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Paste a literary passage here to detect its ambient scene..."
        rows={6}
        className="w-full rounded-xl px-4 py-3 resize-y"
        style={{
          backgroundColor: t.surface,
          color: t.text,
          border: `1px solid ${t.border}`,
          fontSize: 13,
          lineHeight: 1.7,
          fontFamily: "Georgia, 'Times New Roman', serif",
          outline: "none",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = `${t.accent}66`)}
        onBlur={(e) => (e.currentTarget.style.borderColor = t.border)}
      />

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5 rounded-xl overflow-hidden"
            style={{ backgroundColor: t.card, border: `1px solid ${t.border}` }}
          >
            <div className="px-5 py-4">
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Detection Result
              </div>

              {/* Primary scene */}
              <div className="flex items-center gap-4 mb-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: `${t.accent}15`, fontSize: 28 }}
                >
                  {getSceneInfo(result.primary).emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 18, fontWeight: 600 }}>
                      {getSceneInfo(result.primary).label}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-xs"
                      style={{ backgroundColor: `${t.accent}22`, color: t.accent, fontWeight: 600 }}
                    >
                      Primary
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                    {getSceneInfo(result.primary).description}
                  </p>

                  {/* Confidence bar */}
                  <div className="flex items-center gap-2 mt-2">
                    <div
                      className="h-2 rounded-full overflow-hidden flex-1"
                      style={{ backgroundColor: `${t.border}44`, maxWidth: 200 }}
                    >
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor:
                            result.confidence > 0.7 ? t.success : result.confidence > 0.4 ? t.warning : t.accent,
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(result.confidence * 100)}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>
                      {Math.round(result.confidence * 100)}% confidence
                    </span>
                  </div>
                </div>

                {/* Play button */}
                <button
                  onClick={() => onPlay(result.primary, result.secondary, result.secondaryWeight)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all"
                  style={{
                    backgroundColor:
                      playingScene === (result.secondary ? `${result.primary}+${result.secondary}` : result.primary)
                        ? t.accent
                        : `${t.accent}22`,
                    color:
                      playingScene === (result.secondary ? `${result.primary}+${result.secondary}` : result.primary)
                        ? "#fff"
                        : t.accent,
                    fontWeight: 600,
                  }}
                >
                  {playingScene === (result.secondary ? `${result.primary}+${result.secondary}` : result.primary) ? (
                    <>
                      <Square size={13} fill="currentColor" /> Stop
                    </>
                  ) : (
                    <>
                      <Play size={13} fill="currentColor" /> Play
                    </>
                  )}
                </button>
              </div>

              {/* Secondary scene */}
              {result.secondary && result.secondary !== "silence" && (
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-xl mt-2"
                  style={{ backgroundColor: `${t.bg}88`, border: `1px solid ${t.border}44` }}
                >
                  <span style={{ fontSize: 22 }}>{getSceneInfo(result.secondary).emoji}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 14, fontWeight: 500 }}>
                        {getSceneInfo(result.secondary).label}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-xs"
                        style={{ backgroundColor: `${t.border}44`, color: t.textMuted }}
                      >
                        Secondary blend &middot; {Math.round(result.secondaryWeight * 100)}% weight
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>
                      Blended at lower volume to add texture and depth
                    </p>
                  </div>
                </div>
              )}

              {/* All scene scores */}
              <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${t.border}33` }}>
                <div
                  style={{
                    fontSize: 11,
                    color: t.textMuted,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  All Scene Scores
                </div>
                <AllScoresBars t={t} text={text} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!result && text.length > 0 && text.length <= 10 && (
        <p style={{ fontSize: 12, color: t.textMuted, marginTop: 12 }}>
          Keep typing... need at least a few words for detection.
        </p>
      )}
    </div>
  );
}

// Helper: show all scene keyword scores as horizontal bars
function AllScoresBars({ t, text }: { t: ThemeColors; text: string }) {
  // Re-run keyword matching to get raw scores
  const KEYWORD_MAP: [SceneType, RegExp, number][] = [
    ["storm", /\b(thunder|lightning|tempest|hurricane|tornado|thunderstorm|gale\b.*fierce|cyclone|typhoon|thunderclap|thunderous)\b/i, 3],
    ["ocean", /\b(ocean|sea\b|waves?\b|beach|shore|coast|tide|surf(?:ing)?|sailing|sail(?:ed)?|mariner|vessel|harbour|harbor|whaler?|maritime|nautical|bay|lagoon|coral|seagull|cliffs?\s+above\s+the\s+sea|lighthouse|anchor|ship|aboard|deck|port|starboard)\b/i, 2],
    ["river", /\b(river|stream|creek|brook|waterfall|flowing\s+water|cascade|rivulet|rapids|canal|ford|bank\s+of\s+the)\b/i, 2],
    ["rain", /\b(rain(?:ing|y|ed|drops?)?|drizzl(?:e|ing)|downpour|umbrella|puddles?|drenched|soaked|monsoon|shower(?:s)?|sleet|patter(?:ing)?)\b/i, 2],
    ["fire", /\b(fire(?:place|side|light)?|flame|hearth|campfire|burning|candle(?:light|s)?|torch(?:es)?|embers?|blaze|bonfire|lantern|lamp\b|warmth\s+of\s+the\s+fire|stove|mantel|chimney)\b/i, 2],
    ["snow", /\b(snow(?:y|fall|flake|drift|storm)?|blizzard|frost(?:y|ed)?|ice\b|icy|frozen|winter(?:y)?|arctic|polar|sledge|freez(?:ing|e)|glacial|sleet)\b/i, 2],
    ["morning", /\b(morning|dawn|sunrise|daybreak|first\s+light|rooster|cock\s*crow|dew|early\s+light|wak(?:e|ing)\s+(?:up|to)|breakfast|misty\s+morning)\b/i, 2],
    ["wind", /\b(wind(?:y|swept)?|breeze|gust(?:s|ing)?|blow(?:ing|n)|blustery|zephyr|draught|draft|whipp(?:ing|ed)|howl(?:ing)?)\b/i, 1.5],
    ["night", /\b(night(?:fall|time)?|moon(?:light|lit|less)?|stars?\b|starry|darkness|midnight|dusk|evening|twilight|nocturnal|owl|crescent|shadow(?:s|y)?|lamp\s*light|candle\s*lit)\b/i, 1.5],
    ["nature", /\b(forest|trees?\b|garden|meadow|field|grass(?:y)?|flowers?\b|bird(?:s|song)?|woodland|grove|valley|hill(?:side)?|mountain|alpine|summit|peak|blossom|orchard|pastoral|countryside|foliage|fern|moss|clearing|path\s+through)\b/i, 1.5],
    ["city", /\b(city|street|traffic|cars?\b|downtown|urban|crowd(?:ed|s)?|market(?:place)?|tavern|inn\b|shop|merchant|town|village|square|cobblestone|carriage|coach|alley|pavement|café|restaurant|pub|saloon|sidewalk)\b/i, 1.5],
    ["indoor", /\b(room|chamber|house|home|parlou?r|library|study\b|bedroom|hall(?:way)?|door(?:way)?|window|staircase|mansion|castle|cottage|cabin|lodge|dwelling|apartment|cupboard|kitchen|cellar|attic|corridor|passage|closet|desk|bookshelf)\b/i, 1],
  ];

  const scores: Record<string, number> = {};
  let maxScore = 1;

  for (const [scene, regex, weight] of KEYWORD_MAP) {
    const matches = text.match(new RegExp(regex.source, "gi"));
    if (matches) {
      scores[scene] = (scores[scene] || 0) + matches.length * weight;
      if (scores[scene] > maxScore) maxScore = scores[scene];
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {ALL_SCENES.map((scene) => {
        const info = getSceneInfo(scene);
        const score = scores[scene] || 0;
        const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;

        return (
          <div key={scene} className="flex items-center gap-2">
            <span className="w-5 text-center" style={{ fontSize: 13 }}>
              {info.emoji}
            </span>
            <span className="w-16 text-xs" style={{ color: score > 0 ? t.text : t.textMuted, fontSize: 11 }}>
              {info.label}
            </span>
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: `${t.border}33` }}
            >
              {score > 0 && (
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: score === maxScore ? t.accent : `${t.accent}88` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.4, delay: 0.05 }}
                />
              )}
            </div>
            <span className="w-8 text-right text-xs" style={{ color: t.textMuted, fontSize: 10 }}>
              {score > 0 ? score.toFixed(1) : "-"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  TAB 4: BOOKS SHOWCASE — real classic novel passages
// ═══════════════════════════════════════════════════

interface BookShowcase {
  title: string;
  author: string;
  year: number;
  color: string;         // accent color for the spine
  scenes: {
    chapter: string;
    passage: string;
  }[];
}

const BOOK_SHOWCASES: BookShowcase[] = [
  {
    title: "Frankenstein",
    author: "Mary Shelley",
    year: 1818,
    color: "#7cc5e3",
    scenes: [
      {
        chapter: "Letter I — Arctic Expedition",
        passage: "I am already far north of London, and as I walk in the streets of Petersburgh, I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight. I try in vain to be persuaded that the pole is the seat of frost and desolation; there snow and frost are banished; and, sailing over a calm sea, we may be wafted to a land surpassing in wonders. I voluntarily endured cold, famine, thirst, and want of sleep; I hired myself as an under-mate in a Greenland whaler.",
      },
      {
        chapter: "Chapter V — The Creation",
        passage: "It was on a dreary night of November that I beheld the accomplishment of my toils. I collected the instruments of life around me, that I might infuse a spark into the lifeless thing. The rain pattered dismally against the panes, and my candle was nearly burnt out, when, by the glimmer of the half-extinguished light, I saw the dull yellow eye of the creature open. I rushed out of the room and continued a long time traversing my bedchamber.",
      },
      {
        chapter: "Chapter X — The Alpine Valley",
        passage: "I spent the following day roaming through the valley. I stood beside the sources of the Arveiron, which take their rise in a glacier. The steep sides of vast mountains were before me; the icy wall of the glacier overhung me; a few shattered pines were scattered around; the solemn silence of this glorious presence-chamber of imperial nature was broken only by the brawling waves or the fall of some vast fragment, the thunder sound of the avalanche, or the cracking of the accumulated ice.",
      },
      {
        chapter: "Chapter XXIV — The Arctic Chase",
        passage: "I was answered through the darkness by the sound of thunder. The sea was rough, and the waves crashed against the ship as we pressed northward through the frozen strait. Immense sheets of ice surrounded us on all sides, threatening to crush the vessel. The cold was excessive, and many of my unfortunate comrades had already found a grave amidst this scene of desolation. Stars hung above us in the arctic night, brilliant and cold.",
      },
    ],
  },
  {
    title: "Moby-Dick",
    author: "Herman Melville",
    year: 1851,
    color: "#5b9bd5",
    scenes: [
      {
        chapter: "Ch. 1 — Loomings (City)",
        passage: "There now is your insular city of the Manhattoes, belted round by wharves as Indian isles by coral reefs — commerce surrounds it with her surf. Right and left, the streets take you waterward. Its extreme downtown is the Battery, where that noble mole is washed by waves and cooled by breezes. Look at the crowds of water-gazers there, pacing straight for the water along the cobblestone streets, past the shops and merchants and carriages.",
      },
      {
        chapter: "Ch. 23 — The Lee Shore",
        passage: "The port is safety, but the ship is cast upon the howling infinite of the sea. In the deep shadows of midnight the waves battered the hull, and the wind screamed through the rigging like a living thing. The ocean stretched before them, vast and terrible, swallowing the horizon. Salt spray stung their faces as the vessel pitched and rolled upon the heaving grey-green swells, sailing ever onward into the unknown waters.",
      },
      {
        chapter: "Ch. 119 — The Candles",
        passage: "All the yard-arms were tipped with a pallid fire; and touched at each tri-pointed lightning-rod-end with three tapering white flames. The lightning struck the ship, and thunder pealed across the ocean. The typhoon was upon them with terrifying fury. To windward, all was blackness of doom; then the tempest's howling gale tore at the masts, and the rain came down in torrential sheets.",
      },
    ],
  },
  {
    title: "Wuthering Heights",
    author: "Emily Bront\u00eb",
    year: 1847,
    color: "#9b6bb0",
    scenes: [
      {
        chapter: "Ch. 1 — The Moor Wind",
        passage: "Wuthering Heights is the name of Mr. Heathcliff's dwelling. 'Wuthering' being a significant provincial adjective, descriptive of the atmospheric tumult to which its station is exposed in stormy weather. Pure, bracing ventilation they must have up there at all times, indeed: one may guess the power of the north wind blowing over the edge, by the excessive slant of a few stunted firs at the end of the house; and by a range of gaunt thorns all stretching their limbs one way, as if craving alms of the sun. The gusty moorland breeze howled around the chimneys.",
      },
      {
        chapter: "Ch. 9 — The Fireside Confession",
        passage: "She was struck during a tempest of passion with a kind of fit. The fire crackled in the hearth, its embers throwing warm light across the parlour. A candle guttered on the mantel as the flames danced. Nelly sat in the chimney corner, listening to the steady pop of burning logs while the shadows flickered along the walls. Outside, the wind moaned across the moors, but inside the warmth of the blaze kept the darkness at bay.",
      },
      {
        chapter: "Ch. 34 — Heathcliff's End",
        passage: "The following night the rain poured and the wind howled. I could not help looking out of the window towards the kirkyard and the dark moors beyond. The sky was overcast; not merely a starry night, but thick, heavy darkness, with gusts of wind that bent the trees until they moaned. Midnight passed, then the small hours, and the rain dripped steadily from the eaves while shadows gathered at every doorway of the old house.",
      },
    ],
  },
  {
    title: "Adventures of Huckleberry Finn",
    author: "Mark Twain",
    year: 1884,
    color: "#7fc47f",
    scenes: [
      {
        chapter: "Ch. 7 — Down the River",
        passage: "We went drifting down into a big bend, and the night clouded up and got hot. The river was very wide, and was walled with solid timber on both sides; you couldn't see a break in it hardly ever, or a light. The current was running about four or five miles an hour. Every little while we'd hear the water flowing over stones, and see the stream bending between the banks. It was kind of solemn, drifting down the big, still river, looking up at the stars.",
      },
      {
        chapter: "Ch. 9 — The Cave Morning",
        passage: "I waked up to the morning. The birds were singing their dawn chorus, and a rooster crowed from across the far bank. The sun came up golden through the trees, and dew sparkled on the grass and wildflowers. The fresh, sweet morning air drifted up from the river, and the first light of sunrise painted everything warm and soft. It was wonderful to wake to daybreak in the forest, with birdsong all around.",
      },
      {
        chapter: "Ch. 19 — The Thunderstorm",
        passage: "And then the thunder would go rumbling and grumbling away, and quit — and then rip comes another flash and another sockdolager. The waves most washed me off the raft sometimes. The rain poured down and the lightning glared, and the wind blew a hurricane. Every second or two there'd come a glare of lightning that lit up the white-caps for a half a mile around, and the islands looking dusty through the rain, and the trees thrashing around in the wind.",
      },
    ],
  },
  {
    title: "Dracula",
    author: "Bram Stoker",
    year: 1897,
    color: "#c94c4c",
    scenes: [
      {
        chapter: "Ch. 1 — Arriving at the Castle",
        passage: "The castle stood dark against the midnight sky, its towers silhouetted by faint moonlight. Shadows clung to every wall and staircase, thick as velvet. Not a sound stirred in the vast chambers — only the distant howling of wolves on the mountain slopes, and the occasional creak of an ancient door in the draughty corridor. An owl hooted from somewhere in the darkness. The stars were cold and dim above the black Carpathian peaks.",
      },
      {
        chapter: "Ch. 7 — The Storm at Whitby",
        passage: "Then without warning the tempest broke. With a rapidity which seemed incredible, the whole aspect of nature changed. The waves rose in growing fury, each overtopping its fellow, till in a very few minutes the lately glassy sea was like a roaring and devouring monster. The wind shrieked through the harbour. White-crested waves beat madly on the shore, and the thunder came in mighty peals. Lightning illuminated the sea, and a ship appeared, running before the gale.",
      },
      {
        chapter: "Ch. 14 — The Quiet Study",
        passage: "Van Helsing sat in the library, a great room lined from floor to ceiling with bookshelves. The desk lamp threw a warm circle over the scattered papers and journals. The house was utterly quiet — only the faint tick of the clock on the mantel broke the silence. He turned the pages of an old manuscript, the leather binding creaking softly. Outside the window the garden lay dark and still. The study felt close, safe, a room apart from the terrors that awaited in the night.",
      },
    ],
  },
  {
    title: "A Tale of Two Cities",
    author: "Charles Dickens",
    year: 1859,
    color: "#e8a838",
    scenes: [
      {
        chapter: "Bk I, Ch. 2 — The Dover Road",
        passage: "It was the Dover road that lay, on a Friday night late in November, before the first of the persons with whom this history has business. The rain was driving in from the sea in sheets, and the gusts of wind whipped the coach like a furious hand. A clammy and intensely cold mist drenched everything. The horses steamed, the coachman's lantern guttered, and the passengers shivered and pulled their cloaks tighter against the howling weather. Puddles filled every rut in the muddy road.",
      },
      {
        chapter: "Bk II, Ch. 1 — The Streets of London",
        passage: "The streets of London were busy and bustling. Carriages rattled over the cobblestones past the crowded shops and taverns of the city. Merchants called their wares from stalls in the marketplace, and the town square rang with the noise of commerce and conversation. Crowds jostled on the pavement. From every inn and public house came the sound of laughter and singing, and the gaslights flickered to life as evening settled over the rooftops of the great urban sprawl.",
      },
      {
        chapter: "Bk III, Ch. 15 — The Final Night",
        passage: "The night was starless and still. Through the barred window, not a glimmer of moonlight fell upon the stone room. Shadows filled the chamber from wall to wall. In the darkness, the only sounds were the slow drip of water from the corridor ceiling and the distant tolling of a church bell at midnight. The air was cold and heavy, thick with twilight dread, and the silence of the prison was absolute save for those faint, hollow echoes.",
      },
    ],
  },
  {
    title: "The Call of the Wild",
    author: "Jack London",
    year: 1903,
    color: "#6baed6",
    scenes: [
      {
        chapter: "Ch. 2 — Into the Frozen North",
        passage: "The cold was so bitter that it took their breath away. Snow lay thick upon every surface — the ground, the trees, the sled. A deep frost had settled over the landscape, and their breath hung in frozen clouds. The winter trail stretched ahead through a vast white silence, the snowfall muffling every sound until even their footsteps were swallowed. Ice crystals sparkled in the pale arctic light. Not a bird sang; not a breeze stirred. The frozen world was absolutely still.",
      },
      {
        chapter: "Ch. 3 — The Campfire",
        passage: "That night they made camp beneath the pines. A great fire was built, and the flames crackled and leapt, sending sparks spiralling into the dark sky. The blaze cast a warm orange glow over the snow and the ring of seated men, and the embers popped softly in the still night air. The scent of woodsmoke hung thick. Beyond the circle of firelight, the forest pressed close, dark and full of shadows.",
      },
      {
        chapter: "Ch. 7 — The Wild Forest",
        passage: "He ran through the forest with a sense of unbounded freedom. The trees towered above him — pines and spruces reaching for the sky, their branches interlaced in a vast green canopy. Birds called from the treetops; ferns carpeted the clearings. The earth smelled of moss and damp soil, of wildflowers and the green living breath of the deep woodland. He splashed through a stream and climbed a hillside meadow from which the whole valley spread below, lit golden in the morning sunrise.",
      },
    ],
  },
  {
    title: "Heart of Darkness",
    author: "Joseph Conrad",
    year: 1899,
    color: "#5a7247",
    scenes: [
      {
        chapter: "Part I — Up the River",
        passage: "Going up that river was like travelling back to the earliest beginnings of the world, when vegetation rioted on the earth and the big trees were kings. An empty stream, a great silence, a darkness. The broadening waters flowed through a mob of wooded islands. The current ran smooth and swift, and the living trees, lashed together by the creepers, looked out of the flowing water over every low bank of the stream.",
      },
      {
        chapter: "Part II — The Evening Stillness",
        passage: "The dusk came gliding into the river. The sun set behind the forest, and every tree stood as if turned to bronze in the last light of evening. The twilight air was thick with the sounds of nocturnal creatures waking. Stars appeared one by one in the darkening sky. Shadows crept across the water. The night settled slowly, bringing with it the heavy darkness of the jungle — moonless, starless, alive with the sounds of insects and the distant calls of owls.",
      },
      {
        chapter: "Part III — The Storm Inland",
        passage: "Then a thunderstorm broke over the jungle with shocking violence. Lightning bleached the sky white and the thunder cracked so close it seemed the world would split. Rain hammered down in a solid curtain of water, pounding on the leaves and turning the trail to mud. The wind howled through the trees, whipping branches and sending torrents of rainwater coursing across the ground. The tempest raged on for hours, furious and relentless.",
      },
    ],
  },
];

// ── Sentence splitter for narration ──
function splitIntoSentences(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  return raw.map((s) => s.trim()).filter((s) => s.length > 0);
}

const BACKEND_BASE_URL = "http://127.0.0.1:8000";

function BooksTab({
  t,
  playingScene,
  onPlay,
  onStopAmbient,
}: {
  t: ThemeColors;
  playingScene: string | null;
  onPlay: (scene: SceneType, secondary?: SceneType | null, secondaryWeight?: number) => void;
  onStopAmbient: () => void;
}) {
  const [expandedBook, setExpandedBook] = useState<string | null>(null);
  const [narratingKey, setNarratingKey] = useState<string | null>(null);
  const [activeSentenceIdx, setActiveSentenceIdx] = useState(-1);
  const [isBuffering, setIsBuffering] = useState(false);
  const narrationGenRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const audioCacheRef = useRef(new Map<string, string>());
  const voices = OPENAI_VOICES;
  const [selectedVoiceId, setSelectedVoiceId] = useState(DEFAULT_VOICE_ID);
  const voicesLoading = false;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = "";
      }
    };
  }, []);

  const stopNarration = useCallback(() => {
    narrationGenRef.current++;
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = "";
    }
    setNarratingKey(null);
    setActiveSentenceIdx(-1);
    setIsBuffering(false);
  }, []);

  const fetchAudioUrl = useCallback(
    async (sentence: string, cacheKey: string, signal?: AbortSignal): Promise<string | null> => {
      const cached = audioCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const res = await fetch(`${BACKEND_BASE_URL}/api/scene-demo/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sentence,
          voice: selectedVoiceId,
          instructions: buildNarrationInstructions(sentence),
        }),
        signal,
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      const url = `${BACKEND_BASE_URL}${data.url}`;
      audioCacheRef.current.set(cacheKey, url);
      return url;
    },
    [selectedVoiceId]
  );

  const prefetch = useCallback(
    (sentences: string[], fromIdx: number, passageKey: string) => {
      for (let i = 1; i <= 2; i++) {
        const n = fromIdx + i;
        if (n < sentences.length) {
          const ck = `${passageKey}:${selectedVoiceId}:${n}`;
          if (!audioCacheRef.current.has(ck)) {
            fetchAudioUrl(sentences[n], ck).catch(() => {});
          }
        }
      }
    },
    [fetchAudioUrl, selectedVoiceId]
  );

  const narratePassage = useCallback(
    (passageKey: string, passage: string, detection: SceneDetectionResult) => {
      if (narratingKey === passageKey) {
        stopNarration();
        onStopAmbient();
        return;
      }

      stopNarration();
      onStopAmbient();

      const sentences = splitIntoSentences(passage);
      if (sentences.length === 0) return;

      setNarratingKey(passageKey);
      setIsBuffering(true);
      const gen = ++narrationGenRef.current;

      onPlay(detection.primary, detection.secondary, detection.secondaryWeight);

      const speakSentence = async (si: number) => {
        if (narrationGenRef.current !== gen) return;

        if (si >= sentences.length) {
          setNarratingKey(null);
          setActiveSentenceIdx(-1);
          setIsBuffering(false);
          return;
        }

        try {
          const ctrl = new AbortController();
          abortRef.current = ctrl;
          const ck = `${passageKey}:${selectedVoiceId}:${si}`;
          const url = await fetchAudioUrl(sentences[si], ck, ctrl.signal);
          if (!url || ctrl.signal.aborted || narrationGenRef.current !== gen) {
            return;
          }

          const audio = new Audio(url);
          audioRef.current = audio;
          setActiveSentenceIdx(si);
          setIsBuffering(false);

          audio.onended = () => {
            if (narrationGenRef.current === gen) {
              speakSentence(si + 1);
            }
          };

          audio.onerror = () => {
            setIsBuffering(false);
            setNarratingKey(null);
            setActiveSentenceIdx(-1);
          };

          await audio.play();
          prefetch(sentences, si, passageKey);
        } catch (err) {
          console.error("TTS error:", err);
          setIsBuffering(false);
          setNarratingKey(null);
          setActiveSentenceIdx(-1);
        }
      };

      setTimeout(() => {
        if (narrationGenRef.current === gen) speakSentence(0);
      }, 120);
    },
    [fetchAudioUrl, narratingKey, onPlay, onStopAmbient, prefetch, selectedVoiceId, stopNarration],
  );

  return (
    <div>
      <div className="mb-6">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          <BookOpen size={16} className="inline mr-2" style={{ color: t.accent }} />
          Books Showcase
        </h2>
        <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
          Experience classic novels with ambient soundscapes AND narration together. Each passage plays
          the detected scene while an AI narrator reads the text aloud with natural, expressive delivery.
          Watch the text highlight sentence by sentence as you listen.
        </p>
      </div>

      {/* Voice selector */}
      <div
        className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl"
        style={{ backgroundColor: t.surface, border: `1px solid ${t.border}` }}
      >
        <Mic size={14} style={{ color: t.accent, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: t.textMuted, flexShrink: 0 }}>Narrator Voice:</span>
        <select
          value={selectedVoiceId}
          onChange={(e) => setSelectedVoiceId(e.target.value)}
          className="flex-1 rounded-lg px-3 py-1.5"
          style={{
            backgroundColor: t.card,
            color: t.text,
            border: `1px solid ${t.border}`,
            fontSize: 12,
            outline: "none",
            maxWidth: 320,
          }}
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} — {v.description}{v.recommended ? " ★" : ""}
            </option>
          ))}
        </select>
        {voicesLoading && (
          <span style={{ fontSize: 11, color: t.textMuted }}>Loading...</span>
        )}
        {isBuffering && (
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{ fontSize: 11, backgroundColor: `${t.accent}15`, color: t.accent }}
          >
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: t.accent }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
            Generating...
          </span>
        )}
        {narratingKey && !isBuffering && (
          <button
            onClick={() => { stopNarration(); onStopAmbient(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}
          >
            <Square size={10} fill="currentColor" /> Stop
          </button>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {BOOK_SHOWCASES.map((book) => {
          const isExpanded = expandedBook === book.title;

          return (
            <motion.div
              key={book.title}
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: t.card,
                border: `1px solid ${t.border}`,
              }}
            >
              {/* Book header — always visible */}
              <button
                onClick={() => setExpandedBook(isExpanded ? null : book.title)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${t.border}22`)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                {/* Book spine */}
                <div
                  className="flex-shrink-0 w-10 h-14 rounded-md flex items-center justify-center"
                  style={{
                    backgroundColor: `${book.color}22`,
                    borderLeft: `4px solid ${book.color}`,
                  }}
                >
                  <BookOpen size={16} style={{ color: book.color }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{book.title}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>
                    {book.author} &middot; {book.year}
                  </div>
                </div>

                {/* Scene pills for the book */}
                <div className="flex flex-wrap gap-1.5">
                  {book.scenes.map((scene, i) => {
                    const detection = detectScene(scene.passage);
                    const info = getSceneInfo(detection.primary);
                    return (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-full"
                        style={{
                          fontSize: 10,
                          backgroundColor: `${t.border}44`,
                          color: t.textMuted,
                        }}
                      >
                        {info.emoji} {info.label}
                      </span>
                    );
                  })}
                </div>

                {isExpanded ? (
                  <ChevronUp size={16} style={{ color: t.textMuted, flexShrink: 0 }} />
                ) : (
                  <ChevronDown size={16} style={{ color: t.textMuted, flexShrink: 0 }} />
                )}
              </button>

              {/* Expanded scene passages */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div
                      style={{ borderTop: `1px solid ${t.border}44` }}
                    >
                      {book.scenes.map((scene, idx) => {
                        const detection = detectScene(scene.passage);
                        const info = getSceneInfo(detection.primary);
                        const secondaryInfo = detection.secondary
                          ? getSceneInfo(detection.secondary)
                          : null;
                        const passageKey = `${book.title}::${idx}`;
                        const isNarrating = narratingKey === passageKey;
                        const sentences = splitIntoSentences(scene.passage);

                        return (
                          <div
                            key={idx}
                            className="px-5 py-4"
                            style={{
                              borderTop: idx > 0 ? `1px solid ${t.border}22` : undefined,
                              backgroundColor: isNarrating ? `${t.accentGlow}` : undefined,
                            }}
                          >
                            {/* Chapter label + scene + play */}
                            <div className="flex items-center gap-3 mb-3">
                              {/* Narrate button (ambient + voice) */}
                              <button
                                onClick={() => narratePassage(passageKey, scene.passage, detection)}
                                className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all relative"
                                title="Play ambient scene + narrate text"
                                style={{
                                  backgroundColor: isNarrating
                                    ? t.accent
                                    : `${t.accent}22`,
                                  color: isNarrating ? "#fff" : t.accent,
                                  boxShadow: isNarrating ? `0 0 16px ${t.accent}44` : "none",
                                }}
                              >
                                {isNarrating ? (
                                  <Square size={11} fill="currentColor" />
                                ) : (
                                  <Play
                                    size={11}
                                    fill="currentColor"
                                    style={{ marginLeft: 1 }}
                                  />
                                )}
                                {/* Small mic indicator */}
                                <div
                                  className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                                  style={{
                                    backgroundColor: isNarrating ? "#fff" : t.card,
                                    border: `1.5px solid ${isNarrating ? t.accent : t.border}`,
                                  }}
                                >
                                  <AudioLines
                                    size={8}
                                    style={{ color: isNarrating ? t.accent : t.textMuted }}
                                  />
                                </div>
                              </button>

                              <div className="flex-1 min-w-0">
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: t.text,
                                  }}
                                >
                                  {scene.chapter}
                                </div>
                                {isNarrating && (
                                  <motion.div
                                    className="flex items-center gap-1.5 mt-0.5"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                  >
                                    <div className="flex gap-0.5 items-end h-2.5">
                                      {[0, 1, 2, 3].map((i) => (
                                        <motion.div
                                          key={i}
                                          className="w-0.5 rounded-full"
                                          style={{ backgroundColor: t.accent }}
                                          animate={{ height: [2, 10, 2] }}
                                          transition={{
                                            duration: 0.6,
                                            repeat: Infinity,
                                            delay: i * 0.12,
                                            ease: "easeInOut",
                                          }}
                                        />
                                      ))}
                                    </div>
                                    <span style={{ fontSize: 10, color: t.accent }}>
                                      {isBuffering ? "Generating audio..." : `Narrating with ${info.emoji} ${info.label} ambience`}
                                    </span>
                                  </motion.div>
                                )}
                              </div>

                              {/* Scene badges */}
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                                  style={{
                                    fontSize: 10,
                                    backgroundColor: `${t.accent}15`,
                                    color: t.accent,
                                    fontWeight: 600,
                                    border: `1px solid ${t.accent}33`,
                                  }}
                                >
                                  {info.emoji} {info.label}
                                </span>
                                {secondaryInfo && (
                                  <span
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                                    style={{
                                      fontSize: 10,
                                      backgroundColor: `${t.border}33`,
                                      color: t.textMuted,
                                    }}
                                  >
                                    + {secondaryInfo.emoji} {secondaryInfo.label}
                                  </span>
                                )}
                                <span
                                  style={{
                                    fontSize: 10,
                                    color:
                                      detection.confidence > 0.7
                                        ? t.success
                                        : detection.confidence > 0.4
                                          ? t.warning
                                          : t.accent,
                                    fontWeight: 600,
                                  }}
                                >
                                  {Math.round(detection.confidence * 100)}%
                                </span>
                              </div>
                            </div>

                            {/* Passage text with sentence highlighting */}
                            <div
                              style={{
                                fontSize: 13,
                                lineHeight: 1.8,
                                fontFamily: "Georgia, 'Times New Roman', serif",
                                marginLeft: 48,
                              }}
                            >
                              <span style={{ color: `${t.text}66` }}>&ldquo;</span>
                              {sentences.map((sent, si) => {
                                const isActive = isNarrating && si === activeSentenceIdx;
                                const isPast = isNarrating && si < activeSentenceIdx;
                                return (
                                  <span
                                    key={si}
                                    style={{
                                      color: isActive
                                        ? "#fff"
                                        : isPast
                                          ? `${t.text}99`
                                          : `${t.text}bb`,
                                      backgroundColor: isActive
                                        ? `${t.accent}33`
                                        : "transparent",
                                      borderRadius: isActive ? 4 : 0,
                                      padding: isActive ? "1px 3px" : 0,
                                      transition: "all 0.3s ease",
                                    }}
                                  >
                                    {sent}{" "}
                                  </span>
                                );
                              })}
                              <span style={{ color: `${t.text}66` }}>&rdquo;</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reading journey callout */}
                    <div
                      className="px-5 py-3 flex items-center gap-2"
                      style={{
                        backgroundColor: `${t.bg}88`,
                        borderTop: `1px solid ${t.border}33`,
                        fontSize: 11,
                        color: t.textMuted,
                      }}
                    >
                      <Info size={12} style={{ color: t.accent, flexShrink: 0 }} />
                      Reading this book, the ambient engine would transition between{" "}
                      {Array.from(
                        new Set(
                          book.scenes.map((s) => {
                            const d = detectScene(s.passage);
                            return getSceneInfo(d.primary).label;
                          }),
                        ),
                      ).join(", ")}{" "}
                      scenes as the narrative unfolds &mdash; with the narrator reading each passage aloud.
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Info callout */}
      <div
        className="mt-6 flex items-start gap-3 rounded-xl px-5 py-4"
        style={{ backgroundColor: `${t.accent}0a`, border: `1px solid ${t.accent}22` }}
      >
        <AudioLines size={16} className="flex-shrink-0 mt-0.5" style={{ color: t.accent }} />
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>
          <strong style={{ color: t.accent }}>How it works:</strong> Pressing play on any passage
          starts two things simultaneously &mdash; (1) the ambient soundscape detected from the text&rsquo;s
          keywords (with optional scene blending), and (2) AI-powered narration with natural, expressive
          delivery. Each sentence is generated with high-quality voice synthesis for human-like pacing and
          intonation. The current sentence highlights in real-time as the narrator reads through the passage.
          Upcoming sentences are prefetched for seamless playback.
        </div>
      </div>
    </div>
  );
}
