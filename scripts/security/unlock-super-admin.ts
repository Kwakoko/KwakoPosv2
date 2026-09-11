import { prisma } from "../../packages/database/src/index.js";

async function main() {
  await prisma.$executeRawUnsafe("UPDATE platform_super_admin_security SET failed_login_count = 0, last_failed_at = NULL, locked_until = NULL");
  await prisma.$executeRawUnsafe("DELETE FROM auth_login_throttles");
  console.log("SUPER_ADMIN_LOCKOUT_CLEARED_SUCCESSFULLY");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
