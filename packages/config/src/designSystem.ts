export const KWAKOKO_DESIGN_SYSTEM = {
  version: "1.0.0",
  foundations: {
    primaryFont: "Inter",
    technicalFont: "JetBrains Mono",
    spacingUnitPx: 4,
    focusRingWidthPx: 2,
    minimumTouchTargetPx: 44,
  },
  semanticTokens: {
    brand: {
      primary: "var(--kwakoko-forest)",
      deep: "var(--kwakoko-deep)",
      accent: "var(--koko-gold)",
      canvas: "var(--kwakoko-cloud)",
      ink: "var(--kwakoko-ink)",
      muted: "var(--kwakoko-slate)",
    },
    feedback: {
      info: "var(--kwakoko-signal-blue)",
      success: "var(--kwakoko-success)",
      warning: "var(--kwakoko-warning)",
      danger: "var(--kwakoko-danger)",
    },
  },
  components: {
    required: [
      "Button",
      "Input",
      "Select",
      "Card",
      "Badge",
      "Modal",
      "Toast",
      "Table",
      "EmptyState",
      "LoadingState",
      "ErrorState",
    ],
    rules: {
      buttonsUseMinHeightPx: 44,
      iconButtonsRequireAccessibleLabel: true,
      destructiveActionsRequireConfirmation: true,
      loadingStatesMustBeNonBlocking: true,
      emptyStatesMustProvideNextStep: true,
    },
  },
  accessibility: {
    keyboardFocusRequired: true,
    reducedMotionRequired: true,
    formLabelsRequired: true,
    iconOnlyControlsNeedAriaLabel: true,
    statusMustNotRelyOnColorOnly: true,
  },
  responsive: {
    mobileFirst: true,
    breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280 },
  },
  governance: {
    noRawBrandHexInComponents: true,
    noInlineCriticalColors: true,
    useSemanticTokensBeforeComponentOverrides: true,
    designSystemIsSourceOfTruth: true,
  },
} as const;

export type KwakokoDesignSystem = typeof KWAKOKO_DESIGN_SYSTEM;

export function getCanonicalDesignSystem(): KwakokoDesignSystem {
  return KWAKOKO_DESIGN_SYSTEM;
}
