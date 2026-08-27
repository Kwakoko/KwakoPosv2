import type {
  TelecomMicrowaveLink,
  TelecomSite,
} from "@kwakopos2/contracts";

export class TelecomEngine {
  /**
   * Calculates Free Space Path Loss (FSPL) in dB:
   * FSPL = 92.45 + 20*log10(d_km) + 20*log10(f_GHz)
   */
  calculateFreeSpacePathLoss(distanceKm: number, frequencyGhz: number): number {
    const fspl = 92.45 + 20 * Math.log10(distanceKm) + 20 * Math.log10(frequencyGhz);
    return Math.round(fspl * 100) / 100;
  }

  /**
   * Calculates Received Signal Level (RSL) in dBm:
   * RSL = TxPower + TxAntennaGain + RxAntennaGain - FSPL - MiscLoss
   */
  calculateReceivedSignalLevel(
    txPowerDbm: number,
    nearAntennaGainDbi: number,
    farAntennaGainDbi: number,
    fsplDb: number,
    miscLossDb = 2
  ): number {
    const rsl = txPowerDbm + nearAntennaGainDbi + farAntennaGainDbi - fsplDb - miscLossDb;
    return Math.round(rsl * 100) / 100;
  }

  /**
   * Calculates 1st Fresnel Zone Radius at mid-path (meters):
   * r = 8.657 * sqrt(distanceKm / frequencyGhz)
   */
  calculateFresnelZoneRadius(distanceKm: number, frequencyGhz: number): number {
    const r = 8.657 * Math.sqrt(distanceKm / frequencyGhz);
    return Math.round(r * 100) / 100;
  }

  /**
   * Computes True Azimuth bearing between two geographic coordinates in degrees (0 - 360).
   */
  calculateAzimuth(
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
}
