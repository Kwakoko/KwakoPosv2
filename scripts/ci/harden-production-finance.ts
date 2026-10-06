import fs from "node:fs";
import path from "node:path";

const serverPath = path.resolve(process.cwd(), "apps/api/src/server.ts");
if (!fs.existsSync(serverPath)) throw new Error("FINANCE_HARDENING_BLOCKED: canonical API server is missing.");
const source = fs.readFileSync(serverPath, "utf8");

const required = [
  "const financeRepository: any = productionPersistence ? new PrismaFinanceRepository()",
  "const atomicCommercialFinance = productionPersistence ? new PrismaAtomicCommercialFinanceService()",
  "await atomicCommercialFinance.createPurchaseReceipt",
  "await atomicCommercialFinance.createSale",
  "await atomicCommercialFinance.recordExpense",
];
const missing = required.filter((needle) => !source.includes(needle));
if (missing.length) throw new Error(`FINANCE_HARDENING_BLOCKED: ${missing.join(", ")}`);

console.log("Production finance hardening assertion: PASS");
