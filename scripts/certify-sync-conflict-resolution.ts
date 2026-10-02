import { randomUUID } from "node:crypto";
import { prisma, PrismaProductRepository, PrismaStockRepository } from "@kwakopos2/database";
import { WorldStandardPrismaSyncEngine } from "@kwakopos2/sync";

const tenantId = randomUUID();
const branchId = randomUUID();
const ctx = { tenantId, branchId, userId: randomUUID(), roles: ["ADMIN"], permissions: ["*"] };
const engine = new WorldStandardPrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());

async function assertConflictStatus(id: string, status: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    "SELECT status, resolved_at FROM sync_conflict_record WHERE id = $1 AND tenant_id = $2 AND branch_id = $3",
    id, tenantId, branchId,
  );
  if (rows[0]?.status !== status || !rows[0]?.resolved_at) throw new Error("CONFLICT_STATUS_ASSERTION_FAILED:" + id);
}

async function main() {
  await prisma.tenant.create({ data: { id: tenantId, name: "Conflict Resolution Certification", slug: "crc-" + tenantId.slice(0, 12) } });
  await prisma.branch.create({ data: { id: branchId, tenantId, name: "Main", code: "CRC-" + branchId.slice(0, 8) } });

  const productId = randomUUID();
  const categoryId = randomUUID();
  const brandId = randomUUID();
  await prisma.product.create({ data: { id: productId, tenantId, branchId, name: "Server Product", sku: "CRC-P-" + productId.slice(0, 8), category: "General", buyingPrice: 10, sellingPrice: 20 } });
  await prisma.category.create({ data: { id: categoryId, tenantId, branchId, name: "Server Category", code: "CRC-C-" + categoryId.slice(0, 8) } });
  await prisma.brand.create({ data: { id: brandId, tenantId, branchId, name: "Server Brand", code: "CRC-B-" + brandId.slice(0, 8) } });

  const productConflict = "conflict:" + randomUUID();
  await engine.registerConflict(ctx, { conflictId: productConflict, operationId: randomUUID(), entityType: "Product", entityId: productId, localPayload: { name: "Local Product" }, remotePayload: { name: "Server Product" }, deviceId: "DEVICE-A" });
  await engine.registerConflict(ctx, { conflictId: productConflict, operationId: randomUUID(), entityType: "Product", entityId: productId, localPayload: { name: "Local Product" }, remotePayload: { name: "Server Product v2" }, deviceId: "DEVICE-A" });
  const detectCount = await prisma.auditEvent.count({ where: { tenantId, branchId, action: "SYNC_CONFLICT_DETECTED", entityType: "Product" } });
  if (detectCount !== 1) throw new Error("CONFLICT_DETECTION_AUDIT_DEDUP_FAILED");
  await engine.resolveConflict(ctx, productConflict, "ACCEPT_LOCAL");
  if ((await prisma.product.findUnique({ where: { id: productId } }))?.name !== "Local Product") throw new Error("PRODUCT_RESOLUTION_FAILED");
  await assertConflictStatus(productConflict, "ACCEPT_LOCAL");

  const categoryConflict = "conflict:" + randomUUID();
  await engine.registerConflict(ctx, { conflictId: categoryConflict, operationId: randomUUID(), entityType: "Category", entityId: categoryId, localPayload: { name: "Local Category", code: "LOCAL-C" }, remotePayload: { name: "Server Category" } });
  await engine.resolveConflict(ctx, categoryConflict, "ACCEPT_LOCAL");
  if ((await prisma.category.findUnique({ where: { id: categoryId } }))?.name !== "Local Category") throw new Error("CATEGORY_RESOLUTION_FAILED");
  await assertConflictStatus(categoryConflict, "ACCEPT_LOCAL");

  const brandConflict = "conflict:" + randomUUID();
  await engine.registerConflict(ctx, { conflictId: brandConflict, operationId: randomUUID(), entityType: "Brand", entityId: brandId, localPayload: { name: "Local Brand" }, remotePayload: { name: "Server Brand" } });
  await engine.resolveConflict(ctx, brandConflict, "MERGE", { name: "Merged Brand", code: "MERGED-B" });
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (brand?.name !== "Merged Brand" || brand.code !== "MERGED-B") throw new Error("BRAND_MERGE_FAILED");
  await assertConflictStatus(brandConflict, "MERGE");

  const oversellConflict = "conflict:oversell:" + randomUUID();
  await engine.registerConflict(ctx, { conflictId: oversellConflict, operationId: randomUUID(), entityType: "SaleOversell", entityId: randomUUID(), operationType: "CREATE", localPayload: { shortfall: 2 }, remotePayload: { currentInventory: 3 } });
  await engine.resolveConflict(ctx, oversellConflict, "ACCEPT_SERVER");
  await assertConflictStatus(oversellConflict, "ACCEPT_SERVER");

  const conversionConflict = "conflict:conversion:" + randomUUID();
  await engine.registerConflict(ctx, { conflictId: conversionConflict, operationId: randomUUID(), entityType: "UnitConversionConflict", entityId: randomUUID(), operationType: "CREATE", localPayload: { parentUnitsDeducted: 5 }, remotePayload: { availableParentStock: 3 } });
  await engine.resolveConflict(ctx, conversionConflict, "ACCEPT_SERVER");
  await assertConflictStatus(conversionConflict, "ACCEPT_SERVER");

  let isolated = false;
  try {
    await engine.resolveConflict({ ...ctx, tenantId: randomUUID(), branchId: randomUUID() }, productConflict, "ACCEPT_SERVER");
  } catch (e) {
    isolated = String(e).includes("SYNC_CONFLICT_NOT_FOUND");
  }
  if (!isolated) throw new Error("TENANT_CONFLICT_ISOLATION_FAILED");

  const auditDetected = await prisma.auditEvent.count({ where: { tenantId, branchId, action: "SYNC_CONFLICT_DETECTED" } });
  const auditResolved = await prisma.auditEvent.count({ where: { tenantId, branchId, action: "SYNC_CONFLICT_RESOLVED" } });
  const journalRows = await prisma.$queryRawUnsafe<any[]>("SELECT source FROM sync_change_journal WHERE tenant_id=$1 AND branch_id=$2", tenantId, branchId);
  if (auditDetected !== 5 || auditResolved !== 5) throw new Error("PERSISTENT_CONFLICT_AUDIT_INCOMPLETE");
  if (journalRows.filter((r) => r.source === "conflict-resolution").length !== 3) throw new Error("CONFLICT_RESOLUTION_JOURNAL_INCOMPLETE");

  console.log(JSON.stringify({ status:"PASS", test:"postgresql-conflict-resolution-lifecycle", gates:{
    staleProductAcceptLocal:"PASS", categoryAcceptLocal:"PASS", brandMerge:"PASS",
    saleOversellAcknowledge:"PASS", unitConversionAcknowledge:"PASS",
    tenantBranchIsolation:"PASS", persistentAuditTrail:"PASS",
    resolutionJournal:"PASS", conflictRegistrationDedup:"PASS"
  }, auditDetected, auditResolved, resolutionJournalRows: journalRows.filter((r)=>r.source==="conflict-resolution").length }, null, 2));
}

main().catch((e) => { console.error(JSON.stringify({ status:"FAIL", error:String(e?.stack||e) })); process.exitCode=1; }).finally(async()=>{
  try { await prisma.$executeRawUnsafe("DELETE FROM sync_change_journal WHERE tenant_id=$1", tenantId); await prisma.$executeRawUnsafe("DELETE FROM sync_conflict_record WHERE tenant_id=$1", tenantId); await prisma.tenant.delete({ where:{id:tenantId} }); } catch {}
  await prisma.$disconnect();
});