import { z } from "zod";

export const TraVfdFiscalStateEnum = z.enum([
  "LOCAL_FISCAL_PENDING",
  "SUBMITTING",
  "TRA_ACCEPTED",
  "TRA_REJECTED",
  "TRA_RETRY",
  "TRA_VERIFIED",
]);
export type TraVfdFiscalState = z.infer<typeof TraVfdFiscalStateEnum>;

export const TraVfdOutboxStatusEnum = z.enum([
  "PENDING",
  "SUBMITTING",
  "SENT",
  "FAILED",
]);
export type TraVfdOutboxStatus = z.infer<typeof TraVfdOutboxStatusEnum>;

export const TraVfdConfigSchema = z.object({
  enabled: z.boolean(),
  endpoint: z.string().url().or(z.literal("")),
  environment: z.enum(["TEST", "PRODUCTION"]).optional(),
  tin: z.string().min(1).optional(),
  certSerial: z.string().min(1).optional(),
  registrationId: z.string().min(1).optional(),
  efdSerial: z.string().min(1).optional(),
  receiptCode: z.string().min(1).optional(),
  routingKey: z.string().min(1).optional(),
});
export type TraVfdConfig = z.infer<typeof TraVfdConfigSchema>;

export const TraVfdFiscalizationDTOSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  branchId: z.string(),
  receiptId: z.string().nullable(),
  transactionId: z.string(),
  deviceId: z.string(),
  state: TraVfdFiscalStateEnum,
  requestPayload: z.record(z.string(), z.unknown()),
  responsePayload: z.record(z.string(), z.unknown()).nullable().optional(),
  fiscalReceiptNumber: z.string().nullable().optional(),
  fiscalCode: z.string().nullable().optional(),
  verificationCode: z.string().nullable().optional(),
  lastError: z.string().nullable().optional(),
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: z.string().nullable().optional(),
  reconciliationStatus: z.enum(["PENDING", "MATCHED", "MISMATCH", "UNAVAILABLE"]).default("PENDING"),
  reconciledAt: z.string().nullable().optional(),
  reconciliationError: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TraVfdFiscalizationDTO = z.infer<typeof TraVfdFiscalizationDTOSchema>;

export const CreateTraVfdFiscalizationRequestSchema = z.object({
  receiptId: z.string().nullable().optional(),
  transactionId: z.string().min(1),
  deviceId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export const TraVfdProviderEnvironmentEnum = z.enum(["TEST", "PRODUCTION"]);
export type TraVfdProviderEnvironment = z.infer<typeof TraVfdProviderEnvironmentEnum>;

export interface TraVfdIntegrationStatus {
  configured: boolean;
  environment: TraVfdProviderEnvironment;
  stateCounts: Record<TraVfdFiscalState, number>;
  reconciliationCounts: Record<"PENDING" | "MATCHED" | "MISMATCH" | "UNAVAILABLE", number>;
  pendingOutboxCount: number;
  lastVerifiedAt: string | null;
  status: "DISABLED" | "NOT_CONFIGURED" | "PENDING" | "SUBMITTING" | "ACCEPTED" | "REJECTED" | "RETRY" | "VERIFIED" | "RECONCILIATION_REQUIRED";
}

export type CreateTraVfdFiscalizationRequest = z.infer<typeof CreateTraVfdFiscalizationRequestSchema>;
