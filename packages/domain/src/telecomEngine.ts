import type {
  TelecomMicrowaveLink,
  TelecomSite,
  MicrowaveLinkCalculation,
  GeoCoordinate,
} from "@kwakopos2/contracts";

export interface MicrowaveCalculationInputs {
  siteA: { latitude: number; longitude: number; elevationMeters?: number; antennaHeightMeters?: number };
  siteB: { latitude: number; longitude: number; elevationMeters?: number; antennaHeightMeters?: number };
  frequencyGhz: number;
  txPowerDbm: number;
  antennaGainDbiSiteA: number;
  antennaGainDbiSiteB: number;
  feederLossSiteADb?: number;
  feederLossSiteBDb?: number;
  receiverSensitivityDbm?: number; // default e.g. -70 dBm
}

export class TelecomEngine {
  public static readonly CURRENT_CALCULATION_ENGINE_VERSION = 2;

  /**
   * Calculates Great-Circle Distance between two coordinates in Kilometers using Haversine formula.
   */
  static calculateGreatCircleDistanceKm(
    coordA: { latitude: number; longitude: number },
    coordB: { latitude: number; longitude: number }
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371.0; // Earth radius in km

    const dLat = toRad(coordB.latitude - coordA.latitude);
    const dLon = toRad(coordB.longitude - coordA.longitude);
    const lat1 = toRad(coordA.latitude);
    const lat2 = toRad(coordB.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const dist = R * c;
    return Math.round(dist * 1000) / 1000;
  }

  /**
   * Computes True Azimuth bearing between two geographic coordinates in degrees (0 - 360).
   */
  static calculateAzimuth(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const toDeg = (rad: number) => (rad * 180) / Math.PI;

    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const deltaLambda = toRad(lon2 - lon1);

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

    let bearing = toDeg(Math.atan2(y, x));
    bearing = (bearing + 360) % 360;
    return Math.round(bearing * 100) / 100;
  }

  /**
   * Computes Reverse Azimuth from far site back to near site in degrees (0 - 360).
   */
  static calculateReverseAzimuth(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    return this.calculateAzimuth(lat2, lon2, lat1, lon1);
  }

  /**
   * Computes Antenna Elevation / Tilt Angle between Site A and Site B in degrees.
   */
  static calculateElevationAngle(
    heightA: number,
    heightB: number,
    distanceKm: number
  ): number {
    if (distanceKm <= 0) return 0;
    const heightDiffKm = (heightB - heightA) / 1000;
    const angleRad = Math.atan2(heightDiffKm, distanceKm);
    const angleDeg = (angleRad * 180) / Math.PI;
    return Math.round(angleDeg * 100) / 100;
  }

  /**
   * Calculates Free Space Path Loss (FSPL) in dB:
   * FSPL = 92.45 + 20*log10(f_GHz) + 20*log10(d_km)
   */
  static calculateFreeSpacePathLoss(distanceKm: number, frequencyGhz: number): number {
    if (distanceKm <= 0 || frequencyGhz <= 0) return 0;
    const fspl = 92.45 + 20 * Math.log10(distanceKm) + 20 * Math.log10(frequencyGhz);
    return Math.round(fspl * 100) / 100;
  }

  /**
   * Calculates 1st Fresnel Zone Radius at mid-path (meters):
   * r_1 = 8.656 * sqrt(d_km / f_GHz)
   */
  static calculateFresnelZoneRadius(distanceKm: number, frequencyGhz: number): number {
    if (distanceKm <= 0 || frequencyGhz <= 0) return 0;
    const r = 8.656 * Math.sqrt(distanceKm / frequencyGhz);
    return Math.round(r * 100) / 100;
  }

  /**
   * Calculates Received Signal Level (RSL) in dBm:
   * RSL = TxPower + TxGain + RxGain - FSPL - FeederLossA - FeederLossB
   */
  static calculateReceivedSignalLevel(
    txPowerDbm: number,
    nearGainDbi: number,
    farGainDbi: number,
    fsplDb: number,
    feederLossADb = 1.5,
    feederLossBDb = 1.5
  ): number {
    const rsl = txPowerDbm + nearGainDbi + farGainDbi - fsplDb - feederLossADb - feederLossBDb;
    return Math.round(rsl * 100) / 100;
  }

  /**
   * Calculates Fade Margin in dB:
   * Fade Margin = Received Signal Level - Receiver Sensitivity
   */
  static calculateFadeMargin(rslDbm: number, receiverSensitivityDbm = -70.0): number {
    const fm = rslDbm - receiverSensitivityDbm;
    return Math.round(fm * 100) / 100;
  }

  /**
   * Executes a complete, reproducible Microwave Link Budget calculation.
   */
  static executeLinkBudgetCalculation(inputs: MicrowaveCalculationInputs): MicrowaveLinkCalculation {
    const distanceKm = this.calculateGreatCircleDistanceKm(inputs.siteA, inputs.siteB);
    const trueAzimuthDegreesSiteAToB = this.calculateAzimuth(
      inputs.siteA.latitude,
      inputs.siteA.longitude,
      inputs.siteB.latitude,
      inputs.siteB.longitude
    );
    const reverseAzimuthDegreesSiteBToA = this.calculateReverseAzimuth(
      inputs.siteA.latitude,
      inputs.siteA.longitude,
      inputs.siteB.latitude,
      inputs.siteB.longitude
    );

    const totalHeightA = (inputs.siteA.elevationMeters || 0) + (inputs.siteA.antennaHeightMeters || 30);
    const totalHeightB = (inputs.siteB.elevationMeters || 0) + (inputs.siteB.antennaHeightMeters || 30);
    const elevationAngleDegreesSiteAToB = this.calculateElevationAngle(totalHeightA, totalHeightB, distanceKm);

    const freeSpacePathLossDb = this.calculateFreeSpacePathLoss(distanceKm, inputs.frequencyGhz);
    const fresnelZoneRadiusMeters = this.calculateFresnelZoneRadius(distanceKm, inputs.frequencyGhz);

    const receivedSignalLevelDbm = this.calculateReceivedSignalLevel(
      inputs.txPowerDbm,
      inputs.antennaGainDbiSiteA,
      inputs.antennaGainDbiSiteB,
      freeSpacePathLossDb,
      inputs.feederLossSiteADb || 1.5,
      inputs.feederLossSiteBDb || 1.5
    );

    const receiverSensitivity = inputs.receiverSensitivityDbm !== undefined ? inputs.receiverSensitivityDbm : -70.0;
    const fadeMarginDb = this.calculateFadeMargin(receivedSignalLevelDbm, receiverSensitivity);

    const linkBudgetValid = fadeMarginDb >= 15.0; // Adequate fade margin threshold >= 15 dB

    return {
      distanceKm,
      trueAzimuthDegreesSiteAToB,
      reverseAzimuthDegreesSiteBToA,
      elevationAngleDegreesSiteAToB,
      freeSpacePathLossDb,
      fresnelZoneRadiusMeters,
      receivedSignalLevelDbm,
      fadeMarginDb,
      linkBudgetValid,
      calculationVersion: this.CURRENT_CALCULATION_ENGINE_VERSION,
      calculatedAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  // Unit System Presentation Helpers
  // =========================================================================

  static convertDistance(km: number, targetUnit: "KM" | "MILES" | "METERS" | "FEET"): number {
    switch (targetUnit) {
      case "MILES":
        return Math.round(km * 0.621371 * 1000) / 1000;
      case "METERS":
        return Math.round(km * 1000 * 100) / 100;
      case "FEET":
        return Math.round(km * 3280.84 * 100) / 100;
      case "KM":
      default:
        return km;
    }
  }

  static convertPower(dbm: number, targetUnit: "DBM" | "WATTS" | "MILLIWATTS"): number {
    switch (targetUnit) {
      case "MILLIWATTS":
        return Math.round(Math.pow(10, dbm / 10) * 100) / 100;
      case "WATTS":
        return Math.round((Math.pow(10, dbm / 10) / 1000) * 10000) / 10000;
      case "DBM":
      default:
        return dbm;
    }
  }

  // Instance delegation methods
  calculateFreeSpacePathLoss(distanceKm: number, frequencyGhz: number): number {
    return TelecomEngine.calculateFreeSpacePathLoss(distanceKm, frequencyGhz);
  }

  calculateReceivedSignalLevel(
    txPowerDbm: number,
    nearGainDbi: number,
    farGainDbi: number,
    fsplDb: number,
    feederLossADb = 1.5,
    feederLossBDb = 1.5
  ): number {
    return TelecomEngine.calculateReceivedSignalLevel(txPowerDbm, nearGainDbi, farGainDbi, fsplDb, feederLossADb, feederLossBDb);
  }

  calculateFresnelZoneRadius(distanceKm: number, frequencyGhz: number): number {
    return TelecomEngine.calculateFresnelZoneRadius(distanceKm, frequencyGhz);
  }

  calculateAzimuth(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return TelecomEngine.calculateAzimuth(lat1, lon1, lat2, lon2);
  }
}

