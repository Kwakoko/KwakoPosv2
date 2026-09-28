import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@kwakopos2/auth";
import { prisma } from "@kwakopos2/database";
import { PrivilegedRbacMutationService } from "../../apps/api/src/services/rbacMutationService";

describe("RBAC audit transaction proof", () => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const actorUserId = randomUUID();
  const targetRoleId = randomUUID();
  const adminRoleId = randomUUID();
  let service: PrivilegedRbacMutationService;

  const actor = {
    tenantId,
    branchId,
    userId: actorUserId,
    roles: [],
    permissions: [],
    deviceId: "rbac-audit-proof-device",
  };

  beforeAll(async () => {
    service = new PrivilegedRbacMutationService(prisma);
    const passwordHash = await hashPassword("ProofPassword!123");

    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: "RBAC Audit Transaction Proof",
        slug: "rbac-audit-proof-" + tenantId.slice(0, 8),
        branches: {
          create: {
            id: branchId,
            name: "Proof Branch",
            code: "RBAP-" + branchId.slice(0, 6),
          },
        },
        roles: {
          create: [
            {
              id: adminRoleId,
              name: "RBAC Proof Admin",
              permissions: ["users.manage", "roles.manage"],
            },
            {
              id: targetRoleId,
              name: "RBAC Proof Cashier",
              permissions: ["sales.create"],
            },
          ],
        },
      },
    });

    await prisma.user.create({
      data: {
        id: actorUserId,
        tenantId,
        branchId,
        email: "rbac-proof-admin-" + tenantId.slice(0, 8) + "@example.com",
        passwordHash,
        name: "RBAC Proof Admin",
        roleId: adminRoleId,
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS audit_events_append_only ON "audit_events"');
    try {
      await prisma.auditEvent.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    } finally {
      await prisma.$executeRawUnsafe('CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_mutation()');
    }
  });

  it("proves audit_events rejects UPDATE and DELETE", async () => {
    const audit = await prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId,
        userId: actorUserId,
        deviceId: "append-only-proof",
        action: "APPEND_ONLY_PROOF",
        entityType: "Proof",
        entityId: randomUUID(),
        metadata: { proof: true },
      },
    });

    await expect(
      prisma.auditEvent.update({
        where: { id: audit.id },
        data: { action: "MUTATED" },
      }),
    ).rejects.toThrow("AUDIT_EVENTS_APPEND_ONLY");

    await expect(
      prisma.auditEvent.delete({ where: { id: audit.id } }),
    ).rejects.toThrow("AUDIT_EVENTS_APPEND_ONLY");

    expect(await prisma.auditEvent.findUnique({ where: { id: audit.id } })).not.toBeNull();
  });

  it("proves Role + AuditEvent commit atomically", async () => {
    const roleName = "RBAC Transaction Role " + randomUUID().slice(0, 8);
    const role = await service.createRole(actor, {
      name: roleName,
      description: "Atomic role/audit proof",
      permissions: ["sales.create"],
    });

    const audit = await prisma.auditEvent.findFirst({
      where: {
        tenantId,
        action: "ROLE_CREATED",
        entityType: "Role",
        entityId: role.id,
      },
    });

    expect(role.tenantId).toBe(tenantId);
    expect(audit?.entityId).toBe(role.id);
    expect((audit?.metadata as any)?.name).toBe(role.name);
  });

  it("proves User -> Role -> AuditEvent commits atomically", async () => {
    const email = "rbac-user-commit-" + randomUUID().slice(0, 8) + "@example.com";

    const user = await service.createUser(actor, {
      firstName: "Transactional",
      lastName: "User",
      email,
      password: "UserPassword!123",
      roleId: targetRoleId,
      branchId,
    });

    const persisted = await prisma.user.findUnique({
      where: { id: user.id },
      include: { role: true },
    });
    const audit = await prisma.auditEvent.findFirst({
      where: {
        tenantId,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
      },
    });

    expect(persisted?.roleId).toBe(targetRoleId);
    expect(persisted?.role?.id).toBe(targetRoleId);
    expect((audit?.metadata as any)?.roleId).toBe(targetRoleId);
    expect(audit?.userId).toBe(actorUserId);
    expect(audit?.entityId).toBe(user.id);
  });

  it("proves User creation rolls back when its AuditEvent cannot commit", async () => {
    const email = "rbac-tx-rollback@example.com";

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_abort_user_created_audit()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.action = 'USER_CREATED'
           AND COALESCE(NEW.metadata->>'email', '') = 'rbac-tx-rollback@example.com' THEN
          RAISE EXCEPTION 'RBAC_AUDIT_ROLLBACK_PROOF';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_abort_user_created_audit ON "audit_events"');
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_abort_user_created_audit
      BEFORE INSERT ON "audit_events"
      FOR EACH ROW
      EXECUTE FUNCTION test_abort_user_created_audit()
    `);

    try {
      await expect(
        service.createUser(actor, {
          firstName: "Rollback",
          lastName: "Proof",
          email,
          password: "UserPassword!123",
          roleId: targetRoleId,
          branchId,
        }),
      ).rejects.toThrow("RBAC_AUDIT_ROLLBACK_PROOF");

      expect(await prisma.user.findFirst({ where: { tenantId, email } })).toBeNull();

      const audit = await prisma.auditEvent.findFirst({
        where: {
          tenantId,
          action: "USER_CREATED",
          entityType: "User",
          metadata: { path: ["email"], equals: email },
        } as any,
      });
      expect(audit).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_abort_user_created_audit ON "audit_events"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_abort_user_created_audit()');
    }
  });
});
