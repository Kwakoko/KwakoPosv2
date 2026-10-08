import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const LOCK_ID = "SALES-PRODUCTION-LOCK-V2-2026-10-08";
const REQUIRED_SUBITEMS = ["Sales Dashboard","POS","New Sale","Cart","Product selection","Customer selection","Discounts","Taxes","Payments","Payment channels","Receipts","Refunds","Voids/cancellations","Sales history","Sales detail","Recent orders","Sales reports","Sales sync/outbox","Sales ledger/audit trail","Product Bundles / Kits","Bundle definition","Bundle components","Component quantities","Bundle stock availability","Bundle sale","Component stock deduction","Bundle reverse/refund","Bundle reporting","Bundle ledger integrity","Bundle offline synchronization"];

const LOCKED_BLOBS: Record<string,string> = {
  "apps/web/src/pages/PosPage.tsx": "29a81252c2f4d3342541df24278eb2dbea27aaa3",
  "apps/api/src/server.ts": "434a3efaa3ac4ecbe580d7b1b1e7da9c4ce289ae",
  "packages/contracts/src/index.ts": "dc56a06b26b3ff85e1683b835976a6926b2310f4",
  "packages/database/src/atomicCommercialFinance.ts": "41bf32457252c646ae7980106e981fed8a9d39b5",
  "packages/database/src/prismaProductionRepositories.ts": "2f6f1edb11e0e288eaa1906c04aeea3d3338ff01",
  "packages/database/src/bundleInventory.ts": "a75c4ef086a2fdb2a784743317266b39ea2c490b",
  "packages/sync/src/worldStandardPrismaSyncEngine.ts": "2230175727d1590e155c8c72e443cd959fa25fe2",
  "apps/web/src/indexedDb.ts": "982b269df8356696d85f546bc2fbe544e7c82e67",
  "apps/web/src/clientSyncEngine.ts": "dc09da367ef05f11bdbf2b03e0660ca9257146ae",
  "apps/web/src/services/inventoryStockService.ts": "5fadbef7dc8de26e7bc93ce95547cf7a9c8f7e3b",
  "apps/web/src/components/InventoryBundleWorkspace.tsx": "642260ea068cf35af071290e778ada7d84f62a7f",
  "tests/unit/bundle-production-closure.test.ts": "41a5d7753a35d863e3363c0d1e8ae34cd20093fc"
};

const MARKERS: Array<[string,string,string[]]> = [
  ["pos-surface","apps/web/src/pages/PosPage.tsx",["handleCompleteSale","handleInitiateCheckout","selectedCustomerId","executeVoidSale","Void Completed Sale","Sales History","Returns"]],
  ["pos-tax","apps/web/src/pages/PosPage.tsx",["taxInclusivePricing","selectedTaxRate","cartGrandTotal"]],
  ["pos-offline","apps/web/src/pages/PosPage.tsx",["executeAtomicMutation","outboxItems","stockLedger","SALE-STOCK-","expandBundleSaleItems","INSUFFICIENT_BUNDLE_STOCK"]],
  ["history-authority","apps/web/src/pages/PosPage.tsx",["/api/v1/pos/sales","isOnline"]],
  ["sale-contract","packages/contracts/src/index.ts",["CreatePosSaleRequestSchema","occurredAt","isBackdated","CreateSaleReturnRequestSchema"]],
  ["sale-authority","packages/database/src/atomicCommercialFinance.ts",["async createSale","async voidSale","SALE_CREATED","SALE_VOIDED","jrn-sale-void","sync_change_journal","resolveBundleDefinition","BUNDLE_SALE:","INSUFFICIENT_BUNDLE_COMPONENT_STOCK"]],
  ["bundle-resolver","packages/database/src/bundleInventory.ts",["resolveBundleDefinition","BUNDLE_NESTING_NOT_SUPPORTED","BUNDLE_SELF_REFERENCE","BUNDLE_COMPONENT_QUANTITY_INVALID"]],
  ["return-authority","packages/database/src/prismaProductionRepositories.ts",["async createSaleReturn","RETURN_QUANTITY_EXCEEDS_REMAINING","SALE_RETURNED","mapReturnToJournal","BUNDLE_RETURN_SNAPSHOT","BUNDLE_RETURN_SNAPSHOT_MISSING"]],
  ["bundle-definition","apps/web/src/components/InventoryBundleWorkspace.tsx",["bundleComponents","Nested bundles/kits are not supported","Available bundle units"]],
  ["bundle-local-stock","apps/web/src/services/inventoryStockService.ts",["getBundleAvailableQuantity","expandBundleSaleItems","BUNDLE_NESTING_NOT_SUPPORTED"]],
  ["api-rbac","apps/api/src/server.ts",["assertSalesAuthority","SALE_VIEW","SALE_CREATE","SALE_VOID","SALE_RETURN","DISCOUNT_MANAGE"]],
  ["sync-authority","packages/sync/src/worldStandardPrismaSyncEngine.ts",["entityType === \"Sale\"","referenceType || \"\").toUpperCase() === \"SALE\"","provisional"]],
  ["indexeddb-reconcile","apps/web/src/indexedDb.ts",["provisional client StockLedger","SERVER_CONFIRMED","entityType === \"Sale\""]],
  ["receipt-sync-client","apps/web/src/clientSyncEngine.ts",["case \"Receipt\": return \"receipts\";","applyRevisionedChanges"]],
  ["bundle-tests","tests/unit/bundle-production-closure.test.ts",["bundle production invariants","minimum component capacity","BUNDLE_NESTING_NOT_SUPPORTED"]]
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
