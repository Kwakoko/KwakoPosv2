import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const pos = readFileSync(resolve(root, "apps/web/src/pages/PosPage.tsx"), "utf8");
const atomic = readFileSync(resolve(root, "packages/database/src/atomicCommercialFinance.ts"), "utf8");
const legacy = readFileSync(resolve(root, "packages/database/src/commercialRepositories.ts"), "utf8");

describe("POS production closure gates", () => {
  it("does not fabricate payment completion or sale identity", () => {
    expect(pos).not.toContain("Math.max(cashReceived, cartGrandTotal)");
    expect(pos).not.toContain("SALE-2026-");
    expect(pos).toContain("const saleId = safeUUID()");
    expect(pos).toContain("if (paymentMethod === \"Cash\" && cashReceived < cartGrandTotal)");
  });

  it("requires an authoritative open cash session", () => {
    expect(pos).toContain("/api/v1/cash-sessions/active");
    expect(pos).toContain('activeCashSession?.status !== "OPEN"');
    expect(pos).toContain('body: JSON.stringify({ openingCash: amount');
    expect(pos).toContain('"/api/v1/cash-sessions"');
  });

  it("does not allow synthetic inventory variants", () => {
    expect(pos).not.toContain("i.product.id}-default");
    expect(atomic).not.toContain("OFFLINE_POS_FALLBACK");
    expect(legacy).not.toContain("OFFLINE_POS_FALLBACK");
    expect(atomic).toContain("FINANCE_VARIANT_BOUNDARY_VIOLATION");
    expect(atomic).toContain("INSUFFICIENT_STOCK");
    expect(atomic).toContain("CREDIT_CUSTOMER_BOUNDARY_VIOLATION");
    expect(legacy).toContain("POS_VARIANT_NOT_FOUND");
  });

  it("uses collision-safe transaction numbers", () => {
    expect(atomic).not.toContain('tx.sale.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })');
    expect(atomic).not.toContain('tx.payment.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })');
    expect(atomic).toContain("crypto.randomUUID().slice(0, 8).toUpperCase()");
  });

  it("persists active POS cart state in IndexedDB", () => {
    expect(pos).toContain('"pos_active_cart"');
    expect(pos).toContain("db.saveConfigurationLocal");
    expect(pos).toContain("db.getConfigurationLocal");
  });
});
