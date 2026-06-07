import { useReader } from "./ReaderContext";
import { themes } from "./themeStyles";
import { Copy, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const highlightColors = [
  { name: "Yellow", color: "#fef08a", bg: "rgba(254, 240, 138, 0.4)" },
  { name: "Green", color: "#86efac", bg: "rgba(134, 239, 172, 0.4)" },
  { name: "Blue", color: "#93c5fd", bg: "rgba(147, 197, 253, 0.4)" },
  { name: "Pink", color: "#f9a8d4", bg: "rgba(249, 168, 212, 0.4)" },
  { name: "Purple", color: "#c4b5fd", bg: "rgba(196, 181, 253, 0.4)" },
  { name: "Orange", color: "#fdba74", bg: "rgba(253, 186, 116, 0.4)" },
];

interface HighlightToolbarProps {
  selectedText: string;
  position: { x: number; y: number };
  onHighlight: (color: string) => void;
  onDismiss: () => void;
}

export function HighlightToolbar({
  selectedText,
  position,
  onHighlight,
  onDismiss,
}: HighlightToolbarProps) {
  const { theme } = useReader();
  const t = themes[theme];

  const handleCopy = () => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = selectedText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
    onDismiss();
  };

  return (
    <div
      className="fixed z-[100] flex items-center gap-1 px-2 py-2 rounded-xl shadow-2xl"
      style={{
        left: position.x,
        top: position.y - 50,
        transform: "translateX(-50%)",
        backgroundColor: t.popover,
        border: `1px solid ${t.border}`,
      }}
    >
      {highlightColors.map((c) => (
        <button
          key={c.name}
          onClick={() => onHighlight(c.color)}
          className="w-7 h-7 rounded-full transition-transform hover:scale-110 border-2"
          style={{
            backgroundColor: c.color,
            borderColor: `${c.color}cc`,
          }}
          title={c.name}
        />
      ))}
      <div
        className="w-px h-5 mx-1"
        style={{ backgroundColor: t.border }}
      />
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-lg transition-colors hover:opacity-70"
        style={{ color: t.popoverText }}
        title="Copy"
      >
        <Copy size={14} />
      </button>
    </div>
  );
}

export { highlightColors };