export const KWAKOKO_VISUAL_ASSET_LIBRARY = {
  version: "1.0.0",
  status: "PRODUCTION_LOCKED",
  brand: "Kwakoko",
  platform: "Kwakoko Business Operating System",
  mascot: "Koko",
  tagline: "Run your business as one.",
  kokoPromise: "Koko never forgets your business.",
  logo: {
    primary: "/brand/kwakoko-logo.svg",
    mark: "/brand/kwakoko-mark.svg",
    monochrome: "/brand/kwakoko-mark-mono.svg",
  },
  app: {
    favicon: "/brand/favicon.svg",
    icon: "/brand/kwakoko-mark.svg",
  },
  koko: {
    profile: "/brand/koko/koko-profile.svg",
    welcome: "/brand/koko/koko-welcome.svg",
    insights: "/brand/koko/koko-insights.svg",
    sync: "/brand/koko/koko-sync.svg",
  },
  rules: {
    canonicalTokens: "packages/config/src/visualIdentity.ts",
    canonicalAmbassador: "packages/config/src/kokoAmbassador.ts",
    noLegacyProductBrand: true,
    noLocalLogoRedraw: true,
    noKokoCriticalWorkflowInterference: true,
  },
} as const;

export type KwakokoVisualAssetLibrary = typeof KWAKOKO_VISUAL_ASSET_LIBRARY;
