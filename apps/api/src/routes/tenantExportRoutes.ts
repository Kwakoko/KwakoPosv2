import { createHash } from "crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TenantContext } from "@kwakopos2/contracts";
import {
  globalCommercialRepository,
  globalFinanceRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";

export interface TenantDataExportBundle {
  exportVersion: "1.0.0";
  tenantId: string;
  exportedAt: string;
  actorUserId: string;
  metadata: {
    productCount: number;
    customerCount: number;
    supplierCount: number;
    salesCount: number;
    journalEntriesCount: number;
    stockLedgerCount: number;
  };
  data: {
    products: any[];
    customers: any[];
    suppliers: any[];
    sales: any[];
    stockLedger: any[];
    accounts: any[];
    journals: any[];
  };
  integrityChecksum: string;
}

export function tenantExportRoutes(server: FastifyInstance): void {
  // GET /api/v1/tenants/export
  // H-026: GDPR & Enterprise Data Portability Export
  server.get("/api/v1/tenants/export", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = req.tenantContext as TenantContext | undefined;
    if (!ctx) {
      return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }

    const roles = Array.isArray(ctx.roles) ? ctx.roles.map((r) => String(r).toUpperCase()) : [];
    const isAuthorized = roles.some((r) => ["ADMIN", "OWNER", "SUPER_ADMIN", "SUPERADMIN"].includes(r));
    if (!isAuthorized) {
      return reply.status(403).send({ success: false, error: { code: "FORBIDDEN", message: "Only tenant administrators or owners can export tenant data." } });
    }

    const tenantId = ctx.tenantId;
    const now = new Date().toISOString();

    // 1. Products & Variants
    const products = Array.from(globalInMemoryStore.products.values()).filter((p) => p.tenantId === tenantId);
    // 2. Customers
    const customers = Array.from(globalCommercialRepository.customers.values()).filter((c) => c.tenantId === tenantId);
    // 3. Suppliers
    const suppliers = Array.from(globalCommercialRepository.suppliers.values()).filter((s) => s.tenantId === tenantId);
    // 4. Sales
    const sales = Array.from(globalCommercialRepository.sales.values()).filter((s) => s.tenantId === tenantId);
    // 5. Stock Ledger
    const stockLedger = Array.from(globalInMemoryStore.stockLedgers?.values() || []).filter((l) => l.tenantId === tenantId);
    // 6. Finance Accounts & Journals
    const accounts = Array.from(globalFinanceRepository.accounts.values()).filter((a) => a.tenantId === tenantId);
    const journals = Array.from(globalFinanceRepository.journalEntries.values()).filter((j) => j.tenantId === tenantId);

    const payload = {
      products,
      customers,
      suppliers,
      sales,
      stockLedger,
      accounts,
      journals,
    };

    const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

    const bundle: TenantDataExportBundle = {
      exportVersion: "1.0.0",
      tenantId,
      exportedAt: now,
      actorUserId: ctx.userId,
      metadata: {
        productCount: products.length,
        customerCount: customers.length,
        supplierCount: suppliers.length,
        salesCount: sales.length,
        journalEntriesCount: journals.length,
        stockLedgerCount: stockLedger.length,
      },
      data: payload,
      integrityChecksum: checksum,
    };

    reply.header("Content-Disposition", `attachment; filename="kwakopos-export-${tenantId}-${Date.now()}.json"`);
    return reply.status(200).send({ success: true, data: bundle });
  });
}
