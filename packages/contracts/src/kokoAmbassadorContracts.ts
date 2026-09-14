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
  "onboarding", "education", "sync-status", "inventory-intelligence", "business-insights",
  "empty-state", "feature-discovery", "release-communication", "notification", "marketing",
  "social-media", "merchandise",
]);

export const KokoProhibitedUseSchema = z.enum([
  "childish-cartoonization", "threatening-depiction", "stereotypical-african-decoration",
  "copyright-imitation", "unapproved-costume", "species-change", "inconsistent-proportions",
  "critical-transaction-interference",
]);

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

export type KokoAmbassadorDefinition = z.infer<typeof KokoAmbassadorSchema>;

export const KOKO_PRODUCT_PROFILE = {
  id: "koko",
  name: "Koko",
  species: "African Elephant",
  corePromise: "Koko never forgets your business.",
  messages: {
    onboarding: "Welcome. Koko is here to help you understand and run your business.",
    "sync-status": "Your business data is synchronized.",
    "inventory-intelligence": "Koko noticed something important about your inventory.",
    "business-insights": "Here is what changed in your business today.",
  },
} as const;