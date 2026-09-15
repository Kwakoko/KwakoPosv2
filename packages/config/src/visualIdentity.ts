export const KWAKOKO_VISUAL_IDENTITY = {
  version: "1.0",
  palette: {
    forest: "#0B5D4A",
    deep: "#071F1A",
    gold: "#D4A72C",
    sand: "#F3EBDD",
    cloud: "#F7FAF8",
    ink: "#10231D",
    slate: "#5B6B63",
    signalBlue: "#2F80ED",
    success: "#138A63",
    warning: "#C88719",
    danger: "#C94A4A",
  },
  typography: { primary: "Inter", technical: "JetBrains Mono" },
  principles: ["premium", "grounded", "modern", "confident", "human", "African"],
  masterBrandColor: "#0B5D4A",
  accentColor: "#D4A72C",
  mascot: "Koko",
} as const;

export type KwakokoVisualIdentity = typeof KWAKOKO_VISUAL_IDENTITY;
