import { describe, it, expect } from "vitest";
import { TelecomEngine } from "@kwakopos2/domain";

describe("Phase 5 Telecom Microwave Engineering Calculations", () => {
  // Reference Case: Dar es Salaam (-6.7924, 39.2083) to Bagamoyo (-6.4389, 38.9056)
  const siteA = { latitude: -6.7924, longitude: 39.2083, elevationMeters: 15, antennaHeightMeters: 45 };
  const siteB = { latitude: -6.4389, longitude: 38.9056, elevationMeters: 10, antennaHeightMeters: 45 };

  it("calculates great-circle distance accurately", () => {
    const distKm = TelecomEngine.calculateGreatCircleDistanceKm(siteA, siteB);
    expect(distKm).toBeGreaterThan(45);
    expect(distKm).toBeLessThan(60);
  });

  it("calculates true azimuth and reverse azimuth within 0-360 degrees", () => {
    const azAtoB = TelecomEngine.calculateAzimuth(siteA.latitude, siteA.longitude, siteB.latitude, siteB.longitude);
    const azBtoA = TelecomEngine.calculateReverseAzimuth(siteA.latitude, siteA.longitude, siteB.latitude, siteB.longitude);

    expect(azAtoB).toBeGreaterThanOrEqual(0);
    expect(azAtoB).toBeLessThanOrEqual(360);
    expect(azBtoA).toBeGreaterThanOrEqual(0);
    expect(azBtoA).toBeLessThanOrEqual(360);

    // Approx 180 degrees reciprocal difference on sphere
    const diff = Math.abs(Math.abs(azAtoB - azBtoA) - 180);
    expect(diff).toBeLessThan(5);
  });

  it("calculates antenna elevation tilt angle correctly", () => {
    const heightA = (siteA.elevationMeters || 0) + (siteA.antennaHeightMeters || 0); // 60m
    const heightB = (siteB.elevationMeters || 0) + (siteB.antennaHeightMeters || 0); // 55m
    const tilt = TelecomEngine.calculateElevationAngle(heightA, heightB, 50.0);
    expect(tilt).toBeLessThan(1.0);
    expect(tilt).toBeGreaterThan(-1.0);
  });

  it("calculates Free Space Path Loss (FSPL) according to standard RF formula", () => {
    // FSPL(10 km, 13 GHz) = 92.45 + 20*log10(13) + 20*log10(10) = 92.45 + 22.28 + 20 = 134.73 dB
    const fspl = TelecomEngine.calculateFreeSpacePathLoss(10, 13);
    expect(fspl).toBeCloseTo(134.73, 1);
  });

  it("calculates 1st Fresnel zone clearance radius at midpoint", () => {
    // r1 = 8.656 * sqrt(10 / 13) = 8.656 * 0.877 = 7.59 meters
    const r1 = TelecomEngine.calculateFresnelZoneRadius(10, 13);
    expect(r1).toBeCloseTo(7.59, 1);
  });

  it("executes complete reproducible link budget calculation", () => {
    const calculation = TelecomEngine.executeLinkBudgetCalculation({
      siteA,
      siteB,
      frequencyGhz: 13.0,
      txPowerDbm: 24.0,
      antennaGainDbiSiteA: 38.0,
      antennaGainDbiSiteB: 38.0,
      feederLossSiteADb: 1.5,
      feederLossSiteBDb: 1.5,
      receiverSensitivityDbm: -72.0,
    });

    expect(calculation.distanceKm).toBeGreaterThan(0);
    expect(calculation.freeSpacePathLossDb).toBeGreaterThan(100);
    expect(calculation.receivedSignalLevelDbm).toBeLessThan(0);
    expect(calculation.fadeMarginDb).toBeDefined();
    expect(calculation.calculationVersion).toBe(2);
    expect(calculation.calculatedAt).toBeDefined();
  });

  it("converts engineering units without altering underlying canonical values", () => {
    const km = 10.0;
    expect(TelecomEngine.convertDistance(km, "MILES")).toBeCloseTo(6.214, 2);
    expect(TelecomEngine.convertDistance(km, "METERS")).toBe(10000);
    expect(TelecomEngine.convertDistance(km, "FEET")).toBeCloseTo(32808.4, 1);

    const dbm = 30.0; // 30 dBm = 1 Watt = 1000 mW
    expect(TelecomEngine.convertPower(dbm, "WATTS")).toBe(1.0);
    expect(TelecomEngine.convertPower(dbm, "MILLIWATTS")).toBe(1000.0);
  });
});
