import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@kwakopos2/auth";
import { TenantOnboardingCreateRequestSchema, TenantOnboardingUpdateRequestSchema } from "@kwakopos2/contracts";

const OWNER_PERMISSIONS = [
  "PRODUCT_VIEW", "PRODUCT_CREATE", "PRODUCT_EDIT", "PRODUCT_ARCHIVE", "INVENTORY_VIEW", "INVENTORY_ADJUST", "INVENTORY_TRANSFER", "INVENTORY_COUNT",
  "PURCHASE_VIEW", "PURCHASE_CREATE", "PURCHASE_APPROVE", "PURCHASE_RECEIVE", "SALE_VIEW", "SALE_CREATE", "SALE_VOID", "SALE_RETURN",
  "PAYMENT_VIEW", "PAYMENT_CREATE", "PAYMENT_REFUND", "CUSTOMER_VIEW", "CUSTOMER_CREATE", "CUSTOMER_EDIT", "SUPPLIER_VIEW", "SUPPLIER_CREATE", "SUPPLIER_EDIT",
  "REPORT_VIEW", "REPORT_EXPORT", "FINANCE_VIEW", "FINANCE_CREATE", "JOURNAL_CREATE", "JOURNAL_POST", "JOURNAL_REVERSE", "AR_VIEW", "AR_MANAGE", "AP_VIEW", "AP_MANAGE",
  "PAYMENT_RECONCILE", "BANK_RECONCILE", "CASH_RECONCILE", "BUDGET_VIEW", "BUDGET_MANAGE", "FINANCIAL_REPORT_VIEW", "FINANCIAL_REPORT_EXPORT",
  "WORKFORCE_VIEW", "EMPLOYEE_VIEW", "EMPLOYEE_CREATE", "EMPLOYEE_EDIT", "ATTENDANCE_VIEW", "ATTENDANCE_RECORD", "SCHEDULE_VIEW", "SCHEDULE_CREATE", "LEAVE_VIEW", "LEAVE_REQUEST",
  "TASK_VIEW", "TASK_CREATE", "WORK_ORDER_VIEW", "WORK_ORDER_CREATE", "PAYROLL_INPUT_VIEW", "PERFORMANCE_VIEW", "CERTIFICATION_VIEW",
  "BILLING_VIEW", "BILLING_MANAGE", "SUBSCRIPTION_VIEW", "INVOICE_VIEW", "RECEIPT_VIEW", "RECEIPT_CREATE", "RECEIPT_PRINT", "RECEIPT_REPRINT",
];

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

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class TenantOnboardingService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: unknown, actor?: { userId: string; tenantId: string; isSuperAdmin: boolean }) {
    if (!actor?.isSuperAdmin) throw new TenantOnboardingError("FORBIDDEN", "Platform provisioning privileges are required", 403);
    const data = TenantOnboardingCreateRequestSchema.parse(input);
    const slug = normalizeSlug(data.slug || data.businessName);
    const existing = await this.prisma.$queryRaw<Array<any>>`
      SELECT * FROM tenant_onboardings WHERE idempotency_key = ${data.idempotencyKey} LIMIT 1
    `;
    if (existing[0]) return this.toSafeResponse(existing[0]);

    const tenantExists = await this.prisma.tenant.findUnique({ where: { slug } });
    if (tenantExists) throw new TenantOnboardingError("CONFLICT", "Tenant slug is already in use", 409);

    const tenantId = randomUUID();
    const branchId = randomUUID();
    const roleId = randomUUID();
    const ownerId = randomUUID();
    const onboardingId = randomUUID();
    const branchCode = normalizeBranchCode(data.branchCode, slug);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({ data: { id: tenantId, name: data.businessName.trim(), slug, status: "ACTIVE" } });
        const branch = await tx.branch.create({ data: { id: branchId, tenantId, name: data.branchName.trim(), code: branchCode, isMain: true } });
        const role = await tx.role.create({ data: { id: roleId, tenantId, name: "OWNER", permissions: OWNER_PERMISSIONS } });
        const user = await tx.user.create({ data: {
          id: ownerId, tenantId, branchId, email: data.ownerEmail.trim().toLowerCase(), passwordHash: hashPassword(data.ownerPassword), name: data.ownerName.trim(), roleId, status: "ACTIVE",
        } });

        await tx.$executeRaw`
          INSERT INTO tenant_onboardings
          (id, tenant_id, business_name, slug, status, current_step, industry, modules, country, currency, timezone, locale, owner_user_id, branch_id, idempotency_key, metadata)
          VALUES
          (${onboardingId}::uuid, ${tenantId}::uuid, ${data.businessName.trim()}, ${slug}, 'READY', 'COMPLETE', ${data.industry}, ${data.modules}::text[], ${data.country.toUpperCase()}, ${data.currency.toUpperCase()}, ${data.timezone}, ${data.locale}, ${ownerId}::uuid, ${branchId}::uuid, ${data.idempotencyKey}, ${JSON.stringify({ source: "tenant-onboarding", actorUserId: actor.userId })}::jsonb)
        `;
        await tx.$executeRaw`
          INSERT INTO tenant_configurations (tenant_id, country, currency, timezone, locale, numbering_policy, branch_code_policy, tax_configuration)
          VALUES (${tenantId}::uuid, ${data.country.toUpperCase()}, ${data.currency.toUpperCase()}, ${data.timezone}, ${data.locale}, 'SEQUENTIAL', 'TENANT_PREFIXED', '{}'::jsonb)
        `;
        for (const moduleKey of Array.from(new Set(data.modules.length ? data.modules : [data.industry]))) {
          await tx.$executeRaw`
            INSERT INTO tenant_module_entitlements (id, tenant_id, module_key, status, source)
            VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, ${moduleKey}, 'ACTIVE', 'ONBOARDING')
            ON CONFLICT (tenant_id, module_key) DO NOTHING
          `;
        }
        await tx.$executeRaw`
          INSERT INTO tenant_onboarding_audit_events (id, onboarding_id, tenant_id, actor_user_id, transition, result, metadata)
          VALUES (${randomUUID()}::uuid, ${onboardingId}::uuid, ${tenantId}::uuid, ${actor.userId}::uuid, 'PROVISIONED', 'SUCCESS', ${JSON.stringify({ branchId, ownerUserId: ownerId, roleId })}::jsonb)
        `;
        return { onboardingId, tenantId: tenant.id, branchId: branch.id, ownerUserId: user.id, status: "READY", nextStep: "LOGIN" as const };
      });
    } catch (error: any) {
      if (error?.code === "P2002" || error?.code === "23505") throw new TenantOnboardingError("CONFLICT", "Tenant or onboarding idempotency key already exists", 409);
      throw new TenantOnboardingError("PROVISIONING_FAILED", "Tenant provisioning failed and was rolled back", 500);
    }
  }

  async getForActor(tenantId: string, actor: { tenantId: string; isSuperAdmin: boolean }) {
    if (!actor.isSuperAdmin && actor.tenantId !== tenantId) throw new TenantOnboardingError("FORBIDDEN", "Cross-tenant onboarding access denied", 403);
    const rows = await this.prisma.$queryRaw<Array<any>>`
      SELECT id, tenant_id AS "tenantId", status, current_step AS "currentStep", industry, modules, country, currency, timezone, locale,
             owner_user_id AS "ownerUserId", branch_id AS "branchId", created_at AS "createdAt", updated_at AS "updatedAt", completed_at AS "completedAt"
      FROM tenant_onboardings WHERE tenant_id = ${tenantId}::uuid ORDER BY created_at DESC LIMIT 1
    `;
    if (!rows[0]) throw new TenantOnboardingError("NOT_FOUND", "Tenant onboarding not found", 404);
    return this.toSafeResponse(rows[0]);
  }

  async update(tenantId: string, input: unknown, actor: { tenantId: string; isSuperAdmin: boolean }) {
    if (!actor.isSuperAdmin && actor.tenantId !== tenantId) throw new TenantOnboardingError("FORBIDDEN", "Cross-tenant onboarding access denied", 403);
    const data = TenantOnboardingUpdateRequestSchema.parse(input);
    const rows = await this.prisma.$queryRaw<Array<any>>`SELECT * FROM tenant_onboardings WHERE tenant_id = ${tenantId}::uuid ORDER BY created_at DESC LIMIT 1`;
    if (!rows[0]) throw new TenantOnboardingError("NOT_FOUND", "Tenant onboarding not found", 404);
    if (rows[0].status === "COMPLETED") throw new TenantOnboardingError("CONFLICT", "Completed onboarding cannot be modified", 409);
    await this.prisma.$executeRaw`
      UPDATE tenant_onboardings SET
        status = COALESCE(${data.status || null}, status), current_step = COALESCE(${data.currentStep || null}, current_step),
        business_name = COALESCE(${data.businessName || null}, business_name), country = COALESCE(${data.country || null}, country),
        currency = COALESCE(${data.currency || null}, currency), timezone = COALESCE(${data.timezone || null}, timezone),
        locale = COALESCE(${data.locale || null}, locale), industry = COALESCE(${data.industry || null}, industry),
        modules = COALESCE(${data.modules ? data.modules : null}::text[], modules), branch_code = COALESCE(${data.branchCode || null}, branch_code),
        updated_at = NOW()
      WHERE id = ${rows[0].id}::uuid
    `;
    return this.getForActor(tenantId, actor);
  }

  async complete(tenantId: string, actor: { tenantId: string; isSuperAdmin: boolean }) {
    if (!actor.isSuperAdmin && actor.tenantId !== tenantId) throw new TenantOnboardingError("FORBIDDEN", "Cross-tenant onboarding access denied", 403);
    const rows = await this.prisma.$queryRaw<Array<any>>`SELECT * FROM tenant_onboardings WHERE tenant_id = ${tenantId}::uuid ORDER BY created_at DESC LIMIT 1`;
    if (!rows[0]) throw new TenantOnboardingError("NOT_FOUND", "Tenant onboarding not found", 404);
    if (rows[0].status === "COMPLETED") return this.toSafeResponse(rows[0]);
    if (rows[0].status !== "READY") throw new TenantOnboardingError("CONFLICT", "Tenant onboarding is not ready for completion", 409);
    await this.prisma.$executeRaw`UPDATE tenant_onboardings SET status='COMPLETED', current_step='COMPLETE', completed_at=NOW(), updated_at=NOW() WHERE id=${rows[0].id}::uuid`;
    return this.getForActor(tenantId, actor);
  }

  private toSafeResponse(value: any) {
    return {
      id: value.id,
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
      createdAt: iso(value.createdAt ?? value.created_at)!,
      updatedAt: iso(value.updatedAt ?? value.updated_at)!,
      completedAt: iso(value.completedAt ?? value.completed_at),
    };
  }
}
