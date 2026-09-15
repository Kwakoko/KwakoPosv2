import { prisma } from "@kwakopos2/database";
import { hashPassword } from "@kwakopos2/auth";

export const SECURITY_TEST_USER = {
  email: "security.tester@kwakopos.net",
  password: "KwakoSecure2026!#",
};

export async function ensureSecurityTestUser(retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const existing = await prisma.user.findFirst({ where: { email: SECURITY_TEST_USER.email } });
      if (existing) {
        console.log(`Security test user already exists: ${existing.id}`);
        return;
      }
      break;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Security Certification Tenant",
        slug: "security-cert-tenant",
        status: "ACTIVE",
      },
    });
  }
  let branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        name: "Main Branch",
        code: "MAIN-01",
        tenantId: tenant.id,
        isMain: true,
      },
    });
  }
  let role = await prisma.role.findFirst({ where: { tenantId: tenant.id, name: "ADMIN" } });
  if (!role) {
    role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: "ADMIN",
        permissions: ["*"],
      },
    });
  }
  const passwordHash = await hashPassword(SECURITY_TEST_USER.password);
  const user = await prisma.user.create({
    data: {
      email: SECURITY_TEST_USER.email,
      name: "Security Test User",
      passwordHash,
      tenantId: tenant.id,
      branchId: branch.id,
      roleId: role.id,
      status: "ACTIVE",
    },
  });
  console.log(`Created security test user: ${user.id}`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("seed-security-user.ts")) {
  ensureSecurityTestUser()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
