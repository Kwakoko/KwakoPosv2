import fs from "fs";
import path from "path";

const root = process.cwd();
const manifestPath = path.join(root, "apps/web/public/manifest.json");
const assetRoot = path.join(root, "apps/web/public/brand");
const configPath = path.join(root, "packages/config/src/visualAssetLibrary.ts");
const requiredAssets = [
  "kwakoko-logo.svg", "kwakoko-mark.svg", "kwakoko-mark-mono.svg", "favicon.svg",
  "koko/koko-profile.svg", "koko/koko-welcome.svg", "koko/koko-insights.svg", "koko/koko-sync.svg",
];
function pass(label: string) { console.log(`PASS ${label}`); }
function fail(label: string): never { console.error(`FAIL ${label}`); process.exit(1); }
console.log("KWAKOKO BRAND ASSET LOCK VERIFIER v1.0.0");
if (!fs.existsSync(configPath)) fail("asset-authority-missing");
pass("asset-authority");
for (const relative of requiredAssets) {
  const absolute = path.join(assetRoot, relative);
  if (!fs.existsSync(absolute)) fail(`asset:${relative}`);
  const source = fs.readFileSync(absolute, "utf8");
  if (!source.includes("<svg") || !source.includes(">")) fail(`asset-svg:${relative}`);
  pass(`asset:${relative}`);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.name !== "Kwakoko Business Operating System") fail("manifest-brand-name");
if (manifest.short_name !== "Kwakoko BOS") fail("manifest-short-name");
if (manifest.theme_color !== "#0B5D4A") fail("manifest-theme-color");
if (manifest.background_color !== "#F7FAF8") fail("manifest-background-color");
if (!Array.isArray(manifest.icons) || !manifest.icons.some((x: any) => x.src === "/brand/kwakoko-mark.svg")) fail("manifest-icon-authority");
pass("manifest-branding");
const assetSources = requiredAssets.map((x) => fs.readFileSync(path.join(assetRoot, x), "utf8")).join("\n");
if (/DukaPos/i.test(assetSources)) fail("legacy-brand-in-locked-assets");
if (!fs.existsSync(path.join(assetRoot, "koko/koko-profile.svg"))) fail("canonical-koko-profile");
pass("locked-asset-brand-integrity");
for (const file of [path.join(root, "apps/web/index.html"), path.join(root, "apps/web/public/index.html")]) {
  if (!fs.existsSync(file)) continue;
  if (fs.readFileSync(file, "utf8").includes("kwakopos-logo.png")) fail("legacy-logo-reference");
}
pass("no-legacy-logo-reference");
console.log("SUMMARY 12/12 PASS");
