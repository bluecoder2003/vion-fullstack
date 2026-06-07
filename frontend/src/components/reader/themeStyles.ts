import type { ThemeType } from "./ReaderContext";

export interface ThemeStyle {
  bg: string;
  text: string;
  sidebar: string;
  sidebarText: string;
  toolbar: string;
  toolbarText: string;
  accent: string;
  border: string;
  popover: string;
  popoverText: string;
  selectionBg: string;
  label: string;
  fontFamily: string;
  pageNumColor: string;
}

export const themes: Record<ThemeType, ThemeStyle> = {
  original: {
    bg: "#ffffff",
    text: "#1a1a1a",
    sidebar: "#f5f5f5",
    sidebarText: "#1a1a1a",
    toolbar: "#f8f8f8",
    toolbarText: "#1a1a1a",
    accent: "#0066cc",
    border: "#e0e0e0",
    popover: "#ffffff",
    popoverText: "#1a1a1a",
    selectionBg: "rgba(0, 102, 204, 0.15)",
    label: "Original",
    fontFamily: "Georgia, 'Times New Roman', serif",
    pageNumColor: "#999",
  },
  quiet: {
    bg: "#2a2a2a",
    text: "#d4d4d4",
    sidebar: "#1e1e1e",
    sidebarText: "#c0c0c0",
    toolbar: "#333333",
    toolbarText: "#d4d4d4",
    accent: "#6b9fff",
    border: "#444444",
    popover: "#3a3a3a",
    popoverText: "#d4d4d4",
    selectionBg: "rgba(107, 159, 255, 0.2)",
    label: "Quiet",
    fontFamily: "Georgia, 'Times New Roman', serif",
    pageNumColor: "#666",
  },
  paper: {
    bg: "#e8e0d4",
    text: "#3d3832",
    sidebar: "#d8d0c4",
    sidebarText: "#3d3832",
    toolbar: "#ddd5c9",
    toolbarText: "#3d3832",
    accent: "#8b6914",
    border: "#c5bdb1",
    popover: "#e0d8cc",
    popoverText: "#3d3832",
    selectionBg: "rgba(139, 105, 20, 0.15)",
    label: "Paper",
    fontFamily: "Georgia, 'Times New Roman', serif",
    pageNumColor: "#999080",
  },
  bold: {
    bg: "#ffffff",
    text: "#000000",
    sidebar: "#f0f0f0",
    sidebarText: "#000000",
    toolbar: "#f5f5f5",
    toolbarText: "#000000",
    accent: "#000000",
    border: "#d0d0d0",
    popover: "#ffffff",
    popoverText: "#000000",
    selectionBg: "rgba(0, 0, 0, 0.1)",
    label: "Bold",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    pageNumColor: "#aaa",
  },
  calm: {
    bg: "#d4c9a8",
    text: "#4a4535",
    sidebar: "#c4b998",
    sidebarText: "#4a4535",
    toolbar: "#c9be9d",
    toolbarText: "#4a4535",
    accent: "#7a6b3a",
    border: "#b5aa89",
    popover: "#d0c5a4",
    popoverText: "#4a4535",
    selectionBg: "rgba(122, 107, 58, 0.15)",
    label: "Calm",
    fontFamily: "Georgia, 'Times New Roman', serif",
    pageNumColor: "#8a8070",
  },
  focus: {
    bg: "#f5f0e0",
    text: "#2d2a1e",
    sidebar: "#ebe6d6",
    sidebarText: "#2d2a1e",
    toolbar: "#ede8d8",
    toolbarText: "#2d2a1e",
    accent: "#5a5030",
    border: "#d5d0c0",
    popover: "#f0ebd8",
    popoverText: "#2d2a1e",
    selectionBg: "rgba(90, 80, 48, 0.12)",
    label: "Focus",
    fontFamily: "'Charter', Georgia, serif",
    pageNumColor: "#a09880",
  },
};
