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

  constructor(localVersion = "2.0.0", pwaSchemaVersion = 3, localDb?: LocalIndexedDbStore) {
    this.localVersion = localVersion;
    this.pwaSchemaVersion = pwaSchemaVersion;
    this.localDb = localDb || new LocalIndexedDbStore();
  }

  getLocalVersion(): string {
    return this.localVersion;
  }

  getFormattedVersionDisplay(): string {
    return `KwakoPos © 2026 • Version ${this.localVersion}`;
  }

  async checkServerVersion(endpoint = "/api/system/version"): Promise<{
    isUpToDate: boolean;
    localVersion: string;
    serverVersion: string;
    serverInfo: Partial<VersionInfo>;
  }> {
    try {
      let serverInfo: any = {};
      if (typeof fetch !== "undefined") {
        const res = await fetch(endpoint);
        if (res.ok) {
          serverInfo = await res.json();
        }
      }

      const serverVersion = serverInfo.appVersion || serverInfo.version || this.localVersion;
      const isUpToDate = this.localVersion === serverVersion;

      return {
        isUpToDate,
        localVersion: this.localVersion,
        serverVersion,
        serverInfo,
      };
    } catch (err: any) {
      globalRumCollector.recordError(err);
      return {
        isUpToDate: true,
        localVersion: this.localVersion,
        serverVersion: this.localVersion,
        serverInfo: {},
      };
    }
  }

  /**
   * Safely upgrades the local PWA schema while guaranteeing zero data loss
   * of pending outbox mutations, products, variants, and stock ledger entries.
   */
  performSafePwaUpgrade(targetSchemaVersion: number): {
    upgraded: boolean;
    preservedOutboxCount: number;
    preservedProductCount: number;
    preservedVariantCount: number;
    newVersion: number;
  } {
    const migration = this.localDb.migrateToVersion(targetSchemaVersion);
    this.pwaSchemaVersion = migration.newVersion;

    globalRumCollector.recordPwaState("update-ready");

    return {
      upgraded: true,
      preservedOutboxCount: migration.preservedOutboxCount,
      preservedProductCount: this.localDb.products.size,
      preservedVariantCount: this.localDb.productVariants.size,
      newVersion: migration.newVersion,
    };
  }
}

export const globalPwaVersionManager = new PwaVersionManager();