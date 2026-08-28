/**
 * KwakoPos Release Engineering Platform v2 — Change Impact Analyzer
 * Dynamically inspects modified git paths and selects required domain certification suites.
 */

export interface ChangeImpactAnalysis {
  modifiedFiles: string[];
  affectedDomains: string[];
  requiredCertificationSuites: string[];
  hasDatabaseMigrations: boolean;
  hasAuthChanges: boolean;
  hasInventoryChanges: boolean;
  hasSyncChanges: boolean;
  hasPWAChanges: boolean;
  impactScore: number;
}

export function analyzeChangeImpact(modifiedFiles: string[]): ChangeImpactAnalysis {
  const affectedDomains = new Set<string>();
  const requiredCertificationSuites = new Set<string>(["CORE"]);

  let hasDatabaseMigrations = false;
  let hasAuthChanges = false;
  let hasInventoryChanges = false;
  let hasSyncChanges = false;
  let hasPWAChanges = false;

  for (const file of modifiedFiles) {
    const f = file.toLowerCase();

    if (f.includes("auth") || f.includes("jwt") || f.includes("rbac")) {
      hasAuthChanges = true;
      affectedDomains.add("AUTH");
      affectedDomains.add("TENANT");
      requiredCertificationSuites.add("AUTH");
      requiredCertificationSuites.add("TENANT");
    }

    if (f.includes("inventory") || f.includes("stock") || f.includes("variant")) {
      hasInventoryChanges = true;
      affectedDomains.add("INVENTORY");
      affectedDomains.add("STOCK_LEDGER");
      requiredCertificationSuites.add("INVENTORY");
      requiredCertificationSuites.add("STOCK_LEDGER");
    }

    if (f.includes("sync") || f.includes("outbox") || f.includes("indexeddb")) {
      hasSyncChanges = true;
      affectedDomains.add("OFFLINE_SYNC");
      requiredCertificationSuites.add("OFFLINE_SYNC");
    }

    if (f.includes("sw.ts") || f.includes("service-worker") || f.includes("pwa")) {
      hasPWAChanges = true;
      affectedDomains.add("PWA");
      requiredCertificationSuites.add("PWA");
    }

    if (f.includes("migration") || f.includes("schema.prisma")) {
      hasDatabaseMigrations = true;
      affectedDomains.add("DATABASE");
      requiredCertificationSuites.add("DATABASE_MIGRATION");
    }

    if (f.includes("pos") || f.includes("sales") || f.includes("cashier")) {
      affectedDomains.add("POS");
      requiredCertificationSuites.add("POS");
    }

    if (f.includes("billing") || f.includes("subscription") || f.includes("payment")) {
      affectedDomains.add("SUBSCRIPTIONS");
      requiredCertificationSuites.add("SUBSCRIPTIONS");
    }

    if (f.includes("plugin")) {
      affectedDomains.add("INDUSTRY_MODULES");
      requiredCertificationSuites.add("INDUSTRY_MODULES");
    }
  }

  const impactScore = Math.min(
    100,
    modifiedFiles.length * 2 +
      (hasDatabaseMigrations ? 30 : 0) +
      (hasAuthChanges ? 25 : 0) +
      (hasInventoryChanges ? 20 : 0) +
      (hasSyncChanges ? 20 : 0)
  );

  return {
    modifiedFiles,
    affectedDomains: Array.from(affectedDomains),
    requiredCertificationSuites: Array.from(requiredCertificationSuites),
    hasDatabaseMigrations,
    hasAuthChanges,
    hasInventoryChanges,
    hasSyncChanges,
    hasPWAChanges,
    impactScore,
  };
}
