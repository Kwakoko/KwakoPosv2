import { z } from "zod";

export const KokoPersonalitySchema = z.object({
  intelligence: z.literal("high"),
  demeanor: z.enum(["calm", "confident", "helpful"]),
  trustworthiness: z.literal("high"),
  africanIdentity: z.literal("authentic"),
  professionalism: z.literal("professional-first"),
  humor: z.literal("subtle"),
});

export const KokoUsageContextSchema = z.enum([
  "onboarding",
  "education",
  "sync-status",
  "inventory-intelligence",
  "business-insights",
  "empty-state",
  "feature-discovery",
  "release-communication",
  "notification",
  "marketing",
  "social-media",
  "merchandise",
]);

export const KokoProhibitedUseSchema = z.enum([
  "childish-cartoonization",
  "threatening-depiction",
  "stereotypical-african-decoration",
  "copyright-imitation",
  "unapproved-costume",
  "species-change",
  "inconsistent-proportions",
  "critical-transaction-interference",
]);

export const KOKO_AMBASSADOR = {
  id: "koko",
  name: "Koko",
  species: "African Elephant",
  role: "Official Kwakoko Brand Ambassador & Business Companion",
  mission: "Represent intelligence, memory, strength, reliability, community, African authenticity, and business growth.",
  personality: {
    intelligence: "high",
    demeanor: "calm",
    trustworthiness: "high",
    africanIdentity: "authentic",
    professionalism: "professional-first",
    humor: "subtle",
  },
  corePromise: "Koko never forgets your business.",
  visualPrinciples: [
    "Recognizable from silhouette alone",
    "Professional SaaS character, not a children's mascot",
    "Consistent head, ears, trunk, eyes, proportions, posture, and expression language",
    "Distinctive enough to be recognizable without relying on a single color",
    "Authentically African without stereotypes",
  ],
  approvedContexts: KokoUsageContextSchema.options,
  prohibitedUses: KokoProhibitedUseSchema.options,
  status: "canonical-v1",
} as const;

export const KokoAmbassadorSchema = z.object({
  id: z.literal("koko"),
  name: z.literal("Koko"),
  species: z.literal("African Elephant"),
  role: z.string(),
  mission: z.string(),
  personality: KokoPersonalitySchema,
  corePromise: z.string(),
  visualPrinciples: z.array(z.string()).min(1),
  approvedContexts: z.array(KokoUsageContextSchema),
  prohibitedUses: z.array(KokoProhibitedUseSchema),
  status: z.literal("canonical-v1"),
});

export type KokoAmbassador = z.infer<typeof KokoAmbassadorSchema>;

export function validateKokoAmbassador(): KokoAmbassador {
  return KokoAmbassadorSchema.parse(KOKO_AMBASSADOR);
}

export function getKokoProductMessage(context: "sync-status" | "inventory-intelligence" | "business-insights" | "onboarding"): string {
  const messages = {
    "sync-status": "Your business data is synchronized.",
    "inventory-intelligence": "Koko noticed something important about your inventory.",
    "business-insights": "Here is what changed in your business today.",
    onboarding: "Welcome. Koko is here to help you understand and run your business.",
  } as const;
  return messages[context];
}
