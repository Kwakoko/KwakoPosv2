import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const LOCK_ID = "SALES-PRODUCTION-LOCK-V1-2026-10-07";
const REQUIRED_SUBITEMS = ["Sales Dashboard","POS","New Sale","Cart","Product selection","Customer selection","Discounts","Taxes","Payments","Payment channels","Receipts","Refunds","Voids/cancellations","Sales history","Sales detail","Recent orders","Sales reports","Sales sync/outbox","Sales ledger/audit trail"];

const LOCKED_BLOBS: Record<string,string> = {
  "apps/web/src/pages/PosPage.tsx": "631923c2bc23a557397f4cad7aab2b1dbbdab0a6",
  "apps/api/src/server.ts": "bac9bcb82edc4c8dab7ca87f3ee09494ba4490c6",
  "packages/contracts/src/index.ts": "a795b7770d8c2ea0fc43ae2edc128b7d5f1d2c46",
  "packages/database/src/atomicCommercialFinance.ts": "c1f93f0b85c22d66f3c5192d548504c756c305c2",
  "packages/database/src/prismaProductionRepositories.ts": "eb2269ba2e049805f0be12595ee93a949f0c3668",
  "packages/sync/src/worldStandardPrismaSyncEngine.ts": "9523f5e75ee52b3275a151a64c2375cd06f9a257",
  "apps/web/src/indexedDb.ts": "a4999e06159102a5c6de337a91c6cab49ab06c56",
  "apps/web/src/clientSyncEngine.ts": "1fb00628dddab8ad0c43faaf2fa735844571f78f"
};

const MARKERS: Array<[string,string,string[]]> = [
  ["pos-surface","apps/web/src/pages/PosPage.tsx",["handleCompleteSale","handleInitiateCheckout","selectedCustomerId","executeVoidSale","Void Completed Sale","Sales History","Returns"]],
  ["pos-tax","apps/web/src/pages/PosPage.tsx",["taxInclusivePricing","selectedTaxRate","cartGrandTotal"]],
  ["pos-offline","apps/web/src/pages/PosPage.tsx",["executeAtomicMutation","outboxItems","stockLedger","SALE-STOCK-"]],
  ["history-authority","apps/web/src/pages/PosPage.tsx",["/api/v1/pos/sales","isOnline"]],
  ["sale-contract","packages/contracts/src/index.ts",["CreatePosSaleRequestSchema","occurredAt","isBackdated","CreateSaleReturnRequestSchema"]],
  ["sale-authority","packages/database/src/atomicCommercialFinance.ts",["async createSale","voidSale(","SALE_CREATED","SALE_VOIDED","jrn-sale-void","sync_change_journal"]],
  ["return-authority","packages/database/src/prismaProductionRepositories.ts",["async createSaleReturn","RETURN_QUANTITY_EXCEEDS_REMAINING","SALE_RETURNED","mapReturnToJournal"]],
  ["api-rbac","apps/api/src/server.ts",["assertSalesAuthority","permissions.has(\"SALE_VIEW\")","permissions.has(\"SALE_CREATE\")","permissions.has(\"SALE_VOID\")","permissions.has(\"SALE_RETURN\")","DISCOUNT_MANAGE"]],
  ["sync-authority","packages/sync/src/worldStandardPrismaSyncEngine.ts",["entityType === \"Sale\"","referenceType || \"\").toUpperCase() === \"SALE\"","provisional"]],
  ["indexeddb-reconcile","apps/web/src/indexedDb.ts",["provisional client StockLedger","SERVER_CONFIRMED","entityType === \"Sale\""]],
  ["receipt-sync-client","apps/web/src/clientSyncEngine.ts",["case \"PurchaseReceipt\": return \"receipts\";","case \"Receipt\": return \"receipts\";","applyRevisionedChanges"]]
];

function read(p:string){ const f=path.resolve(process.cwd(),p); if(!fs.existsSync(f)) throw new Error("missing file: "+p); return fs.readFileSync(f,"utf8"); }
function blobSha(content:string){ const b=Buffer.from(content); const h=createHash("sha1"); h.update(Buffer.from("blob "+b.length+"\0")); h.update(b); return h.digest("hex"); }

const failures:string[]=[];
for(const [p,expected] of Object.entries(LOCKED_BLOBS)){
  try{ const actual=blobSha(read(p)); if(actual!==expected) failures.push(`LOCK_DRIFT: ${p} expected ${expected} got ${actual}`); }
  catch(e){ failures.push(`LOCK_READ_FAILURE: ${p}: ${String(e)}`); }
}
for(const [name,p,needles] of MARKERS){
  try{ const source=read(p); for(const needle of needles) if(!source.includes(needle)) failures.push(`CONTRACT_FAILURE: ${name} missing marker: ${needle}`); }
  catch(e){ failures.push(`CONTRACT_READ_FAILURE: ${name}: ${String(e)}`); }
}
const result={lockId:LOCK_ID,verdict:failures.length?"FAIL":"PASS",subitems:REQUIRED_SUBITEMS,lockedFiles:Object.keys(LOCKED_BLOBS).length,failures,generatedAt:new Date().toISOString()};
console.log(JSON.stringify(result,null,2));
if(failures.length) process.exit(1);
console.log("SALES PRODUCTION LOCK: PASS — "+LOCK_ID);
