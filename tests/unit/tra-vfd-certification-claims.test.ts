import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());

function sourceFilesUnder(...parts: string[]) {
  const dir = path.join(ROOT, ...parts);
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(...parts, entry.name);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("TRA VFD certification claim integrity", () => {
  it("contains no hard-coded TRA certification identifiers or statuses", () => {
    const files = [
      ...sourceFilesUnder("apps", "web", "src"),
      ...sourceFilesUnder("apps", "api", "src"),
    ];
    const forbidden = [
      "TRA VFD: Certified",
      "TRA VFD: XX Queued",
      "TRA-VFD-TZ-2026-X89B21",
      "STATUS: ELECTRONICALLY CERTIFIED",
      "TRA VFD: Certified (Electronic)",
    ];
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const token of forbidden) {
        if (content.includes(token)) violations.push(`${path.relative(ROOT, file)} contains '${token}'`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not default the EFD/TRA status to VERIFIED", () => {
    const report = fs.readFileSync(
      path.join(ROOT, "apps", "web", "src", "pages", "ReportsPage.tsx"),
      "utf8",
    );
    expect(report).not.toMatch(/efdStatus\s*\|\|\s*["']VERIFIED["']/);
  });

  it("only renders a fiscal code when the recorded state is TRA_ACCEPTED or TRA_VERIFIED", () => {
    const display = fs.readFileSync(
      path.join(ROOT, "apps", "web", "src", "pages", "CustomerDisplayPage.tsx"),
      "utf8",
    );
    expect(display).toContain('["TRA_ACCEPTED", "TRA_VERIFIED"].includes');
  });
});
