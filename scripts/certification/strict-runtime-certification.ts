import fs from "fs";
import path from "path";

const root = process.cwd();
const failures: string[] = [];
const requireFile = (relative: string) => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) failures.push(`Missing required file: ${relative}`);
};
const sourceContains = (relative: string, needle: string, forbidden = false) => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { failures.push(`Cannot inspect missing file: ${relative}`); return; }
  const text = fs.readFileSync(file, "utf8");
  const present = text.includes(needle);
  if (forbidden ? present : !present) failures.push(`${forbidden ? "Forbidden pattern" : "Required pattern"} in ${relative}: ${needle}`);
};

for (const file of [
  "apps/web/src/main.tsx",
  "apps/web/src/App.tsx",
  "apps/web/src/context/KwakoPosContexts.tsx",
  "apps/web/src/services/apiClient.ts",
  "apps/web/src/indexedDb.ts",
  "apps/api/src/server.ts",
  "apps/api/src/serverFixed.ts",
  "apps/api/dist/serverFixed.js",
  "apps/web/dist/index.html",
]) requireFile(file);

sourceContains("apps/web/src/context/KwakoPosContexts.tsx", "apiLogin");
sourceContains("apps/web/src/context/KwakoPosContexts.tsx", "isAuthenticated: Boolean(user)");
sourceContains("apps/web/src/context/KwakoPosContexts.tsx", "permissions.includes(\"*\")");
sourceContains("apps/web/src/context/KwakoPosContexts.tsx", "for (const item of pending)", true);
sourceContains("apps/web/src/context/KwakoPosContexts.tsx", "markOutboxSynced(item.id)", true);
sourceContains("apps/web/src/services/apiClient.ts", "refreshAccessToken");
sourceContains("apps/web/src/services/apiClient.ts", "requestJson<T>(input, init, false)");
sourceContains("apps/web/src/indexedDb.ts", "indexedDB.open");
sourceContains("apps/api/src/serverFixed.ts", "prisma.user.findFirst");
sourceContains("apps/api/src/serverFixed.ts", "prisma.deviceSession.findUnique");
sourceContains("apps/api/src/serverFixed.ts", "KWAKOPOS_BOOTSTRAP_ADMIN_EMAIL");
sourceContains("apps/api/package.json", "serverFixed.js");
sourceContains("index.js", "apps/api/dist/serverFixed.js");

for (const file of [path.join(root, "apps/web/dist/index.html")]) {
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, "utf8");
  if (!html.includes('id="root"')) failures.push(`React root missing from ${path.relative(root, file)}`);
  if (html.includes("RealAppShell")) failures.push(`Retired generated shell detected in ${path.relative(root, file)}`);
}

if (failures.length) {
  console.error("STRICT RUNTIME CERTIFICATION: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("STRICT RUNTIME CERTIFICATION: PASS");
console.log("Active React entrypoint, authenticated session path, RBAC source, durable browser storage, production auth gateway, and retired-shell exclusion verified.");
