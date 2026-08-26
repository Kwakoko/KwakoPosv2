import fs from "node:fs";
import path from "node:path";

const file = path.resolve("apps/api/src/server.ts");
let source = fs.readFileSync(file, "utf8");

if (source.includes("const financeRepository: any = productionPersistence ? new PrismaFinanceRepository()") && source.includes("await atomicCommercialFinance.createSale")) {
  console.log("Production finance hardening already present; no changes needed.");
  process.exit(0);
}

source = source.replace("  PrismaStockRepository,\n  globalInMemoryStore,", "  PrismaStockRepository,\n  PrismaFinanceRepository,\n  PrismaAtomicCommercialFinanceService,\n  globalInMemoryStore,");
source = source.replace("  const syncEngine = productionPersistence\n    ? new PrismaSyncEngine(productRepo as PrismaProductRepository, stockRepo as PrismaStockRepository)\n    : new SyncEngine(productRepo as ScopedProductRepository, stockRepo as ScopedStockRepository, globalCommercialRepository, globalInMemoryStore);", "  const syncEngine = productionPersistence\n    ? new PrismaSyncEngine(productRepo as PrismaProductRepository, stockRepo as PrismaStockRepository)\n    : new SyncEngine(productRepo as ScopedProductRepository, stockRepo as ScopedStockRepository, globalCommercialRepository, globalInMemoryStore);\n\n  const financeRepository: any = productionPersistence ? new PrismaFinanceRepository() : globalFinanceRepository;\n  const atomicCommercialFinance = productionPersistence ? new PrismaAtomicCommercialFinanceService() : null;");
const financeStart = source.indexOf("  // ==========================================\n  // PHASE 2: Finance & Operational Control REST Routes");
const financeEnd = source.indexOf("  // ==========================================\n  // Observability & Real-User Monitoring Routes", financeStart);
if (financeStart < 0 || financeEnd < 0) throw new Error("FINANCE_PATCH_TARGET_NOT_FOUND");
let financeBlock = source.slice(financeStart, financeEnd).replaceAll("globalFinanceRepository.", "financeRepository.");
financeBlock = financeBlock.replace(/(?<!await )financeRepository\.(\w+\([^;\n]+\))/g, "await financeRepository.$1");
source = source.slice(0, financeStart) + financeBlock + source.slice(financeEnd);
source = source.replace("    const result = globalCommercialRepository.createPurchaseReceipt(req.tenantContext!, validated);\n    return reply.status(201).send({ success: true, data: result });", "    const result = atomicCommercialFinance\n      ? await atomicCommercialFinance.createPurchaseReceipt(req.tenantContext!, validated)\n      : globalCommercialRepository.createPurchaseReceipt(req.tenantContext!, validated);\n    return reply.status(201).send({ success: true, data: result });");
source = source.replace("    const result = globalCommercialRepository.createPosSale(req.tenantContext!, validated);\n    return reply.status(201).send({ success: true, data: result });", "    const result = atomicCommercialFinance\n      ? await atomicCommercialFinance.createSale(req.tenantContext!, validated)\n      : globalCommercialRepository.createPosSale(req.tenantContext!, validated);\n    return reply.status(201).send({ success: true, data: result });");
source = source.replace("    const expense = globalCommercialRepository.recordExpense(req.tenantContext!, validated);\n    return reply.status(201).send({ success: true, data: expense });", "    const expense = atomicCommercialFinance\n      ? await atomicCommercialFinance.recordExpense(req.tenantContext!, validated)\n      : globalCommercialRepository.recordExpense(req.tenantContext!, validated);\n    return reply.status(201).send({ success: true, data: expense });");
for (const required of ["new PrismaFinanceRepository()", "new PrismaAtomicCommercialFinanceService()", "await financeRepository.createJournalEntry", "await atomicCommercialFinance.createSale", "await atomicCommercialFinance.createPurchaseReceipt", "await atomicCommercialFinance.recordExpense"]) {
  if (!source.includes(required)) throw new Error(`FINANCE_PATCH_INCOMPLETE:${required}`);
}
fs.writeFileSync(file, source);
console.log("Production finance hardening applied to apps/api/src/server.ts");
