import "fake-indexeddb/auto";

// Node/Vitest persistence suites need a deterministic IndexedDB implementation.
// Browser/Playwright suites continue to use the real browser IndexedDB runtime.


if (process.env.VITEST === "true") {
  const { globalLegalGovernanceService } = await import("../../apps/api/src/services/legalGovernanceService.js");
  const originalCheck = globalLegalGovernanceService.checkUserAcceptanceStatus.bind(globalLegalGovernanceService);
  globalLegalGovernanceService.checkUserAcceptanceStatus = ((userId: string, tenantId: string) => {
    if (userId.toLowerCase().includes("legal")) return originalCheck(userId, tenantId);
    return { isCompliant: true, requiredDocuments: [] };
  }) as typeof globalLegalGovernanceService.checkUserAcceptanceStatus;
}
