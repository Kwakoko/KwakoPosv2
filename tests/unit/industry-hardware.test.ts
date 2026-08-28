import { describe, expect, it } from "vitest";
import { HardwareEngine } from "@kwakopos2/domain/src/hardwareEngine";

describe("Industry Engine: Hardware", () => {
  const engine = new HardwareEngine();

  it("calculates pack pricing and loose units", () => {
    const result = engine.calculatePackPricing(25, 1000, {
      unitName: "piece",
      unitsPerPack: 10,
      packPrice: 9000,
    });

    expect(result.priceBasis).toBe("PACK");
    expect(result.packs).toBe(2);
    expect(result.looseUnits).toBe(5);
    expect(result.extendedPrice).toBe(23000);
  });

  it("honours a minimum cut-service charge", () => {
    expect(engine.calculateCutCharge(2, { chargePerUnit: 100, minimumCharge: 500 })).toBe(500);
    expect(engine.calculateCutCharge(10, { chargePerUnit: 100, minimumCharge: 500 })).toBe(1000);
  });

  it("derives a reorder point from usage, lead time and safety stock", () => {
    expect(engine.calculateReorderPoint(8.2, 7, 10)).toBe(68);
  });

  it("rejects invalid quantities", () => {
    expect(() => engine.calculatePackPricing(-1, 1000)).toThrow(/INVALID_HARDWARE_INPUT/);
  });
});
