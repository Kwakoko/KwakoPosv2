import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const LOCK_ID = "SALES-PRODUCTION-LOCK-V2-2026-10-08";
const REQUIRED_SUBITEMS = ["Sales Dashboard","POS","New Sale","Cart","Product selection","Customer selection","Discounts","Taxes","Payments","Payment channels","Receipts","Refunds","Voids/cancellations","Sales history","Sales detail","Recent orders","Sales reports","Sales sync/outbox","Sales ledger/audit trail","Product Bundles / Kits","Bundle definition","Bundle components","Component quantities","Bundle stock availability","Bundle sale","Component stock deduction","Bundle reverse/refund","Bundle reporting","Bundle ledger integrity","Bundle offline synchronization"];

const LOCKED_BLOBS: Record<string,string> = {
  "apps/web/src/pages/PosPage.tsx": "b4930d7df339b105bb417048c8fbfb48ac08a430",
  "apps/api/src/server.ts": "53db2e566095a4d171b810e1c8345d840284285c",
  "packages/contracts/src/index.ts": "55fe00d48292b228f4f7aa176dc8da9bca1d1402",
  "packages/database/src/atomicCommercialFinance.ts": "502f6c6aa03994cc3e8a217fac86075b290995b3",
  "packages/database/src/index.ts": "ec6eab98927d06b4de98ffe63c14a58fbc87ce29",
  "packages/database/src/prismaProductionRepositories.ts": "72575e27a0c6ed11ba808e0aefb09e08a6fc4936",
  "packages/database/src/bundleInventory.ts": "86a69340f7bdaf36304805720ab5461a1d99a3ff",
  "packages/sync/src/worldStandardPrismaSyncEngine.ts": "3b0667066646b29b1767ae83c3266d8290207843",
  "apps/web/src/indexedDb.ts": "982b269df8356696d85f546bc2fbe544e7c82e67",
  "apps/web/src/clientSyncEngine.ts": "dc09da367ef05f11bdbf2b03e0660ca9257146ae",
  "apps/web/src/services/inventoryStockService.ts": "5fadbef7dc8de26e7bc93ce95547cf7a9c8f7e3b",
  "apps/web/src/components/InventoryBundleWorkspace.tsx": "6f95a91ee619d9ab00c7cc623dfc00a486c72a54",
  "tests/unit/bundle-production-closure.test.ts": "ee008c74dab2d6bf6cfc423ef350b706e7b8b08d"
};

const MARKERS: Array<[string,string,string[]]> = [
  ["pos-surface","apps/web/src/pages/PosPage.tsx",["handleCompleteSale","handleInitiateCheckout","selectedCustomerId","executeVoidSale","Void Completed Sale","Sales History","Returns"]],
  ["pos-tax","apps/web/src/pages/PosPage.tsx",["taxInclusivePricing","selectedTaxRate","cartGrandTotal"]],
  ["pos-offline","apps/web/src/pages/PosPage.tsx",["executeAtomicMutation","outboxItems","stockLedger","SALE-STOCK-","expandBundleSaleItems","INSUFFICIENT_BUNDLE_STOCK"]],
  ["history-authority","apps/web/src/pages/PosPage.tsx",["/api/v1/pos/sales","isOnline"]],
  ["sale-contract","packages/contracts/src/index.ts",["CreatePosSaleRequestSchema","bundleDefinitionVersion","bundleComponents","CreateSaleReturnRequestSchema"]],
  ["sale-authority","packages/database/src/atomicCommercialFinance.ts",["async createSale","resolveBundleDefinition","bundleDefinitionVersion","BUNDLE_DEFINITION_CHANGED_OFFLINE","BUNDLE_SALE:","INSUFFICIENT_BUNDLE_COMPONENT_STOCK"]],
  ["bundle-resolver","packages/database/src/bundleInventory.ts",["resolveBundleDefinition","validateBundleDefinitionAttributes","bundleDefinitionVersion","BUNDLE_NESTING_NOT_SUPPORTED","BUNDLE_SELF_REFERENCE","BUNDLE_COMPONENT_QUANTITY_INVALID"]],
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
