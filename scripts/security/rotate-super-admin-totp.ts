import { prisma } from "@kwakopos2/database";
import { rotateSuperAdminTotp } from "../../apps/api/src/services/superAdminSecurityService.js";

const email = String(process.env.SUPER_ADMIN_EMAIL || "admin@kwakoko.co.tz").trim().toLowerCase();
const newTotpSecret = String(process.env.SUPER_ADMIN_NEW_TOTP_SECRET || "").trim().toUpperCase().replace(/\s+/g, "");
const verificationCode = String(process.env.SUPER_ADMIN_NEW_TOTP_CODE || "").trim();

if (!newTotpSecret || !verificationCode) {
  throw new Error("SUPER_ADMIN_NEW_TOTP_SECRET and SUPER_ADMIN_NEW_TOTP_CODE must be supplied through deployment secret configuration; credentials are never stored in source control.");
}

async function main(): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email }, include: { role: true } });
  if (!user) throw new Error(`Super Admin account '${email}' not found.`);
  const roleName = String(user.role?.name || "").toUpperCase();
  if (roleName !== "SUPER_ADMIN" && roleName !== "PLATFORM_SUPER_ADMIN") throw new Error(`User '${email}' is not a platform SUPER_ADMIN.`);

  await rotateSuperAdminTotp(user.id, newTotpSecret, verificationCode);
  console.log(JSON.stringify({ status: "SUCCESS", action: "SUPER_ADMIN_MFA_ROTATED", email: user.email, userId: user.id, timestamp: new Date().toISOString() }));
}

main().catch((error) => { console.error("TOTP_ROTATION_FAILED:", error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });