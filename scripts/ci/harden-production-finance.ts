import fs from "node:fs";
import path from "node:path";

const serverPath = path.resolve(process.cwd(), "apps/api/src/server.ts");
const source = fs.readFileSync(serverPath, "utf8");

const required = [
  "new PrismaFinanceRepository()",
  "new PrismaAtomicCommercialFinanceService()",
  "atomicCommercialFinance.createSale",
  "atomicCommercialFinance.createPurchaseReceipt",
  "atomicCommercialFinance.recordExpense",
];

for (const marker of required) {
  if (!source.includes(marker)) {
    throw new Error(`PRODUCTION_FINANCE_GATE_FAILED:${marker}`);
  }
}

if (source.includes("globalFinanceRepository.createSale") || source.includes("globalFinanceRepository.createPurchaseReceipt")) {
  throw new Error("PRODUCTION_FINANCE_GATE_FAILED: legacy finance repository path remains");
}

console.log("Production finance architecture verified; source mutation is prohibited.");