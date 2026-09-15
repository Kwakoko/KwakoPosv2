export const KWAKOKO_BRAND_VOICE = {
  version: "1.0.0",
  voice: {
    core: ["clear", "confident", "calm", "helpful", "professional", "grounded", "human"],
    character: "An intelligent operating partner: direct enough for work, warm enough for people, and disciplined enough for business-critical decisions.",
    priorities: ["clarity", "trust", "actionability", "respect", "consistency"],
  },
  toneModes: {
    operational: {
      useFor: ["forms", "navigation", "daily workflows", "settings", "routine confirmations"],
      rules: ["Be concise.", "Lead with the action or status.", "Use familiar business terms.", "Avoid decorative language."],
    },
    guidance: {
      useFor: ["onboarding", "tips", "empty states", "help", "education"],
      rules: ["Be encouraging without hype.", "Explain why when it prevents mistakes.", "Give one clear next step."],
    },
    alert: {
      useFor: ["errors", "warnings", "sync issues", "security notices", "financial controls"],
      rules: ["State what happened.", "State impact when material.", "State the safest next action.", "Never blame the user."],
    },
    executive: {
      useFor: ["dashboards", "reports", "business insights", "management summaries"],
      rules: ["Start with the business signal.", "Separate fact from interpretation.", "Use numbers and dates precisely.", "Avoid unexplained jargon."],
    },
    marketing: {
      useFor: ["website copy", "campaigns", "sales collateral", "public product messaging"],
      rules: ["Lead with customer value.", "Prefer proof over superlatives.", "Use the canonical Kwakoko positioning.", "Never invent traction, customers, certifications, or capabilities."],
    },
    koko: {
      useFor: ["approved Koko companion contexts"],
      rules: ["Keep Koko helpful and professional.", "Use subtle warmth, not childish language.", "Koko may simplify complex guidance, never distort it.", "Koko never interrupts critical transactions or security decisions."],
    },
  },
  sentenceStandards: {
    defaultVoice: "active",
    preferred: ["plain language", "short sentences", "specific actions", "consistent terminology"],
    avoid: ["hype", "fear-based wording", "blame", "vague promises", "excessive exclamation marks", "unexplained acronyms", "mocking or childish language"],
  },
  terminology: {
    preferred: {
      businessOperatingSystem: "Business Operating System",
      masterBrand: "Kwakoko",
      platform: "Kwakoko Business Operating System",
      pos: "KwakoPos",
      sync: "sync",
      offlineFirst: "offline-first",
      branch: "branch",
      tenant: "business account",
      employee: "employee",
      customer: "customer",
      supplier: "supplier",
    },
    avoidAsCustomerFacingDefaults: ["ERP", "app", "tool", "thing", "stuff", "user error", "oops", "magic", "AI will handle everything"],
  },
  localization: {
    sourceLanguage: "en",
    supportedLanguages: ["en", "sw", "fr"],
    principles: [
      "Translate meaning, not word order.",
      "Preserve product names, feature names, numbers, dates, and placeholders exactly where required.",
      "Keep business terminology consistent across all supported languages.",
      "Do not translate branded names Kwakoko, KwakoPos, Koko, or the canonical platform name unless an approved localized form exists.",
      "Prefer natural Tanzanian Kiswahili for Swahili UI while retaining internationally recognized technical terms where they improve clarity.",
      "Use professional international French for French UI; avoid region-specific slang unless explicitly approved.",
    ],
  },
  prohibitedClaims: [
    "market leader",
    "number one",
    "best in Africa",
    "100% secure",
    "zero downtime",
    "never loses data",
    "guaranteed growth",
    "guaranteed savings",
    "fully compliant",
    "fully autonomous",
  ],
  governance: {
    noOverclaimRule: "Customer-facing language must describe verified capabilities and measurable evidence. Roadmap capabilities must be labeled as planned, not presented as available.",
    noBlameRule: "Errors describe system state and recovery actions; they must not shame, mock, or blame the operator.",
    terminologyRule: "New user-facing terminology must follow the canonical lexicon or be explicitly approved as an extension.",
    localizationRule: "English is the source of truth for meaning; Kiswahili and French translations must preserve business intent, safety, and product terminology.",
  },
} as const;

export type KwakokoBrandVoice = typeof KWAKOKO_BRAND_VOICE;

export function getCanonicalBrandVoice(): KwakokoBrandVoice {
  return KWAKOKO_BRAND_VOICE;
}
