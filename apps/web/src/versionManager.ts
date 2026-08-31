import { LocalIndexedDbStore } from "./indexedDb.js";
import { globalRumCollector } from "./rum/rumCollector.js";

export interface VersionInfo {
  appVersion: string;
  gitTag: string;
  gitSha?: string;
  cloudRunRevision?: string;
  environment: string;
  pwaSchemaVersion: number;
}

export class PwaVersionManager {
  private localVersion: string;
  private pwaSchemaVersion: number;
  private localDb: LocalIndexedDbStore;

  constructor(localVersion = "2.5.0", pwaSchemaVersion = 3, localDb?: LocalIndexedDbStore) {
    this.localVersion = localVersion;
    this.pwaSchemaVersion = pwaSchemaVersion;
    this.localDb = localDb || new LocalIndexedDbStore();
  }

  getLocalVersion(): string { return this.localVersion; }
  getFormattedVersionDisplay(): string { return `KwakoPos © 2026 • Version ${this.localVersion}`; }

  async checkServerVersion(endpoint = "/api/system/version"): Promise<{
    isUpToDate: boolean;
    localVersion: string;
    serverVersion: string | null;
    serverInfo: Partial<VersionInfo>;
  }> {
    try {
      const res = await fetch(endpoint, { headers: { Accept: "application/json" }, credentials: "include" });
      if (!res.ok) throw new Error(`Version endpoint returned HTTP ${res.status}`);
      const body = await res.json();
      const serverInfo = (body?.data || body) as Partial<VersionInfo>;
      const serverVersion = serverInfo.appVersion || serverInfo.version || null;
      return { isUpToDate: Boolean(serverVersion && this.localVersion === serverVersion), localVersion: this.localVersion, serverVersion, serverInfo };
    } catch (err: unknown) {
      globalRumCollector.recordError(err);
      return { isUpToDate: false, localVersion: this.localVersion, serverVersion: null, serverInfo: {} };
    }
  }

  performSafePwaUpgrade(targetSchemaVersion: number): {
    upgraded: boolean;
    preservedOutboxCount: number;
    preservedProductCount: number;
    preservedVariantCount: number;
    newVersion: number;
  } {
    if (!Number.isInteger(targetSchemaVersion) || targetSchemaVersion < this.pwaSchemaVersion) {
      return { upgraded: false, preservedOutboxCount: this.localDb.getPendingOutbox().length, preservedProductCount: this.localDb.products.size, preservedVariantCount: this.localDb.productVariants.size, newVersion: this.pwaSchemaVersion };
    }
    const migration = this.localDb.migrateToVersion(targetSchemaVersion);
    this.pwaSchemaVersion = migration.newVersion;
    globalRumCollector.recordPwaState("update-ready");
    return { upgraded: migration.newVersion >= targetSchemaVersion, preservedOutboxCount: migration.preservedOutboxCount, preservedProductCount: this.localDb.products.size, preservedVariantCount: this.localDb.productVariants.size, newVersion: migration.newVersion };
  }
}

export const globalPwaVersionManager = new PwaVersionManager();
