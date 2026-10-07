import fs from "node:fs";
import path from "node:path";

const LOCK_ID = "RECEIPT-PRODUCTION-LOCK-V1-2026-10-08";
const SUBITEMS = ["Receipt generation","Receipt storage","Receipt retrieval","Receipt reprint","Receipt sharing","Receipt numbering","Offline receipts","Receipt synchronization","Receipt audit","Printer integration"];
const MARKERS = [
  ["service","apps/api/src/services/receiptService.ts",["createReceipt","recordPrint","recordShare","getReceiptForPublicVerification"]],
  ["routes","apps/api/src/routes/receiptRoutes.ts",["/api/v2/receipts/:id/print/audit","/api/v2/receipts/:id/reprint","/api/v2/receipts/:id/share","Receipt share recorded"]],
  ["repository","packages/database/src/receiptRepositories.ts",["class PrismaReceiptRepository","pg_advisory_xact_lock","recordPrint","status: \"OPENED\"","auditLogs"]],
  ["client","apps/web/src/pages/ReceiptsPage.tsx",["db.receipts","db.syncOutbox","apiFetch","printReceiptToThermal","/print/audit","/share"]],
  ["printer","apps/web/src/services/receiptPrinterService.ts",["navigator.serial","buildEscPosPayload","getWriter"]],
  ["tests","tests/unit/receipt-production-lock.test.ts",["Receipt production lock","buildEscPosPayload","status: \"OPENED\""]],
  ["package","package.json",["certify:receipts-lock"]],
  ["ci",".github/workflows/ci.yml",["npm run certify:receipts-lock"]],
  ["candidate",".github/workflows/production-certification.yml",["npm run certify:receipts-lock"]],
  ["exact-main",".github/workflows/production-release-exact-main.yml",["npm run certify:receipts-lock"]],
];
function read(p:string){ const f=path.resolve(process.cwd(),p); if(!fs.existsSync(f)) throw new Error("MISSING_FILE:"+p); return fs.readFileSync(f,"utf8"); }
const failures:string[]=[];
for(const [name,file,needles] of MARKERS as Array<[string,string,string[]]>){ const source=read(file); for(const n of needles) if(!source.includes(n)) failures.push(name+" missing "+n); }
const page=read("apps/web/src/pages/ReceiptsPage.tsx");
const repo=read("packages/database/src/receiptRepositories.ts");
if(page.includes("Receipt Dispatched") || page.includes("successfully dispatched")) failures.push("share false-success text remains");
if(repo.includes("status: \"SENT\"")) failures.push("share status remains SENT");
if(page.includes("setReceipts(updated)") && page.includes("handleReprintSubmit")) failures.push("reprint still mutates local state directly");
const result={lockId:LOCK_ID,verdict:failures.length?"FAIL":"PASS",subitems:SUBITEMS,failures,generatedAt:new Date().toISOString()};
console.log(JSON.stringify(result,null,2));
if(failures.length) process.exit(1);
console.log("RECEIPT PRODUCTION LOCK: PASS — "+LOCK_ID);
