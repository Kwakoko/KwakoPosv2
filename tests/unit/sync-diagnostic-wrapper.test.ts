/**
 * KwakoPos v2 — Sync Diagnostic Failure Wrapper & Error Panel Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests verifying:
 *   1. Diagnostic error categorization (HTTP 403, 401, 500, Network, Schema)
 *   2. Operator remediation generation without console access
 *   3. Automatic capture in clientSyncEngine.runSync()
 *   4. Diagnostic wrapper execution and error retention
 *   5. Real-time notification and error clearing
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  syncDiagnosticService,
  type SyncDiagnosticErrorEntry
} from "../../apps/web/src/services/syncDiagnosticService.js";
import { ClientSyncEngine, clientSyncEngine } from "../../apps/web/src/clientSyncEngine.js";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";

describe("SyncDiagnosticService & Operator Failure Panel", () => {
  let localDb: LocalIndexedDbStore;

  beforeEach(async () => {
    syncDiagnosticService.clearErrors();
    localDb = new LocalIndexedDbStore(5);
    await localDb.ready;
    localDb.clear({ allowDestructiveReset: true });
  });

  it("1. Parses HTTP 403 Forbidden into AUTH_FORBIDDEN with actionable operator remediation", () => {
    const error = new Error("Sync push failed: HTTP 403");
    const entry = syncDiagnosticService.parseError(error, {
      endpoint: "/sync/push",
      tenantId: "tenant-bravo",
      outboxPendingCount: 4,
    });

    expect(entry.statusCode).toBe(403);
    expect(entry.category).toBe("AUTH_FORBIDDEN");
    expect(entry.title).toContain("HTTP 403");
    expect(entry.remediation).toContain("permissions");
    expect(entry.endpoint).toBe("/sync/push");
    expect(entry.outboxPendingCount).toBe(4);
  });

  it("2. Parses HTTP 401 into AUTH_UNAUTHORIZED and guides session renewal", () => {
    const error = new Error("Request failed with status code 401: Unauthorized");
    const entry = syncDiagnosticService.parseError(error);

    expect(entry.statusCode).toBe(401);
    expect(entry.category).toBe("AUTH_UNAUTHORIZED");
    expect(entry.remediation).toContain("log out and sign back in");
  });

  it("3. Parses network disconnects and confirms outbox safety", () => {
    const error = new TypeError("Failed to fetch");
    const entry = syncDiagnosticService.parseError(error);

    expect(entry.category).toBe("NETWORK_DISCONNECTED");
    expect(entry.remediation).toContain("safely staged");
  });

  it("4. Automatically logs failure to diagnostic service when clientSyncEngine.runSync() encounters HTTP 403", async () => {
    const failingPushApi = vi.fn(async () => {
      throw new Error("Sync push failed: HTTP 403 Forbidden");
    });
    const mockDeltaApi = vi.fn(async () => ({
      changes: [],
      serverTimestamp: new Date().toISOString(),
      hasMore: false,
    }));

    clientSyncEngine.init({
      localDb,
      pushApiFn: failingPushApi,
      deltaApiFn: mockDeltaApi,
      tenantId: "tenant-err-test",
    });

    localDb.enqueueOutbox({
      entityType: "Product",
      entityId: "prod-err-1",
      operationType: "CREATE",
      payload: { name: "Sample Item" },
      tenantId: "tenant-err-test",
    });

    // Run sync and expect rejection
    await expect(clientSyncEngine.runSync()).rejects.toThrow("HTTP 403");

    // Verify error was logged in syncDiagnosticService
    const loggedErrors = syncDiagnosticService.getErrors();
    expect(loggedErrors.length).toBeGreaterThanOrEqual(1);

    const latest = syncDiagnosticService.getLatestError();
    expect(latest).not.toBeNull();
    expect(latest?.statusCode).toBe(403);
    expect(latest?.category).toBe("AUTH_FORBIDDEN");
    expect(latest?.tenantId).toBe("tenant-err-test");
    expect(latest?.outboxPendingCount).toBe(1);
  });

  it("5. Diagnostic wrapSync executes cleanly on success and records on failure", async () => {
    const successFn = vi.fn(async () => "SYNC_OK");
    const result = await syncDiagnosticService.wrapSync(successFn);
    expect(result).toBe("SYNC_OK");
    expect(syncDiagnosticService.getErrors().length).toBe(0);

    const failFn = vi.fn(async () => {
      throw new Error("Gateway timeout HTTP 504");
    });
    await expect(syncDiagnosticService.wrapSync(failFn)).rejects.toThrow("HTTP 504");

    const errors = syncDiagnosticService.getErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].statusCode).toBe(504);
    expect(errors[0].category).toBe("SERVER_FAILURE");
  });

  it("6. Emits live updates to diagnostic subscribers and supports clearing", () => {
    let capturedList: SyncDiagnosticErrorEntry[] = [];
    const unsubscribe = syncDiagnosticService.subscribe((list) => {
      capturedList = list;
    });

    syncDiagnosticService.logFailure(new Error("Test error 1"));
    expect(capturedList.length).toBe(1);

    syncDiagnosticService.logFailure(new Error("Test error 2"));
    expect(capturedList.length).toBe(2);

    syncDiagnosticService.clearErrors();
    expect(capturedList.length).toBe(0);

    unsubscribe();
  });
});
