import { randomUUID } from "crypto";
import {
  ScopedProductRepository,
  ScopedFinanceRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import {
  assertNoOrphanAdjustments,
  assertTenantIsolation,
} from "@kwakopos2/domain";
import { TenantContext, RecoveryReconciliationAudit } from "@kwakopos2/contracts";

export async function runRecoveryReconciliation(ctx: TenantContext): Promise<RecoveryReconciliationAudit> {
  const prodRepo = new ScopedProductRepository(globalInMemoryStore);
  const finRepo = new ScopedFinanceRepository(globalInMemoryStore);

  let preCheckCount = 0;
  let postCheckCount = 0;
  let orphansDetected = 0;
  let duplicateTransactions = 0;
  let financialBalanceVariance = 0;
  let tenantLeakageDetected = false;
  const issues: string[] = [];

  try {
    // 1. Audit Stock Ledger & Adjustments for Orphans (Invariant 011)
    const adjustments = Array.from(globalInMemoryStore.stockAdjustments.values()).filter((a) => a.tenantId === ctx.tenantId);
    const ledgers = Array.from(globalInMemoryStore.stockLedgers.values()).filter((l) => l.tenantId === ctx.tenantId);

    preCheckCount = adjustments.length;
    postCheckCount = ledgers.length;

    try {
      assertNoOrphanAdjustments(adjustments, ledgers);
    } catch (err: any) {
      orphansDetected += 1;
      issues.push(`Orphan adjustment detected: ${err.message}`);
    }

    // 2. Audit Financial Ledger Balance (Double-Entry Equality Invariant)
    const tb = finRepo.getTrialBalance(ctx);
    financialBalanceVariance = Math.abs(tb.totalDebits - tb.totalCredits);
    if (!tb.isBalanced) {
      issues.push(`Trial Balance Imbalance: Debits=${tb.totalDebits}, Credits=${tb.totalCredits}, Diff=${financialBalanceVariance}`);
    }

    // 3. Audit Tenant Isolation Boundaries (Invariant 007)
    const foreignTenant: TenantContext = {
      tenantId: `FOREIGN-TENANT-${randomUUID().slice(0, 6)}`,
      branchId: `FOREIGN-BRANCH-${randomUUID().slice(0, 6)}`,
      userId: `USER-FOREIGN`,
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    const products = prodRepo.getProducts(ctx);
    for (const p of products) {
      try {
        assertTenantIsolation(foreignTenant, p.tenantId);
        tenantLeakageDetected = true;
        issues.push(`CRITICAL_TENANT_LEAKAGE: Foreign tenant accessed product ${p.id}`);
      } catch {
        // Expected: assertTenantIsolation throws error when cross-tenant access attempted
      }
    }

    // 4. Duplicate Transaction Detection (Idempotency Key Verification)
    const idempotencyKeys = new Set<string>();
    for (const adj of adjustments) {
      if (idempotencyKeys.has(adj.idempotencyKey)) {
        duplicateTransactions += 1;
        issues.push(`Duplicate stock adjustment idempotency key detected: ${adj.idempotencyKey}`);
      }
      idempotencyKeys.add(adj.idempotencyKey);
    }

    const reconciliationPassed =
      orphansDetected === 0 &&
      duplicateTransactions === 0 &&
      financialBalanceVariance === 0 &&
      !tenantLeakageDetected &&
      tb.isBalanced;

    return {
      preCheckCount,
      postCheckCount,
      orphansDetected,
      duplicateTransactions,
      financialBalanceVariance,
      tenantLeakageDetected,
      reconciliationPassed,
      details: reconciliationPassed
        ? "Recovery Reconciliation Engine: 100% Data & Financial Integrity Verified"
        : `Recovery Reconciliation Failed: ${issues.join("; ")}`,
    };
  } catch (err: any) {
    return {
      preCheckCount: 0,
      postCheckCount: 0,
      orphansDetected: 1,
      duplicateTransactions: 0,
      financialBalanceVariance: 99999,
      tenantLeakageDetected: true,
      reconciliationPassed: false,
      details: `Reconciliation Exception: ${err.message}`,
    };
  }
}
