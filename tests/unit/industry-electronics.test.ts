import { describe, expect, it } from "vitest";
import { ElectronicsEngine } from "@kwakopos2/domain";

describe("Industry Engine: Electronics", () => {
  const engine = new ElectronicsEngine();

  it("accepts a valid IMEI using Luhn validation", () => {
    expect(engine.validateImei("490154203237518")).toBe("490154203237518");
  });

  it("rejects malformed IMEIs", () => {
    expect(() => engine.validateImei("123456789012345")).toThrow(/INVALID_ELECTRONICS_IMEI/);
  });

  it("calculates warranty expiry from sale date", () => {
    const result = engine.calculateWarranty(
      "2026-01-01T00:00:00.000Z",
      { warrantyDays: 365, startMode: "SALE_DATE" },
      null,
      "2026-06-01T00:00:00.000Z"
    );

    expect(result.startDate).toBe("2026-01-01T00:00:00.000Z");
    expect(result.expiryDate).toBe("2027-01-01T00:00:00.000Z");
    expect(result.active).toBe(true);
    expect(result.daysRemaining).toBe(214);
  });

  it("expands bundles deterministically", () => {
    expect(engine.expandBundle([
      { sku: "PHONE-001", quantity: 1 },
      { sku: "CASE-001", quantity: 2 },
    ], 3)).toEqual([
      { sku: "PHONE-001", quantity: 3 },
      { sku: "CASE-001", quantity: 6 },
    ]);
  });
});
