import { z } from "zod";

export const BrandVoiceLanguageEnum = z.enum(["en", "sw", "fr"]);
export type BrandVoiceLanguage = z.infer<typeof BrandVoiceLanguageEnum>;

export const BrandVoiceToneModeEnum = z.enum([
  "operational",
  "guidance",
  "alert",
  "executive",
  "marketing",
  "koko",
]);
export type BrandVoiceToneMode = z.infer<typeof BrandVoiceToneModeEnum>;

export const BrandVoiceCopyRequestSchema = z.object({
  language: BrandVoiceLanguageEnum,
  toneMode: BrandVoiceToneModeEnum,
  text: z.string().min(1),
  context: z.string().min(1),
  containsKoko: z.boolean().default(false),
});
export type BrandVoiceCopyRequest = z.infer<typeof BrandVoiceCopyRequestSchema>;

export const BrandVoiceValidationIssueSchema = z.object({
  code: z.enum([
    "PROHIBITED_CLAIM",
    "BLAMEFUL_LANGUAGE",
    "NON_CANONICAL_TERM",
    "CRITICAL_WORKFLOW_INTERRUPTION",
    "LOCALIZATION_DRIFT",
  ]),
  message: z.string().min(1),
  replacement: z.string().optional(),
});
export type BrandVoiceValidationIssue = z.infer<typeof BrandVoiceValidationIssueSchema>;

export const BrandVoiceValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(BrandVoiceValidationIssueSchema),
});
export type BrandVoiceValidationResult = z.infer<typeof BrandVoiceValidationResultSchema>;
