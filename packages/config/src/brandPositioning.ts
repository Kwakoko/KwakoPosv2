export const KWAKOKO_BRAND_POSITIONING = {
  version: "1.0.0",
  category: "Business Operating System",
  masterBrand: "Kwakoko",
  platform: "Kwakoko Business Operating System",
  promise: "Run your business as one connected operation.",
  positioningStatement:
    "Kwakoko Business Operating System is the connected business operating platform built for African businesses that need one reliable system to run operations, people, money, inventory, customers, and industry workflows across devices and locations.",
  primaryAudience:
    "Growth-oriented African businesses moving from fragmented tools, paper, spreadsheets, or disconnected applications to one operating platform.",
  primaryProblem:
    "Business information and workflows become fragmented across sales, stock, finance, people, customers, branches, and specialist processes.",
  strategicDifferentiators: [
    "Connected operations across core business workflows",
    "Offline-first operation for imperfect connectivity conditions",
    "Multi-branch and multi-tenant operating architecture",
    "Industry-specific modules on one shared platform",
    "Progressive scalability from a single business to complex organizations",
    "African-market context without limiting global scalability",
  ],
  categoryLanguage: {
    use: [
      "Business Operating System",
      "connected business operations",
      "one operating platform",
      "industry modules",
      "offline-first",
      "business infrastructure",
    ],
    avoidAsPrimaryPositioning: [
      "just a POS",
      "cashier app",
      "simple stock app",
      "accounting-only software",
      "generic ERP replacement",
    ],
  },
  proofPillars: [
    "Operate",
    "Connect",
    "Control",
    "Understand",
    "Scale",
  ],
  audienceMessages: {
    owner: "See and control the business as one operation.",
    manager: "Coordinate people, branches, stock, money, and workflows from one system.",
    employee: "Do the work in one consistent operating environment.",
    enterprise: "Standardize operations while adding industry-specific capabilities as you grow.",
    partner: "Build on a governed platform with reusable business capabilities.",
  },
  taglines: {
    master: "Run your business as one.",
    platform: "One platform. Every part of your business.",
    growth: "Start where you are. Scale without rebuilding.",
    resilience: "Your business keeps moving, even when connectivity does not.",
  },
  governance: {
    canonicalDescription:
      "Kwakoko is the master brand. Kwakoko Business Operating System is the flagship business operating platform. KwakoPos is a POS capability within that platform.",
    noOverclaimRule:
      "Positioning language must describe capabilities that are implemented or explicitly marked as roadmap capabilities; do not imply market leadership, customer counts, compliance status, or product functionality without evidence.",
  },
} as const;

export type KwakokoBrandPositioning = typeof KWAKOKO_BRAND_POSITIONING;

export function getCanonicalPositioning(): KwakokoBrandPositioning {
  return KWAKOKO_BRAND_POSITIONING;
}
