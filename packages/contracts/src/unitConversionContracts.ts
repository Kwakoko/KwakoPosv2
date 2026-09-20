import { z } from "zod";

export const UnitConversionTransactionSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  tenantId: z.string(),
  branchId: z.string(),
  parentVariantId: z.string(),
  childVariantId: z.string(),
  parentUnitsDeducted: z.number().positive(),
  childUnitsProduced: z.number().positive(),
  conversionRatio: z.number().positive(),
  reason: z.string().optional(),
  saleId: z.string().optional(),
  idempotencyKey: z.string().min(1),
  createdAt: z.string().optional(),
});

export type UnitConversionTransaction = z.infer<typeof UnitConversionTransactionSchema>;
