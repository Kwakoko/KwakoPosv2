import * as fs from "fs";
import * as path from "path";

export interface CompatibilityMetadata {
  databaseSchemaVersion: number;
  syncProtocolVersion: number;
  pwaSchemaVersion: number;
  minSupportedClientVersion: string;
  recommendedClientVersion: string;
  maximumSupportedClientVersion: string;
  migrationSet: string[];
}

export interface AuthoritativeReleaseIdentity {
  appVersion: string;
  version: string;
  tag: string;
  gitTag: string;
  gitSha: string;
  buildId: string;
  buildNumber?: number;
  releaseId: string;
  containerDigest: string | null;
  cloudRunRevision: string | null;
  environment: string;
  releaseChannel: string;
  releasedAt: string;
  releaseTimestamp: string;
  pwaVersion: string;
  pwaSchemaVersion: number;
  syncProtocolVersion: number;
  databaseSchemaVersion: number;
  minimumSupportedClientVersion: string;
  maximumSupportedClientVersion: string;
  certification: "PASS" | "FAIL" | "PENDING";
  compatibility: CompatibilityMetadata;
  brand: {
    parentBrand: string;
    platform: string;
    platformShort: string;
    posCapability: string;
  };
}

export const FALLBACK_AUTHORITATIVE_RELEASE: AuthoritativeReleaseIdentity = {
  appVersion: "0.0.0-dev",
  version: "0.0.0-dev",
  tag: "v0.0.0-dev",
  gitTag: "v0.0.0-dev",
  gitSha: "",
  buildId: "",
  buildNumber: 0,
  releaseId: "",
  containerDigest: null,
  cloudRunRevision: null,
  environment: "development",
  releaseChannel: "stable",
  releasedAt: "2026-09-15T20:10:00.000Z",
  releaseTimestamp: "2026-09-15T20:10:00.000Z",
  pwaVersion: "0.0.0-dev",
  pwaSchemaVersion: 4,
  syncProtocolVersion: 2,
  databaseSchemaVersion: 4,
  minimumSupportedClientVersion: "2.0.0",
  maximumSupportedClientVersion: "3.0.0",
  certification: "PENDING",
  compatibility: {
    databaseSchemaVersion: 4,
    syncProtocolVersion: 2,
    pwaSchemaVersion: 4,
    minSupportedClientVersion: "2.0.0",
    recommendedClientVersion: "0.0.0-dev",
    maximumSupportedClientVersion: "3.0.0",
    migrationSet: ["1->2", "2->3", "3->4", "4->3", "4->2", "3->2", "2->1"],
  },
  brand: {
    parentBrand: "Kwakoko",
    platform: "Kwakoko Business Operating System",
    platformShort: "Kwakoko BOS",
    posCapability: "KwakoPos",
  },
};

function isNodeRuntime(): boolean {
  return (
    typeof window === "undefined" &&
    typeof process !== "undefined" &&
    Boolean(process?.versions?.node) &&
    typeof path?.join === "function" &&
    typeof fs?.existsSync === "function"
  );
}

export function loadAuthoritativeRelease(cwd?: string): AuthoritativeReleaseIdentity {
  if (!isNodeRuntime()) {
    return FALLBACK_AUTHORITATIVE_RELEASE;
  }
  const root = cwd || (typeof process?.cwd === "function" ? process.cwd() : "/");
  // Traverse upwards looking for release-manifest.json
  let currentDir = root;
  for (let i = 0; i < 4; i++) {
    if (typeof path?.join !== "function" || typeof fs?.existsSync !== "function") {
      break;
    }
    const candidate = path.join(currentDir, "release-manifest.json");
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, "utf8");
        const parsed = JSON.parse(raw);
        return {
          ...FALLBACK_AUTHORITATIVE_RELEASE,
          ...parsed,
          compatibility: {
            ...FALLBACK_AUTHORITATIVE_RELEASE.compatibility,
            ...(parsed.compatibility || {}),
          },
        };
      } catch {
        /* ignore parse error */
      }
    }
    if (typeof path?.dirname !== "function") break;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  if (typeof path?.join !== "function" || typeof fs?.existsSync !== "function") {
    return FALLBACK_AUTHORITATIVE_RELEASE;
  }
  const packagePath = path.join(root, "package.json");
  let version = "";
  if (fs.existsSync(packagePath)) {
    try { version = JSON.parse(fs.readFileSync(packagePath, "utf8")).version || version; } catch {}
  }
  return {
    ...FALLBACK_AUTHORITATIVE_RELEASE,
    appVersion: version,
    version,
    tag: `v${version}`,
    gitTag: `v${version}`,
    compatibility: { ...FALLBACK_AUTHORITATIVE_RELEASE.compatibility, recommendedClientVersion: version },
  };
}

export const AUTHORITATIVE_RELEASE = loadAuthoritativeRelease();

export interface VersionDriftReport {
  hasDrift: boolean;
  authoritativeVersion: string;
  mismatches: Array<{
    target: string;
    foundVersion: string;
    expectedVersion: string;
  }>;
}

export function detectVersionDrift(cwd?: string): VersionDriftReport {
  if (!isNodeRuntime()) {
    return {
      hasDrift: false,
      authoritativeVersion: FALLBACK_AUTHORITATIVE_RELEASE.appVersion,
      mismatches: [],
    };
  }
  const root = cwd || (typeof process?.cwd === "function" ? process.cwd() : "/");
  const release = loadAuthoritativeRelease(root);
  const expected = release.appVersion;
  const mismatches: VersionDriftReport["mismatches"] = [];

  // Check root package.json
  const rootPkgPath = path.join(root, "package.json");
  if (fs.existsSync(rootPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
      if (pkg.version !== expected) {
        mismatches.push({ target: "package.json", foundVersion: pkg.version, expectedVersion: expected });
      }
    } catch {
      /* ignore */
    }
  }

  // Check workspace packages
  for (const group of ["apps", "packages"]) {
    const groupDir = path.join(root, group);
    if (fs.existsSync(groupDir)) {
      const subdirs = fs.readdirSync(groupDir);
      for (const sub of subdirs) {
        const pkgFile = path.join(groupDir, sub, "package.json");
        if (fs.existsSync(pkgFile)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
            if (pkg.version !== expected) {
              mismatches.push({ target: `${group}/${sub}/package.json`, foundVersion: pkg.version, expectedVersion: expected });
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  // Check web public manifest
  const manifestPath = path.join(root, "apps/web/public/manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (m.version && m.version !== expected) {
        mismatches.push({ target: "apps/web/public/manifest.json", foundVersion: m.version, expectedVersion: expected });
      }
    } catch {
      /* ignore */
    }
  }

  return {
    hasDrift: mismatches.length > 0,
    authoritativeVersion: expected,
    mismatches,
  };
}
