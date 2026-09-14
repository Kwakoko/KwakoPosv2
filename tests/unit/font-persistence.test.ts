import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  fontPersistenceEngine,
  SYSTEM_FONT_SANS_DEFAULT,
  SYSTEM_FONT_MONO_DEFAULT,
} from "../../apps/web/src/persistence/fontPersistenceEngine.js";

const rootDir = process.cwd();
const webPublicDir = path.join(rootDir, "apps/web/public");
const fontsDir = path.join(webPublicDir, "fonts");

describe("KwakoPos System-Wide Font Adoption & Persistence Engine", () => {
  const expectedFontFiles = [
    "inter-regular.woff2",
    "inter-medium.woff2",
    "inter-semibold.woff2",
    "inter-bold.woff2",
    "jetbrains-mono-regular.woff2",
    "jetbrains-mono-medium.woff2",
    "jetbrains-mono-semibold.woff2",
    "jetbrains-mono-bold.woff2",
  ];

  it("1. Verifies all 8 self-hosted WOFF2 font files exist and have non-zero size", () => {
    expect(fs.existsSync(fontsDir)).toBe(true);
    for (const filename of expectedFontFiles) {
      const filePath = path.join(fontsDir, filename);
      expect(fs.existsSync(filePath), `Font file ${filename} must exist`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(10000);
    }
  });

  it("2. Verifies public/asset-manifest.json includes all font files with valid SHA-256 hashes", () => {
    const manifestPath = path.join(webPublicDir, "asset-manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(Array.isArray(manifest.assets)).toBe(true);

    for (const filename of expectedFontFiles) {
      const assetEntry = manifest.assets.find((a: any) => a.path === `/fonts/${filename}`);
      expect(assetEntry, `Asset manifest must include /fonts/${filename}`).toBeDefined();
      expect(assetEntry.hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("3. Verifies public/sw.js includes all font files in PRECACHE_ASSETS for offline durability", () => {
    const swPath = path.join(webPublicDir, "sw.js");
    expect(fs.existsSync(swPath)).toBe(true);
    const swContent = fs.readFileSync(swPath, "utf8");

    for (const filename of expectedFontFiles) {
      expect(swContent).toContain(`/fonts/${filename}`);
    }
  });

  it("4. Verifies styles.css defines local @font-face with font-display: block and no remote imports", () => {
    const cssPath = path.join(rootDir, "apps/web/src/styles.css");
    const cssContent = fs.readFileSync(cssPath, "utf8");

    // No remote google fonts import
    expect(cssContent).not.toContain("fonts.googleapis.com");

    // Must define local @font-face
    expect(cssContent).toContain("font-family: 'Inter'");
    expect(cssContent).toContain("font-family: 'JetBrains Mono'");
    expect(cssContent).toContain("font-display: block;");
    expect(cssContent).toContain("/fonts/inter-regular.woff2");
    expect(cssContent).toContain("/fonts/jetbrains-mono-regular.woff2");

    // Strict design tokens without fallback cascades
    expect(cssContent).toContain("--font-sans: 'Inter', sans-serif;");
    expect(cssContent).toContain("--font-mono: 'JetBrains Mono', monospace;");
  });

  it("5. Verifies index.html has no external font links and preloads primary fonts", () => {
    const htmlPath = path.join(rootDir, "apps/web/index.html");
    const htmlContent = fs.readFileSync(htmlPath, "utf8");

    expect(htmlContent).not.toContain("fonts.googleapis.com");
    expect(htmlContent).not.toContain("fonts.gstatic.com");
    expect(htmlContent).toContain('rel="preload" href="/fonts/inter-regular.woff2"');
    expect(htmlContent).toContain('rel="preload" href="/fonts/inter-semibold.woff2"');
  });

  it("6. Verifies fontPersistenceEngine initializes and maintains persistent font contracts", () => {
    const config = fontPersistenceEngine.initialize();
    expect(config.adoptedFromLegacy).toBe(true);
    expect(config.fontSans).toBe(SYSTEM_FONT_SANS_DEFAULT);
    expect(config.fontMono).toBe(SYSTEM_FONT_MONO_DEFAULT);
    expect(config.persisted).toBe(true);

    const integrity = fontPersistenceEngine.verifyIntegrity();
    expect(integrity).toBe(true);
  });

  it("7. Verifies zero system fallback cascades exist in apps/web/src", () => {
    const srcDir = path.join(rootDir, "apps/web/src");
    const prohibitedPatterns = [
      "-apple-system",
      "BlinkMacSystemFont",
      "Segoe UI",
    ];

    function checkDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") || entry.name.endsWith(".css"))) {
          const content = fs.readFileSync(fullPath, "utf8");
          for (const pattern of prohibitedPatterns) {
            expect(
              content.includes(pattern),
              `File ${path.relative(srcDir, fullPath)} contains prohibited fallback font '${pattern}'`
            ).toBe(false);
          }
        }
      }
    }

    checkDir(srcDir);
  });
});
