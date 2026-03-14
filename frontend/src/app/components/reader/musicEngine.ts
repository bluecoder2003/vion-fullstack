/**
 * Procedural Music Engine — Web Audio API-based soothing music generator
 * All 6 genres are designed to be calm, gentle, and reading-friendly.
 */

export type MusicGenre =
  | "acoustic"
  | "lofi"
  | "buttonSmash"
  | "friday"
  | "synthwave"
  | "hero";

export interface GenreInfo {
  type: MusicGenre;
  label: string;
  color: string;
  icon: string;
}

export const GENRES: GenreInfo[] = [
  { type: "acoustic",    label: "Acoustic ambient", color: "#22c55e", icon: "\u{1F426}" },
  { type: "lofi",        label: "Lo-fi hip hop",    color: "#eab308", icon: "\u{1F3A7}" },
  { type: "buttonSmash", label: "Gentle keys",      color: "#6366f1", icon: "\u{1F3B9}" },
  { type: "friday",      label: "Warm evening",     color: "#f97316", icon: "\u{1F305}" },
  { type: "synthwave",   label: "Dream synth",      color: "#d946ef", icon: "\u{1F319}" },
  { type: "hero",        label: "Calm voyage",      color: "#38bdf8", icon: "\u26F5" },
];

// Musical scales (semitone offsets from root)
const SCALES = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian:     [0, 2, 4, 6, 7, 9, 11],
};

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function scaleNote(root: number, scale: number[], degree: number): number {
  const octave = Math.floor(degree / scale.length);
  const idx = ((degree % scale.length) + scale.length) % scale.length;
  return root + octave * 12 + scale[idx];
}

// ═══════════════════════════════════════════════════════
//  MUSIC ENGINE CLASS
// ═══════════════════════════════════════════════════════

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeNodes: AudioNode[] = [];
  private timers: number[] = [];
  private running = false;
  private _volume = 0.35;
  private _genre: MusicGenre = "acoustic";

  get volume() { return this._volume; }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this._volume, this.ctx!.currentTime, 0.05);
    }
  }

  get genre() { return this._genre; }

  private ensureContext() {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  async start(genre: MusicGenre) {
    this.stop();
    this._genre = genre;
    this.running = true;
    const ctx = this.ensureContext();

    switch (genre) {
      case "acoustic":    this.playAcoustic(ctx); break;
      case "lofi":        this.playLofi(ctx); break;
      case "buttonSmash": this.playGentleKeys(ctx); break;
      case "friday":      this.playWarmEvening(ctx); break;
      case "synthwave":   this.playDreamSynth(ctx); break;
      case "hero":        this.playCalmVoyage(ctx); break;
    }
  }

  stop() {
    this.running = false;
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    this.activeNodes.forEach(n => {
      try { n.disconnect(); } catch {}
    });
    this.activeNodes = [];
  }

  destroy() {
    this.stop();
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close();
    }
    this.ctx = null;
    this.masterGain = null;
  }

  private track(node: AudioNode) {
    this.activeNodes.push(node);
    return node;
  }

  private schedule(fn: () => void, delayMs: number) {
    const id = window.setTimeout(() => {
      if (this.running) fn();
    }, delayMs);
    this.timers.push(id);
  }

  // ─── Shared: gentle pad with slow attack/release ───

  private createSoftPad(
    ctx: AudioContext,
    freq: number,
    duration: number,
    type: OscillatorType = "sine",
    detune = 0,
    maxGain = 0.08,
  ): { osc: OscillatorNode; gain: GainNode } {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.masterGain!);
    this.track(osc);
    this.track(gain);

    const now = ctx.currentTime;
    const attack = Math.min(duration * 0.35, 1.5);
    const release = Math.min(duration * 0.4, 2.0);
    gain.gain.setTargetAtTime(maxGain, now, attack / 3);
    gain.gain.setTargetAtTime(0, now + duration - release, release / 3);
    osc.start(now);
    osc.stop(now + duration + 2);
    return { osc, gain };
  }

  private createFilteredNoise(
    ctx: AudioContext,
    filterFreq: number,
    filterType: BiquadFilterType = "lowpass",
    noiseGain = 0.01,
  ): { noise: AudioBufferSourceNode; gain: GainNode } {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.value = noiseGain;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    noise.start();

    this.track(noise);
    this.track(filter);
    this.track(gain);
    return { noise, gain };
  }

  // ─── ACOUSTIC AMBIENT ──────────────────────────────
  // Warm, breathy pads with gentle arpeggios — like sitting by a window

  private playAcoustic(ctx: AudioContext) {
    const root = 48; // C3
    const scale = SCALES.major;
    const progression = [0, 4, 5, 3]; // I-V-vi-IV
    let chordIdx = 0;

    // Soft breath noise bed
    this.createFilteredNoise(ctx, 600, "lowpass", 0.008);

    const playChord = () => {
      if (!this.running) return;
      const degree = progression[chordIdx % progression.length];
      const notes = [0, 2, 4].map(d => scaleNote(root, scale, degree + d));

      // Warm layered pad
      notes.forEach(n => {
        this.createSoftPad(ctx, midiToFreq(n), 6, "sine", Math.random() * 4 - 2, 0.06);
        this.createSoftPad(ctx, midiToFreq(n), 6, "triangle", Math.random() * 6, 0.03);
      });

      // Gentle arpeggio — slow, spaced, quiet
      const arpNotes = [0, 2, 4, 5, 4, 2].map(d => scaleNote(root + 12, scale, degree + d));
      arpNotes.forEach((n, i) => {
        this.schedule(() => {
          if (!this.running) return;
          this.createSoftPad(ctx, midiToFreq(n), 1.2, "sine", 0, 0.03);
        }, i * 850 + Math.random() * 100);
      });

      chordIdx++;
      this.schedule(() => playChord(), 6000);
    };

    playChord();
  }

  // ─── LO-FI HIP HOP ────────────────────────────────
  // Mellow beats, warm chords, vinyl crackle — cozy study vibes

  private playLofi(ctx: AudioContext) {
    const root = 55; // G3
    const scale = SCALES.dorian;
    const bpm = 65; // Slower than typical — very relaxed
    const beatMs = (60 / bpm) * 1000;
    let beat = 0;

    // Vinyl crackle bed
    this.createFilteredNoise(ctx, 4000, "highpass", 0.012);

    const chords = [
      [0, 2, 4, 6],
      [3, 5, 0, 2],
      [4, 6, 1, 3],
      [2, 4, 6, 1],
    ];
    let chordIdx = 0;

    const playBeat = () => {
      if (!this.running) return;

      // Very soft kick — more of a gentle thump
      if (beat % 4 === 0 || beat % 4 === 2) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(80, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
        this.track(osc);
        this.track(gain);
      }

      // Whisper-soft brush hit on backbeats
      if (beat % 4 === 1 || beat % 4 === 3) {
        const { gain } = this.createFilteredNoise(ctx, 3000, "bandpass", 0);
        gain.gain.setValueAtTime(0.03, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      }

      // Chord pad — very warm, held long
      if (beat % 4 === 0) {
        const chord = chords[chordIdx % chords.length];
        chord.forEach(d => {
          const freq = midiToFreq(scaleNote(root, scale, d));
          this.createSoftPad(ctx, freq, (beatMs * 4) / 1000, "triangle", Math.random() * 4, 0.04);
        });
        chordIdx++;
      }

      // Occasional gentle melodic bell
      if (Math.random() < 0.2) {
        const degree = pickRandom([0, 2, 4, 5, 6]);
        const freq = midiToFreq(scaleNote(root + 12, scale, degree));
        this.createSoftPad(ctx, freq, 0.8, "sine", 0, 0.025);
      }

      beat++;
      this.schedule(() => playBeat(), beatMs);
    };

    playBeat();
  }

  // ─── GENTLE KEYS (was Button Smash) ────────────────
  // Soft piano-like tones drifting at random intervals

  private playGentleKeys(ctx: AudioContext) {
    const root = 60; // C4
    const scale = SCALES.pentatonic;

    // Background pad drone
    this.createSoftPad(ctx, midiToFreq(48), 30, "sine", 0, 0.04);
    this.createSoftPad(ctx, midiToFreq(55), 30, "sine", 0, 0.03);

    const playNote = () => {
      if (!this.running) return;
      const degree = Math.floor(Math.random() * 8);
      const freq = midiToFreq(scaleNote(root, scale, degree));

      // Soft bell/piano tone
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc2.type = "triangle";
      osc.frequency.value = freq;
      osc2.frequency.value = freq * 2.01; // Slight shimmer
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.02);
      gain.gain.setTargetAtTime(0, ctx.currentTime + 0.15, 0.4);
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 3);
      osc2.stop(ctx.currentTime + 3);
      this.track(osc);
      this.track(osc2);
      this.track(gain);

      // Random, unhurried spacing
      const nextDelay = 800 + Math.random() * 2200;
      this.schedule(() => playNote(), nextDelay);
    };

    // Slowly reintroduce the drone pad
    this.schedule(() => {
      if (!this.running) return;
      this.createSoftPad(ctx, midiToFreq(48), 30, "sine", 0, 0.04);
      this.createSoftPad(ctx, midiToFreq(55), 30, "sine", 0, 0.03);
    }, 28000);

    playNote();
  }

  // ─── WARM EVENING (was It's Friday) ────────────────
  // Slow jazz-inspired warmth — brushed textures, gentle bass

  private playWarmEvening(ctx: AudioContext) {
    const root = 53; // F3
    const scale = SCALES.mixolydian;
    const bpm = 55;
    const beatMs = (60 / bpm) * 1000;
    let beat = 0;

    // Room tone
    this.createFilteredNoise(ctx, 300, "lowpass", 0.006);

    const bassLine = [0, 0, 3, 4, 5, 5, 4, 3];
    let chordIdx = 0;

    const playBeat = () => {
      if (!this.running) return;

      // Gentle bass walk
      const bassDeg = bassLine[beat % bassLine.length];
      const bassFreq = midiToFreq(scaleNote(root - 12, scale, bassDeg));
      this.createSoftPad(ctx, bassFreq, beatMs / 1000 * 0.8, "sine", 0, 0.07);

      // Warm chord every 4 beats
      if (beat % 4 === 0) {
        const chordDegs = [
          [0, 2, 4, 6],
          [3, 5, 0, 2],
          [5, 0, 2, 4],
          [4, 6, 1, 3],
        ];
        const chord = chordDegs[chordIdx % chordDegs.length];
        chord.forEach(d => {
          const freq = midiToFreq(scaleNote(root, scale, d));
          this.createSoftPad(ctx, freq, (beatMs * 4) / 1000, "triangle", Math.random() * 3, 0.035);
        });
        chordIdx++;
      }

      // Subtle brush shimmer
      if (beat % 2 === 1 && Math.random() < 0.5) {
        const { gain } = this.createFilteredNoise(ctx, 5000, "highpass", 0);
        gain.gain.setValueAtTime(0.015, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      }

      // Occasional high bell
      if (Math.random() < 0.15) {
        const degree = pickRandom([0, 2, 4, 6]);
        const freq = midiToFreq(scaleNote(root + 24, scale, degree));
        this.createSoftPad(ctx, freq, 1.5, "sine", 0, 0.02);
      }

      beat++;
      this.schedule(() => playBeat(), beatMs);
    };

    playBeat();
  }

  // ─── DREAM SYNTH (was Synthwave) ───────────────────
  // Ethereal, slow-moving synth pads — like floating in space

  private playDreamSynth(ctx: AudioContext) {
    const root = 45; // A2
    const scale = SCALES.lydian; // Dreamy, floaty character
    const chords = [
      [0, 2, 4],
      [5, 0, 2],
      [3, 5, 0],
      [4, 6, 1],
    ];
    let chordIdx = 0;

    const playSection = () => {
      if (!this.running) return;
      const chord = chords[chordIdx % chords.length];

      // Deep, wide synth pad
      chord.forEach(d => {
        const freq = midiToFreq(scaleNote(root + 12, scale, d));
        // Detune layers for width
        this.createSoftPad(ctx, freq, 8, "sawtooth", -8, 0.025);
        this.createSoftPad(ctx, freq, 8, "sawtooth", 8, 0.025);
        // Sine core for warmth
        this.createSoftPad(ctx, freq, 8, "sine", 0, 0.04);
      });

      // Sub bass
      const bassFreq = midiToFreq(scaleNote(root, scale, chord[0]));
      this.createSoftPad(ctx, bassFreq, 8, "sine", 0, 0.06);

      // Slow shimmer arpeggio
      const arpNotes = [0, 2, 4, 2].map(i => chord[i % chord.length]);
      arpNotes.forEach((d, i) => {
        this.schedule(() => {
          if (!this.running) return;
          const freq = midiToFreq(scaleNote(root + 24, scale, d));
          this.createSoftPad(ctx, freq, 2, "sine", 0, 0.02);
        }, i * 1800 + Math.random() * 200);
      });

      chordIdx++;
      this.schedule(() => playSection(), 8000);
    };

    // Filtered noise bed — like soft wind
    this.createFilteredNoise(ctx, 400, "lowpass", 0.01);

    playSection();
  }

  // ─── CALM VOYAGE (was Hero's Journey) ──────────────
  // Gentle, expansive pads — like gazing at the horizon from a quiet ship

  private playCalmVoyage(ctx: AudioContext) {
    const root = 48; // C3
    const scale = SCALES.major;
    const progression = [0, 3, 5, 4, 0, 5, 3, 2];
    let chordIdx = 0;

    // Soft ocean-like noise bed
    this.createFilteredNoise(ctx, 500, "lowpass", 0.01);

    const playSection = () => {
      if (!this.running) return;
      const degree = progression[chordIdx % progression.length];

      // Layered pad — spacious and warm
      [0, 2, 4].forEach(d => {
        const freq = midiToFreq(scaleNote(root, scale, degree + d));
        this.createSoftPad(ctx, freq, 7, "triangle", Math.random() * 5 - 2.5, 0.05);
        this.createSoftPad(ctx, freq * 2, 7, "sine", 0, 0.015); // Octave shimmer
      });

      // Low root for grounding
      const rootFreq = midiToFreq(scaleNote(root - 12, scale, degree));
      this.createSoftPad(ctx, rootFreq, 7, "sine", 0, 0.05);

      // Slow, gentle melody fragments
      const melody = [4, 2, 0, 2];
      melody.forEach((d, i) => {
        this.schedule(() => {
          if (!this.running) return;
          const freq = midiToFreq(scaleNote(root + 24, scale, degree + d));
          this.createSoftPad(ctx, freq, 2, "sine", 0, 0.025);
        }, i * 1600 + Math.random() * 300);
      });

      chordIdx++;
      this.schedule(() => playSection(), 7000);
    };

    playSection();
  }
}
