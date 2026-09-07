import { prisma } from "@kwakopos2/database";
import { hashPassword, validatePasswordStrength } from "@kwakopos2/auth";

const email = String(process.env.SUPER_ADMIN_EMAIL || "admin@kwakoko.co.tz").trim().toLowerCase();
const recoveryKey = String(process.env.SUPER_ADMIN_RECOVERY_KEY || "");
const newPassword = String(process.env.SUPER_ADMIN_NEW_PASSWORD || "");

if (!recoveryKey) {
  console.error("ERROR: SUPER_ADMIN_RECOVERY_KEY is required to authorize platform recovery.");
  process.exit(1);
}

if (!newPassword) {
  console.error("ERROR: SUPER_ADMIN_NEW_PASSWORD is required to set new temporary recovery credentials.");
  process.exit(1);
}

const strength = validatePasswordStrength(newPassword);
if (!strength.valid) {
  console.error(`ERROR: Password complexity requirements not met: ${strength.reason}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const expectedKey = process.env.PLATFORM_RECOVERY_AUTHORITY_KEY || process.env.SUPER_ADMIN_RECOVERY_KEY;
  if (recoveryKey !== expectedKey) {
    console.error("ERROR: RECOVERY_AUTHORIZATION_FAILED: Invalid recovery key.");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email },
    include: { role: true },
  });

  if (!user) {
    console.error(`ERROR: Target Super Admin '${email}' not found.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(newPassword);
  let revokedCount = 0;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Enforce must_change_password = true and mfa_enrolled = false so the operator is forced to reset credentials & re-enroll MFA
    await tx.$executeRawUnsafe(
      `UPDATE platform_super_admin_security SET bootstrap_pending = TRUE, must_change_password = TRUE, mfa_enrolled = FALSE, failed_login_count = 0, locked_until = NULL, updated_at = NOW() WHERE user_id = $1`,
      user.id
    );

    const res = await tx.deviceSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    revokedCount = res.count;

    try {
      await tx.auditEvent.create({
        data: {
          tenantId: user.tenantId,
          branchId: user.branchId,
          userId: user.id,
          deviceId: "cli-recovery",
          action: "SUPER_ADMIN_RECOVERY",
          entityType: "SUPER_ADMIN_SECURITY",
          entityId: user.id,
          metadata: {
            email,
            sessionsRevoked: revokedCount,
            actor: "PLATFORM_RECOVERY_AUTHORITY",
            mustChangePassword: true,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch {
      // best effort
    }
  });

  console.log(
    JSON.stringify({
      status: "SUCCESS",
      action: "SUPER_ADMIN_RECOVERY",
      email: user.email,
      userId: user.id,
      sessionsRevoked: revokedCount,
      mustChangePassword: true,
      timestamp: new Date().toISOString(),
    })
  );
}

main()
  .catch((err) => {
    console.error("RECOVERY_FAILED:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });