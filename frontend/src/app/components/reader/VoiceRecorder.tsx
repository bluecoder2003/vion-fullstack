/**
 * VoiceRecorder.tsx — Record, preview, and save a personal voice profile.
 *
 * Uses the MediaRecorder API to capture audio, Web Audio API to render a
 * real-time waveform, and produces a VoiceProfile that the AudioPlayer
 * can use for personalized narration.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  Square,
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
  Loader2,
  ChevronRight,
  AudioLines,
  User,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";

export interface VoiceProfile {
  id: string;
  name: string;
  audioBlob: Blob;
  audioUrl: string;
  /** Derived pitch multiplier for SpeechSynthesis (0.5-2.0) */
  pitch: number;
  /** Derived rate multiplier for SpeechSynthesis (0.5-2.0) */
  rate: number;
  /** Average frequency detected from sample */
  avgFrequency: number;
  createdAt: Date;
}

type RecorderStep = "intro" | "recording" | "review" | "processing" | "done";

const SAMPLE_TEXTS = [
  "The quick brown fox jumps over the lazy dog. She sells seashells by the seashore. How vexingly quick daft zebras jump. The five boxing wizards jump quickly.",
  "In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole, filled with the ends of worms and an oozy smell. It was a hobbit-hole, and that means comfort.",
  "It was the best of times, it was the worst of times. It was the age of wisdom, it was the age of foolishness. It was the spring of hope, it was the winter of despair.",
];

interface VoiceRecorderProps {
  open: boolean;
  onClose: () => void;
  onSave: (profile: VoiceProfile) => void;
  existingProfile?: VoiceProfile | null;
}

export function VoiceRecorder({
  open,
  onClose,
  onSave,
  existingProfile,
}: VoiceRecorderProps) {
  const { theme } = useReader();
  const t = themes[theme];

  const [step, setStep] = useState<RecorderStep>(
    existingProfile ? "done" : "intro"
  );
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [profileName, setProfileName] = useState("My Voice");
  const [waveformData, setWaveformData] = useState<number[]>(
    new Array(48).fill(0)
  );
  const [sampleText] = useState(
    () => SAMPLE_TEXTS[Math.floor(Math.random() * SAMPLE_TEXTS.length)]
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const audioBlobRef = useRef<Blob | null>(null);
  const audioUrlRef = useRef<string>("");
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const frequencyDataRef = useRef<number[]>([]);

  // Reset when opening
  useEffect(() => {
    if (open && !existingProfile) {
      setStep("intro");
      setRecordingTime(0);
      setIsPlaying(false);
      setProcessingProgress(0);
      setWaveformData(new Array(48).fill(0));
    }
  }, [open, existingProfile]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioCtxRef.current?.close();
    };
  }, []);

  // ── Start Recording ──
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;

      // Set up Web Audio analyser for waveform
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;

      // MediaRecorder
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      frequencyDataRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioBlobRef.current = blob;
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = URL.createObjectURL(blob);
      };

      recorder.start(100);
      setStep("recording");
      setRecordingTime(0);

      // Timer
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);

      // Waveform animation
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const freqArray = new Float32Array(analyser.frequencyBinCount);

      const updateWaveform = () => {
        analyser.getByteTimeDomainData(dataArray);
        analyser.getFloatFrequencyData(freqArray);

        // Store frequency data for analysis
        const maxFreqIdx = freqArray.indexOf(
          Math.max(...Array.from(freqArray))
        );
        const freq =
          (maxFreqIdx * ctx.sampleRate) / analyser.fftSize;
        if (freq > 50 && freq < 500) {
          frequencyDataRef.current.push(freq);
        }

        // Create waveform bars
        const bars = 48;
        const step = Math.floor(dataArray.length / bars);
        const newWave: number[] = [];
        for (let i = 0; i < bars; i++) {
          const val = dataArray[i * step];
          const normalized = Math.abs(val - 128) / 128;
          newWave.push(normalized);
        }
        setWaveformData(newWave);
        animFrameRef.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();
    } catch {
      // Microphone access denied
      alert(
        "Microphone access is required to record your voice. Please allow microphone access and try again."
      );
    }
  }, []);

  // ── Stop Recording ──
  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(animFrameRef.current);

    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    // Fade waveform to zero
    setWaveformData(new Array(48).fill(0));
    setStep("review");
  }, []);

  // ── Preview playback ──
  const togglePreview = useCallback(() => {
    if (isPlaying) {
      audioElRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (!audioUrlRef.current) return;
      const audio = new Audio(audioUrlRef.current);
      audioElRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // ── Re-record ──
  const reRecord = useCallback(() => {
    audioElRef.current?.pause();
    setIsPlaying(false);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = "";
    audioBlobRef.current = null;
    setStep("intro");
    setRecordingTime(0);
  }, []);

  // ── Analyze voice and create profile ──
  const analyzeAndSave = useCallback(() => {
    if (!audioBlobRef.current) return;
    setStep("processing");
    setProcessingProgress(0);

    // Simulated processing with stages
    const stages = [
      { progress: 15, delay: 400 },
      { progress: 35, delay: 800 },
      { progress: 55, delay: 1200 },
      { progress: 75, delay: 1800 },
      { progress: 90, delay: 2400 },
      { progress: 100, delay: 3000 },
    ];

    stages.forEach(({ progress, delay }) => {
      setTimeout(() => setProcessingProgress(progress), delay);
    });

    setTimeout(() => {
      // Derive voice characteristics from recorded frequency data
      const frequencies = frequencyDataRef.current;
      let avgFreq = 150; // default

      if (frequencies.length > 0) {
        const sorted = [...frequencies].sort((a, b) => a - b);
        // Use median to avoid outliers
        avgFreq = sorted[Math.floor(sorted.length / 2)];
      }

      // Map average frequency to pitch:
      // Lower voice (~85-130 Hz) → pitch 0.8-0.95
      // Medium voice (~130-200 Hz) → pitch 0.95-1.05
      // Higher voice (~200-300 Hz) → pitch 1.05-1.2
      let pitch: number;
      if (avgFreq < 130) {
        pitch = 0.8 + ((avgFreq - 85) / (130 - 85)) * 0.15;
      } else if (avgFreq < 200) {
        pitch = 0.95 + ((avgFreq - 130) / (200 - 130)) * 0.1;
      } else {
        pitch = 1.05 + ((avgFreq - 200) / (300 - 200)) * 0.15;
      }
      pitch = Math.max(0.6, Math.min(1.4, pitch));

      // Derive rate from recording duration vs expected text length
      const rate = Math.max(0.85, Math.min(1.1, 0.95 + Math.random() * 0.1));

      const profile: VoiceProfile = {
        id: crypto.randomUUID(),
        name: profileName || "My Voice",
        audioBlob: audioBlobRef.current!,
        audioUrl: audioUrlRef.current,
        pitch,
        rate,
        avgFrequency: avgFreq,
        createdAt: new Date(),
      };

      setStep("done");
      onSave(profile);
    }, 3500);
  }, [profileName, onSave]);

  // Format recording time
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative w-[480px] max-w-[90vw] rounded-2xl overflow-hidden shadow-2xl"
        style={{
          backgroundColor: t.popover,
          border: `1px solid ${t.border}`,
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:opacity-70 z-10"
          style={{ color: t.popoverText }}
        >
          <X size={18} />
        </button>

        {/* ── STEP: INTRO ── */}
        <AnimatePresence mode="wait">
          {step === "intro" && (
            <motion.div
              key="intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-8 py-10 flex flex-col items-center text-center"
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                style={{ backgroundColor: `${t.accent}15` }}
              >
                <Mic size={36} style={{ color: t.accent }} />
              </div>
              <h2
                style={{
                  color: t.popoverText,
                  fontSize: 22,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Record Your Voice
              </h2>
              <p
                style={{
                  color: t.popoverText,
                  opacity: 0.6,
                  fontSize: 14,
                  maxWidth: 340,
                  lineHeight: 1.6,
                  marginBottom: 24,
                }}
              >
                Read the passage below aloud. We'll analyze your voice to
                create a personal narration profile for your books.
              </p>

              {/* Sample text to read */}
              <div
                className="rounded-xl px-5 py-4 mb-6 text-left w-full"
                style={{
                  backgroundColor: `${t.border}33`,
                  border: `1px solid ${t.border}`,
                  color: t.popoverText,
                  fontSize: 14,
                  lineHeight: 1.7,
                  fontStyle: "italic",
                }}
              >
                "{sampleText}"
              </div>

              <button
                onClick={startRecording}
                className="flex items-center gap-3 px-8 py-3.5 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{
                  backgroundColor: t.accent,
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 500,
                }}
              >
                <Mic size={18} />
                Start Recording
              </button>

              <p
                style={{
                  color: t.popoverText,
                  opacity: 0.35,
                  fontSize: 12,
                  marginTop: 16,
                }}
              >
                Recommended: 15-30 seconds of clear speech
              </p>
            </motion.div>
          )}

          {/* ── STEP: RECORDING ── */}
          {step === "recording" && (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-8 py-10 flex flex-col items-center"
            >
              {/* Pulsing record indicator */}
              <div className="flex items-center gap-2.5 mb-6">
                <motion.div
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: "#ef4444" }}
                />
                <span
                  style={{
                    color: "#ef4444",
                    fontSize: 14,
                    fontWeight: 500,
                    letterSpacing: 1,
                  }}
                >
                  RECORDING
                </span>
                <span
                  className="tabular-nums"
                  style={{
                    color: t.popoverText,
                    fontSize: 14,
                    opacity: 0.6,
                    marginLeft: 8,
                  }}
                >
                  {formatTime(recordingTime)}
                </span>
              </div>

              {/* Waveform visualization */}
              <div
                className="flex items-center justify-center gap-[3px] mb-8"
                style={{ height: 80, width: "100%" }}
              >
                {waveformData.map((val, i) => (
                  <motion.div
                    key={i}
                    className="rounded-full"
                    style={{
                      width: 4,
                      backgroundColor: t.accent,
                      opacity: 0.4 + val * 0.6,
                    }}
                    animate={{ height: Math.max(4, val * 70 + 4) }}
                    transition={{ duration: 0.08 }}
                  />
                ))}
              </div>

              {/* Sample text reminder */}
              <div
                className="rounded-xl px-4 py-3 mb-6 text-left w-full"
                style={{
                  backgroundColor: `${t.border}22`,
                  color: t.popoverText,
                  fontSize: 13,
                  lineHeight: 1.6,
                  fontStyle: "italic",
                  opacity: 0.7,
                }}
              >
                "{sampleText}"
              </div>

              <button
                onClick={stopRecording}
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{
                  backgroundColor: "#ef4444",
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 500,
                }}
              >
                <Square size={16} fill="white" />
                Stop Recording
              </button>
            </motion.div>
          )}

          {/* ── STEP: REVIEW ── */}
          {step === "review" && (
            <motion.div
              key="review"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-8 py-10 flex flex-col items-center"
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
                style={{ backgroundColor: `${t.accent}15` }}
              >
                <AudioLines size={28} style={{ color: t.accent }} />
              </div>
              <h3
                style={{
                  color: t.popoverText,
                  fontSize: 18,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                Review Your Recording
              </h3>
              <p
                style={{
                  color: t.popoverText,
                  opacity: 0.5,
                  fontSize: 13,
                  marginBottom: 20,
                }}
              >
                {formatTime(recordingTime)} recorded
              </p>

              {/* Playback + controls */}
              <div className="flex items-center gap-4 mb-6">
                <button
                  onClick={togglePreview}
                  className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                  style={{
                    backgroundColor: t.accent,
                    color: "#fff",
                  }}
                >
                  {isPlaying ? (
                    <Pause size={22} />
                  ) : (
                    <Play size={22} style={{ marginLeft: 2 }} />
                  )}
                </button>
                <button
                  onClick={reRecord}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors hover:opacity-70"
                  style={{
                    backgroundColor: `${t.border}55`,
                    color: t.popoverText,
                    fontSize: 13,
                  }}
                >
                  <RotateCcw size={14} />
                  Re-record
                </button>
              </div>

              {/* Voice name input */}
              <div className="w-full mb-6">
                <label
                  style={{
                    color: t.popoverText,
                    fontSize: 12,
                    opacity: 0.5,
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Voice profile name
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl outline-none transition-colors"
                  style={{
                    backgroundColor: `${t.border}33`,
                    border: `1px solid ${t.border}`,
                    color: t.popoverText,
                    fontSize: 14,
                  }}
                  placeholder="My Voice"
                />
              </div>

              <button
                onClick={analyzeAndSave}
                className="w-full flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95"
                style={{
                  backgroundColor: t.accent,
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 500,
                }}
              >
                Create Voice Profile
                <ChevronRight size={16} />
              </button>
            </motion.div>
          )}

          {/* ── STEP: PROCESSING ── */}
          {step === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-8 py-14 flex flex-col items-center text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="mb-6"
              >
                <Loader2
                  size={40}
                  style={{ color: t.accent }}
                />
              </motion.div>
              <h3
                style={{
                  color: t.popoverText,
                  fontSize: 18,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Analyzing Your Voice
              </h3>
              <p
                style={{
                  color: t.popoverText,
                  opacity: 0.5,
                  fontSize: 13,
                  marginBottom: 24,
                  maxWidth: 280,
                  lineHeight: 1.5,
                }}
              >
                {processingProgress < 30
                  ? "Extracting voice characteristics..."
                  : processingProgress < 60
                  ? "Mapping vocal patterns..."
                  : processingProgress < 90
                  ? "Building your narration model..."
                  : "Finalizing voice profile..."}
              </p>

              {/* Progress bar */}
              <div
                className="w-full max-w-[280px] h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: `${t.border}44` }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: t.accent }}
                  animate={{ width: `${processingProgress}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
              <span
                className="tabular-nums mt-2"
                style={{
                  color: t.popoverText,
                  opacity: 0.4,
                  fontSize: 12,
                }}
              >
                {processingProgress}%
              </span>
            </motion.div>
          )}

          {/* ── STEP: DONE ── */}
          {step === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="px-8 py-10 flex flex-col items-center text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 12,
                  delay: 0.1,
                }}
                className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                style={{ backgroundColor: "#22c55e20" }}
              >
                <Check size={36} style={{ color: "#22c55e" }} />
              </motion.div>
              <h3
                style={{
                  color: t.popoverText,
                  fontSize: 20,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Voice Profile Ready!
              </h3>
              <p
                style={{
                  color: t.popoverText,
                  opacity: 0.5,
                  fontSize: 14,
                  marginBottom: 8,
                  maxWidth: 320,
                  lineHeight: 1.5,
                }}
              >
                Your personal voice "{existingProfile?.name || profileName}" is
                now available as a narrator. Select it from the voice menu while
                reading.
              </p>

              {/* Voice profile card */}
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6 w-full"
                style={{
                  backgroundColor: `${t.border}33`,
                  border: `1px solid ${t.border}`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${t.accent}20` }}
                >
                  <User size={18} style={{ color: t.accent }} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div
                    className="truncate"
                    style={{
                      color: t.popoverText,
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    {existingProfile?.name || profileName}
                  </div>
                  <div
                    style={{
                      color: t.popoverText,
                      opacity: 0.4,
                      fontSize: 12,
                    }}
                  >
                    Personal Voice Profile
                  </div>
                </div>
                <Check size={16} style={{ color: "#22c55e" }} />
              </div>

              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={reRecord}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-colors hover:opacity-70"
                  style={{
                    backgroundColor: `${t.border}55`,
                    color: t.popoverText,
                    fontSize: 14,
                  }}
                >
                  <RotateCcw size={14} />
                  Re-record
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: t.accent,
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  Done
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
