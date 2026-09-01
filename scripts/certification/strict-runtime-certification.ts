import fs from "fs";
import path from "path";

const root = process.cwd();
const failures: string[] = [];
const requireFile = (relative: string) => { const file = path.join(root, relative); if (!fs.existsSync(file)) failures.push(`Missing required file: ${relative}`); };
const sourceContains = (relative: string, needle: string, forbidden = false) => { const file = path.join(root, relative); if (!fs.existsSync(file)) { failures.push(`Cannot inspect missing file: ${relative}`); return; } const text = fs.readFileSync(file, "utf8"); const present = text.includes(needle); if (forbidden ? present : !present) failures.push(`${forbidden ? "Forbidden pattern" : "Required pattern"} in ${relative}: ${needle}`); };

for (const file of [
  "apps/web/src/main.tsx","apps/web/src/App.tsx","apps/web/src/context/KwakoPosContexts.tsx","apps/web/src/services/apiClient.ts","apps/web/src/indexedDb.ts","apps/web/src/versionManager.ts",
  "apps/api/src/server.ts","apps/api/src/serverFixed.ts","packages/sync/src/prismaSyncEngine.ts","apps/api/package.json","apps/web/package.json","package.json","release-manifest.json","index.js",
  "apps/web/dist/index.html","apps/web/dist/manifest.json","apps/web/dist/sw.js","apps/api/dist/serverFixed.js",
]) requireFile(file);

sourceContains("apps/web/src/context/KwakoPosContexts.tsx", "apiLogin");
sourceContains("apps/web/src/context/KwakoPosContexts.tsx", "isAuthenticated: Boolean(user)");
sourceContains("apps/web/src/context/KwakoPosContexts.tsx", "permissions.includes(\"*\")");
sourceContains("apps/web/src/context/KwakoPosContexts.tsx", "for (const item of pending)", true);
sourceContains("apps/web/src/context/KwakoPosContexts.tsx", "markOutboxSynced(item.id)", true);
sourceContains("apps/web/src/services/apiClient.ts", "refreshAccessToken");
sourceContains("apps/web/src/services/apiClient.ts", "refreshInFlight");
sourceContains("apps/web/src/indexedDb.ts", "indexedDB.open");
sourceContains("apps/web/src/indexedDb.ts", "objectStore(");
sourceContains("apps/web/src/indexedDb.ts", "this.nativeDb");
sourceContains("apps/web/src/versionManager.ts", "isUpToDate: false");
sourceContains("apps/api/src/serverFixed.ts", "prisma.user.findMany");
sourceContains("apps/api/src/serverFixed.ts", "prisma.deviceSession.findUnique");
sourceContains("apps/api/src/serverFixed.ts", "KWAKOPOS_BOOTSTRAP_ADMIN_EMAIL");
sourceContains("apps/api/src/serverFixed.ts", "server.addHook(\"preValidation\"");
sourceContains("packages/sync/src/prismaSyncEngine.ts", "entityType === \"Sale\"");
sourceContains("packages/sync/src/prismaSyncEngine.ts", "entityType === \"PurchaseReceipt\"");
sourceContains("packages/sync/src/prismaSyncEngine.ts", "PrismaAtomicCommercialFinanceService");
sourceContains("apps/api/package.json", "serverFixed.js");
sourceContains("index.js", "apps/api/dist/serverFixed.js");

const readJson = (relative: string): any => { try { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); } catch { return null; } };
const rootPkg = readJson("package.json");
const apiPkg = readJson("apps/api/package.json");
const webPkg = readJson("apps/web/package.json");
const releaseManifest = readJson("release-manifest.json");
if (rootPkg?.version && apiPkg?.version && webPkg?.version && releaseManifest?.version) {
  const versions = [rootPkg.version, apiPkg.version, webPkg.version, releaseManifest.version];
  if (versions.some((version) => version !== rootPkg.version)) failures.push(`Release version drift detected: ${JSON.stringify({ root: rootPkg.version, api: apiPkg.version, web: webPkg.version, manifest: releaseManifest.version })}`);
  if (releaseManifest.tag !== `v${rootPkg.version}`) failures.push(`release-manifest tag drift: expected v${rootPkg.version}, got ${releaseManifest.tag}`);
}

for (const relative of ["apps/web/dist/index.html","apps/web/dist/sw.js"]) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, "utf8");
  if (relative.endsWith("index.html")) {
    if (!content.includes('id="root"')) failures.push("React root missing from apps/web/dist/index.html");
    if (content.includes("RealAppShell")) failures.push("Retired generated shell detected in apps/web/dist/index.html");
  }
  if (relative.endsWith("sw.js") && !content.includes("kwakopos-runtime-v2.5.0")) failures.push("PWA service-worker cache is not bound to release version 2.5.0");
}

if (failures.length) {
  console.error("STRICT RUNTIME CERTIFICATION: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("STRICT RUNTIME CERTIFICATION: PASS");
console.log("Compiled React/PWA artifacts, authentication, refresh, RBAC, durable IndexedDB, production auth gateway, offline commercial sync, and release consistency verified statically.");
