import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";
import { hashPassword, validatePasswordStrength } from "@kwakopos2/auth";
import { ensureSuperAdminSecurityTables } from "../../apps/api/src/services/superAdminSecurityService.js";

const email = String(process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.SUPER_ADMIN_INITIAL_PASSWORD || "");
if (!email) {
  throw new Error("SUPER_ADMIN_EMAIL must be supplied through deployment secret/configuration; it must never be committed or hardcoded.");
}

if (!password) {
  throw new Error("SUPER_ADMIN_INITIAL_PASSWORD must be supplied through deployment secret configuration; it must never be committed or hardcoded.");
}

const strength = validatePasswordStrength(password);
if (!strength.valid) {
  throw new Error(`SUPER_ADMIN_INITIAL_PASSWORD policy failure: ${strength.reason}`);
}

async function main(): Promise<void> {
  await ensureSuperAdminSecurityTables();
  const existing = await prisma.user.findFirst({
    where: { email },
    include: { role: true },
  });

  if (existing) {
    // Repair platform security record if missing, without modifying password
    const security = await prisma.$queryRawUnsafe<{ user_id: string }[]>(
      `SELECT user_id FROM platform_super_admin_security WHERE user_id = $1`,
      existing.id
    );
    if (!security[0]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO platform_super_admin_security(user_id, bootstrap_pending, must_change_password, mfa_required, mfa_enrolled) VALUES ($1, FALSE, FALSE, TRUE, FALSE) ON CONFLICT DO NOTHING`,
        existing.id
      );
    }

    console.log(
      JSON.stringify({
        status: "SUPER_ADMIN_ALREADY_EXISTS",
        message: "Super Admin account already exists. Existing credentials were NOT overwritten. Use 'npm run superadmin:rotate' to rotate credentials.",
        userId: existing.id,
        email,
      })
    );
    return;
  }

  const passwordHash = await hashPassword(password);
  const tenantSlug = "kwakoko-platform";

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.upsert({
      where: { slug: tenantSlug },
      update: { name: "Kwakoko Platform" },
      create: { name: "Kwakoko Platform", slug: tenantSlug, status: "ACTIVE" },
    });

    const branch = await tx.branch.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: "HQ" } },
      update: { name: "Kwakoko Headquarters", isMain: true },
      create: { tenantId: tenant.id, name: "Kwakoko Headquarters", code: "HQ", isMain: true },
    });

    const legacyRole = await tx.role.findUnique({
      where: { tenantId_name: { tenantId: tenant.id, name: "SUPER_ADMIN" } },
    });
    if (legacyRole) {
      await tx.role.update({
        where: { id: legacyRole.id },
        data: { name: "PLATFORM_SUPER_ADMIN", permissions: ["platform:control"], isSystemRole: true },
      });
    }

    const role = await tx.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "PLATFORM_SUPER_ADMIN" } },
      update: { permissions: ["platform:control"], isSystemRole: true },
      create: { tenantId: tenant.id, name: "PLATFORM_SUPER_ADMIN", permissions: ["platform:control"], isSystemRole: true },
    });

    const user = await tx.user.create({
      data: {
        id: randomUUID(),
        tenantId: tenant.id,
        branchId: branch.id,
        email,
        passwordHash,
        name: "Kwakoko Super Admin",
        roleId: role.id,
        status: "ACTIVE",
      },
    });

    await tx.$executeRawUnsafe(
      `INSERT INTO platform_super_admin_security(user_id, bootstrap_pending, must_change_password, mfa_required, mfa_enrolled) VALUES ($1, TRUE, TRUE, TRUE, FALSE) ON CONFLICT (user_id) DO NOTHING`,
      user.id
    );

    try {
      await tx.auditEvent.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          userId: user.id,
          deviceId: "cli-bootstrap",
          action: "SUPER_ADMIN_BOOTSTRAPPED",
          entityType: "SUPER_ADMIN_SECURITY",
          entityId: user.id,
          metadata: {
            email,
            bootstrapPending: true,
            mustChangePassword: true,
            mfaRequired: true,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch {
      // audit table best-effort if running in early migration phase
    }

    return { tenantId: tenant.id, branchId: branch.id, userId: user.id };
  });

  console.log(JSON.stringify({ status: "created", email, ...result }));
}

main()
  .catch((error) => {
    console.error("SUPER_ADMIN_BOOTSTRAP_FAILED");
    console.error(error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
