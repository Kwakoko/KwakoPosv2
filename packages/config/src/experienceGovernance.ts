export const KWAKOKO_EXPERIENCE_GOVERNANCE = {
  version: "1.0.0",
  authority: "Kwakoko Experience Integrity Registry",
  governedLayers: [
    "brand",
    "voice",
    "visual",
    "ui",
    "interaction",
    "function",
    "localization",
    "ai-agent",
  ],
  requiredAuthorities: {
    brandHierarchy: "packages/config/src/brandHierarchy.ts",
    positioning: "packages/config/src/brandPositioning.ts",
    visualIdentity: "packages/config/src/visualIdentity.ts",
    voice: "packages/config/src/brandVoice.ts",
    koko: "packages/config/src/kokoAmbassador.ts",
  },
  aiRules: [
    "Do not introduce customer-facing brand language outside the canonical voice and positioning rules.",
    "Do not create a UI action without a governed interaction path or an explicitly documented non-action control.",
    "Do not add a new business capability without a discoverable UI path, API/domain path, or explicit internal-only classification.",
    "Do not bypass canonical visual tokens or create uncontrolled Koko variants.",
    "Do not present roadmap capability as available capability.",
  ],
  uiFunctionIntegrity: {
    interactiveElementsMustBeClassified: true,
    allowedNonActionButtonReasons: ["tab", "menu-trigger", "dialog-trigger", "disclosure", "form-submit", "disabled-state"],
    reportOnlyHeuristics: [
      "button_without_action_or_explicit_non_action_reason",
      "anchor_without_navigation_target",
      "navigation_label_without_route_reference",
      "named_handler_without_reachable_invocation",
    ],
    failClosedForExplicitViolations: true,
  },
  releaseCertificate: {
    id: "KWAKOKO-EXPERIENCE-CERTIFICATE-v1.0",
    requiredGates: [
      "brand-integrity",
      "experience-governance",
      "voice-governance",
      "visual-governance",
      "typecheck",
      "unit-tests",
    ],
  },
} as const;

export type KwakokoExperienceGovernance = typeof KWAKOKO_EXPERIENCE_GOVERNANCE;

export function getExperienceGovernance(): KwakokoExperienceGovernance {
  return KWAKOKO_EXPERIENCE_GOVERNANCE;
}
