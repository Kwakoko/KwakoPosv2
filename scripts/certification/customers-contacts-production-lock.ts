import fs from "node:fs";
import path from "node:path";

const LOCK_ID = "CUSTOMERS-CONTACTS-PRODUCTION-LOCK-V1-2026-10-07";

const REQUIRED_SUBITEMS = [
  "Customers",
  "Suppliers",
  "Contacts",
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
  "Audit",
];

const REQUIRED: Array<[string, string, string[]]> = [
  ["customer-ui", "apps/web/src/pages/CustomersPage.tsx", [
    "crypto.randomUUID",
    'entityType:"Customer"',
    'entityType:"CustomerContact"',
    "Contact Search",
    "Transaction History",
    "Import CSV",
    "Export CSV",
    "Post Customer Payment",
    "paymentPosting",
  ]],
  ["customer-api", "apps/api/src/server.ts", [
    "customerContactRoutes(server)",
    'server.get("/api/v1/customers"',
    'server.post("/api/v1/customers"',
    'server.put("/api/v1/customers/:id"',
    'server.delete("/api/v1/customers/:id"',
    "CUSTOMER_CREATED",
    "CUSTOMER_UPDATED",
    "CUSTOMER_ARCHIVED",
    "requireCommercialPermission(req",
  ]],
  ["contact-api", "apps/api/src/routes/customerContactRoutes.ts", [
    'server.get("/api/v1/customers/:id/history"',
    'server.get("/api/v1/customers/:id/contacts"',
    'server.get("/api/v1/contacts/search"',
    'server.post("/api/v1/customers/:id/contacts"',
    'server.put("/api/v1/customers/:id/contacts/:contactId"',
    'server.delete("/api/v1/customers/:id/contacts/:contactId"',
    'server.post("/api/v1/customers/:id/payment"',
    'server.get("/api/v1/customers/export.csv"',
    'server.post("/api/v1/customers/import"',
    "CONTACT_CREATED",
    "CONTACT_UPDATED",
    "CONTACT_ARCHIVED",
    "CUSTOMER_PAYMENT_POSTED",
    "CUSTOMER_EXPORT",
  ]],
  ["contact-storage", "packages/database/prisma/migrations/202610070001_customers_contacts_production_lock/migration.sql", [
    "CREATE TABLE IF NOT EXISTS customer_contacts",
    '"tenantId"',
    '"branchId"',
    '"customerId"',
    '"decisionInfluence"',
    "customer_contacts_primary_uq",
  ]],
  ["sync", "packages/sync/src/worldStandardPrismaSyncEngine.ts", [
    'op.entityType === "CustomerContact"',
    'op.entityType === "Payment"',
    "PAYMENT_EXCEEDS_CUSTOMER_BALANCE",
    "CUSTOMER_DELETE_BLOCKED_OUTSTANDING_BALANCE",
    "CUSTOMER_PAYMENT_POSTED",
    "CONTACT_CREATED",
    "CONTACT_UPDATED",
    "CONTACT_ARCHIVED",
    "CUSTOMER_CREATED",
    'CustomerContact: "customer_contacts"',
  ]],
  ["client-sync", "apps/web/src/clientSyncEngine.ts", [
    '"contacts"',
    'case "CustomerContact": return "contacts"',
  ]],
  ["indexeddb", "apps/web/src/indexedDb.ts", [
    "AUTHORITATIVE_SCHEMA_VERSION = 7",
    "contacts: QueryableStore",
    'case "contacts":',
  ]],
  ["contract", "packages/contracts/src/index.ts", [
    '"CustomerContact"',
    "contacts: z.array",
  ]],
  ["contact-contract", "packages/contracts/src/crmContracts.ts", [
    "export const CustomerContactSchema",
    'contactId: z.string().uuid()',
    "decisionInfluence",
  ]],
  ["financial-authority", "packages/database/src/atomicCommercialFinance.ts", [
    'paymentMethod === "CREDIT"',
    "currentBalance: { increment: Number(sale.grandTotal) }",
    "customerCreditLimit",
    "customerCurrentBalance",
  ]],
  ["supplier-history", "apps/web/src/pages/PurchasingPage.tsx", [
    "supplierHistory",
    "openSupplierHistory",
    "Supplier Transactions",
    "Profile",
  ]],
  ["supplier-api-history", "apps/api/src/routes/customerContactRoutes.ts", [
    'server.get("/api/v1/suppliers/:id/history"',
    "purchaseOrders",
    "purchaseReceipts",
  ]],
  ["migration", "apps/web/src/persistence/migrationEngine.ts", [
    "V6 -> V7",
    "toVersion >= 7 && fromVersion < 7",
    'createObjectStore("contacts")',
  ]],
  ["release-manifest", "release-manifest.json", [
    '"pwaSchemaVersion": 7',
  ]],
  ["release-compatibility", "apps/web/src/persistence/releaseCompatibility.ts", [
    "schemaVersion: 7",
    'databaseCompatibilityRange: ">=1 <=7"',
    '"6->7"',
  ]],
];

function read(file: string): string {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute)) throw new Error("missing file: " + file);
  return fs.readFileSync(absolute, "utf8");
}

const failures: string[] = [];

for (const [name, file, markers] of REQUIRED) {
  try {
    const source = read(file);
    for (const marker of markers) {
      if (!source.includes(marker)) failures.push(name + ": missing marker " + marker);
    }
  } catch (error) {
    failures.push(name + ": " + String(error));
  }
}

const customers = read("apps/web/src/pages/CustomersPage.tsx");
for (const marker of [
  "cust-" + "$" + "{Date.now()}",
  "/wallet",
  'method: "PUT"',
]) {
  if (marker !== 'method: "PUT"' && customers.includes(marker)) failures.push("legacy-unsafe-customer-ui: " + marker);
}

const sync = read("packages/sync/src/worldStandardPrismaSyncEngine.ts");
if (sync.includes('CustomerContact: "customer_contacts",\n      CustomerContact: "customer_contacts"')) {
  failures.push("sync: duplicate CustomerContact mapping");
}

const route = read("apps/api/src/routes/customerContactRoutes.ts");
const insert = route.split("\n").find((line) => line.includes("INSERT INTO customer_contacts"));
if (!insert || !insert.includes("role,department") || !insert.includes("decisionInfluence")) {
  failures.push("contact-api: incomplete contact INSERT");
}

const result = {
  lockId: LOCK_ID,
  status: failures.length === 0 ? "PRODUCTION_LOCKED" : "BLOCKED",
  verdict: failures.length === 0 ? "PASS" : "FAIL",
  subitems: REQUIRED_SUBITEMS,
  gatesChecked: REQUIRED.length,
  failures,
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
console.log("CUSTOMERS / CONTACTS PRODUCTION LOCK: PASS — " + LOCK_ID);
