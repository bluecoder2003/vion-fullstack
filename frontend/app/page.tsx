"use client";

import { useState, useRef, useCallback } from "react";
import axios from "axios";
import { AppState, EMOTIONS } from "@/lib/types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function HomePage() {
  const [emotion, setEmotion] = useState("Sad");
  const [appState, setAppState] = useState<AppState>("idle");
  const [audioURL, setAudioURL] = useState("");
  const [transcription, setTranscription] = useState("");
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setAppState("processing");

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "voice.webm");
        form.append("emotion", emotion.toLowerCase());

        try {
          const { data } = await axios.post(`${BACKEND_URL}/api/tts`, form);

          if (data.file) {
            setAudioURL(`${BACKEND_URL}/tts/${data.file}`);
            setTranscription(data.transcription || "");
            setAppState("result");
          }
        } catch (err: unknown) {
          const message =
            axios.isAxiosError(err) && err.response?.data?.error
              ? err.response.data.error
              : err instanceof Error
                ? err.message
                : "Failed to process audio";
          setError(message);
          setAppState("idle");
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setAppState("recording");
    } catch {
      setError("Microphone access denied. Please allow mic permissions.");
    }
  }, [emotion]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const resetToIdle = useCallback(() => {
    setAppState("idle");
    setAudioURL("");
    setTranscription("");
    setError("");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div
        className="w-full max-w-lg rounded-2xl border p-10"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Voice Tone</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Speech to Speech
          </p>
        </div>

        <div className="mb-8">
          <p
            className="mb-3 text-sm font-medium"
            style={{ color: "var(--muted)" }}
          >
            Emotions:
          </p>
          <div className="flex gap-3">
            {EMOTIONS.map((em) => (
              <button
                key={em}
                id={`emotion-${em.toLowerCase()}`}
                className={`emotion-chip ${emotion === em ? "selected" : ""}`}
                onClick={() => setEmotion(em)}
                disabled={appState === "processing"}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          {appState === "idle" && (
            <>
              <button
                id="record-button"
                className="record-btn"
                onClick={startRecording}
              >
                <div className="inner" />
              </button>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Tap to Record
              </p>
            </>
          )}

          {appState === "recording" && (
            <>
              <button
                id="stop-button"
                className="record-btn recording"
                onClick={stopRecording}
              >
                <div className="inner" />
              </button>
              <p className="text-sm font-medium text-red-500">Recording…</p>
            </>
          )}

          {appState === "processing" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="spinner" />
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Processing…
              </p>
            </div>
          )}

          {appState === "result" && (
            <div className="w-full space-y-4">
              {transcription && (
                <div>
                  <p
                    className="mb-1 text-xs font-medium uppercase"
                    style={{ color: "var(--muted)" }}
                  >
                    You said
                  </p>
                  <p
                    className="rounded-lg border p-3 text-sm italic"
                    style={{ borderColor: "var(--border)" }}
                  >
                    &ldquo;{transcription}&rdquo;
                  </p>
                </div>
              )}

              <div>
                <p
                  className="mb-1 text-xs font-medium uppercase"
                  style={{ color: "var(--muted)" }}
                >
                  {emotion} version
                </p>
                <audio id="audio-player" controls src={audioURL} autoPlay />
              </div>

              <button
                id="try-again-button"
                onClick={resetToIdle}
                className="w-full rounded-lg border py-2 text-sm font-medium transition-colors hover:bg-gray-50"
                style={{ borderColor: "var(--border)" }}
              >
                ↻ Try Again
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
