import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "@kwakopos2/database";

function requireSuperAdmin(req: any): string {
  const ctx = req.tenantContext;
  const roles = Array.isArray(ctx?.roles) ? ctx.roles.map((r: unknown) => String(r).toUpperCase()) : [];
  const permissions = Array.isArray(ctx?.permissions) ? ctx.permissions.map((p: unknown) => String(p).toLowerCase()) : [];
  if (!roles.includes("SUPER_ADMIN") && !roles.includes("SUPERADMIN") && !permissions.includes("admin:database")) {
    throw new Error("FORBIDDEN: Super Admin database credentials required");
  }
  return String(ctx?.userId || "super-admin");
}

const TABLE_MAP: Record<string, string> = {
  tenants: "tenants",
  branches: "branches",
  users: "users",
  roles: "roles",
  products: "products",
  product_variants: "product_variants",
  customers: "customers",
  suppliers: "suppliers",
  sales: "sales",
  sale_lines: "sale_lines",
  stock_ledger: "stock_ledgers",
  stock_adjustments: "stock_adjustments",
  accounts: "accounts",
  journal_entries: "journal_entries",
  receipts: "receipts",
  sync_operations: "sync_operations",
  audit_events: "audit_events",
};

function quoteIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error("TABLE_NOT_ALLOWED");
  return `"${name.replace(/"/g, '""')}"`;
}

function jsonSafe<T>(value: T): T {
  if (typeof value === "bigint") return Number(value) as T;
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item)) as T;
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) output[key] = jsonSafe(item);
    return output as T;
  }
  return value;
}

export function superAdminDatabaseRoutes(server: FastifyInstance): void {
  server.get("/api/v1/super-admin/db/tables", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      requireSuperAdmin(req);
      const tables = await prisma.$queryRaw<Array<any>>`
        SELECT c.table_name AS "name",
               COALESCE(s.n_live_tup, 0)::bigint AS "estimatedRows",
               pg_total_relation_size(format('%I.%I', c.table_schema, c.table_name))::bigint AS "totalBytes"
        FROM information_schema.tables c
        LEFT JOIN pg_stat_user_tables s
          ON s.schemaname = c.table_schema AND s.relname = c.table_name
        WHERE c.table_schema = 'public' AND c.table_type = 'BASE TABLE'
        ORDER BY c.table_name
      `;
      return reply.send({ success: true, source: "postgresql", tables: jsonSafe(tables) });
    } catch (error: any) {
      req.log.error({ err: error }, "PostgreSQL table inspection failed");
      return reply.status(500).send({ success: false, error: { code: "DATABASE_TABLE_INSPECTION_FAILED", message: "PostgreSQL table inspection failed." } });
    }
  });

  server.get("/api/v1/super-admin/db/table-data", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      requireSuperAdmin(req);
      const query = (req.query || {}) as any;
      const requested = String(query.table || "products").toLowerCase();
      const table = TABLE_MAP[requested];
      if (!table) return reply.status(400).send({ success: false, error: { code: "TABLE_NOT_ALLOWED", message: "Requested table is not available through the database console." } });

      const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit || "50"), 10) || 50));
      const offset = Math.max(0, Number.parseInt(String(query.offset || "0"), 10) || 0);
      const identifier = Prisma.raw(table);
      const rows = await prisma.$queryRaw<any[]>(
        Prisma.sql`SELECT * FROM ${identifier} ORDER BY 1 OFFSET ${offset} LIMIT ${limit}`,
      );
      const countRows = await prisma.$queryRaw<any[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${identifier}`,
      );
      return reply.send({
        success: true,
        source: "postgresql",
        table: requested,
        totalCount: Number(countRows[0]?.count || 0),
        limit,
        offset,
        rows: jsonSafe(rows),
        fields: rows.length > 0 ? Object.keys(rows[0]) : [],
      });
    } catch (error: any) {
      req.log.error({ err: error }, "PostgreSQL table data query failed");
      return reply.status(500).send({ success: false, error: { code: "DATABASE_TABLE_DATA_FAILED", message: "PostgreSQL table data query failed." } });
    }
  });

  server.post("/api/v1/super-admin/db/maintenance", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      requireSuperAdmin(req);
      const action = String(((req.body || {}) as any).action || "AUDIT_INTEGRITY").toUpperCase();
      const started = performance.now();

      if (action === "AUDIT_INTEGRITY") {
        const [orphanVariants, orphanLedgerTenants, duplicateEmails] = await Promise.all([
          prisma.$queryRaw<Array<any>>`SELECT COUNT(*)::int AS count FROM "product_variants" v LEFT JOIN "products" p ON p."id"=v."productId" WHERE p."id" IS NULL`,
          prisma.$queryRaw<Array<any>>`SELECT COUNT(*)::int AS count FROM "stock_ledgers" l LEFT JOIN "tenants" t ON t."id"=l."tenantId" WHERE t."id" IS NULL`,
          prisma.$queryRaw<Array<any>>`SELECT COUNT(*)::int AS count FROM (SELECT "tenantId","email",COUNT(*) c FROM "users" GROUP BY "tenantId","email" HAVING COUNT(*)>1) q`,
        ]);
        const counts = {
          orphanVariants: Number(orphanVariants[0]?.count || 0),
          orphanLedgerTenants: Number(orphanLedgerTenants[0]?.count || 0),
          duplicateUserEmails: Number(duplicateEmails[0]?.count || 0),
        };
        return reply.send({ success: true, source: "postgresql", report: { action, status: Object.values(counts).every((v) => v === 0) ? "HEALTHY" : "ATTENTION_REQUIRED", durationMs: Math.round(performance.now() - started), ...counts } });
      }

      if (action === "PURGE_ORPHANS") {
        return reply.status(403).send({ success: false, error: { code: "PURGE_REQUIRES_EXPLICIT_MIGRATION", message: "Destructive orphan purge is not enabled through the production database console." } });
      }

      return reply.status(400).send({ success: false, error: { code: "MAINTENANCE_ACTION_UNSUPPORTED", message: "Unsupported maintenance action." } });
    } catch (error: any) {
      req.log.error({ err: error }, "PostgreSQL maintenance failed");
      return reply.status(500).send({ success: false, error: { code: "DATABASE_MAINTENANCE_FAILED", message: "PostgreSQL maintenance operation failed." } });
    }
  });

  server.get("/api/v1/super-admin/system/metrics", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      requireSuperAdmin(req);
      const [dbStats, counts] = await Promise.all([
        prisma.$queryRaw<Array<any>>`
          SELECT current_database() AS "database",
                 pg_database_size(current_database())::bigint AS "sizeBytes",
                 (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database())::int AS "activeBackends"
        `,
        prisma.$queryRaw<Array<any>>`
          SELECT
            (SELECT COUNT(*) FROM "tenants")::int AS "tenants",
            (SELECT COUNT(*) FROM "users")::int AS "users",
            (SELECT COUNT(*) FROM "products")::int AS "products",
            (SELECT COUNT(*) FROM "sales")::int AS "sales"
        `,
      ]);
      const mem = process.memoryUsage();
      return reply.send({
        success: true,
        source: "postgresql",
        timestamp: Date.now(),
        process: {
          uptimeSeconds: Math.floor(process.uptime()),
          pid: process.pid,
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memory: { rssBytes: mem.rss, heapTotalBytes: mem.heapTotal, heapUsedBytes: mem.heapUsed, externalBytes: mem.external },
        },
        database: dbStats[0] || {},
        counts: counts[0] || {},
      });
    } catch (error: any) {
      req.log.error({ err: error }, "PostgreSQL metrics query failed");
      return reply.status(500).send({ success: false, error: { code: "DATABASE_METRICS_FAILED", message: "PostgreSQL metrics query failed." } });
    }
  });

  server.get("/api/v1/super-admin/system/logs", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      requireSuperAdmin(req);
      return reply.send({ success: true, logs: [], source: "application_log_stream" });
    } catch (error: any) {
      return reply.status(403).send({ success: false, error: { code: "SYSTEM_LOGS_FORBIDDEN", message: "System logs unavailable." } });
    }
  });
}