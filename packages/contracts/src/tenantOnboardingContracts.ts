import { z } from "zod";

export const TenantOnboardingStatusEnum = z.enum([
  "DRAFT",
  "PROFILE_COMPLETE",
  "CONFIGURED",
  "READY",
  "COMPLETED",
  "FAILED",
  "SUSPENDED",
]);
export type TenantOnboardingStatus = z.infer<typeof TenantOnboardingStatusEnum>;

export const TenantOnboardingStepEnum = z.enum([
  "BUSINESS_PROFILE",
  "LOCALIZATION",
  "INDUSTRY",
  "BRANCH",
  "OWNER",
  "REVIEW",
  "PROVISIONING",
  "COMPLETE",
]);
export type TenantOnboardingStep = z.infer<typeof TenantOnboardingStepEnum>;

export const TenantOnboardingCreateRequestSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().toLowerCase().email().max(320),
  ownerPassword: z.string().min(12).max(128),
  branchName: z.string().trim().min(2).max(120).default("Main Branch"),
  branchCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/).optional(),
  country: z.string().trim().min(2).max(80).default("TZ"),
  currency: z.string().trim().toUpperCase().length(3).default("TZS"),
  timezone: z.string().trim().min(3).max(80).default("Africa/Dar_es_Salaam"),
  locale: z.string().trim().min(2).max(20).default("en-TZ"),
  industry: z.string().trim().min(1).max(80).default("Retail"),
  modules: z.array(z.string().trim().min(1).max(80)).max(100).default(["Retail"]),
  idempotencyKey: z.string().trim().min(16).max(128),
});
export type TenantOnboardingCreateRequest = z.infer<typeof TenantOnboardingCreateRequestSchema>;

export const TenantOnboardingUpdateRequestSchema = z.object({
  status: TenantOnboardingStatusEnum.optional(),
  currentStep: TenantOnboardingStepEnum.optional(),
  businessName: z.string().trim().min(2).max(120).optional(),
  country: z.string().trim().min(2).max(80).optional(),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  timezone: z.string().trim().min(3).max(80).optional(),
  locale: z.string().trim().min(2).max(20).optional(),
  industry: z.string().trim().min(1).max(80).optional(),
  modules: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  branchName: z.string().trim().min(2).max(120).optional(),
  branchCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/).optional(),
}).strict();
export type TenantOnboardingUpdateRequest = z.infer<typeof TenantOnboardingUpdateRequestSchema>;

export const TenantOnboardingResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  status: TenantOnboardingStatusEnum,
  currentStep: TenantOnboardingStepEnum,
  industry: z.string(),
  modules: z.array(z.string()),
  country: z.string(),
  currency: z.string(),
  timezone: z.string(),
  locale: z.string(),
  ownerUserId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type TenantOnboardingResponse = z.infer<typeof TenantOnboardingResponseSchema>;
