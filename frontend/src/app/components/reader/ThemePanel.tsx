import { useReader, type ThemeType } from "./ReaderContext";
import { themes } from "./themeStyles";
import { Minus, Plus, Sun } from "lucide-react";

const themeOptions: {
  key: ThemeType;
  previewBg: string;
  previewText: string;
  label: string;
}[] = [
  { key: "original", previewBg: "#ffffff", previewText: "#000000", label: "Original" },
  { key: "quiet", previewBg: "#4a4a4a", previewText: "#c0c0c0", label: "Quiet" },
  { key: "paper", previewBg: "#d0c8b8", previewText: "#5a5550", label: "Paper" },
  { key: "bold", previewBg: "#ffffff", previewText: "#000000", label: "Bold" },
  { key: "calm", previewBg: "#c4b998", previewText: "#6a6040", label: "Calm" },
  { key: "focus", previewBg: "#f0ebd0", previewText: "#3a3520", label: "Focus" },
];

export function ThemePanel() {
  const { theme, setTheme, fontSize, setFontSize, themeOpen } = useReader();
  const t = themes[theme];

  if (!themeOpen) return null;

  return (
    <div
      className="absolute right-16 top-14 z-50 rounded-2xl shadow-2xl overflow-hidden"
      style={{
        backgroundColor: t.popover,
        border: `1px solid ${t.border}`,
        width: 360,
      }}
    >
      {/* Arrow */}
      <div
        className="absolute -top-2 right-20 w-4 h-4 rotate-45"
        style={{
          backgroundColor: t.popover,
          borderTop: `1px solid ${t.border}`,
          borderLeft: `1px solid ${t.border}`,
        }}
      />

      <div className="px-6 py-4" style={{ color: t.popoverText }}>
        <div className="text-center mb-4" style={{ opacity: 0.7 }}>
          Themes & Settings
        </div>

        <div
          className="h-px mb-4"
          style={{ backgroundColor: t.border }}
        />

        {/* Font size controls */}
        <div
          className="flex items-center rounded-xl overflow-hidden mb-5"
          style={{ border: `1px solid ${t.border}` }}
        >
          <button
            onClick={() => setFontSize(Math.max(12, fontSize - 1))}
            className="flex-1 flex items-center justify-center py-3 transition-colors hover:opacity-70"
            style={{
              borderRight: `1px solid ${t.border}`,
              color: t.popoverText,
            }}
          >
            <span style={{ fontSize: 14 }}>A</span>
          </button>
          <button
            onClick={() => setFontSize(Math.min(32, fontSize + 1))}
            className="flex-1 flex items-center justify-center py-3 transition-colors hover:opacity-70"
            style={{
              borderRight: `1px solid ${t.border}`,
              color: t.popoverText,
            }}
          >
            <span style={{ fontSize: 22 }}>A</span>
          </button>
          <button
            className="flex-1 flex items-center justify-center py-3 transition-colors hover:opacity-70"
            style={{
              color: t.popoverText,
              backgroundColor: theme === "quiet" ? `${t.accent}30` : "transparent",
            }}
          >
            <Sun size={18} />
          </button>
        </div>

        {/* Theme grid */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {themeOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setTheme(opt.key)}
              className="flex flex-col items-center justify-center rounded-xl py-4 px-2 transition-all"
              style={{
                backgroundColor: opt.previewBg,
                border:
                  theme === opt.key
                    ? `2px solid ${t.accent}`
                    : `1px solid ${t.border}`,
                boxShadow:
                  theme === opt.key ? `0 0 0 1px ${t.accent}` : "none",
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  color: opt.previewText,
                  fontFamily:
                    opt.key === "bold"
                      ? "'Helvetica Neue', sans-serif"
                      : "Georgia, serif",
                  fontWeight: opt.key === "bold" ? 700 : 400,
                }}
              >
                Aa
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: opt.previewText,
                  marginTop: 4,
                  opacity: 0.8,
                }}
              >
                {opt.label}
              </span>
            </button>
          ))}
        </div>

        {/* Font size indicator */}
        <div
          className="text-center mb-3"
          style={{ fontSize: 12, opacity: 0.6 }}
        >
          Font Size: {fontSize}px
        </div>

        {/* Customise button */}
        <button
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-colors hover:opacity-80"
          style={{
            backgroundColor: `${t.border}80`,
            color: t.popoverText,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Customise
        </button>
      </div>
    </div>
  );
}