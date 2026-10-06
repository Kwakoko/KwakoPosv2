/**
 * KwakoPos Enterprise Release Compatibility Matrix
 * Binds applicationVersion, pwaVersion, schemaVersion, syncProtocolVersion,
 * releaseId, databaseCompatibilityRange, minSupportedClientVersion,
 * maxSupportedClientVersion, and migrationSet.
 */

export interface ReleaseCompatibilityMatrix {
  applicationVersion: string;
  pwaVersion: string;
  schemaVersion: number;
  syncProtocolVersion: number;
  releaseId: string;
  databaseCompatibilityRange: string; // e.g. ">=1 <=4"
  minimumSupportedClientVersion: string;
  maximumSupportedClientVersion: string;
  migrationSet: {
    supportedForward: string[]; // e.g. ["1->2", "2->3", "3->4"]
    supportedBackward: string[]; // e.g. ["4->3", "4->2", "3->2", "2->1"]
  };
}

export const AUTHORITATIVE_COMPATIBILITY_MATRIX: ReleaseCompatibilityMatrix = {
  applicationVersion: "2.13.0",
  pwaVersion: "2.13.0",
  schemaVersion: 6,
  syncProtocolVersion: 2,
  releaseId: "kwakopos-rel-2.13.0-7cd1d44",
  databaseCompatibilityRange: ">=1 <=6",
  minimumSupportedClientVersion: "2.0.0",
  maximumSupportedClientVersion: "3.0.0",
  migrationSet: {
    supportedForward: ["1->2", "2->3", "3->4", "4->5", "1->3", "1->4", "1->5", "2->4", "2->5", "3->5"],
    supportedBackward: ["4->3", "4->2", "4->1", "3->2", "3->1", "2->1"],
  },
};

export interface CompatibilityCheckResult {
  compatible: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export function parseSemVerParts(v: string): [number, number, number] {
  const clean = v.replace(/^v/, "").trim();
  const [major, minor, patch] = clean.split(".").map((n) => parseInt(n, 10) || 0);
  return [major, minor, patch];
}

export function compareSemVer(v1: string, v2: string): number {
  const [maj1, min1, pat1] = parseSemVerParts(v1);
  const [maj2, min2, pat2] = parseSemVerParts(v2);
  if (maj1 !== maj2) return maj1 - maj2;
  if (min1 !== min2) return min1 - min2;
  return pat1 - pat2;
}

export function validateReleaseCompatibility(
  candidate: {
    applicationVersion?: string;
    pwaVersion?: string;
    schemaVersion?: number;
    syncProtocolVersion?: number;
  },
  matrix: ReleaseCompatibilityMatrix = AUTHORITATIVE_COMPATIBILITY_MATRIX,
): CompatibilityCheckResult {
  const appVer = candidate.applicationVersion || matrix.applicationVersion;
  const schemaVer = candidate.schemaVersion ?? matrix.schemaVersion;
  const syncVer = candidate.syncProtocolVersion ?? matrix.syncProtocolVersion;

  // Check client version range
  if (compareSemVer(appVer, matrix.minimumSupportedClientVersion) < 0) {
    return {
      compatible: false,
      reason: `CLIENT_TOO_OLD: version ${appVer} is below minimum supported version ${matrix.minimumSupportedClientVersion}`,
    };
  }

  if (compareSemVer(appVer, matrix.maximumSupportedClientVersion) > 0) {
    return {
      compatible: false,
      reason: `CLIENT_TOO_NEW: version ${appVer} exceeds maximum supported version ${matrix.maximumSupportedClientVersion}`,
    };
  }

  // Check schema version range
  if (schemaVer < 1 || schemaVer > 5) {
    return {
      compatible: false,
      reason: `SCHEMA_INCOMPATIBLE: schema version ${schemaVer} is outside supported range ${matrix.databaseCompatibilityRange}`,
    };
  }

  // Check sync protocol version
  if (syncVer !== matrix.syncProtocolVersion) {
    return {
      compatible: false,
      reason: `SYNC_PROTOCOL_MISMATCH: expected protocol ${matrix.syncProtocolVersion}, received ${syncVer}`,
    };
  }

  return { compatible: true };
}
