import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../../apps/api/src/server.js";
import { hashPassword } from "@kwakopos2/auth";
import { prisma } from "@kwakopos2/database";
import { globalLegalGovernanceService } from "../../apps/api/src/services/legalGovernanceService.js";
import type { FastifyInstance } from "fastify";

// Release-loop regression coverage: every DeviceSession fixture must include branchId and tokenFamilyId.
describe("Privileged RBAC PostgreSQL API", () => {
  let app: FastifyInstance;
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const ownerRoleId = randomUUID();
  const ownerUserId = randomUUID();
  const ownerEmail = `p0-owner-${randomUUID()}@kwakoko.test`;
  const tenantHeaders = {
    "x-tenant-id": tenantId,
    "x-branch-id": branchId,
    "x-user-id": ownerUserId,
  };

  beforeAll(async () => {
    await prisma.tenant.create({
      data: { id: tenantId, name: "P0 RBAC Test Tenant", slug: `p0-rbac-${tenantId.slice(0, 8)}`, status: "ACTIVE" },
    });
    await prisma.branch.create({
      data: { id: branchId, tenantId, name: "Main", code: "MAIN", isMain: true },
    });
    await prisma.role.create({
      data: {
        id: ownerRoleId,
        tenantId,
        name: "P0 RBAC OWNER",
        permissions: ["users.manage", "roles.manage"],
      },
    });
    await prisma.user.create({
      data: {
        id: ownerUserId,
        tenantId,
        branchId,
        email: ownerEmail,
        passwordHash: await hashPassword("P0-RBAC-owner-password"),
        name: "P0 RBAC Owner",
        roleId: ownerRoleId,
        status: "ACTIVE",
      },
    });

    const pendingLegal = globalLegalGovernanceService.checkUserAcceptanceStatus(ownerUserId, tenantId);
    for (const document of pendingLegal.requiredDocuments) {
      globalLegalGovernanceService.recordAcceptance(ownerUserId, tenantId, {
        documentId: document.documentId,
        documentVersion: document.requiredVersion,
        language: "en",
        acceptanceMethod: "CLICK_WRAP",
        sessionDeviceRef: "p0-rbac-test",
      });
    }

    app = buildServer({ productionPersistence: true });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    // audit_events is append-only by design; CI uses an isolated PostgreSQL database per run,
    // so teardown intentionally leaves immutable audit evidence intact rather than violating the invariant.
  });
  it("lists PostgreSQL roles and creates a custom role with an audit event", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/roles",
      headers: tenantHeaders,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.some((role: any) => role.id === ownerRoleId)).toBe(true);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/roles",
      headers: tenantHeaders,
      payload: { name: "RBAC Cashier", permissions: ["pos.sell"] },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.name).toBe("RBAC Cashier");
    expect(created.json().data.id).toBeTruthy();

    const roleRow = await prisma.role.findUnique({ where: { id: created.json().data.id } });
    expect(roleRow?.tenantId).toBe(tenantId);
    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId, entityType: "Role", entityId: created.json().data.id, action: "ROLE_CREATED" },
    });
    expect(audit).not.toBeNull();
  });

  it("creates and deactivates users through PostgreSQL RBAC authority", async () => {
    const roles = await app.inject({
      method: "GET",
      url: "/api/v1/roles",
      headers: tenantHeaders,
    });
    const customRole = roles.json().data.find((role: any) => role.name === "RBAC Cashier");
    expect(customRole).toBeTruthy();

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: tenantHeaders,
      payload: {
        firstName: "Persisted",
        lastName: "Cashier",
        email: `p0-cashier-${randomUUID()}@kwakoko.test`,
        phone: "+255700123456",
        password: "P0-RBAC-user-password",
        roleId: customRole.id,
        branchId,
        createEmployeeProfile: true,
      },
    });
    expect(created.statusCode).toBe(201);
    const userId = created.json().data.id;

    const userRow = await prisma.user.findUnique({ where: { id: userId } });
    const employeeRow = await prisma.employee.findFirst({ where: { tenantId, userId } });
    expect(employeeRow).not.toBeNull();
    expect(employeeRow?.branchId).toBe(branchId);
    expect(employeeRow?.userId).toBe(userId);
    const employeeAudit = await prisma.auditEvent.findFirst({
      where: { tenantId, entityType: "Employee", entityId: employeeRow!.id, action: "EMPLOYEE_CREATED" },
    });
    expect(employeeAudit).not.toBeNull();
    expect(userRow?.tenantId).toBe(tenantId);
    expect(userRow?.roleId).toBe(customRole.id);
    expect(userRow?.phone).toBe("+255700123456");

    const secondBranchId = randomUUID();
    await prisma.branch.create({
      data: { id: secondBranchId, tenantId, name: "Branch 2", code: `B2-${secondBranchId.slice(0, 6)}` },
    });
    const moved = await app.inject({
      method: "PUT",
      url: `/api/v1/users/${userId}`,
      headers: tenantHeaders,
      payload: { branchId: secondBranchId },
    });
    expect(moved.statusCode).toBe(200);
    const movedEmployee = await prisma.employee.findFirst({ where: { tenantId, userId } });
    expect(movedEmployee?.branchId).toBe(secondBranchId);
    const transfer = await prisma.employmentRecord.findFirst({
      where: { tenantId, employeeId: employeeRow!.id, changeType: "TRANSFER", branchId: secondBranchId },
    });
    expect(transfer).not.toBeNull();

    await prisma.deviceSession.create({
      data: {
        id: randomUUID(),
        tenantId,
        userId,
        branchId,
        deviceId: "p0-rbac-device",
        tokenFamilyId: randomUUID(),
        refreshTokenHash: "p0-rbac-refresh-hash",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${userId}`,
      headers: tenantHeaders,
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().data.status).toBe("INACTIVE");

    const inactive = await prisma.user.findUnique({ where: { id: userId } });
    expect(inactive?.status).toBe("INACTIVE");
    const session = await prisma.deviceSession.findFirst({ where: { userId } });
    expect(session?.revokedAt).not.toBeNull();

    const audits = await prisma.auditEvent.findMany({
      where: { tenantId, entityType: "User", entityId: userId },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((row) => row.action)).toEqual(expect.arrayContaining(["USER_CREATED", "USER_UPDATED"]));

    const ordinarySyncRows = await prisma.syncOperation.findMany({
      where: { tenantId, entityType: { in: ["User", "Role"] } },
    });
    expect(ordinarySyncRows).toHaveLength(0);
  });
});