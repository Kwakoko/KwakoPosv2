import fs from "node:fs";
import path from "node:path";

function findRepoRoot(start: string): string {
  let current = path.resolve(start);
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "apps/api/src/server.ts"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("FINANCE_HARDENING_BLOCKED: repository root not found.");
}
const serverPath = path.join(findRepoRoot(process.cwd()), "apps/api/src/server.ts");
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
