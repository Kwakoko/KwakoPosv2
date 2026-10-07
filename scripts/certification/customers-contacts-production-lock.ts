import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const LOCK_ID = "CUSTOMERS-CONTACTS-PRODUCTION-LOCK-2026-10-07";
const REQUIRED_SURFACES = [
  "Customers",
  "Suppliers",
  "Customer profiles",
  "Supplier profiles",
  "Customer transactions",
  "Supplier transactions",
  "Credit limits",
  "Customer balances",
  "Contact search",
  "Contact history",
  "Import/export",
  "Contact synchronization",
  "Supplier profile / ledger drilldown",
  "Audit",
];

const LOCKED_BLOBS: Record<string, string> = {
  "apps/web/src/pages/CustomersPage.tsx": "4a7e27f271b8911f0385b1aeeff71fbd8e01bb4d",
  "apps/web/src/indexedDb.ts": "245cf822def2edf7dcc27741b708efb1c6c6276b",
  "apps/web/src/persistence/migrationEngine.ts": "5b6ac2bb41b7747289b54ae8507201e50614b099",
  "apps/web/src/clientSyncEngine.ts": "6bbd64c387fdc6ea16a0fa0e46e283c92e0ad65e",
  "apps/api/src/server.ts": "ae89266a23967e40432763b43fe583e61827c530",
  "packages/contracts/src/index.ts": "cc04c1115f5b4b145c524629606cca3ac827ab59",
  "packages/database/prisma/schema.prisma": "4bf880ef5fe0f012f270706bdc6bf93c032547dc",
  "packages/database/prisma/migrations/202610070001_customers_contacts_authority/migration.sql": "b108a95e9732350bc4291859307758ab974e80c6",
  "packages/database/src/prismaProductionRepositories.ts": "cf5d1d6fc648e0f28d752254e61fe05fbd50b52b",
  "packages/sync/src/worldStandardPrismaSyncEngine.ts": "f7ccab61ae3ade83dcf8e22ff69094b690a32c18",
  "apps/web/src/modules/moduleRegistry.ts": "5706ec7e7983c564f3ba5b35a286e269529af06b",
  "apps/web/src/App.tsx": "652498161865f20835fcc86fc89072808b3d2e00",
  "apps/web/src/pages/PurchasingPage.tsx": "a3ccfaaccf690e5af759c42a78c3011f875b0444",
  "tests/integration/customers-contacts-production-lock.test.ts": "379ac34246b140ccc21fb80ced09e21b0d90bdab",
};

const MARKERS: Array<[string, string, ...string[]]> = [
  ["customer-ui", "apps/web/src/pages/CustomersPage.tsx",
    "commitLocalMutation", 'entityType: "Customer"', 'entityType: "CustomerContact"',
    "/api/v1/customers/", "/api/v1/contacts/", "Import CSV", "Export"],
  ["customer-money", "apps/web/src/pages/CustomersPage.tsx",
    "Queue Repayment", "Queue Deposit", "customer balance will reconcile"],
  ["customer-rbac-api", "apps/api/src/server.ts",
    "requireCommercialPermission", "customer.view", "customer.create", "customer.edit", "supplier.view"],
  ["customer-api", "apps/api/src/server.ts",
    "/api/v1/customers/:id/transactions", "/api/v1/customers/:id/payment", "/api/v1/customers/:id/wallet",
    "/api/v1/customers/import", "/api/v1/contacts", "/api/v1/contacts/:id/history"],
  ["customer-authority", "packages/database/src/prismaProductionRepositories.ts",
    "recordCustomerPayment", "depositCustomerWallet", "getCustomerTransactions", "getCustomerContacts", "importCustomerContacts",
    "CUSTOMER_PAYMENT_RECORDED", "CUSTOMER_WALLET_DEPOSIT"],
  ["customer-schema", "packages/database/prisma/schema.prisma",
    "model CustomerContact", "walletBalance", "CustomerContact[]", "customer_contacts"],
  ["contact-migration", "packages/database/prisma/migrations/202610070001_customers_contacts_authority/migration.sql",
    "CREATE TABLE IF NOT EXISTS", "customer_contacts", "wallet_balance"],
  ["sync-authority", "packages/sync/src/worldStandardPrismaSyncEngine.ts",
    '["Customer", "Supplier", "CustomerContact"]', "CUSTOMER_CONTACT_CREATED", "CUSTOMER_PAYMENT_RECORDED",
    "CUSTOMER_WALLET_DEPOSIT", "SYNC_CONFLICT", "tenantId: ctx.tenantId", "branchId: ctx.branchId"],
  ["offline-contact-store", "apps/web/src/indexedDb.ts",
    "customerContacts", "AUTHORITATIVE_SCHEMA_VERSION = 7", "saveCustomerContactLocal", "getCustomerContactsLocal"],
  ["offline-contact-migration", "apps/web/src/persistence/migrationEngine.ts",
    'toVersion === 7', "customerContacts"],
  ["client-sync-contact", "apps/web/src/clientSyncEngine.ts",
    "CustomerContact", "customerContacts"],
  ["customer-navigation", "apps/web/src/modules/moduleRegistry.ts",
    "Customer Directory", "Contacts", "Customer Transactions", "Import / Export"],
  ["customer-route", "apps/web/src/App.tsx",
    "Customer Directory", "Contacts", "Customer Transactions", "Import / Export"],
  ["supplier-ui", "apps/web/src/pages/PurchasingPage.tsx",
    "Supplier Directory", "Supplier Profile & Ledger", "/api/v1/suppliers/",
    "View supplier profile and transaction history"],
  ["customer-integration-test", "tests/integration/customers-contacts-production-lock.test.ts",
    "Customers / Contacts Production Lock", "CUSTOMER_CONTACT_CREATED", "CUSTOMER_PAYMENT_RECORDED",
    "CUSTOMER_WALLET_DEPOSIT", "ALREADY_PROCESSED", "CUSTOMER_NOT_FOUND"],
];

function read(p: string): string {
  const f = path.resolve(process.cwd(), p);
  if (!fs.existsSync(f)) throw new Error("missing file: " + p);
  return fs.readFileSync(f, "utf8");
}
function blobSha(content: string, p: string): string {
  return execFileSync("git", ["hash-object", "--path=" + p, "--stdin"], {
    input: Buffer.from(content),
    encoding: "utf8",
  }).trim();
}

const failures: string[] = [];
for (const [p, expected] of Object.entries(LOCKED_BLOBS)) {
  try {
    const actual = blobSha(read(p), p);
    if (actual !== expected) failures.push(`LOCK_DRIFT: ${p} expected ${expected} got ${actual}`);
  } catch (e) {
    failures.push(`LOCK_READ_FAILURE: ${p}: ${String(e)}`);
  }
}
for (const [name, p, ...needles] of MARKERS) {
  try {
    const source = read(p);
    for (const needle of needles) {
      if (!source.includes(needle)) failures.push(`CONTRACT_FAILURE: ${name} missing marker: ${needle}`);
    }
  } catch (e) {
    failures.push(`CONTRACT_READ_FAILURE: ${name}: ${String(e)}`);
  }
}

const result = {
  lockId: LOCK_ID,
  verdict: failures.length === 0 ? "PASS" : "FAIL",
  requiredSurfaces: REQUIRED_SURFACES,
  lockedFiles: Object.keys(LOCKED_BLOBS).length,
  failures,
  generatedAt: new Date().toISOString(),
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
console.log("CUSTOMERS / CONTACTS PRODUCTION LOCK: PASS — " + LOCK_ID);
