import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const POS_PAGE = path.resolve(process.cwd(), "apps/web/src/pages/PosPage.tsx");

describe("POS backdated sale UI contract", () => {
  it("exposes backdated sale activation on the New Sale surface", () => {
    const source = fs.readFileSync(POS_PAGE, "utf8");

    expect(source).toContain("Activate Backdated Sale");
    expect(source).toContain("onClick={activateBackdatedSale}");
    expect(source).toContain('title="Activate Backdated Sale (SALE_BACKDATE permission)"');
    expect(source).toContain('aria-pressed={isBackdatedSale}');

    const activationIndex = source.indexOf("Activate Backdated Sale");
    const mainGridIndex = source.indexOf("/* Main Grid: Products on Left (60%), Cart on Right) */");
    expect(activationIndex).toBeGreaterThan(-1);
    expect(activationIndex).toBeLessThan(mainGridIndex);

    const activationRegionStart = source.lastIndexOf("<button", activationIndex);
    const activationRegionEnd = source.indexOf("</button>", activationIndex);
    const activationRegion = source.slice(activationRegionStart, activationRegionEnd);

    expect(activationRegion).not.toContain("disabled={cart.length === 0}");
  });

  it("keeps the historical sale date control on the New Sale surface", () => {
    const source = fs.readFileSync(POS_PAGE, "utf8");

    expect(source).toContain("Backdated Sale Control Surface");
    expect(source).toContain("Historical Sale Date &amp; Time");
    expect(source).toContain('aria-label="Backdated sale date and time"');
    expect(source).toContain("max={toLocalDateTimeInputValue(new Date())}");
    expect(source).toContain("730 * 24 * 60 * 60 * 1000");
  });
});
