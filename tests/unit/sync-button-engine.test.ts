/**
 * KwakoPos v2 — Client Sync Engine Button & Handler Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests verifying:
 *   1. clientSyncEngine is initialized with DB + API references
 *   2. handleSyncNow hooks into clientSyncEngine.runSync()
 *   3. UI status transitions: IDLE -> RUNNING -> SUCCESS / FAILED
 *   4. Pending outbox item count drops after successful sync runSync()
 *   5. Error detection (e.g. HTTP 403 rejection) transitions status to FAILED and logs
 *   6. Button component renders variant="primary" and attaches onClick handler
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { ClientSyncEngine, clientSyncEngine } from "../../apps/web/src/clientSyncEngine.js";
import { Button } from "../../apps/web/src/components/UI/Button.js";
import type { SyncPushRequest, SyncPushResponse, SyncDeltaResponse } from "@kwakopos2/contracts";

describe("ClientSyncEngine & Sync Button Workflow", () => {
  let localDb: LocalIndexedDbStore;
  let mockPushApi: ReturnType<typeof vi.fn>;
  let mockDeltaApi: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    localDb = new LocalIndexedDbStore(5);

    await localDb.ready;
    localDb.clear({ allowDestructiveReset: true });

    mockPushApi = vi.fn(async (req: SyncPushRequest): Promise<SyncPushResponse> => {
      return {
        success: true,
        results: req.operations.map((op) => ({
          operationId: op.operationId,
          status: "SUCCESS",
          clientCreatedAt: op.clientCreatedAt,
          serverAppliedAt: new Date().toISOString(),
        })),
        serverTimestamp: new Date().toISOString(),
      };
    });

    mockDeltaApi = vi.fn(async (_since?: string): Promise<SyncDeltaResponse> => {
      return {
        changes: [],
        serverTimestamp: new Date().toISOString(),
        hasMore: false,
      };
    });

    // Initialize clientSyncEngine with DB + API references
    clientSyncEngine.init({
      deviceId: "test-device-btn",
      localDb,
      pushApiFn: mockPushApi,
      deltaApiFn: mockDeltaApi,
      tenantId: "tenant-test-01",
      branchId: "branch-test-01",
    });
  });

  it("1. Verifies clientSyncEngine is initialized with DB and API references", async () => {
    expect(clientSyncEngine.localDb).toBe(localDb);
    expect(clientSyncEngine.pushApiFn).toBe(mockPushApi);
    expect(clientSyncEngine.deltaApiFn).toBe(mockDeltaApi);
    expect(clientSyncEngine.defaultTenantId).toBe("tenant-test-01");

    const initialCount = await clientSyncEngine.localDb.getPendingOutboxCount();
    expect(initialCount).toBe(0);
  });

  it("2. Successfully executes handleSyncNow handler, updates status to SUCCESS, and refreshes outbox count", async () => {
    // Stage 2 pending mutations in outbox
    localDb.enqueueOutbox({
      entityType: "Product",
      entityId: "prod-1",
      operationType: "CREATE",
      payload: { name: "Product 1" },
      tenantId: "tenant-test-01",
      branchId: "branch-test-01",
    });
    localDb.enqueueOutbox({
      entityType: "Product",
      entityId: "prod-2",
      operationType: "CREATE",
      payload: { name: "Product 2" },
      tenantId: "tenant-test-01",
      branchId: "branch-test-01",
    });

    let countBefore = await clientSyncEngine.localDb.getPendingOutboxCount();
    expect(countBefore).toBe(2);

    let syncStatus = "IDLE";
    let outboxCount = countBefore;

    const refreshOutboxCount = async () => {
      const count = await clientSyncEngine.localDb.getPendingOutboxCount();
      outboxCount = count;
    };

    const handleSyncNow = async () => {
      try {
        syncStatus = "RUNNING";
        const result = await clientSyncEngine.runSync();
        expect(result.pushed).toBe(2);
        syncStatus = "SUCCESS";
      } catch (err) {
        console.error("Test 2 error:", err);
        syncStatus = "FAILED";
      } finally {
        await refreshOutboxCount();
      }
    };

    // Execute the handler
    await handleSyncNow();

    expect(syncStatus).toBe("SUCCESS");
    expect(outboxCount).toBe(0);
    expect(mockPushApi).toHaveBeenCalledTimes(1);
    expect(mockDeltaApi).toHaveBeenCalledTimes(1);

    const countAfter = await clientSyncEngine.localDb.getPendingOutboxCount();
    expect(countAfter).toBe(0);
  });

  it("3. Handles sync push HTTP 403 error, sets status to FAILED, and logs error", async () => {
    // Configure push API to simulate HTTP 403 Forbidden
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failingPushApi = vi.fn(async () => {
      throw new Error("Sync push failed: HTTP 403");
    });

    clientSyncEngine.init({
      localDb,
      pushApiFn: failingPushApi,
      deltaApiFn: mockDeltaApi,
      tenantId: "tenant-test-01",
      branchId: "branch-test-01",
    });

    localDb.enqueueOutbox({
      entityType: "Product",
      entityId: "prod-forbidden",
      operationType: "UPDATE",
      payload: { name: "Forbidden" },
      tenantId: "tenant-test-01",
      branchId: "branch-test-01",
    });
    const countBefore = await clientSyncEngine.localDb.getPendingOutboxCount();
    expect(countBefore).toBe(1);

    let syncStatus = "IDLE";
    let loggedError: any = null;

    const handleSyncNow = async () => {
      try {
        syncStatus = "RUNNING";
        await clientSyncEngine.runSync();
        syncStatus = "SUCCESS";
      } catch (err) {
        console.error("Sync failed:", err);
        loggedError = err;
        syncStatus = "FAILED";
      }
    };

    await handleSyncNow();

    expect(syncStatus).toBe("FAILED");
    expect(loggedError).toBeInstanceOf(Error);
    expect(loggedError.message).toContain("HTTP 403");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Sync failed:", expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it("4. Ensures outbox count drops accurately with custom ClientSyncEngine instance", async () => {
    const customDb = new LocalIndexedDbStore(5);
    await customDb.ready;
    customDb.clear({ allowDestructiveReset: true });
    const customEngine = new ClientSyncEngine("custom-dev", customDb, mockPushApi, mockDeltaApi, "tenant-test-01", "branch-test-01");

    customDb.enqueueOutbox({
      entityType: "Customer",
      entityId: "cust-1",
      operationType: "CREATE",
      payload: { name: "Alice" },
      tenantId: "tenant-test-01",
      branchId: "branch-test-01",
    });
    customDb.enqueueOutbox({
      entityType: "Customer",
      entityId: "cust-2",
      operationType: "CREATE",
      payload: { name: "Bob" },
      tenantId: "tenant-test-01",
      branchId: "branch-test-01",
    });
    customDb.enqueueOutbox({
      entityType: "Customer",
      entityId: "cust-3",
      operationType: "CREATE",
      payload: { name: "Charlie" },
      tenantId: "tenant-test-01",
      branchId: "branch-test-01",
    });

    expect(await customEngine.localDb.getPendingOutboxCount()).toBe(3);

    const result = await customEngine.runSync();
    expect(result.pushed).toBe(3);
    expect(await customEngine.localDb.getPendingOutboxCount()).toBe(0);
  });

  it("5. Verifies Button component renders variant='primary' and attaches onClick handler", () => {
    let clickCount = 0;
    const handleSyncNow = () => {
      clickCount += 1;
    };

    const element = Button({
      variant: "primary",
      onClick: handleSyncNow,
      children: "Sync Now",
    });

    expect(element.props.className).toContain("v2-btn-primary");
    expect(element.props.children).toBe("Sync Now");
    expect(typeof element.props.onClick).toBe("function");

    // Click invocation
    element.props.onClick();
    expect(clickCount).toBe(1);
  });

  it("6. Simulates UI feedback rendering for RUNNING, SUCCESS, and FAILED states", () => {
    const renderFeedback = (syncStatus: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED") => {
      return {
        isRunning: syncStatus === "RUNNING",
        runningText: syncStatus === "RUNNING" ? "Syncing…" : null,
        isSuccess: syncStatus === "SUCCESS",
        successText: syncStatus === "SUCCESS" ? "Sync completed!" : null,
        isFailed: syncStatus === "FAILED",
        failedText: syncStatus === "FAILED" ? "Sync failed. Check logs." : null,
      };
    };

    expect(renderFeedback("RUNNING").runningText).toBe("Syncing…");
    expect(renderFeedback("SUCCESS").successText).toBe("Sync completed!");
    expect(renderFeedback("FAILED").failedText).toBe("Sync failed. Check logs.");
  });
});
