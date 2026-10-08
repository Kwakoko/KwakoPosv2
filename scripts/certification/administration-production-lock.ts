import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const LOCK_ID = "ADMINISTRATION-PRODUCTION-LOCK-2026-10-08";

const REQUIRED_FILES = [
  "apps/api/src/routes/administrationRoutes.ts",
  "apps/api/src/routes/rbacRoutes.ts",
  "apps/api/src/routes/tenantOnboardingRoutes.ts",
  "apps/api/src/services/rbacMutationService.ts",
  "apps/api/src/server.ts",
  "apps/web/src/pages/AdministrationPage.tsx",
  "apps/web/src/App.tsx",
  "apps/web/src/layouts/SystemAppShellLayout.tsx",
  "tests/unit/administration-production-lock.test.ts",
];

const MARKERS: Array<[string, string, ...string[]]> = [
  ["administration-routes", REQUIRED_FILES[0],
    'server.get("/api/v1/administration/modules"',
    'server.put("/api/v1/administration/modules"',
    'server.put("/api/v1/administration/settings/batch"',
    'server.get("/api/v1/administration/audit"',
    "FEATURE_MODULE_ENTITLEMENTS_UPDATED",
  ],
  ["branch-authority", REQUIRED_FILES[1],
    'server.get("/api/v1/branches"',
    'server.post("/api/v1/branches"',
    'server.put("/api/v1/branches/:id"',
  ],
  ["tenant-authorization", REQUIRED_FILES[2],
    "canAdministerTenant",
    "Tenant administration permission is required",
  ],
  ["branch-audit", REQUIRED_FILES[3],
    "BRANCH_CREATED",
    "BRANCH_UPDATED",
    "branches.manage",
  ],
  ["api-registration", REQUIRED_FILES[4],
    'import { administrationRoutes } from "./routes/administrationRoutes.js";',
    "administrationRoutes(server, { rbacService: rbacMutationService });",
  ],
  ["ui-surface", REQUIRED_FILES[5],
    "Tenant",
    "Branches",
    "Users",
    "Roles & Permissions",
    "Subscription",
    "Billing",
    "Feature Modules",
    "System Configuration",
    "Security Configuration",
    "Audit Logs",
    "/api/v1/administration/modules",
    "/api/v1/administration/settings/batch",
    "/api/v1/administration/audit",
  ],
  ["spa-route", REQUIRED_FILES[6],
    '"/administration": "Administration"',
    'case "/administration":',
  ],
  ["navigation-lock", REQUIRED_FILES[7],
    'onNavigate("/administration")',
    "Administration",
  ],
];

function read(file: string) {
  const resolved = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolved)) throw new Error("Missing file: " + file);
  return fs.readFileSync(resolved, "utf8");
}

function blobSha(content: string) {
  const bytes = Buffer.from(content, "utf8");
  const hash = createHash("sha1");
  hash.update(Buffer.from(`blob ${bytes.length}\0`, "utf8"));
  hash.update(bytes);
  return hash.digest("hex");
}

const failures: string[] = [];
for (const file of REQUIRED_FILES) {
  try { read(file); } catch (error) { failures.push("LOCK_READ_FAILURE: " + file + " :: " + String(error)); }
}
for (const [name, file, ...needles] of MARKERS) {
  try {
    const source = read(file);
    for (const needle of needles) {
      if (!source.includes(needle)) failures.push("CONTRACT_FAILURE: " + name + " :: " + needle);
    }
  } catch (error) {
    failures.push("CONTRACT_READ_FAILURE: " + name + " :: " + String(error));
  }
}

try {
  const serverSha = blobSha(read("apps/api/src/server.ts"));
  for (const lockFile of [
    "scripts/certification/sales-production-lock.ts",
    "scripts/certification/cash-management-production-lock.ts",
  ]) {
    const lockSource = read(lockFile);
    if (!lockSource.includes(serverSha)) {
      failures.push("SHARED_SERVER_LOCK_DRIFT: " + lockFile + " does not pin " + serverSha);
    }
  }
} catch (error) {
  failures.push("SHARED_SERVER_LOCK_READ_FAILURE: " + String(error));
}

const result = {
  lockId: LOCK_ID,
  verdict: failures.length === 0 ? "PASS" : "FAIL",
  requiredFiles: REQUIRED_FILES,
  failures,
  generatedAt: new Date().toISOString(),
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
console.log("ADMINISTRATION PRODUCTION LOCK: PASS — " + LOCK_ID);
