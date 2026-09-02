import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@kwakopos2/auth";
import {
  TenantOnboardingCreateRequestSchema,
  TenantOnboardingUpdateRequestSchema,
  type TenantOnboardingCreateRequest,
  type TenantOnboardingUpdateRequest,
} from "@kwakopos2/contracts";

const OWNER_PERMISSIONS = [
  "PRODUCT_VIEW", "PRODUCT_CREATE", "PRODUCT_EDIT", "PRODUCT_ARCHIVE",
  "INVENTORY_VIEW", "INVENTORY_ADJUST", "INVENTORY_TRANSFER", "INVENTORY_COUNT",
  "PURCHASE_VIEW", "PURCHASE_CREATE", "PURCHASE_APPROVE", "PURCHASE_RECEIVE",
  "SALE_VIEW", "SALE_CREATE", "SALE_VOID", "SALE_RETURN",
  "PAYMENT_VIEW", "PAYMENT_CREATE", "PAYMENT_REFUND",
  "CUSTOMER_VIEW", "CUSTOMER_CREATE", "CUSTOMER_EDIT",
  "SUPPLIER_VIEW", "SUPPLIER_CREATE", "SUPPLIER_EDIT",
  "REPORT_VIEW", "REPORT_EXPORT", "FINANCE_VIEW", "FINANCE_CREATE",
  "JOURNAL_CREATE", "JOURNAL_POST", "JOURNAL_REVERSE",
  "AR_VIEW", "AR_MANAGE", "AP_VIEW", "AP_MANAGE",
  "PAYMENT_RECONCILE", "BANK_RECONCILE", "CASH_RECONCILE",
  "BUDGET_VIEW", "BUDGET_MANAGE", "FINANCIAL_REPORT_VIEW", "FINANCIAL_REPORT_EXPORT",
  "WORKFORCE_VIEW", "EMPLOYEE_VIEW", "EMPLOYEE_CREATE", "EMPLOYEE_EDIT",
  "ATTENDANCE_VIEW", "ATTENDANCE_RECORD", "SCHEDULE_VIEW", "SCHEDULE_CREATE",
  "LEAVE_VIEW", "LEAVE_REQUEST", "TASK_VIEW", "TASK_CREATE",
  "WORK_ORDER_VIEW", "WORK_ORDER_CREATE", "PAYROLL_INPUT_VIEW",
  "PERFORMANCE_VIEW", "CERTIFICATION_VIEW",
  "BILLING_VIEW", "BILLING_MANAGE", "SUBSCRIPTION_VIEW", "INVOICE_VIEW",
  "RECEIPT_VIEW", "RECEIPT_CREATE", "RECEIPT_PRINT", "RECEIPT_REPRINT",
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

export class TenantOnboardingService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: unknown) {
    const data = TenantOnboardingCreateRequestSchema.parse(input);
    const slug = normalizeSlug(data.slug || data.businessName);

    const existing = await this.prisma.tenantOnboarding.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
    if (existing) return this.toSafeResponse(existing);

    const sameSlug = await this.prisma.tenant.findUnique({ where: { slug } });
    if (sameSlug) throw new TenantOnboardingError("CONFLICT", "Tenant slug is already in use", 409);

    const now = new Date();
    const onboardingId = randomUUID();
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const roleId = randomUUID();
    const ownerId = randomUUID();
    const branchCode = normalizeBranchCode(data.branchCode, slug);

    const result = await this.prisma.$transaction(async (tx) => {
      const onboarding = await tx.tenantOnboarding.create({
        data: {
          id: onboardingId,
          tenantId,
          status: "DRAFT",
          currentStep: "PROVISIONING",
          businessName: data.businessName.trim(),
          slug,
          industry: data.industry,
          modules: data.modules,
          country: data.country.toUpperCase(),
          currency: data.currency.toUpperCase(),
          timezone: data.timezone,
          locale: data.locale,
          ownerUserId: ownerId,
          branchId,
          idempotencyKey: data.idempotencyKey,
          metadata: { source: "tenant-onboarding", createdAt: now.toISOString() },
        },
      });

      const tenant = await tx.tenant.create({ data: { id: tenantId, name: data.businessName.trim(), slug, status: "ACTIVE" } });
      const branch = await tx.branch.create({ data: { id: branchId, tenantId: tenant.id, name: data.branchName.trim(), code: branchCode, isMain: true } });
      const role = await tx.role.create({ data: { id: roleId, tenantId: tenant.id, name: "OWNER", permissions: OWNER_PERMISSIONS } });
      const user = await tx.user.create({
        data: {
          id: ownerId,
          tenantId: tenant.id,
          branchId: branch.id,
          email: data.ownerEmail.trim().toLowerCase(),
          passwordHash: hashPassword(data.ownerPassword),
          name: data.ownerName.trim(),
          roleId: role.id,
          status: "ACTIVE",
        },
      });

      await tx.tenantOnboarding.update({
        where: { id: onboarding.id },
        data: { status: "READY", currentStep: "COMPLETE", metadata: { source: "tenant-onboarding", tenantId, branchId, ownerUserId: ownerId } },
      });
      return { onboarding, tenant, branch, role, user };
    });

    return {
      onboardingId: result.onboarding.id,
      tenantId: result.tenant.id,
      branchId: result.branch.id,
      ownerUserId: result.user.id,
      status: "READY",
      nextStep: "LOGIN",
    };
  }

  async getForActor(tenantId: string, actorTenantId?: string) {
    if (actorTenantId && actorTenantId !== tenantId) throw new TenantOnboardingError("FORBIDDEN", "Cross-tenant onboarding access denied", 403);
    const onboarding = await this.prisma.tenantOnboarding.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    if (!onboarding) throw new TenantOnboardingError("NOT_FOUND", "Tenant onboarding not found", 404);
    return this.toSafeResponse(onboarding);
  }

  async update(tenantId: string, input: unknown, actorTenantId?: string) {
    if (actorTenantId && actorTenantId !== tenantId) throw new TenantOnboardingError("FORBIDDEN", "Cross-tenant onboarding access denied", 403);
    const data = TenantOnboardingUpdateRequestSchema.parse(input);
    const current = await this.prisma.tenantOnboarding.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    if (!current) throw new TenantOnboardingError("NOT_FOUND", "Tenant onboarding not found", 404);
    if (current.status === "COMPLETED") throw new TenantOnboardingError("CONFLICT", "Completed onboarding cannot be modified", 409);
    const updated = await this.prisma.tenantOnboarding.update({ where: { id: current.id }, data: {
      status: data.status,
      currentStep: data.currentStep,
      businessName: data.businessName,
      industry: data.industry,
      modules: data.modules,
      country: data.country,
      currency: data.currency,
      timezone: data.timezone,
      locale: data.locale,
      branchName: data.branchName,
      branchCode: data.branchCode,
    } });
    return this.toSafeResponse(updated);
  }

  async complete(tenantId: string, actorTenantId?: string) {
    if (actorTenantId && actorTenantId !== tenantId) throw new TenantOnboardingError("FORBIDDEN", "Cross-tenant onboarding access denied", 403);
    const current = await this.prisma.tenantOnboarding.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    if (!current) throw new TenantOnboardingError("NOT_FOUND", "Tenant onboarding not found", 404);
    if (current.status === "COMPLETED") return this.toSafeResponse(current);
    if (current.status !== "READY") throw new TenantOnboardingError("CONFLICT", "Tenant onboarding is not ready for completion", 409);
    const updated = await this.prisma.tenantOnboarding.update({ where: { id: current.id }, data: { status: "COMPLETED", completedAt: new Date(), currentStep: "COMPLETE" } });
    return this.toSafeResponse(updated);
  }

  private toSafeResponse(value: any) {
    return {
      id: value.id,
      tenantId: value.tenantId,
      status: value.status,
      currentStep: value.currentStep,
      industry: value.industry,
      modules: Array.isArray(value.modules) ? value.modules : [],
      country: value.country,
      currency: value.currency,
      timezone: value.timezone,
      locale: value.locale,
      ownerUserId: value.ownerUserId,
      branchId: value.branchId,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
      completedAt: value.completedAt ? value.completedAt.toISOString() : null,
    };
  }
}
