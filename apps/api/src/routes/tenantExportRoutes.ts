import { createHash } from "crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "@kwakopos2/database";

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

function requireTenantAdmin(ctx: TenantContext): void {
  const roles = Array.isArray(ctx.roles) ? ctx.roles.map((r) => String(r).toUpperCase()) : [];
  const permissions = Array.isArray(ctx.permissions) ? ctx.permissions.map((p) => String(p).toLowerCase()) : [];
  const allowed =
    roles.some((r) => ["ADMIN", "OWNER", "SUPER_ADMIN", "SUPERADMIN"].includes(r)) ||
    permissions.includes("*") ||
    permissions.includes("admin:*");
  if (!allowed) throw new Error("FORBIDDEN: Only tenant administrators or owners can export tenant data.");
}

export function tenantExportRoutes(server: FastifyInstance): void {
  server.get("/api/v1/tenants/export", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = req.tenantContext as TenantContext | undefined;
    if (!ctx?.tenantId || !ctx.branchId || !ctx.userId) {
      return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }

    try {
      requireTenantAdmin(ctx);
      const tenantId = ctx.tenantId;
      const now = new Date().toISOString();

      const [products, customers, suppliers, sales, stockLedger, accounts, journals] = await Promise.all([
        prisma.product.findMany({ where: { tenantId }, include: { variants: true }, orderBy: { createdAt: "asc" } }),
        prisma.customer.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
        prisma.supplier.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
        prisma.sale.findMany({ where: { tenantId }, include: { lines: true, payments: true }, orderBy: { soldAt: "asc" } }),
        prisma.stockLedger.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
        prisma.account.findMany({ where: { tenantId }, orderBy: { accountCode: "asc" } }),
        prisma.journalEntry.findMany({ where: { tenantId }, include: { lines: true }, orderBy: { entryDate: "asc" } }),
      ]);

      const payload = { products, customers, suppliers, sales, stockLedger, accounts, journals };
      const integrityChecksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

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
        integrityChecksum,
      };

      reply.header("Content-Disposition", `attachment; filename="kwakopos-export-${tenantId}-${Date.now()}.json"`);
      return reply.status(200).send({ success: true, data: bundle });
    } catch (error: any) {
      req.log.error({ err: error }, "Authoritative tenant export failed");
      if (String(error?.message || "").startsWith("FORBIDDEN:")) {
        return reply.status(403).send({
          success: false,
          error: { code: "FORBIDDEN", message: String(error.message) },
        });
      }
      return reply.status(500).send({
        success: false,
        error: { code: "TENANT_EXPORT_FAILED", message: "Authoritative PostgreSQL tenant export failed." },
      });
    }
  });
}
