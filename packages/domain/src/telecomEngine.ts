import {
  TechnicalAssetRecord,
  WorkOrderIncidentRecord,
  FiberTestResultRecord,
  CustomerAcceptanceRecord,
  TelecomFinancialSummary,
  TechnicalAssetLifecycle,
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
  receiverSensitivityDbm?: number;
}

export interface MicrowaveLinkCalculation {
  distanceKm: number;
  trueAzimuthDegreesSiteAToB: number;
  reverseAzimuthDegreesSiteBToA: number;
  elevationAngleDegreesSiteAToB: number;
  freeSpacePathLossDb: number;
  fresnelZoneRadiusMeters: number;
  receivedSignalLevelDbm: number;
  fadeMarginDb: number;
  linkBudgetValid: boolean;
  calculationVersion: number;
  calculatedAt: string;
}

export class TelecomEngine {
  public static readonly CURRENT_CALCULATION_ENGINE_VERSION = 2;

  private validAssetTransitions: Record<TechnicalAssetLifecycle, TechnicalAssetLifecycle[]> = {
    PROCURED: ["RECEIVED"],
    RECEIVED: ["INSPECTED"],
    INSPECTED: ["IN_STOCK"],
    IN_STOCK: ["RESERVED", "INSTALLED"],
    RESERVED: ["INSTALLED", "IN_STOCK"],
    INSTALLED: ["ACTIVE", "FAULTED"],
    ACTIVE: ["MAINTENANCE", "FAULTED", "RETIRED"],
    MAINTENANCE: ["ACTIVE", "FAULTED", "RETIRED"],
    FAULTED: ["REPAIRED", "RETIRED"],
    REPAIRED: ["ACTIVE", "IN_STOCK"],
    RETIRED: [],
  };

  public validateAssetLifecycleTransition(
    currentStatus: TechnicalAssetLifecycle,
    newStatus: TechnicalAssetLifecycle
  ): boolean {
    if (currentStatus === newStatus) return true;
    const allowed = this.validAssetTransitions[currentStatus] || [];
    return allowed.includes(newStatus);
  }

  public validateFiberOtdrTest(otdrLossDb: number, maxAllowedLossDb = 0.5): boolean {
    return otdrLossDb <= maxAllowedLossDb;
  }

  public evaluateSlaBreach(
    actualResponseHours: number,
    targetResponseHours: number,
    actualResolutionHours: number,
    targetResolutionHours: number
  ): boolean {
    return actualResponseHours > targetResponseHours || actualResolutionHours > targetResolutionHours;
  }

  public calculateSiteMaterialBalance(
    issuedQuantity: number,
    installedQuantity: number,
    returnedQuantity: number
  ): number {
    const balance = issuedQuantity - installedQuantity - returnedQuantity;
    if (balance < 0) {
      throw new Error(`Invalid site material balance: cannot be negative (${balance})`);
    }
    return balance;
  }

  public calculateTelecomFinancialSummary(
    workOrders: WorkOrderIncidentRecord[],
    equipmentRevenueUsd: number,
    laborRevenueUsd: number,
    materialCostUsd: number,
    slaPenaltyUsd = 0
  ): TelecomFinancialSummary {
    const totalWorkOrdersCount = workOrders.length;
    const totalRevenueUsd = equipmentRevenueUsd + laborRevenueUsd;
    const grossMarginUsd = totalRevenueUsd - materialCostUsd - slaPenaltyUsd;
    const grossMarginPct =
      totalRevenueUsd > 0 ? Math.round((grossMarginUsd / totalRevenueUsd) * 1000) / 10 : 0;

    return {
      totalWorkOrdersCount,
      totalEquipmentRevenueUsd: Math.round(equipmentRevenueUsd * 100) / 100,
      totalLaborRevenueUsd: Math.round(laborRevenueUsd * 100) / 100,
      totalMaterialCostUsd: Math.round(materialCostUsd * 100) / 100,
      totalSlaPenaltyDeductionsUsd: Math.round(slaPenaltyUsd * 100) / 100,
      grossMarginUsd: Math.round(grossMarginUsd * 100) / 100,
      grossMarginPct,
    };
  }

  // =========================================================================
  // Microwave Link Budget Calculations
  // =========================================================================

  static calculateGreatCircleDistanceKm(
    coordA: { latitude: number; longitude: number },
    coordB: { latitude: number; longitude: number }
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371.0;

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

  static calculateAzimuth(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

  static calculateReverseAzimuth(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return this.calculateAzimuth(lat2, lon2, lat1, lon1);
  }

  static calculateElevationAngle(heightA: number, heightB: number, distanceKm: number): number {
    if (distanceKm <= 0) return 0;
    const heightDiffKm = (heightB - heightA) / 1000;
    const angleRad = Math.atan2(heightDiffKm, distanceKm);
    const angleDeg = (angleRad * 180) / Math.PI;
    return Math.round(angleDeg * 100) / 100;
  }

  static calculateFreeSpacePathLoss(distanceKm: number, frequencyGhz: number): number {
    if (distanceKm <= 0 || frequencyGhz <= 0) return 0;
    const fspl = 92.45 + 20 * Math.log10(distanceKm) + 20 * Math.log10(frequencyGhz);
    return Math.round(fspl * 100) / 100;
  }

  static calculateFresnelZoneRadius(distanceKm: number, frequencyGhz: number): number {
    if (distanceKm <= 0 || frequencyGhz <= 0) return 0;
    const r = 8.656 * Math.sqrt(distanceKm / frequencyGhz);
    return Math.round(r * 100) / 100;
  }

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

  static calculateFadeMargin(rslDbm: number, receiverSensitivityDbm = -70.0): number {
    const fm = rslDbm - receiverSensitivityDbm;
    return Math.round(fm * 100) / 100;
  }

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

    const linkBudgetValid = fadeMarginDb >= 15.0;

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
