import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // sync_conflict_record is managed via raw SQL (not a Prisma model).
  const result = await prisma.$executeRaw`
    UPDATE sync_conflict_record
    SET
      status       = 'RESOLVED',
      resolved_at  = NOW()
    WHERE tenant_id = '33b96a4b-8b7e-4066-b858-92b0ee0ee62c'
      AND status   = 'OPEN'
  `;
  console.log(`✅ Resolved ${result} open sync conflicts.`);

  const remaining = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM sync_conflict_record
    WHERE tenant_id = '33b96a4b-8b7e-4066-b858-92b0ee0ee62c'
      AND status = 'OPEN'
  `;
  console.log(`Remaining OPEN conflicts: ${remaining[0].count}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
