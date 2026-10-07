import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const LOCK_ID = "CUSTOMERS-CONTACTS-PRODUCTION-LOCK-2026-10-07";
// Certification source revision: 2026-10-07-final-trigger
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
  "apps/web/src/pages/CustomersPage.tsx": "0681f28e71a441fb5342ce55c11a33bec6ed9161",
  "apps/web/src/indexedDb.ts": "03382d251e7eed4962a1fff8a25154aeebcb5c3b",
  "apps/web/src/persistence/migrationEngine.ts": "5b6ac2bb41b7747289b54ae8507201e50614b099",
  "apps/web/src/clientSyncEngine.ts": "7b846fb46a1cb725b7d6c09130669963d6078c4e",
  "apps/api/src/server.ts": "a74c1c1515c1e4e242bdf521157620c01b06a7be",
  "packages/contracts/src/index.ts": "088c086f91320349f3f8ac4b94c699f15d0c9cf3",
  "packages/database/prisma/schema.prisma": "4bf880ef5fe0f012f270706bdc6bf93c032547dc",
  "packages/database/prisma/migrations/202610070001_customers_contacts_authority/migration.sql": "b108a95e9732350bc4291859307758ab974e80c6",
  "packages/database/src/prismaProductionRepositories.ts": "bdfa9bf62d475f3129c44ff986daf450c3e42442",
  "packages/sync/src/worldStandardPrismaSyncEngine.ts": "c439797e147cb3f03a1dd69d546d7a50f091f91f",
  "apps/web/src/modules/moduleRegistry.ts": "5706ec7e7983c564f3ba5b35a286e269529af06b",
  "apps/web/src/App.tsx": "863d4a8c295bc1ef9659e77723ee3d311729311c",
  "apps/web/src/pages/PurchasingPage.tsx": "a3ccfaaccf690e5af759c42a78c3011f875b0444",
  "tests/integration/customers-contacts-production-lock.test.ts": "379ac34246b140ccc21fb80ced09e21b0d90bdab",
  ".github/workflows/production-certification.yml": "57aaaf7dbd7bf32e3b0d67a82e2eb40280ef5111",
  ".github/workflows/production-release-exact-main.yml": "6e13f452332fe16893b68cda724f71145e5f7aa5",
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
    "CREATE TABLE IF NOT EXISTS", "customer_contacts", "walletBalance"],
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
  ["customer-route", "apps/web/src/modules/moduleRegistry.ts",
    "Customer Directory", "Contacts", "Customer Transactions", "Import / Export"],
  ["customer-route-app", "apps/web/src/App.tsx",
    "/customers", 'case "/customers":'],
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
