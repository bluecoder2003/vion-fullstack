/**
 * Adaptive Ambient Sound Engine — Procedural Web Audio API soundscape generator.
 *
 * Features:
 * ▸ 12 scene types synthesised entirely via Web Audio API
 * ▸ Multi-layer scene blending (primary + secondary scenes mixed)
 * ▸ Hysteresis / momentum — prevents rapid flickering between scenes
 * ▸ Smooth exponential crossfades (configurable 2–4 s)
 * ▸ Random micro-events (bird calls, thunder cracks, church bells …)
 * ▸ Per-scene volume normalisation so all scenes feel equally "present"
 * ▸ Narration-aware ducking — gently attenuates ambient during speech emphasis
 */

// ═══════════════════════════════════════════════════════
//  SCENE TYPES & METADATA
// ═══════════════════════════════════════════════════════

export type SceneType =
  | "morning"
  | "nature"
  | "rain"
  | "ocean"
  | "wind"
  | "fire"
  | "night"
  | "city"
  | "river"
  | "storm"
  | "snow"
  | "indoor"
  | "silence";

export interface SceneInfo {
  type: SceneType;
  label: string;
  emoji: string;
  description: string;
}

const SCENE_META: Record<SceneType, { label: string; emoji: string; description: string }> = {
  morning: { label: "Morning",     emoji: "\u{1F305}", description: "Dawn chorus with gentle breeze" },
  nature:  { label: "Forest",      emoji: "\u{1F333}", description: "Deep woodland with birdsong" },
  rain:    { label: "Rain",        emoji: "\u{1F327}\uFE0F", description: "Steady rainfall on surfaces" },
  ocean:   { label: "Ocean",       emoji: "\u{1F30A}", description: "Rolling waves and sea spray" },
  wind:    { label: "Wind",        emoji: "\u{1F32C}\uFE0F", description: "Gusting breeze through open spaces" },
  fire:    { label: "Fireside",    emoji: "\u{1F525}", description: "Crackling hearth with warm pops" },
  night:   { label: "Night",       emoji: "\u{1F319}", description: "Crickets and quiet nocturnal air" },
  city:    { label: "City",        emoji: "\u{1F3D9}\uFE0F", description: "Urban hum with distant traffic" },
  river:   { label: "River",       emoji: "\u{1F3DE}\uFE0F", description: "Flowing water over stones" },
  storm:   { label: "Storm",       emoji: "\u26C8\uFE0F", description: "Heavy rain with thunder" },
  snow:    { label: "Snow",        emoji: "\u2744\uFE0F", description: "Muffled silence of snowfall" },
  indoor:  { label: "Quiet Room",  emoji: "\u{1F3E0}", description: "Soft room tone and faint hum" },
  silence: { label: "Silence",     emoji: "\u{1F50C}", description: "No ambient sound" },
};

export function getSceneInfo(type: SceneType): SceneInfo {
  return { type, ...SCENE_META[type] };
}

export const ALL_SCENES: SceneType[] = [
  "morning", "nature", "rain", "ocean", "wind", "fire",
  "night", "city", "river", "storm", "snow", "indoor",
];

// Per-scene base volume multiplier so louder scenes (storm) don't overpower quieter ones (snow).
const SCENE_VOLUME_NORM: Record<SceneType, number> = {
  morning: 0.85, nature: 0.80, rain: 0.75, ocean: 0.80,
  wind: 0.70, fire: 0.85, night: 0.90, city: 0.65,
  river: 0.80, storm: 0.60, snow: 0.95, indoor: 1.0,
  silence: 0,
};

// ═══════════════════════════════════════════════════════
//  KEYWORD-BASED SCENE DETECTION
// ═══════════════════════════════════════════════════════

// Each entry: [scene, regex, weight].  Higher weight = stronger signal.
const KEYWORD_MAP: [SceneType, RegExp, number][] = [
  // ── Storm (highest priority — superset of rain) ──
  ["storm",   /\b(thunder|lightning|tempest|hurricane|tornado|thunderstorm|gale\b.*fierce|cyclone|typhoon|thunderclap|thunderous)\b/i, 3],
  // ── Ocean ──
  ["ocean",   /\b(ocean|sea\b|waves?\b|beach|shore|coast|tide|surf(?:ing)?|sailing|sail(?:ed)?|mariner|vessel|harbour|harbor|whaler?|maritime|nautical|bay|lagoon|coral|seagull|cliffs?\s+above\s+the\s+sea|lighthouse|anchor|ship|aboard|deck|port|starboard)\b/i, 2],
  // ── River ──
  ["river",   /\b(river|stream|creek|brook|waterfall|flowing\s+water|cascade|rivulet|rapids|canal|ford|bank\s+of\s+the)\b/i, 2],
  // ── Rain ──
  ["rain",    /\b(rain(?:ing|y|ed|drops?)?|drizzl(?:e|ing)|downpour|umbrella|puddles?|drenched|soaked|monsoon|shower(?:s)?|sleet|patter(?:ing)?)\b/i, 2],
  // ── Fire / hearth ──
  ["fire",    /\b(fire(?:place|side|light)?|flame|hearth|campfire|burning|candle(?:light|s)?|torch(?:es)?|embers?|blaze|bonfire|lantern|lamp\b|warmth\s+of\s+the\s+fire|stove|mantel|chimney)\b/i, 2],
  // ── Snow ──
  ["snow",    /\b(snow(?:y|fall|flake|drift|storm)?|blizzard|frost(?:y|ed)?|ice\b|icy|frozen|winter(?:y)?|arctic|polar|sledge|freez(?:ing|e)|glacial|sleet)\b/i, 2],
  // ── Morning / dawn ──
  ["morning", /\b(morning|dawn|sunrise|daybreak|first\s+light|rooster|cock\s*crow|dew|early\s+light|wak(?:e|ing)\s+(?:up|to)|breakfast|misty\s+morning)\b/i, 2],
  // ── Wind ──
  ["wind",    /\b(wind(?:y|swept)?|breeze|gust(?:s|ing)?|blow(?:ing|n)|blustery|zephyr|draught|draft|whipp(?:ing|ed)|howl(?:ing)?)\b/i, 1.5],
  // ── Night ──
  ["night",   /\b(night(?:fall|time)?|moon(?:light|lit|less)?|stars?\b|starry|darkness|midnight|dusk|evening|twilight|nocturnal|owl|crescent|shadow(?:s|y)?|lamp\s*light|candle\s*lit)\b/i, 1.5],
  // ── Nature / forest ──
  ["nature",  /\b(forest|trees?\b|garden|meadow|field|grass(?:y)?|flowers?\b|bird(?:s|song)?|woodland|grove|valley|hill(?:side)?|mountain|alpine|summit|peak|blossom|orchard|pastoral|countryside|foliage|fern|moss|clearing|path\s+through)\b/i, 1.5],
  // ── City / town ──
  ["city",    /\b(city|street|traffic|cars?\b|downtown|urban|crowd(?:ed|s)?|market(?:place)?|tavern|inn\b|shop|merchant|town|village|square|cobblestone|carriage|coach|alley|pavement|café|restaurant|pub|saloon|sidewalk)\b/i, 1.5],
  // ── Indoor ──
  ["indoor",  /\b(room|chamber|house|home|parlou?r|library|study\b|bedroom|hall(?:way)?|door(?:way)?|window|staircase|mansion|castle|cottage|cabin|lodge|dwelling|apartment|cupboard|kitchen|cellar|attic|corridor|passage|closet|desk|bookshelf)\b/i, 1],
];

/**
 * Analyse a chunk of text and return the best-matching scene
 * plus a confidence score (0–1) and an optional secondary scene.
 */
export interface SceneDetectionResult {
  primary: SceneType;
  secondary: SceneType | null;
  confidence: number;           // 0–1 for primary
  secondaryWeight: number;      // 0–1, how strongly to blend secondary
}

export function detectScene(text: string): SceneDetectionResult {
  if (!text || text.trim().length === 0) {
    return { primary: "silence", secondary: null, confidence: 0, secondaryWeight: 0 };
  }

  const scores: Partial<Record<SceneType, number>> = {};
  for (const [scene, regex, weight] of KEYWORD_MAP) {
    const matches = text.match(new RegExp(regex.source, "gi"));
    if (matches && matches.length > 0) {
      scores[scene] = (scores[scene] || 0) + matches.length * weight;
    }
  }

  // Sort by score descending
  const sorted = (Object.entries(scores) as [SceneType, number][])
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    return { primary: "silence", secondary: null, confidence: 0, secondaryWeight: 0 };
  }

  const topScore = sorted[0][1];
  const primary = sorted[0][0];

  // Confidence: clamp between 0–1 based on keyword density
  const wordCount = text.split(/\s+/).length;
  const confidence = Math.min(1, topScore / Math.max(wordCount * 0.06, 2));

  // Secondary scene: if a second scene scores >= 40% of primary, blend it
  let secondary: SceneType | null = null;
  let secondaryWeight = 0;
  if (sorted.length > 1) {
    const secScore = sorted[1][1];
    const ratio = secScore / topScore;
    if (ratio >= 0.4 && sorted[1][0] !== primary) {
      secondary = sorted[1][0];
      secondaryWeight = ratio * 0.5; // max 0.5 blend
    }
  }

  return { primary, secondary, confidence, secondaryWeight };
}

/**
 * Build a context window: grab nearby sentences for richer scene detection.
 * Uses an asymmetric window — more look-behind than look-ahead.
 */
export function buildContextWindow(
  sentences: string[],
  currentIdx: number,
  windowSize = 9,
): string {
  const behind = Math.ceil(windowSize * 0.6);
  const ahead = windowSize - behind;
  const start = Math.max(0, currentIdx - behind);
  const end = Math.min(sentences.length, currentIdx + ahead + 1);
  return sentences.slice(start, end).join(" ");
}

// ═══════════════════════════════════════════════════════
//  SCENE HYSTERESIS / MOMENTUM
// ═══════════════════════════════════════════════════════

/**
 * Tracks scene detections over time and only switches when a new scene
 * has been consistently detected for several consecutive checks.
 */
export class SceneHysteresis {
  private history: SceneType[] = [];
  private current: SceneType = "silence";
  private readonly threshold: number;
  private readonly maxHistory: number;

  constructor(threshold = 3, maxHistory = 8) {
    this.threshold = threshold;
    this.maxHistory = maxHistory;
  }

  /**
   * Feed a new detection.  Returns the "stable" scene —
   * which only changes if the new scene has appeared
   * `threshold` times in the last `maxHistory` detections.
   */
  update(detected: SceneType): SceneType {
    this.history.push(detected);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Count occurrences in history
    const counts: Partial<Record<SceneType, number>> = {};
    for (const s of this.history) {
      counts[s] = (counts[s] || 0) + 1;
    }

    // If detected scene has enough momentum, switch
    if ((counts[detected] || 0) >= this.threshold) {
      this.current = detected;
    }

    // Also switch if current scene has dropped to 0 in recent history
    if ((counts[this.current] || 0) === 0 && this.history.length >= this.threshold) {
      // Find the scene with most occurrences
      let best: SceneType = "silence";
      let bestCount = 0;
      for (const [s, c] of Object.entries(counts) as [SceneType, number][]) {
        if (c > bestCount) { bestCount = c; best = s; }
      }
      this.current = best;
    }

    return this.current;
  }

  get scene() { return this.current; }

  reset() {
    this.history = [];
    this.current = "silence";
  }
}

// ═══════════════════════════════════════════════════════
//  AMBIENT ENGINE — Web Audio API procedural synthesis
// ═══════════════════════════════════════════════════════

interface SceneLayer {
  gain: GainNode;
  nodes: AudioNode[];
  scene: SceneType;
  timers: ReturnType<typeof setTimeout>[];
}

export class AmbientEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private duckGain: GainNode | null = null;        // for narration ducking
  private primaryLayer: SceneLayer | null = null;
  private secondaryLayer: SceneLayer | null = null;
  private fadingLayers: SceneLayer[] = [];          // layers being faded out
  private _volume = 0.35;
  private _running = false;
  private _ducking = false;
  private _secondaryBlend = 0;                       // 0–1
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;

  get volume() { return this._volume; }
  get running() { return this._running; }
  get scene() { return this.primaryLayer?.scene ?? "silence"; }
  get secondaryScene() { return this.secondaryLayer?.scene ?? null; }

  // ── Audio Context management ──

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext();
      // Chain: scene gains → duckGain → masterGain → destination
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._volume;

      this.duckGain = this.ctx.createGain();
      this.duckGain.gain.value = 1.0;

      this.duckGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // ── Volume control ──

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.1);
    }
  }

  // ── Narration ducking ──

  /** Briefly lower ambient volume to let narration emphasis through. */
  duck(amount = 0.6, duration = 0.8) {
    if (!this.duckGain || !this.ctx || this._ducking) return;
    this._ducking = true;
    const now = this.ctx.currentTime;
    this.duckGain.gain.setTargetAtTime(amount, now, 0.15);
    this.duckGain.gain.setTargetAtTime(1.0, now + duration, 0.3);
    setTimeout(() => { this._ducking = false; }, (duration + 0.5) * 1000);
  }

  // ── Scene transitions ──

  /**
   * Transition to a new primary scene (and optionally a secondary blend scene)
   * with smooth crossfade.
   */
  transitionTo(scene: SceneType, secondary?: SceneType | null, secondaryWeight = 0.3) {
    if (!this._running) {
      // Store for when we start
      if (this.primaryLayer) this.primaryLayer.scene = scene;
      return;
    }

    const ctx = this.ensureContext();
    const CROSSFADE_TIME = 2.5; // seconds

    // ── Primary layer transition ──
    if (scene !== this.primaryLayer?.scene || !this.primaryLayer) {
      // Fade out old primary
      if (this.primaryLayer) {
        this.fadeOutLayer(this.primaryLayer, CROSSFADE_TIME);
      }

      if (scene !== "silence") {
        // Create new primary layer
        this.primaryLayer = this.createLayer(ctx, scene, 1.0, CROSSFADE_TIME);
      } else {
        this.primaryLayer = null;
      }
    }

    // ── Secondary layer transition ──
    const wantSecondary = secondary && secondary !== "silence" && secondary !== scene && secondaryWeight > 0.1;

    if (wantSecondary) {
      if (this.secondaryLayer?.scene !== secondary) {
        if (this.secondaryLayer) {
          this.fadeOutLayer(this.secondaryLayer, CROSSFADE_TIME);
        }
        this.secondaryLayer = this.createLayer(ctx, secondary!, secondaryWeight, CROSSFADE_TIME);
      } else if (this.secondaryLayer) {
        // Just update blend level
        const normVol = SCENE_VOLUME_NORM[secondary!] ?? 0.8;
        this.secondaryLayer.gain.gain.setTargetAtTime(
          secondaryWeight * normVol, ctx.currentTime, 0.5
        );
      }
      this._secondaryBlend = secondaryWeight;
    } else if (this.secondaryLayer) {
      this.fadeOutLayer(this.secondaryLayer, CROSSFADE_TIME);
      this.secondaryLayer = null;
      this._secondaryBlend = 0;
    }
  }

  private createLayer(
    ctx: AudioContext,
    scene: SceneType,
    targetVolume: number,
    fadeInTime: number,
  ): SceneLayer {
    const normVol = SCENE_VOLUME_NORM[scene] ?? 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.duckGain!);

    const layer: SceneLayer = { gain, nodes: [], scene, timers: [] };

    this.buildScene(ctx, scene, gain, layer);

    // Fade in
    gain.gain.setTargetAtTime(
      targetVolume * normVol,
      ctx.currentTime + 0.05,
      fadeInTime * 0.35,
    );

    return layer;
  }

  private fadeOutLayer(layer: SceneLayer, duration: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    layer.gain.gain.setTargetAtTime(0, now, duration * 0.3);
    this.fadingLayers.push(layer);

    // Clean up after fade completes
    const timer = setTimeout(() => {
      this.destroyLayer(layer);
      this.fadingLayers = this.fadingLayers.filter(l => l !== layer);
    }, duration * 1500);
    layer.timers.push(timer);
  }

  private destroyLayer(layer: SceneLayer) {
    for (const t of layer.timers) clearTimeout(t);
    layer.timers = [];
    for (const n of layer.nodes) {
      try { (n as any).stop?.(); } catch {}
      try { n.disconnect(); } catch {}
    }
    try { layer.gain.disconnect(); } catch {}
    layer.nodes = [];
  }

  // ── Start / Stop / Dispose ──

  start(scene?: SceneType, secondary?: SceneType | null, secondaryWeight?: number) {
    this._running = true;
    this.ensureContext();
    this.transitionTo(scene ?? "indoor", secondary, secondaryWeight);
  }

  stop() {
    this._running = false;
    if (this.transitionTimer) { clearTimeout(this.transitionTimer); this.transitionTimer = null; }

    const layers = [this.primaryLayer, this.secondaryLayer, ...this.fadingLayers].filter(Boolean) as SceneLayer[];
    for (const layer of layers) {
      if (this.ctx) {
        layer.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      }
    }

    setTimeout(() => {
      for (const layer of layers) this.destroyLayer(layer);
    }, 1800);

    this.primaryLayer = null;
    this.secondaryLayer = null;
    this.fadingLayers = [];
  }

  dispose() {
    this.stop();
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.duckGain = null;
  }

  // ═══════════════════════════════════════════════════════
  //  SCENE BUILDERS — each creates a multi-layer soundscape
  // ═══════════════════════════════════════════════════════

  private buildScene(ctx: AudioContext, scene: SceneType, dest: GainNode, layer: SceneLayer) {
    switch (scene) {
      case "morning":  this.buildMorning(ctx, dest, layer); break;
      case "nature":   this.buildNature(ctx, dest, layer); break;
      case "rain":     this.buildRain(ctx, dest, layer); break;
      case "ocean":    this.buildOcean(ctx, dest, layer); break;
      case "wind":     this.buildWind(ctx, dest, layer); break;
      case "fire":     this.buildFire(ctx, dest, layer); break;
      case "night":    this.buildNight(ctx, dest, layer); break;
      case "city":     this.buildCity(ctx, dest, layer); break;
      case "river":    this.buildRiver(ctx, dest, layer); break;
      case "storm":    this.buildStorm(ctx, dest, layer); break;
      case "snow":     this.buildSnow(ctx, dest, layer); break;
      case "indoor":   this.buildIndoor(ctx, dest, layer); break;
      default: break;
    }
  }

  // ── Helpers ──

  private makeNoise(ctx: AudioContext, layer: SceneLayer, duration = 4): AudioBufferSourceNode {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    layer.nodes.push(source);
    return source;
  }

  private makePinkNoise(ctx: AudioContext, layer: SceneLayer, duration = 4): AudioBufferSourceNode {
    // Pink noise — more natural sounding (1/f spectral distribution)
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    layer.nodes.push(source);
    return source;
  }

  private makeLFO(ctx: AudioContext, layer: SceneLayer, freq: number, amount: number, dest: AudioParam) {
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = freq;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = amount;
    lfo.connect(lfoGain);
    lfoGain.connect(dest);
    lfo.start();
    layer.nodes.push(lfo, lfoGain);
  }

  private scheduleRecurring(
    layer: SceneLayer,
    callback: () => void,
    minDelay: number,
    maxDelay: number,
  ) {
    const schedule = () => {
      if (!this._running || !this.isLayerActive(layer)) return;
      callback();
      const next = minDelay + Math.random() * (maxDelay - minDelay);
      const timer = setTimeout(schedule, next);
      layer.timers.push(timer);
    };
    const initial = minDelay * 0.5 + Math.random() * maxDelay * 0.5;
    const timer = setTimeout(schedule, initial);
    layer.timers.push(timer);
  }

  private isLayerActive(layer: SceneLayer): boolean {
    return layer === this.primaryLayer || layer === this.secondaryLayer;
  }

  // ═══════════════════════════════════════════════════════
  //  MORNING — dawn chorus, gentle breeze, distant rooster
  // ═══════════════════════════════════════════════════════

  private buildMorning(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Warm pink noise base — gentle morning air
    const pinkNoise = this.makePinkNoise(ctx, layer);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1200;
    const g = ctx.createGain(); g.gain.value = 0.10;
    pinkNoise.connect(lp); lp.connect(g); g.connect(dest);
    pinkNoise.start();
    layer.nodes.push(lp, g);

    // Subtle breeze modulation
    this.makeLFO(ctx, layer, 0.12, 200, lp.frequency);

    // Dawn bird chorus — multiple overlapping birds
    this.scheduleMorningBirds(ctx, dest, layer, 2800 + Math.random() * 800, 3);
    this.scheduleMorningBirds(ctx, dest, layer, 3500 + Math.random() * 1000, 5);
    this.scheduleMorningBirds(ctx, dest, layer, 4200 + Math.random() * 600, 4);

    // Occasional distant rooster
    this.scheduleRecurring(layer, () => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const cockG = ctx.createGain();
      cockG.gain.value = 0;
      const cockFilter = ctx.createBiquadFilter();
      cockFilter.type = "bandpass"; cockFilter.frequency.value = 800; cockFilter.Q.value = 3;
      osc.connect(cockFilter); cockFilter.connect(cockG); cockG.connect(dest);

      const now = ctx.currentTime;
      // Rising crow sound
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.linearRampToValueAtTime(900, now + 0.3);
      osc.frequency.linearRampToValueAtTime(700, now + 0.6);
      cockG.gain.setValueAtTime(0, now);
      cockG.gain.linearRampToValueAtTime(0.025, now + 0.05);
      cockG.gain.linearRampToValueAtTime(0.03, now + 0.3);
      cockG.gain.setTargetAtTime(0, now + 0.5, 0.1);
      osc.start(now); osc.stop(now + 0.8);
    }, 12000, 25000);
  }

  private scheduleMorningBirds(ctx: AudioContext, dest: GainNode, layer: SceneLayer, baseFreq: number, burstLen: number) {
    this.scheduleRecurring(layer, () => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const birdG = ctx.createGain(); birdG.gain.value = 0;
      osc.connect(birdG); birdG.connect(dest);

      const now = ctx.currentTime;
      const freq = baseFreq + (Math.random() - 0.5) * 600;
      const count = burstLen + Math.floor(Math.random() * 3);

      for (let i = 0; i < count; i++) {
        const t = now + i * (0.08 + Math.random() * 0.06);
        birdG.gain.setValueAtTime(0, t);
        birdG.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.03, t + 0.02);
        osc.frequency.setValueAtTime(freq + Math.random() * 400, t);
        osc.frequency.linearRampToValueAtTime(freq - 100 + Math.random() * 300, t + 0.05);
        birdG.gain.linearRampToValueAtTime(0, t + 0.07);
      }
      osc.start(now); osc.stop(now + count * 0.15 + 0.1);
    }, 1500, 5000);
  }

  // ═══════════════════════════════════════════════════════
  //  NATURE — deep forest with birdsong and rustling leaves
  // ═══════════════════════════════════════════════════════

  private buildNature(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Rustling leaves — pink noise through bandpass
    const pinkNoise = this.makePinkNoise(ctx, layer);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.13;
    pinkNoise.connect(bp); bp.connect(g); g.connect(dest);
    pinkNoise.start();
    layer.nodes.push(bp, g);

    // Slow wind through canopy
    this.makeLFO(ctx, layer, 0.15, 250, bp.frequency);
    this.makeLFO(ctx, layer, 0.07, 0.04, g.gain);

    // Deep forest ambience — very low hum
    const deepNoise = this.makeNoise(ctx, layer, 3);
    const deepLp = ctx.createBiquadFilter();
    deepLp.type = "lowpass"; deepLp.frequency.value = 180;
    const deepG = ctx.createGain(); deepG.gain.value = 0.06;
    deepNoise.connect(deepLp); deepLp.connect(deepG); deepG.connect(dest);
    deepNoise.start();
    layer.nodes.push(deepLp, deepG);

    // Bird songs — two species at different frequencies
    this.scheduleBirdChirps(ctx, dest, layer, 2200, 600);
    this.scheduleBirdChirps(ctx, dest, layer, 3800, 400);

    // Occasional woodpecker
    this.scheduleRecurring(layer, () => {
      const now = ctx.currentTime;
      const taps = 4 + Math.floor(Math.random() * 6);
      for (let i = 0; i < taps; i++) {
        const noise = this.makeNoise(ctx, layer, 0.3);
        const tapBp = ctx.createBiquadFilter();
        tapBp.type = "bandpass"; tapBp.frequency.value = 1800 + Math.random() * 500; tapBp.Q.value = 8;
        const tapG = ctx.createGain(); tapG.gain.value = 0;
        noise.connect(tapBp); tapBp.connect(tapG); tapG.connect(dest);
        const t = now + i * 0.08;
        tapG.gain.setValueAtTime(0, t);
        tapG.gain.linearRampToValueAtTime(0.06, t + 0.005);
        tapG.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        noise.start(t); noise.stop(t + 0.05);
        layer.nodes.push(tapBp, tapG);
      }
    }, 8000, 20000);
  }

  private scheduleBirdChirps(ctx: AudioContext, dest: GainNode, layer: SceneLayer, baseFreq: number, freqRange: number) {
    this.scheduleRecurring(layer, () => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const freq = baseFreq + Math.random() * freqRange;
      osc.frequency.value = freq;
      const birdG = ctx.createGain(); birdG.gain.value = 0;
      osc.connect(birdG); birdG.connect(dest);

      const now = ctx.currentTime;
      const chirpCount = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < chirpCount; i++) {
        const t = now + i * 0.12;
        birdG.gain.setValueAtTime(0, t);
        birdG.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.03, t + 0.03);
        osc.frequency.setValueAtTime(freq + Math.random() * 400, t);
        osc.frequency.linearRampToValueAtTime(freq - 150 + Math.random() * 300, t + 0.08);
        birdG.gain.linearRampToValueAtTime(0, t + 0.1);
      }
      osc.start(now); osc.stop(now + chirpCount * 0.12 + 0.15);
    }, 2000, 7000);
  }

  // ═══════════════════════════════════════════════════════
  //  RAIN — layered rainfall with varying intensity
  // ═══════════════════════════════════════════════════════

  private buildRain(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Main steady rain — pink noise shaped
    const pinkNoise = this.makePinkNoise(ctx, layer, 5);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 800;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 9000;
    const g = ctx.createGain(); g.gain.value = 0.22;
    pinkNoise.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dest);
    pinkNoise.start();
    layer.nodes.push(hp, lp, g);

    // Heavy drops layer
    const dropNoise = this.makeNoise(ctx, layer);
    const dropBp = ctx.createBiquadFilter();
    dropBp.type = "bandpass"; dropBp.frequency.value = 3500; dropBp.Q.value = 0.8;
    const dropG = ctx.createGain(); dropG.gain.value = 0.07;
    dropNoise.connect(dropBp); dropBp.connect(dropG); dropG.connect(dest);
    dropNoise.start();
    layer.nodes.push(dropBp, dropG);

    // Rain on different surfaces (higher freq for metal/glass)
    const surfaceNoise = this.makeNoise(ctx, layer, 3);
    const surfBp = ctx.createBiquadFilter();
    surfBp.type = "bandpass"; surfBp.frequency.value = 6000; surfBp.Q.value = 2;
    const surfG = ctx.createGain(); surfG.gain.value = 0.03;
    surfaceNoise.connect(surfBp); surfBp.connect(surfG); surfG.connect(dest);
    surfaceNoise.start();
    layer.nodes.push(surfBp, surfG);

    // Gentle intensity modulation
    this.makeLFO(ctx, layer, 0.06, 0.05, g.gain);
    this.makeLFO(ctx, layer, 0.03, 0.02, dropG.gain);

    // Occasional heavier gust
    this.scheduleRecurring(layer, () => {
      const gustNoise = this.makeNoise(ctx, layer, 2);
      const gustBp = ctx.createBiquadFilter();
      gustBp.type = "bandpass"; gustBp.frequency.value = 1500; gustBp.Q.value = 0.5;
      const gustG = ctx.createGain(); gustG.gain.value = 0;
      gustNoise.connect(gustBp); gustBp.connect(gustG); gustG.connect(dest);
      const now = ctx.currentTime;
      gustG.gain.setTargetAtTime(0.08, now, 0.5);
      gustG.gain.setTargetAtTime(0, now + 2, 0.8);
      gustNoise.start(now); gustNoise.stop(now + 5);
      layer.nodes.push(gustBp, gustG);
    }, 8000, 18000);
  }

  // ═══════════════════════════════════════════════════════
  //  OCEAN — rolling waves with foam and seagulls
  // ═══════════════════════════════════════════════════════

  private buildOcean(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Deep wave base
    const pinkNoise = this.makePinkNoise(ctx, layer, 6);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 500;
    const g = ctx.createGain(); g.gain.value = 0.28;
    pinkNoise.connect(lp); lp.connect(g); g.connect(dest);
    pinkNoise.start();
    layer.nodes.push(lp, g);

    // Wave rhythm — slow amplitude modulation
    this.makeLFO(ctx, layer, 0.08, 0.12, g.gain);
    this.makeLFO(ctx, layer, 0.03, 100, lp.frequency);

    // Foam / spray layer
    const foamNoise = this.makeNoise(ctx, layer, 4);
    const foamBp = ctx.createBiquadFilter();
    foamBp.type = "bandpass"; foamBp.frequency.value = 2500; foamBp.Q.value = 0.3;
    const foamG = ctx.createGain(); foamG.gain.value = 0.04;
    foamNoise.connect(foamBp); foamBp.connect(foamG); foamG.connect(dest);
    foamNoise.start();
    layer.nodes.push(foamBp, foamG);
    this.makeLFO(ctx, layer, 0.1, 0.03, foamG.gain);

    // Shore wash — periodic high-freq bursts
    const washNoise = this.makePinkNoise(ctx, layer, 3);
    const washHp = ctx.createBiquadFilter();
    washHp.type = "highpass"; washHp.frequency.value = 1500;
    const washG = ctx.createGain(); washG.gain.value = 0;
    washNoise.connect(washHp); washHp.connect(washG); washG.connect(dest);
    washNoise.start();
    layer.nodes.push(washHp, washG);
    // Create wave-crashing rhythm
    this.makeLFO(ctx, layer, 0.07, 0.04, washG.gain);

    // Occasional distant seagull
    this.scheduleRecurring(layer, () => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const gullG = ctx.createGain(); gullG.gain.value = 0;
      const gullFilter = ctx.createBiquadFilter();
      gullFilter.type = "bandpass"; gullFilter.frequency.value = 1800; gullFilter.Q.value = 4;
      osc.connect(gullFilter); gullFilter.connect(gullG); gullG.connect(dest);

      const now = ctx.currentTime;
      const calls = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < calls; i++) {
        const t = now + i * 0.4;
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.linearRampToValueAtTime(1800 + Math.random() * 400, t + 0.15);
        osc.frequency.linearRampToValueAtTime(1000, t + 0.3);
        gullG.gain.setValueAtTime(0, t);
        gullG.gain.linearRampToValueAtTime(0.02, t + 0.05);
        gullG.gain.linearRampToValueAtTime(0, t + 0.3);
      }
      osc.start(now); osc.stop(now + calls * 0.4 + 0.2);
    }, 10000, 25000);
  }

  // ═══════════════════════════════════════════════════════
  //  WIND — howling gusts with whistling
  // ═══════════════════════════════════════════════════════

  private buildWind(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Main wind body
    const pinkNoise = this.makePinkNoise(ctx, layer);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 400; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.18;
    pinkNoise.connect(bp); bp.connect(g); g.connect(dest);
    pinkNoise.start();
    layer.nodes.push(bp, g);

    // Slow howling modulation
    this.makeLFO(ctx, layer, 0.1, 250, bp.frequency);
    this.makeLFO(ctx, layer, 0.05, 0.07, g.gain);

    // Higher whistling layer
    const whistleNoise = this.makeNoise(ctx, layer);
    const whistleBp = ctx.createBiquadFilter();
    whistleBp.type = "bandpass"; whistleBp.frequency.value = 1400; whistleBp.Q.value = 3;
    const whistleG = ctx.createGain(); whistleG.gain.value = 0.03;
    whistleNoise.connect(whistleBp); whistleBp.connect(whistleG); whistleG.connect(dest);
    whistleNoise.start();
    layer.nodes.push(whistleBp, whistleG);
    this.makeLFO(ctx, layer, 0.18, 500, whistleBp.frequency);
    this.makeLFO(ctx, layer, 0.08, 0.02, whistleG.gain);

    // Occasional strong gusts
    this.scheduleRecurring(layer, () => {
      const gustNoise = this.makePinkNoise(ctx, layer, 3);
      const gustBp = ctx.createBiquadFilter();
      gustBp.type = "bandpass"; gustBp.frequency.value = 300 + Math.random() * 400; gustBp.Q.value = 0.4;
      const gustG = ctx.createGain(); gustG.gain.value = 0;
      gustNoise.connect(gustBp); gustBp.connect(gustG); gustG.connect(dest);
      const now = ctx.currentTime;
      gustG.gain.setTargetAtTime(0.12 + Math.random() * 0.06, now, 0.4);
      gustG.gain.setTargetAtTime(0, now + 1.5, 0.6);
      gustNoise.start(now); gustNoise.stop(now + 4);
      layer.nodes.push(gustBp, gustG);
    }, 4000, 10000);
  }

  // ═══════════════════════════════════════════════════════
  //  FIRE — crackling hearth with warm rumble and pops
  // ═══════════════════════════════════════════════════════

  private buildFire(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Crackle layer — rapid filtered noise bursts
    const crackleNoise = this.makeNoise(ctx, layer, 2);
    const crackleHp = ctx.createBiquadFilter();
    crackleHp.type = "highpass"; crackleHp.frequency.value = 3000;
    const crackleG = ctx.createGain(); crackleG.gain.value = 0.10;
    crackleNoise.connect(crackleHp); crackleHp.connect(crackleG); crackleG.connect(dest);
    crackleNoise.start();
    layer.nodes.push(crackleHp, crackleG);
    this.makeLFO(ctx, layer, 8, 0.08, crackleG.gain);

    // Warm low rumble
    const rumbleNoise = this.makePinkNoise(ctx, layer, 3);
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = "lowpass"; rumbleLp.frequency.value = 250;
    const rumbleG = ctx.createGain(); rumbleG.gain.value = 0.14;
    rumbleNoise.connect(rumbleLp); rumbleLp.connect(rumbleG); rumbleG.connect(dest);
    rumbleNoise.start();
    layer.nodes.push(rumbleLp, rumbleG);
    this.makeLFO(ctx, layer, 0.25, 0.04, rumbleG.gain);

    // Mid-frequency body
    const bodyNoise = this.makeNoise(ctx, layer, 2);
    const bodyBp = ctx.createBiquadFilter();
    bodyBp.type = "bandpass"; bodyBp.frequency.value = 800; bodyBp.Q.value = 0.5;
    const bodyG = ctx.createGain(); bodyG.gain.value = 0.04;
    bodyNoise.connect(bodyBp); bodyBp.connect(bodyG); bodyG.connect(dest);
    bodyNoise.start();
    layer.nodes.push(bodyBp, bodyG);

    // Fire pops and snaps
    this.scheduleRecurring(layer, () => {
      const popNoise = this.makeNoise(ctx, layer, 0.5);
      const popBp = ctx.createBiquadFilter();
      popBp.type = "bandpass"; popBp.frequency.value = 1800 + Math.random() * 3000; popBp.Q.value = 5;
      const popG = ctx.createGain(); popG.gain.value = 0;
      popNoise.connect(popBp); popBp.connect(popG); popG.connect(dest);
      const now = ctx.currentTime;
      popG.gain.setValueAtTime(0, now);
      popG.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.08, now + 0.008);
      popG.gain.exponentialRampToValueAtTime(0.001, now + 0.06 + Math.random() * 0.04);
      popNoise.start(now); popNoise.stop(now + 0.12);
      layer.nodes.push(popBp, popG);
    }, 250, 1500);
  }

  // ═══════════════════════════════════════════════════════
  //  NIGHT — crickets, owl hoots, quiet wind
  // ═══════════════════════════════════════════════════════

  private buildNight(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Very quiet wind base
    const pinkNoise = this.makePinkNoise(ctx, layer);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.05;
    pinkNoise.connect(bp); bp.connect(g); g.connect(dest);
    pinkNoise.start();
    layer.nodes.push(bp, g);
    this.makeLFO(ctx, layer, 0.08, 80, bp.frequency);

    // Cricket chorus — two voices
    this.scheduleCrickets(ctx, dest, layer, 4200 + Math.random() * 600);
    this.scheduleCrickets(ctx, dest, layer, 5000 + Math.random() * 500);

    // Tree frog (lower pitch chirps)
    this.scheduleRecurring(layer, () => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 1800 + Math.random() * 400;
      const frogG = ctx.createGain(); frogG.gain.value = 0;
      osc.connect(frogG); frogG.connect(dest);
      const now = ctx.currentTime;
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const t = now + i * 0.25;
        frogG.gain.setValueAtTime(0, t);
        frogG.gain.linearRampToValueAtTime(0.025, t + 0.02);
        frogG.gain.linearRampToValueAtTime(0, t + 0.15);
      }
      osc.start(now); osc.stop(now + count * 0.25 + 0.2);
    }, 3000, 10000);

    // Distant owl hoot
    this.scheduleRecurring(layer, () => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const owlG = ctx.createGain(); owlG.gain.value = 0;
      const owlFilter = ctx.createBiquadFilter();
      owlFilter.type = "lowpass"; owlFilter.frequency.value = 600;
      osc.connect(owlFilter); owlFilter.connect(owlG); owlG.connect(dest);

      const now = ctx.currentTime;
      // "Hoo-hoo" pattern
      osc.frequency.setValueAtTime(380, now);
      owlG.gain.setValueAtTime(0, now);
      owlG.gain.linearRampToValueAtTime(0.03, now + 0.08);
      owlG.gain.linearRampToValueAtTime(0, now + 0.35);
      owlG.gain.setValueAtTime(0, now + 0.5);
      owlG.gain.linearRampToValueAtTime(0.035, now + 0.58);
      osc.frequency.setValueAtTime(340, now + 0.5);
      owlG.gain.linearRampToValueAtTime(0, now + 1.0);
      osc.start(now); osc.stop(now + 1.2);
    }, 15000, 35000);
  }

  private scheduleCrickets(ctx: AudioContext, dest: GainNode, layer: SceneLayer, baseFreq: number) {
    this.scheduleRecurring(layer, () => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = baseFreq + Math.random() * 300;
      const cricketG = ctx.createGain(); cricketG.gain.value = 0;
      osc.connect(cricketG); cricketG.connect(dest);

      const now = ctx.currentTime;
      const chirps = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < chirps; i++) {
        const t = now + i * 0.055;
        cricketG.gain.setValueAtTime(0, t);
        cricketG.gain.linearRampToValueAtTime(0.025 + Math.random() * 0.015, t + 0.012);
        cricketG.gain.linearRampToValueAtTime(0, t + 0.038);
      }
      osc.start(now); osc.stop(now + chirps * 0.055 + 0.1);
    }, 400, 2500);
  }

  // ═══════════════════════════════════════════════════════
  //  CITY — layered urban ambience
  // ═══════════════════════════════════════════════════════

  private buildCity(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Traffic rumble
    const rumbleNoise = this.makePinkNoise(ctx, layer, 4);
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = "lowpass"; rumbleLp.frequency.value = 250;
    const rumbleG = ctx.createGain(); rumbleG.gain.value = 0.13;
    rumbleNoise.connect(rumbleLp); rumbleLp.connect(rumbleG); rumbleG.connect(dest);
    rumbleNoise.start();
    layer.nodes.push(rumbleLp, rumbleG);
    this.makeLFO(ctx, layer, 0.04, 0.03, rumbleG.gain);

    // Mid-frequency crowd murmur
    const murmurNoise = this.makeNoise(ctx, layer);
    const murmurBp = ctx.createBiquadFilter();
    murmurBp.type = "bandpass"; murmurBp.frequency.value = 700; murmurBp.Q.value = 0.4;
    const murmurG = ctx.createGain(); murmurG.gain.value = 0.04;
    murmurNoise.connect(murmurBp); murmurBp.connect(murmurG); murmurG.connect(dest);
    murmurNoise.start();
    layer.nodes.push(murmurBp, murmurG);

    // Occasional passing vehicle
    this.scheduleRecurring(layer, () => {
      const vehNoise = this.makePinkNoise(ctx, layer, 3);
      const vehLp = ctx.createBiquadFilter();
      vehLp.type = "lowpass"; vehLp.frequency.value = 200;
      const vehG = ctx.createGain(); vehG.gain.value = 0;
      vehNoise.connect(vehLp); vehLp.connect(vehG); vehG.connect(dest);
      const now = ctx.currentTime;
      // Doppler-like sweep
      vehLp.frequency.setValueAtTime(120, now);
      vehLp.frequency.linearRampToValueAtTime(300, now + 1.5);
      vehLp.frequency.linearRampToValueAtTime(150, now + 3);
      vehG.gain.setTargetAtTime(0.06, now, 0.3);
      vehG.gain.setTargetAtTime(0, now + 2, 0.5);
      vehNoise.start(now); vehNoise.stop(now + 4.5);
      layer.nodes.push(vehLp, vehG);
    }, 6000, 15000);

    // Distant church/clock bells
    this.scheduleRecurring(layer, () => {
      const bellOsc = ctx.createOscillator();
      bellOsc.type = "sine";
      bellOsc.frequency.value = 520 + Math.random() * 80;
      const bellG = ctx.createGain(); bellG.gain.value = 0;
      const bellFilter = ctx.createBiquadFilter();
      bellFilter.type = "bandpass"; bellFilter.frequency.value = 800; bellFilter.Q.value = 2;
      bellOsc.connect(bellFilter); bellFilter.connect(bellG); bellG.connect(dest);
      const now = ctx.currentTime;
      bellG.gain.setValueAtTime(0, now);
      bellG.gain.linearRampToValueAtTime(0.015, now + 0.02);
      bellG.gain.setTargetAtTime(0, now + 0.5, 0.4);
      bellOsc.start(now); bellOsc.stop(now + 2);
    }, 20000, 45000);
  }

  // ═══════════════════════════════════════════════════════
  //  RIVER — flowing water with babbling and splashes
  // ═══════════════════════════════════════════════════════

  private buildRiver(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Mid-frequency flowing water
    const pinkNoise = this.makePinkNoise(ctx, layer, 4);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.16;
    pinkNoise.connect(bp); bp.connect(g); g.connect(dest);
    pinkNoise.start();
    layer.nodes.push(bp, g);
    this.makeLFO(ctx, layer, 0.2, 300, bp.frequency);
    this.makeLFO(ctx, layer, 0.12, 0.04, g.gain);

    // Babbling higher layer
    const babbleNoise = this.makeNoise(ctx, layer, 3);
    const babbleBp = ctx.createBiquadFilter();
    babbleBp.type = "bandpass"; babbleBp.frequency.value = 3200; babbleBp.Q.value = 1;
    const babbleG = ctx.createGain(); babbleG.gain.value = 0.05;
    babbleNoise.connect(babbleBp); babbleBp.connect(babbleG); babbleG.connect(dest);
    babbleNoise.start();
    layer.nodes.push(babbleBp, babbleG);
    this.makeLFO(ctx, layer, 0.35, 0.03, babbleG.gain);

    // Low undertone
    const deepNoise = this.makePinkNoise(ctx, layer, 5);
    const deepLp = ctx.createBiquadFilter();
    deepLp.type = "lowpass"; deepLp.frequency.value = 300;
    const deepG = ctx.createGain(); deepG.gain.value = 0.06;
    deepNoise.connect(deepLp); deepLp.connect(deepG); deepG.connect(dest);
    deepNoise.start();
    layer.nodes.push(deepLp, deepG);

    // Occasional splash
    this.scheduleRecurring(layer, () => {
      const splashNoise = this.makeNoise(ctx, layer, 0.5);
      const splashBp = ctx.createBiquadFilter();
      splashBp.type = "bandpass"; splashBp.frequency.value = 2000 + Math.random() * 2000; splashBp.Q.value = 2;
      const splashG = ctx.createGain(); splashG.gain.value = 0;
      splashNoise.connect(splashBp); splashBp.connect(splashG); splashG.connect(dest);
      const now = ctx.currentTime;
      splashG.gain.setValueAtTime(0, now);
      splashG.gain.linearRampToValueAtTime(0.04, now + 0.01);
      splashG.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      splashNoise.start(now); splashNoise.stop(now + 0.2);
      layer.nodes.push(splashBp, splashG);
    }, 3000, 8000);
  }

  // ═══════════════════════════════════════════════════════
  //  STORM — heavy rain + wind + thunder
  // ═══════════════════════════════════════════════════════

  private buildStorm(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Heavy rain base (reuse rain builder)
    this.buildRain(ctx, dest, layer);

    // Deep wind rumble
    const windNoise = this.makePinkNoise(ctx, layer, 4);
    const windLp = ctx.createBiquadFilter();
    windLp.type = "lowpass"; windLp.frequency.value = 180;
    const windG = ctx.createGain(); windG.gain.value = 0.18;
    windNoise.connect(windLp); windLp.connect(windG); windG.connect(dest);
    windNoise.start();
    layer.nodes.push(windLp, windG);
    this.makeLFO(ctx, layer, 0.06, 0.08, windG.gain);

    // Howling mid-range wind
    const howlNoise = this.makeNoise(ctx, layer);
    const howlBp = ctx.createBiquadFilter();
    howlBp.type = "bandpass"; howlBp.frequency.value = 500; howlBp.Q.value = 0.8;
    const howlG = ctx.createGain(); howlG.gain.value = 0.06;
    howlNoise.connect(howlBp); howlBp.connect(howlG); howlG.connect(dest);
    howlNoise.start();
    layer.nodes.push(howlBp, howlG);
    this.makeLFO(ctx, layer, 0.12, 200, howlBp.frequency);

    // Thunder — periodic rumbles
    this.scheduleRecurring(layer, () => {
      const thunderNoise = this.makeNoise(ctx, layer, 4);
      const thunderLp = ctx.createBiquadFilter();
      thunderLp.type = "lowpass"; thunderLp.frequency.value = 80 + Math.random() * 60;
      const thunderG = ctx.createGain(); thunderG.gain.value = 0;
      thunderNoise.connect(thunderLp); thunderLp.connect(thunderG); thunderG.connect(dest);

      const now = ctx.currentTime;
      // Initial crack
      thunderG.gain.setValueAtTime(0, now);
      thunderG.gain.linearRampToValueAtTime(0.25 + Math.random() * 0.15, now + 0.05);
      // Rumble decay
      thunderG.gain.setTargetAtTime(0.12, now + 0.2, 0.3);
      thunderG.gain.setTargetAtTime(0, now + 1.2, 0.6);
      thunderNoise.start(now); thunderNoise.stop(now + 4.5);
      layer.nodes.push(thunderLp, thunderG);

      // Secondary distant rumble
      const dist = this.makeNoise(ctx, layer, 3);
      const distLp = ctx.createBiquadFilter();
      distLp.type = "lowpass"; distLp.frequency.value = 60;
      const distG = ctx.createGain(); distG.gain.value = 0;
      dist.connect(distLp); distLp.connect(distG); distG.connect(dest);
      const t2 = now + 0.8 + Math.random() * 1.5;
      distG.gain.setValueAtTime(0, t2);
      distG.gain.linearRampToValueAtTime(0.08, t2 + 0.1);
      distG.gain.setTargetAtTime(0, t2 + 0.8, 0.5);
      dist.start(now); dist.stop(t2 + 3);
      layer.nodes.push(distLp, distG);
    }, 5000, 18000);
  }

  // ═══════════════════════════════════════════════════════
  //  SNOW — hushed, muffled world
  // ═══════════════════════════════════════════════════════

  private buildSnow(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Very soft low wind
    const pinkNoise = this.makePinkNoise(ctx, layer);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 280;
    const g = ctx.createGain(); g.gain.value = 0.07;
    pinkNoise.connect(lp); lp.connect(g); g.connect(dest);
    pinkNoise.start();
    layer.nodes.push(lp, g);
    this.makeLFO(ctx, layer, 0.04, 0.025, g.gain);

    // High shimmer — crystalline quality
    const shimmerNoise = this.makeNoise(ctx, layer);
    const shimmerHp = ctx.createBiquadFilter();
    shimmerHp.type = "highpass"; shimmerHp.frequency.value = 7000;
    const shimmerG = ctx.createGain(); shimmerG.gain.value = 0.012;
    shimmerNoise.connect(shimmerHp); shimmerHp.connect(shimmerG); shimmerG.connect(dest);
    shimmerNoise.start();
    layer.nodes.push(shimmerHp, shimmerG);
    this.makeLFO(ctx, layer, 0.1, 0.005, shimmerG.gain);

    // Occasional muffled crunch (footstep in snow)
    this.scheduleRecurring(layer, () => {
      const crunchNoise = this.makeNoise(ctx, layer, 0.3);
      const crunchBp = ctx.createBiquadFilter();
      crunchBp.type = "bandpass"; crunchBp.frequency.value = 1500; crunchBp.Q.value = 1;
      const crunchLp = ctx.createBiquadFilter();
      crunchLp.type = "lowpass"; crunchLp.frequency.value = 2000;
      const crunchG = ctx.createGain(); crunchG.gain.value = 0;
      crunchNoise.connect(crunchBp); crunchBp.connect(crunchLp); crunchLp.connect(crunchG); crunchG.connect(dest);
      const now = ctx.currentTime;
      crunchG.gain.setValueAtTime(0, now);
      crunchG.gain.linearRampToValueAtTime(0.03, now + 0.01);
      crunchG.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      crunchNoise.start(now); crunchNoise.stop(now + 0.12);
      layer.nodes.push(crunchBp, crunchLp, crunchG);
    }, 10000, 25000);
  }

  // ═══════════════════════════════════════════════════════
  //  INDOOR — quiet room tone with subtle life
  // ═══════════════════════════════════════════════════════

  private buildIndoor(ctx: AudioContext, dest: GainNode, layer: SceneLayer) {
    // Room tone — very low filtered noise
    const pinkNoise = this.makePinkNoise(ctx, layer);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 220;
    const g = ctx.createGain(); g.gain.value = 0.035;
    pinkNoise.connect(lp); lp.connect(g); g.connect(dest);
    pinkNoise.start();
    layer.nodes.push(lp, g);

    // Mains hum (50/60 Hz)
    const hum = ctx.createOscillator();
    hum.type = "sine"; hum.frequency.value = 60;
    const humG = ctx.createGain(); humG.gain.value = 0.006;
    hum.connect(humG); humG.connect(dest);
    hum.start();
    layer.nodes.push(hum, humG);

    // Subtle higher harmonic
    const hum2 = ctx.createOscillator();
    hum2.type = "sine"; hum2.frequency.value = 120;
    const hum2G = ctx.createGain(); hum2G.gain.value = 0.003;
    hum2.connect(hum2G); hum2G.connect(dest);
    hum2.start();
    layer.nodes.push(hum2, hum2G);

    // Occasional creak
    this.scheduleRecurring(layer, () => {
      const creakOsc = ctx.createOscillator();
      creakOsc.type = "sawtooth";
      const creakFilter = ctx.createBiquadFilter();
      creakFilter.type = "bandpass"; creakFilter.frequency.value = 400 + Math.random() * 200; creakFilter.Q.value = 8;
      const creakG = ctx.createGain(); creakG.gain.value = 0;
      creakOsc.connect(creakFilter); creakFilter.connect(creakG); creakG.connect(dest);
      const now = ctx.currentTime;
      creakOsc.frequency.setValueAtTime(200, now);
      creakOsc.frequency.linearRampToValueAtTime(350 + Math.random() * 100, now + 0.15);
      creakG.gain.setValueAtTime(0, now);
      creakG.gain.linearRampToValueAtTime(0.008, now + 0.03);
      creakG.gain.setTargetAtTime(0, now + 0.1, 0.05);
      creakOsc.start(now); creakOsc.stop(now + 0.3);
    }, 15000, 40000);

    // Occasional clock tick
    this.scheduleRecurring(layer, () => {
      const tickNoise = this.makeNoise(ctx, layer, 0.1);
      const tickBp = ctx.createBiquadFilter();
      tickBp.type = "bandpass"; tickBp.frequency.value = 3000; tickBp.Q.value = 10;
      const tickG = ctx.createGain(); tickG.gain.value = 0;
      tickNoise.connect(tickBp); tickBp.connect(tickG); tickG.connect(dest);
      const now = ctx.currentTime;
      tickG.gain.setValueAtTime(0, now);
      tickG.gain.linearRampToValueAtTime(0.012, now + 0.002);
      tickG.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      tickNoise.start(now); tickNoise.stop(now + 0.05);
      layer.nodes.push(tickBp, tickG);
    }, 950, 1050);  // roughly once per second
  }
}
