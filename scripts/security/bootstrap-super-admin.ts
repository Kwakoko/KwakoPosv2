import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";
import { hashPassword } from "@kwakopos2/auth";

const email = String(process.env.SUPER_ADMIN_EMAIL || "admin@kwakoko.co.tz").trim().toLowerCase();
const password = String(process.env.SUPER_ADMIN_INITIAL_PASSWORD || "");

if (!password) throw new Error("SUPER_ADMIN_INITIAL_PASSWORD must be supplied through a secret-management mechanism; it must never be committed or hardcoded.");
if (password.length < 12) throw new Error("SUPER_ADMIN_INITIAL_PASSWORD must contain at least 12 characters.");
if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "production-certification" && process.env.ALLOW_SUPER_ADMIN_BOOTSTRAP !== "true") {
  throw new Error("Refusing Super Admin bootstrap outside a production-like environment without ALLOW_SUPER_ADMIN_BOOTSTRAP=true.");
}

async function main(): Promise<void> {
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    const security = await prisma.$queryRawUnsafe<{ user_id: string }[]>(`SELECT user_id FROM platform_super_admin_security WHERE user_id = $1`, existing.id);
    if (!security[0]) await prisma.$executeRawUnsafe(`INSERT INTO platform_super_admin_security(user_id) VALUES ($1) ON CONFLICT DO NOTHING`, existing.id);
    console.log(JSON.stringify({ status: "already_exists", userId: existing.id, email }));
    return;
  }

  const passwordHash = await hashPassword(password);
  const tenantSlug = "kwakoko-platform";
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.upsert({ where: { slug: tenantSlug }, update: { name: "Kwakoko Platform" }, create: { name: "Kwakoko Platform", slug: tenantSlug, status: "ACTIVE" } });
    const branch = await tx.branch.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "HQ" } }, update: { name: "Kwakoko Headquarters", isMain: true }, create: { tenantId: tenant.id, name: "Kwakoko Headquarters", code: "HQ", isMain: true } });
    const role = await tx.role.upsert({ where: { tenantId_name: { tenantId: tenant.id, name: "SUPER_ADMIN" } }, update: { permissions: ["*"] }, create: { tenantId: tenant.id, name: "SUPER_ADMIN", permissions: ["*"] } });
    const user = await tx.user.create({ data: { id: randomUUID(), tenantId: tenant.id, branchId: branch.id, email, passwordHash, name: "Kwakoko Super Admin", roleId: role.id, status: "ACTIVE" } });
    await tx.$executeRawUnsafe(`INSERT INTO platform_super_admin_security(user_id, bootstrap_pending, must_change_password, mfa_required, mfa_enrolled) VALUES ($1, TRUE, TRUE, TRUE, FALSE)`, user.id);
    return { tenantId: tenant.id, branchId: branch.id, userId: user.id };
  });

  console.log(JSON.stringify({ status: "created", email, ...result }));
}

main().catch((error) => {
  console.error("SUPER_ADMIN_BOOTSTRAP_FAILED");
  console.error(error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
