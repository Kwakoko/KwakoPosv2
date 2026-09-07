import { prisma } from "@kwakopos2/database";
import { hashPassword, validatePasswordStrength } from "@kwakopos2/auth";

const email = String(process.env.SUPER_ADMIN_EMAIL || "admin@kwakoko.co.tz").trim().toLowerCase();
const newPassword = String(process.env.SUPER_ADMIN_NEW_PASSWORD || "");

if (!newPassword) {
  console.error("ERROR: SUPER_ADMIN_NEW_PASSWORD environment variable is required to rotate Super Admin credentials.");
  process.exit(1);
}

const strength = validatePasswordStrength(newPassword);
if (!strength.valid) {
  console.error(`ERROR: Password complexity requirements not met: ${strength.reason}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email },
    include: { role: true },
  });

  if (!user) {
    console.error(`ERROR: Super Admin account '${email}' not found.`);
    process.exit(1);
  }

  const roleName = String(user.role?.name || "").toUpperCase();
  if (roleName !== "SUPER_ADMIN" && roleName !== "PLATFORM_SUPER_ADMIN") {
    console.error(`ERROR: User '${email}' is not a platform SUPER_ADMIN.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(newPassword);
  let revokedCount = 0;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await tx.$executeRawUnsafe(
      `UPDATE platform_super_admin_security SET must_change_password = FALSE, failed_login_count = 0, locked_until = NULL, updated_at = NOW() WHERE user_id = $1`,
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
          deviceId: "cli-rotation",
          action: "SUPER_ADMIN_PASSWORD_ROTATED",
          entityType: "SUPER_ADMIN_SECURITY",
          entityId: user.id,
          metadata: {
            email,
            sessionsRevoked: revokedCount,
            actor: "CLI_ADMIN_ROTATION",
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch {
      // best-effort audit
    }
  });

  console.log(
    JSON.stringify({
      status: "SUCCESS",
      action: "SUPER_ADMIN_PASSWORD_ROTATED",
      email: user.email,
      userId: user.id,
      sessionsRevoked: revokedCount,
      timestamp: new Date().toISOString(),
    })
  );
}

main()
  .catch((err) => {
    console.error("ROTATION_FAILED:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });