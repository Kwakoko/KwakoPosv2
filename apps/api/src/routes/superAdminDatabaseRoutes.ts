import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { loadConfig, getReleaseIdentity } from "@kwakopos2/config";
import { requireStepUpToken } from "../services/stepUpGuard.js";
import { Prisma } from "@prisma/client";
import { prisma } from "@kwakopos2/database";

function requireSuperAdmin(req: any): string {
  const ctx = req.tenantContext;
  const roles = Array.isArray(ctx?.roles) ? ctx.roles.map((r: unknown) => String(r).toUpperCase()) : [];
  if (!roles.includes("SUPER_ADMIN") && !roles.includes("SUPERADMIN") && !roles.includes("PLATFORM_SUPER_ADMIN")) {
    throw new Error("FORBIDDEN: Platform Super Admin role required");
  }
  return String(ctx?.userId || "");
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
      const platformLogs = await prisma.$queryRaw<any[]>\`SELECT id, tenant_id AS "tenantId", actor_id AS "actorId", action, entity_type AS "entityType", entity_id AS "entityId", metadata, created_at AS "createdAt" FROM platform_audit_events ORDER BY created_at DESC LIMIT 200\`;\
      return reply.send({ success: true, logs: jsonSafe(platformLogs), source: "postgresql" });
    } catch (error: any) {
      return reply.status(403).send({ success: false, error: { code: "SYSTEM_LOGS_FORBIDDEN", message: "System logs unavailable." } });
    }
  });

  // Independent Super Admin Production Control Plane.
  server.get("/api/v1/super-admin/tenants", async (req, reply) => {
    try {
      requireSuperAdmin(req);
      const query = (req.query || {}) as any;
      const search = String(query.search || "").trim();
      const limit = Math.min(200, Math.max(1, Number.parseInt(String(query.limit || "100"), 10) || 100));
      const where = search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }] }
        : {};
      const tenants = await prisma.tenant.findMany({
        where, orderBy: { createdAt: "desc" }, take: limit,
        include: { branches: true, _count: { select: { users: true, products: true, sales: true } } },
      });
      return reply.send({ success:true, source:"postgresql", data:tenants.map((t:any)=>({
        tenantId:t.id,name:t.name,slug:t.slug,status:t.status,createdAt:t.createdAt,updatedAt:t.updatedAt,
        branchCount:t.branches.length,userCount:t._count.users,productCount:t._count.products,saleCount:t._count.sales,
        branches:t.branches.map((b:any)=>({branchId:b.id,name:b.name,code:b.code,isMain:b.isMain})),
      }))});
    } catch (error:any) {
      const message=error instanceof Error?error.message:"Tenant directory unavailable";
      return reply.status(message.startsWith("FORBIDDEN")?403:500).send({success:false,error:{code:"SUPER_ADMIN_TENANT_DIRECTORY_FAILED",message}});
    }
  });

  server.get("/api/v1/super-admin/tenants/:tenantId", async (req, reply) => {
    try {
      requireSuperAdmin(req);
      const tenantId=String((req.params as any).tenantId||"").trim();
      const tenant=await prisma.tenant.findUnique({
        where:{id:tenantId}, include:{branches:true,_count:{select:{users:true,products:true,sales:true}}},
      });
      if(!tenant) return reply.status(404).send({success:false,error:{code:"TENANT_NOT_FOUND",message:"Tenant not found"}});
      return reply.send({success:true,source:"postgresql",data:{
        tenantId:tenant.id,name:tenant.name,slug:tenant.slug,status:tenant.status,createdAt:tenant.createdAt,updatedAt:tenant.updatedAt,
        branchCount:tenant.branches.length,userCount:tenant._count.users,productCount:tenant._count.products,saleCount:tenant._count.sales,
        branches:tenant.branches.map((b:any)=>({branchId:b.id,name:b.name,code:b.code,isMain:b.isMain})),
      }});
    } catch(error:any){
      const message=error instanceof Error?error.message:"Tenant detail unavailable";
      return reply.status(message.startsWith("FORBIDDEN")?403:500).send({success:false,error:{code:"SUPER_ADMIN_TENANT_DETAIL_FAILED",message}});
    }
  });

  server.post("/api/v1/super-admin/tenants/:tenantId/suspend", async (req, reply) => {
    try {
      const actor=requireSuperAdmin(req); const ctx=req.tenantContext!;
      requireStepUpToken(req,ctx,"TENANT_SUSPEND");
      const tenantId=String((req.params as any).tenantId||"").trim();
      const reason=String(((req.body||{}) as any).reason||"").trim();
      if(!tenantId||reason.length<3) return reply.status(400).send({success:false,error:{code:"SUSPENSION_INPUT_INVALID",message:"tenantId and a suspension reason are required"}});
      const result=await prisma.$transaction(async(tx:any)=>{
        const tenant=await tx.tenant.findUnique({where:{id:tenantId}});
        if(!tenant) throw new Error("TENANT_NOT_FOUND");
        if(tenant.status==="CLOSED") throw new Error("TENANT_CLOSED");
        const updated=await tx.tenant.update({where:{id:tenantId},data:{status:"SUSPENDED"}});
        await tx.deviceSession.updateMany({where:{tenantId,revokedAt:null},data:{revokedAt:new Date(),status:"REVOKED",revokeReason:"TENANT_SUSPENDED"}});
        await tx.$executeRaw`INSERT INTO platform_audit_events (id,tenant_id,actor_id,action,entity_type,entity_id,metadata)
          VALUES (${randomUUID()},${tenantId},${actor},'TENANT_SUSPENDED','Tenant',${tenantId},${JSON.stringify({reason})}::jsonb)`;
        return updated;
      });
      return reply.send({success:true,source:"postgresql",data:{tenantId:result.id,status:result.status,reason}});
    } catch(error:any) {
      const message=error instanceof Error?error.message:"Tenant suspension failed";
      const status=message==="TENANT_NOT_FOUND"?404:message.startsWith("FORBIDDEN")?403:message.includes("STEP_UP")?401:400;
      return reply.status(status).send({success:false,error:{code:"SUPER_ADMIN_TENANT_SUSPEND_FAILED",message}});
    }
  });

  server.post("/api/v1/super-admin/tenants/:tenantId/reactivate", async (req, reply) => {
    try {
      const actor=requireSuperAdmin(req); const ctx=req.tenantContext!;
      requireStepUpToken(req,ctx,"TENANT_REACTIVATE");
      const tenantId=String((req.params as any).tenantId||"").trim();
      const result=await prisma.$transaction(async(tx:any)=>{
        const tenant=await tx.tenant.findUnique({where:{id:tenantId}});
        if(!tenant) throw new Error("TENANT_NOT_FOUND");
        if(tenant.status==="CLOSED") throw new Error("TENANT_CLOSED");
        const updated=await tx.tenant.update({where:{id:tenantId},data:{status:"ACTIVE"}});
        await tx.$executeRaw`INSERT INTO platform_audit_events (id,tenant_id,actor_id,action,entity_type,entity_id,metadata)
          VALUES (${randomUUID()},${tenantId},${actor},'TENANT_REACTIVATED','Tenant',${tenantId},'{}'::jsonb)`;
        return updated;
      });
      return reply.send({success:true,source:"postgresql",data:{tenantId:result.id,status:result.status}});
    } catch(error:any) {
      const message=error instanceof Error?error.message:"Tenant reactivation failed";
      const status=message==="TENANT_NOT_FOUND"?404:message.startsWith("FORBIDDEN")?403:message.includes("STEP_UP")?401:400;
      return reply.status(status).send({success:false,error:{code:"SUPER_ADMIN_TENANT_REACTIVATE_FAILED",message}});
    }
  });

  server.get("/api/v1/super-admin/subscriptions", async (req, reply) => {
    try {
      requireSuperAdmin(req);
      const rows=await prisma.saasDataRecord.findMany({where:{entityType:"SUBSCRIPTION"},orderBy:{updatedAt:"desc"},take:500});
      const ids=Array.from(new Set(rows.map((r:any)=>r.scopeKey).filter((v:string)=>v&&v!=="GLOBAL")));
      const tenants=ids.length?await prisma.tenant.findMany({where:{id:{in:ids}},select:{id:true,name:true,status:true}}):[];
      const map=new Map(tenants.map((t:any)=>[t.id,t]));
      return reply.send({success:true,source:"postgresql",data:rows.map((r:any)=>({recordId:r.id,tenantId:r.scopeKey,tenant:map.get(r.scopeKey)||null,status:r.status,subscription:r.payload,updatedAt:r.updatedAt}))});
    } catch(error:any) {
      const message=error instanceof Error?error.message:"Subscription registry unavailable";
      return reply.status(message.startsWith("FORBIDDEN")?403:500).send({success:false,error:{code:"SUPER_ADMIN_SUBSCRIPTIONS_FAILED",message}});
    }
  });

  server.post("/api/v1/super-admin/subscriptions/:tenantId/change-plan", async (req, reply) => {
    try {
      const actor=requireSuperAdmin(req); const ctx=req.tenantContext!;
      requireStepUpToken(req,ctx,"SUBSCRIPTION_CHANGE");
      const tenantId=String((req.params as any).tenantId||"").trim();
      const planId=String(((req.body||{}) as any).planId||"").trim();
      if(!tenantId||!planId) return reply.status(400).send({success:false,error:{code:"SUBSCRIPTION_INPUT_INVALID",message:"tenantId and planId are required"}});
      const plan=await prisma.saasDataRecord.findFirst({where:{scopeKey:"GLOBAL",entityType:"PLAN",recordKey:planId,status:"ACTIVE"}});
      const current=await prisma.saasDataRecord.findFirst({where:{scopeKey:tenantId,entityType:"SUBSCRIPTION"},orderBy:{updatedAt:"desc"}});
      if(!plan) return reply.status(404).send({success:false,error:{code:"PLAN_NOT_FOUND",message:"Plan not found"}});
      if(!current) return reply.status(404).send({success:false,error:{code:"SUBSCRIPTION_NOT_FOUND",message:"Subscription not found"}});
      const pp=(plan.payload||{}) as any, cp=(current.payload||{}) as any;
      const next={...cp,planId,planCode:pp.code,planVersion:pp.version??1,basePrice:Number(pp.basePrice??0),currentPeriodPrice:Number(pp.basePrice??0),updatedAt:new Date().toISOString(),changedBy:actor};
      const saved=await prisma.$transaction(async(tx:any)=>{
        const r=await tx.saasDataRecord.update({where:{id:current.id},data:{payload:next,status:String(current.status||"ACTIVE")}});
        await tx.$executeRaw`INSERT INTO platform_audit_events (id,tenant_id,actor_id,action,entity_type,entity_id,metadata)
          VALUES (${randomUUID()},${tenantId},${actor},'SUBSCRIPTION_PLAN_CHANGED','Subscription',${current.id},${JSON.stringify({planId,planCode:pp.code})}::jsonb)`;
        return r;
      });
      return reply.send({success:true,source:"postgresql",data:{recordId:saved.id,tenantId,payload:saved.payload}});
    } catch(error:any) {
      const message=error instanceof Error?error.message:"Subscription plan change failed";
      const status=message.startsWith("FORBIDDEN")?403:message.includes("STEP_UP")?401:400;
      return reply.status(status).send({success:false,error:{code:"SUPER_ADMIN_SUBSCRIPTION_CHANGE_FAILED",message}});
    }
  });

  server.get("/api/v1/super-admin/feature-flags", async (req, reply) => {
    try {
      requireSuperAdmin(req);
      const rows=await prisma.saasDataRecord.findMany({where:{entityType:"FEATURE_FLAG"},orderBy:[{scopeKey:"asc"},{recordKey:"asc"},{updatedAt:"desc"}],take:1000});
      return reply.send({success:true,source:"postgresql",data:rows.map((r:any)=>({scopeKey:r.scopeKey,flagKey:r.recordKey,status:r.status,payload:r.payload,updatedAt:r.updatedAt}))});
    } catch(error:any) {
      const message=error instanceof Error?error.message:"Feature flag registry unavailable";
      return reply.status(message.startsWith("FORBIDDEN")?403:500).send({success:false,error:{code:"SUPER_ADMIN_FEATURE_FLAGS_FAILED",message}});
    }
  });

  server.put("/api/v1/super-admin/feature-flags/:scopeKey/:flagKey", async (req, reply) => {
    try {
      const actor=requireSuperAdmin(req); const ctx=req.tenantContext!;
      requireStepUpToken(req,ctx,"FEATURE_FLAG_CHANGE");
      const scopeKey=String((req.params as any).scopeKey||"").trim();
      const flagKey=String((req.params as any).flagKey||"").trim();
      const body=(req.body||{}) as any;
      if(!/^[A-Za-z0-9._-]{2,100}$/.test(flagKey)||(!scopeKey||scopeKey.length>100)) return reply.status(400).send({success:false,error:{code:"FLAG_INPUT_INVALID",message:"Invalid feature flag scope or key"}});
      if(typeof body.enabled!=="boolean") return reply.status(400).send({success:false,error:{code:"FLAG_VALUE_INVALID",message:"enabled must be boolean"}});
      const payload={enabled:body.enabled,reason:String(body.reason||"").trim().slice(0,500),actor,updatedAt:new Date().toISOString()};
      const saved=await prisma.$transaction(async(tx:any)=>{
        const r=await tx.saasDataRecord.upsert({where:{scopeKey_entityType_recordKey:{scopeKey,entityType:"FEATURE_FLAG",recordKey:flagKey}},create:{id:randomUUID(),scopeKey,entityType:"FEATURE_FLAG",recordKey:flagKey,payload,status:"ACTIVE"},update:{payload,status:"ACTIVE",updatedAt:new Date()}});
        await tx.$executeRaw`INSERT INTO platform_audit_events (id,tenant_id,actor_id,action,entity_type,entity_id,metadata)
          VALUES (${randomUUID()},CASE WHEN ${scopeKey}='GLOBAL' THEN NULL ELSE ${scopeKey} END,${actor},'FEATURE_FLAG_CHANGED','FeatureFlag',${flagKey},${JSON.stringify({scopeKey,enabled:body.enabled,reason:payload.reason})}::jsonb)`;
        return r;
      });
      return reply.send({success:true,source:"postgresql",data:{scopeKey,flagKey,payload:saved.payload,updatedAt:saved.updatedAt}});
    } catch(error:any) {
      const message=error instanceof Error?error.message:"Feature flag update failed";
      const status=message.startsWith("FORBIDDEN")?403:message.includes("STEP_UP")?401:400;
      return reply.status(status).send({success:false,error:{code:"SUPER_ADMIN_FEATURE_FLAG_CHANGE_FAILED",message}});
    }
  });

  server.get("/api/v1/super-admin/audit", async (req, reply) => {
    try {
      requireSuperAdmin(req);
      const limit=Math.min(500,Math.max(1,Number.parseInt(String(((req.query||{}) as any).limit||"200"),10)||200));
      const platform=await prisma.$queryRaw<any[]>`SELECT id,tenant_id AS "tenantId",actor_id AS "actorId",action,entity_type AS "entityType",entity_id AS "entityId",metadata,created_at AS "createdAt"
        FROM platform_audit_events ORDER BY created_at DESC LIMIT ${limit}`;
      const tenant=await prisma.auditEvent.findMany({orderBy:{createdAt:"desc"},take:limit});
      return reply.send({success:true,source:"postgresql",data:{platform,tenant}});
    } catch(error:any) {
      const message=error instanceof Error?error.message:"Global audit unavailable";
      return reply.status(message.startsWith("FORBIDDEN")?403:503).send({success:false,error:{code:"SUPER_ADMIN_AUDIT_FAILED",message}});
    }
  });

  server.get("/api/v1/super-admin/security/health", async (req, reply) => {
    try {
      requireSuperAdmin(req);
      await prisma.$executeRaw`ALTER TABLE platform_super_admin_security ADD COLUMN IF NOT EXISTS last_totp_counter BIGINT`;
      const [securityRows, throttleRows, incidents, activeSessions]=await Promise.all([
        prisma.$queryRaw<any[]>`SELECT user_id AS "userId",mfa_required AS "mfaRequired",mfa_enrolled AS "mfaEnrolled",mfa_type AS "mfaType",locked_until AS "lockedUntil",failed_login_count AS "failedLoginCount",last_login_at AS "lastLoginAt" FROM platform_super_admin_security ORDER BY user_id`,
        prisma.$queryRaw<any[]>`SELECT COUNT(*)::int AS count,COUNT(*) FILTER (WHERE locked_until>NOW())::int AS "activeLocks" FROM auth_login_throttles`,
        prisma.securityPrivacyIncident.count({where:{status:{notIn:["CLOSED","REMEDIATED"]}}}),
        prisma.deviceSession.count({where:{revokedAt:null,expiresAt:{gt:new Date()}}}),
      ]);
      const securityReady=securityRows.length>0 && securityRows.every((r:any)=>r.mfaRequired && r.mfaEnrolled && !(r.lockedUntil && new Date(r.lockedUntil)>new Date()));
      return reply.send({success:true,source:"postgresql",data:{securityReady,superAdminAccounts:securityRows.length,mfaEnrolledAccounts:securityRows.filter((r:any)=>r.mfaEnrolled).length,activeAuthLocks:Number(throttleRows[0]?.activeLocks||0),activeSecurityIncidents:incidents,activeSessions}});
    } catch(error:any) {
      const message=error instanceof Error?error.message:"Security monitoring unavailable";
      return reply.status(message.startsWith("FORBIDDEN")?403:503).send({success:false,error:{code:"SUPER_ADMIN_SECURITY_HEALTH_UNAVAILABLE",message}});
    }
  });

  server.get("/api/v1/super-admin/diagnostics", async (req, reply) => {
    try {
      requireSuperAdmin(req);
      const [db,counts,syncPending,fiscalPending]=await Promise.all([
        prisma.$queryRaw<any[]>`SELECT current_database() AS "database",pg_database_size(current_database())::bigint AS "sizeBytes",(SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname=current_database()) AS "activeBackends"`,
        prisma.$queryRaw<any[]>`SELECT (SELECT COUNT(*)::int FROM tenants) AS tenants,(SELECT COUNT(*)::int FROM branches) AS branches,(SELECT COUNT(*)::int FROM users) AS users,(SELECT COUNT(*)::int FROM products) AS products,(SELECT COUNT(*)::int FROM sales) AS sales`,
        prisma.syncOperation.count({where:{status:{in:["PENDING","FAILED"]}}}),
        prisma.traVfdOutbox.count({where:{status:{in:["PENDING","FAILED"]}}}),
      ]);
      return reply.send({success:true,source:"postgresql",data:{timestamp:new Date().toISOString(),database:jsonSafe(db[0]||{}),counts:counts[0]||{},queues:{syncPending,fiscalPending},process:{uptimeSeconds:Math.floor(process.uptime()),nodeVersion:process.version,memory:process.memoryUsage()}}});
    } catch(error:any) {
      const message=error instanceof Error?error.message:"Platform diagnostics unavailable";
      return reply.status(message.startsWith("FORBIDDEN")?403:503).send({success:false,error:{code:"SUPER_ADMIN_DIAGNOSTICS_UNAVAILABLE",message}});
    }
  });

  server.get("/api/v1/super-admin/releases", async (req, reply) => {
    try {
      requireSuperAdmin(req);
      const identity=getReleaseIdentity(loadConfig());
      const [candidates,attestations,health]=await Promise.all([
        prisma.releaseCandidate.findMany({orderBy:{createdAt:"desc"},take:20}),
        prisma.releaseAttestation.findMany({orderBy:{verificationTimestamp:"desc"},take:20}),
        prisma.deploymentHealth.findMany({orderBy:{timestamp:"desc"},take:100}),
      ]);
      return reply.send({success:true,source:"postgresql",data:{identity,candidates,attestations,health}});
    } catch(error:any) {
      const message=error instanceof Error?error.message:"Release registry unavailable";
      return reply.status(message.startsWith("FORBIDDEN")?403:503).send({success:false,error:{code:"SUPER_ADMIN_RELEASES_FAILED",message}});
    }
  });

  server.get("/api/v1/super-admin/overview/live", async (req, reply) => {
    try {
      requireSuperAdmin(req);
      const [totalTenants,activeTenants,totalBranches,totalUsers,subscriptionCount,incidentCount]=await Promise.all([
        prisma.tenant.count(),prisma.tenant.count({where:{status:"ACTIVE"}}),prisma.branch.count(),prisma.user.count(),
        prisma.saasDataRecord.count({where:{entityType:"SUBSCRIPTION"}}),prisma.securityPrivacyIncident.count({where:{status:{notIn:["CLOSED","REMEDIATED"]}}}),
      ]);
      const identity=getReleaseIdentity(loadConfig());
      return reply.send({success:true,source:"postgresql",data:{platformName:"Kwakoko Business Operating System",totalTenants,activeTenants,totalBranches,totalUsers,activeSubscriptions:subscriptionCount,activeSecurityIncidents:incidentCount,release:{version:identity.appVersion,gitSha:identity.gitSha,tag:identity.gitTag,revision:identity.cloudRunRevision}}});
    } catch(error:any) {
      const message=error instanceof Error?error.message:"Platform overview unavailable";
      return reply.status(message.startsWith("FORBIDDEN")?403:503).send({success:false,error:{code:"SUPER_ADMIN_OVERVIEW_LIVE_FAILED",message}});
    }
  });

}
