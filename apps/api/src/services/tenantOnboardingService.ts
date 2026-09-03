import { createHash, randomUUID } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { hashPassword } from "@kwakopos2/auth";
import { StandardPluginCatalog } from "@kwakopos2/domain";
import { TenantOnboardingCreateRequestSchema, TenantOnboardingUpdateRequestSchema } from "@kwakopos2/contracts/tenantOnboardingContracts";

const OWNER_PERMISSIONS = [
  "PRODUCT_VIEW", "PRODUCT_CREATE", "PRODUCT_EDIT", "PRODUCT_ARCHIVE",
  "INVENTORY_VIEW", "INVENTORY_ADJUST", "INVENTORY_TRANSFER", "INVENTORY_COUNT",
  "PURCHASE_VIEW", "PURCHASE_CREATE", "PURCHASE_APPROVE", "PURCHASE_RECEIVE",
  "SALE_VIEW", "SALE_CREATE", "SALE_VOID", "SALE_RETURN",
  "PAYMENT_VIEW", "PAYMENT_CREATE", "PAYMENT_REFUND",
  "CUSTOMER_VIEW", "CUSTOMER_CREATE", "CUSTOMER_EDIT",
  "SUPPLIER_VIEW", "SUPPLIER_CREATE", "SUPPLIER_EDIT",
  "REPORT_VIEW", "REPORT_EXPORT", "FINANCE_VIEW", "FINANCE_CREATE",
  "JOURNAL_CREATE", "JOURNAL_POST", "JOURNAL_REVERSE", "AR_VIEW", "AR_MANAGE",
  "AP_VIEW", "AP_MANAGE", "PAYMENT_RECONCILE", "BANK_RECONCILE", "CASH_RECONCILE",
  "BUDGET_VIEW", "BUDGET_MANAGE", "FINANCIAL_REPORT_VIEW", "FINANCIAL_REPORT_EXPORT",
  "WORKFORCE_VIEW", "EMPLOYEE_VIEW", "EMPLOYEE_CREATE", "EMPLOYEE_EDIT",
  "ATTENDANCE_VIEW", "ATTENDANCE_RECORD", "SCHEDULE_VIEW", "SCHEDULE_CREATE",
  "LEAVE_VIEW", "LEAVE_REQUEST", "TASK_VIEW", "TASK_CREATE", "WORK_ORDER_VIEW", "WORK_ORDER_CREATE",
  "PAYROLL_INPUT_VIEW", "PERFORMANCE_VIEW", "CERTIFICATION_VIEW",
  "RECEIPT_VIEW", "RECEIPT_CREATE", "RECEIPT_PRINT", "RECEIPT_REPRINT",
] as const;

export class TenantOnboardingError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "TenantOnboardingError";
  }
}

function normalizeSlug(input: string): string {
  const slug = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  if (!slug) throw new TenantOnboardingError("VALIDATION_ERROR", "A valid tenant slug is required");
  return slug;
}

function normalizeBranchCode(input: string | undefined, tenantSlug: string): string {
  const explicit = input?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return (explicit || `${tenantSlug.slice(0, 8).toUpperCase()}-HQ`).slice(0, 20);
}

function stableFingerprint(value: Record<string, unknown>): string {
  const normalized = Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function fingerprintRequest(data: any): string {
  return stableFingerprint({ ...data, ownerPassword: createHash("sha256").update(String(data.ownerPassword)).digest("hex") });
}

function findManifest(value: string): any {
  const normalized = value.trim().toLowerCase();
  return StandardPluginCatalog.find((p: any) => [p.id, p.name, p.industry].filter(Boolean).some((candidate: string) => String(candidate).trim().toLowerCase() === normalized));
}

function canonicalModule(value: string): string {
  const manifest = findManifest(value);
  if (!manifest) throw new TenantOnboardingError("VALIDATION_ERROR", `Unknown or unauthorized module: ${value}`);
  return manifest.id;
}

function canonicalIndustry(value: string): string {
  const manifest = findManifest(value);
  if (!manifest) throw new TenantOnboardingError("VALIDATION_ERROR", `Unknown or unauthorized industry: ${value}`);
  return manifest.industry;
}

function iso(value: Date | string | null | undefined): string | null {
  return value ? (value instanceof Date ? value.toISOString() : new Date(value).toISOString()) : null;
}

export class TenantOnboardingService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: unknown, actor?: { userId: string; tenantId: string; isSuperAdmin: boolean; correlationId?: string; traceId?: string }) {
    if (!actor?.isSuperAdmin) throw new TenantOnboardingError("FORBIDDEN", "Platform provisioning privileges are required", 403);
    const data = TenantOnboardingCreateRequestSchema.parse(input);
    const modules = Array.from(new Set(data.modules.map(canonicalModule)));
    const industry = canonicalIndustry(data.industry);
    const normalized = { ...data, businessName: data.businessName.trim(), ownerName: data.ownerName.trim(), ownerEmail: data.ownerEmail.trim().toLowerCase(), branchName: data.branchName.trim(), modules, industry };
    const slug = normalizeSlug(data.slug || data.businessName);
    const branchCode = normalizeBranchCode(data.branchCode, slug);
    const requestFingerprint = fingerprintRequest(normalized);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.idempotencyKey}, 0))`;
        const existing = await tx.$queryRaw<Array<any>>`SELECT * FROM tenant_onboardings WHERE idempotency_key = ${data.idempotencyKey} LIMIT 1`;
        if (existing[0]) {
          if (existing[0].request_fingerprint !== requestFingerprint) throw new TenantOnboardingError("CONFLICT", "Idempotency key was already used with different parameters", 409);
          return { onboardingId: existing[0].id, tenantId: existing[0].tenant_id, branchId: existing[0].branch_id, ownerUserId: existing[0].owner_user_id, status: existing[0].status, nextStep: existing[0].status === "COMPLETED" ? "LOGIN" as const : "LOGIN" as const };
        }

        const existingTenant = await tx.tenant.findUnique({ where: { slug } });
        if (existingTenant) throw new TenantOnboardingError("CONFLICT", "Tenant slug is already in use", 409);

        const tenantId = randomUUID();
        const branchId = randomUUID();
        const roleId = randomUUID();
        const ownerId = randomUUID();
        const onboardingId = randomUUID();
        const passwordHash = await hashPassword(data.ownerPassword);

        const tenant = await tx.tenant.create({ data: { id: tenantId, name: normalized.businessName, slug, status: "ACTIVE" } });
        const branch = await tx.branch.create({ data: { id: branchId, tenantId, name: normalized.branchName, code: branchCode, isMain: true } });
        const role = await tx.role.create({ data: { id: roleId, tenantId, name: "OWNER", permissions: [...OWNER_PERMISSIONS] } });
        const user = await tx.user.create({ data: { id: ownerId, tenantId, branchId, roleId: role.id, email: normalized.ownerEmail, passwordHash, name: normalized.ownerName } });

        await tx.$executeRaw`INSERT INTO tenant_onboardings (id, tenant_id, business_name, slug, branch_name, branch_code, status, current_step, industry, modules, country, currency, timezone, locale, owner_user_id, branch_id, idempotency_key, request_fingerprint, created_at, updated_at) VALUES (${onboardingId}::uuid, ${tenantId}::uuid, ${normalized.businessName}, ${slug}, ${normalized.branchName}, ${branchCode}, 'READY', 'COMPLETE', ${industry}, ${Prisma.sql`ARRAY[${Prisma.join(modules)}]`}::text[], ${data.country}, ${data.currency}, ${data.timezone}, ${data.locale}, ${ownerId}::uuid, ${branchId}::uuid, ${data.idempotencyKey}, ${requestFingerprint}, NOW(), NOW())`;
        await tx.$executeRaw`INSERT INTO tenant_configurations (tenant_id, country, currency, timezone, locale, numbering_policy, branch_code_policy, tax_configuration) VALUES (${tenantId}::uuid, ${data.country}, ${data.currency}, ${data.timezone}, ${data.locale}, 'SEQUENTIAL', 'TENANT_PREFIXED', '{}'::jsonb)`;
        for (const moduleKey of modules) await tx.$executeRaw`INSERT INTO tenant_module_entitlements (id, tenant_id, module_key, status, source) VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, ${moduleKey}, 'ACTIVE', 'ONBOARDING')`;
        await tx.$executeRaw`INSERT INTO tenant_onboarding_audit_events (id, onboarding_id, tenant_id, actor_user_id, transition, result, correlation_id, trace_id, metadata) VALUES (${randomUUID()}::uuid, ${onboardingId}::uuid, ${tenantId}::uuid, ${actor.userId}::uuid, 'CREATE', 'SUCCESS', ${actor.correlationId || null}, ${actor.traceId || null}, '{}'::jsonb)`;

        return { onboardingId, tenantId: tenant.id, branchId: branch.id, ownerUserId: user.id, status: "READY" as const, nextStep: "LOGIN" as const };
      });
    } catch (error: any) {
      if (error instanceof TenantOnboardingError) throw error;
      if (error?.code === "P2002" || error?.code === "23505") throw new TenantOnboardingError("CONFLICT", "Tenant or onboarding idempotency key already exists", 409);
      throw new TenantOnboardingError("PROVISIONING_FAILED", "Tenant provisioning failed and was rolled back", 500);
    }
  }

  async getForActor(tenantId: string, actor: { tenantId: string; isSuperAdmin: boolean }) {
    if (!actor.isSuperAdmin && actor.tenantId !== tenantId) throw new TenantOnboardingError("FORBIDDEN", "Cross-tenant onboarding access denied", 403);
    const rows = await this.prisma.$queryRaw<Array<any>>`SELECT id, tenant_id AS "tenantId", status, current_step AS "currentStep", industry, modules, country, currency, timezone, locale, owner_user_id AS "ownerUserId", branch_id AS "branchId", created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt" FROM tenant_onboardings WHERE tenant_id = ${tenantId}::uuid ORDER BY created_at DESC LIMIT 1`;
    if (!rows[0]) throw new TenantOnboardingError("NOT_FOUND", "Tenant onboarding not found", 404);
    return this.toSafeResponse(rows[0]);
  }

  async update(tenantId: string, input: unknown, actor: { tenantId: string; isSuperAdmin: boolean }) {
    if (!actor.isSuperAdmin && actor.tenantId !== tenantId) throw new TenantOnboardingError("FORBIDDEN", "Cross-tenant onboarding access denied", 403);
    const data = TenantOnboardingUpdateRequestSchema.parse(input);
    try {
      await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<any>>`SELECT * FROM tenant_onboardings WHERE tenant_id = ${tenantId}::uuid ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
        if (!rows[0]) throw new TenantOnboardingError("NOT_FOUND", "Tenant onboarding not found", 404);
        if (rows[0].status === "COMPLETED") throw new TenantOnboardingError("CONFLICT", "Completed onboarding cannot be modified", 409);

        const modules = data.modules ? Array.from(new Set(data.modules.map(canonicalModule))) : undefined;
        const industry = data.industry ? canonicalIndustry(data.industry) : undefined;
        const branchId = rows[0].branch_id;
        if (data.businessName) await tx.tenant.update({ where: { id: tenantId }, data: { name: data.businessName.trim() } });
        if (branchId && (data.branchName || data.branchCode)) await tx.branch.update({ where: { id: branchId }, data: { ...(data.branchName ? { name: data.branchName.trim() } : {}), ...(data.branchCode ? { code: data.branchCode } : {}) } });
        if (data.country || data.currency || data.timezone || data.locale) await tx.$executeRaw`UPDATE tenant_configurations SET country=COALESCE(${data.country || null}, country), currency=COALESCE(${data.currency || null}, currency), timezone=COALESCE(${data.timezone || null}, timezone), locale=COALESCE(${data.locale || null}, locale), updated_at=NOW() WHERE tenant_id=${tenantId}::uuid`;
        if (modules) {
          await tx.$executeRaw`UPDATE tenant_onboardings SET modules=${Prisma.sql`ARRAY[${Prisma.join(modules)}]`}::text[] WHERE tenant_id=${tenantId}::uuid`;
          await tx.$executeRaw`DELETE FROM tenant_module_entitlements WHERE tenant_id=${tenantId}::uuid`;
          for (const moduleKey of modules) await tx.$executeRaw`INSERT INTO tenant_module_entitlements (id, tenant_id, module_key, status, source) VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, ${moduleKey}, 'ACTIVE', 'ONBOARDING')`;
        }
        await tx.$executeRaw`UPDATE tenant_onboardings SET business_name=COALESCE(${data.businessName?.trim() || null}, business_name), branch_name=COALESCE(${data.branchName?.trim() || null}, branch_name), branch_code=COALESCE(${data.branchCode || null}, branch_code), country=COALESCE(${data.country || null}, country), currency=COALESCE(${data.currency || null}, currency), timezone=COALESCE(${data.timezone || null}, timezone), locale=COALESCE(${data.locale || null}, locale), industry=COALESCE(${industry || null}, industry), updated_at=NOW() WHERE tenant_id=${tenantId}::uuid`;
        await tx.$executeRaw`INSERT INTO tenant_onboarding_audit_events (id, onboarding_id, tenant_id, actor_user_id, transition, result, correlation_id, trace_id, metadata) VALUES (${randomUUID()}::uuid, ${rows[0].id}::uuid, ${tenantId}::uuid, ${actor.isSuperAdmin ? null : actor.tenantId}::uuid, 'UPDATE', 'SUCCESS', NULL, NULL, '{}'::jsonb)`;
      });
    } catch (error: any) {
      if (error instanceof TenantOnboardingError) throw error;
      if (error?.code === "P2002" || error?.code === "23505") throw new TenantOnboardingError("CONFLICT", "Tenant branch code is already in use", 409);
      throw new TenantOnboardingError("PROVISIONING_FAILED", "Tenant onboarding update failed", 500);
    }
    return this.getForActor(tenantId, actor);
  }

  async complete(tenantId: string, actor: { tenantId: string; isSuperAdmin: boolean; userId?: string; correlationId?: string; traceId?: string }) {
    if (!actor.isSuperAdmin && actor.tenantId !== tenantId) throw new TenantOnboardingError("FORBIDDEN", "Cross-tenant onboarding access denied", 403);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<any>>`SELECT * FROM tenant_onboardings WHERE tenant_id = ${tenantId}::uuid ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
      if (!rows[0]) throw new TenantOnboardingError("NOT_FOUND", "Tenant onboarding not found", 404);
      if (rows[0].status === "COMPLETED") return;
      if (rows[0].status !== "READY") throw new TenantOnboardingError("CONFLICT", "Only READY onboardings can be completed", 409);
      await tx.$executeRaw`UPDATE tenant_onboardings SET status='COMPLETED', current_step='COMPLETE', completed_at=NOW(), updated_at=NOW() WHERE id=${rows[0].id}::uuid`;
      await tx.$executeRaw`INSERT INTO tenant_onboarding_audit_events (id, onboarding_id, tenant_id, actor_user_id, transition, result, correlation_id, trace_id, metadata) VALUES (${randomUUID()}::uuid, ${rows[0].id}::uuid, ${tenantId}::uuid, ${actor.userId || null}::uuid, 'COMPLETE', 'SUCCESS', ${actor.correlationId || null}, ${actor.traceId || null}, '{}'::jsonb)`;
    });
    return this.getForActor(tenantId, actor);
  }

  private toSafeResponse(value: any) {
    return {
      id: String(value.id),
      tenantId: value.tenantId ?? value.tenant_id ?? null,
      status: value.status,
      currentStep: value.currentStep ?? value.current_step,
      industry: value.industry,
      modules: Array.isArray(value.modules) ? value.modules : [],
      country: value.country,
      currency: value.currency,
      timezone: value.timezone,
      locale: value.locale,
      ownerUserId: value.ownerUserId ?? value.owner_user_id ?? null,
      branchId: value.branchId ?? value.branch_id ?? null,
      createdAt: iso(value.createdAt ?? value.created_at),
      updatedAt: iso(value.updatedAt ?? value.updated_at),
      completedAt: iso(value.completedAt ?? value.completed_at),
    };
  }
}
