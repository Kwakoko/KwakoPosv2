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
export type CreateTraVfdFiscalizationRequest = z.infer<typeof CreateTraVfdFiscalizationRequestSchema>;
