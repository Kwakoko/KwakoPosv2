import { describe, it, expect } from "vitest";
import { TelecomEngine } from "@kwakopos2/domain";

describe("Industry Engine: Telecom & Microwave Link Engineering", () => {
  const engine = new TelecomEngine();

  it("calculates Free Space Path Loss (FSPL) accurately", () => {
    // Distance = 10 km, Frequency = 18 GHz
    // FSPL = 92.45 + 20*log10(10) + 20*log10(18) = 92.45 + 20 + 25.105 = 137.56 dB
    const fspl = engine.calculateFreeSpacePathLoss(10, 18);
    expect(fspl).toBeCloseTo(137.56, 1);
  });

  it("calculates Received Signal Level (RSL) and link budget", () => {
    const fspl = engine.calculateFreeSpacePathLoss(10, 18);
    // RSL = +20 dBm (Tx) + 38 dBi (Tx Ant) + 38 dBi (Rx Ant) - 137.56 dB (FSPL) - 2 dB (Loss: 1dB + 1dB)
    // RSL = 20 + 38 + 38 - 137.56 - 2 = -43.56 dBm
    const rsl = engine.calculateReceivedSignalLevel(20, 38, 38, fspl, 1, 1);
    expect(rsl).toBeCloseTo(-43.56, 1);
  });


  it("calculates Fresnel Zone clearance radius at mid-path", () => {
    // r = 8.657 * sqrt(10 / 18) = 8.657 * 0.74535 = 6.45 meters
    const radius = engine.calculateFresnelZoneRadius(10, 18);
    expect(radius).toBeCloseTo(6.45, 1);
  });

  it("calculates True Azimuth bearing between tower coordinates", () => {
    // Site A: Dar es Salaam (-6.8235, 39.2695)
    // Site B: Bagamoyo (-6.4440, 38.9056)
    const azimuth = engine.calculateAzimuth(-6.8235, 39.2695, -6.4440, 38.9056);
    expect(azimuth).toBeGreaterThanOrEqual(0);
    expect(azimuth).toBeLessThanOrEqual(360);
    // Northwest bearing roughly ~315 degrees
    expect(azimuth).toBeGreaterThan(300);
    expect(azimuth).toBeLessThan(340);
  });
});
