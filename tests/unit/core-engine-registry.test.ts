/**
 * Core Engine Registry Unit Test Suite
 * ======================================
 * Tests the CoreEngineRegistry singleton for:
 *   - Engine registration and duplicate prevention
 *   - CQRS command dispatch (executeCommand)
 *   - CQRS query dispatch (executeQuery)
 *   - Dependency validation
 *   - Cycle detection
 *   - Idempotent command replay
 *   - Engine status management
 *   - Health checks
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CoreEngineRegistry } from "@kwakopos2/domain";
import type { TenantContext, EngineDescriptor, EngineCommandEnvelope } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(): TenantContext {
  return {
    tenantId: "tenant-registry-test-001",
    branchId: "branch-registry-test-001",
    userId: "user-registry-test-001",
    roles: ["SUPER_ADMIN"],
  } as TenantContext;
}

function makeDescriptor(overrides: Partial<EngineDescriptor> = {}): EngineDescriptor {
  return {
    engineId: `test.engine.${randomUUID().slice(0, 8)}`,
    name: "Test Engine",
    version: "1.0.0",
    layer: "BUSINESS_CORE",
    status: "ACTIVE",
    dependencies: [],
    extensionPoints: [],
    permissionsRequired: [],
    supportedCommands: [],
    supportedQueries: [],
    publishedEvents: [],
    healthStatus: "HEALTHY",
    ...overrides,
  };
}

function makeCommand(engineId: string, commandName: string, payload: Record<string, any> = {}): EngineCommandEnvelope {
  return {
    commandId: randomUUID(),
    engineId,
    commandName,
    tenantId: "tenant-registry-test-001",
    payload,
    actorId: "user-registry-test-001",
    issuedAt: new Date().toISOString(),
    idempotencyKey: randomUUID(),
  };
}

// Reset registry singleton before each test
beforeEach(() => {
  CoreEngineRegistry.resetInstance();
});

// ===========================================================================
// 1. Registration
// ===========================================================================

describe("CoreEngineRegistry — Registration", () => {
  it("registers an engine successfully", () => {
    const registry = CoreEngineRegistry.getInstance();
    const desc = makeDescriptor({ engineId: "test.engine.alpha" });
    registry.registerEngine(desc, { commandHandlers: {}, queryHandlers: {} });

    const found = registry.getEngine("test.engine.alpha");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test Engine");
  });

  it("throws CORE_ENGINE_ALREADY_REGISTERED on duplicate registration", () => {
    const registry = CoreEngineRegistry.getInstance();
    const desc = makeDescriptor({ engineId: "test.engine.duplicate" });
    registry.registerEngine(desc);

    expect(() =>
      registry.registerEngine(desc)
    ).toThrow("CORE_ENGINE_ALREADY_REGISTERED");
  });

  it("listEngines returns all registered engines", () => {
    const registry = CoreEngineRegistry.getInstance();
    registry.registerEngine(makeDescriptor({ engineId: "test.engine.list1" }));
    registry.registerEngine(makeDescriptor({ engineId: "test.engine.list2" }));

    const engines = registry.listEngines();
    const ids = engines.map((e) => e.engineId);
    expect(ids).toContain("test.engine.list1");
    expect(ids).toContain("test.engine.list2");
  });

  it("listEngines can filter by layer", () => {
    const registry = CoreEngineRegistry.getInstance();
    registry.registerEngine(makeDescriptor({ engineId: "test.biz.engine", layer: "BUSINESS_CORE" }));
    registry.registerEngine(makeDescriptor({ engineId: "test.foundation.engine", layer: "FOUNDATION" }));

    const biz = registry.listEngines({ layer: "BUSINESS_CORE" });
    expect(biz.every((e) => e.layer === "BUSINESS_CORE")).toBe(true);
    expect(biz.some((e) => e.engineId === "test.biz.engine")).toBe(true);
  });
});

// ===========================================================================
// 2. CQRS Command Dispatch
// ===========================================================================

describe("CoreEngineRegistry — Command Dispatch", () => {
  it("dispatches a command to the registered handler", async () => {
    const registry = CoreEngineRegistry.getInstance();
    const engineId = "test.engine.cmd-dispatch";
    let capturedPayload: any = null;

    registry.registerEngine(
      makeDescriptor({ engineId, supportedCommands: ["DoSomething"] }),
      {
        commandHandlers: {
          DoSomething: async (ctx, cmd) => {
            capturedPayload = cmd.payload;
            return {
              commandId: cmd.commandId,
              success: true,
              data: { ok: true },
              eventsPublished: [],
              executionDurationMs: 0,
            };
          },
        },
      }
    );

    const ctx = makeCtx();
    const command = makeCommand(engineId, "DoSomething", { value: 42 });
    const result = await registry.executeCommand(ctx, command);

    expect(result.success).toBe(true);
    expect(capturedPayload.value).toBe(42);
  });

  it("throws CORE_ENGINE_NOT_FOUND for unknown engine", async () => {
    const registry = CoreEngineRegistry.getInstance();
    const ctx = makeCtx();
    const command = makeCommand("unknown.engine.xyz", "Noop");

    await expect(
      registry.executeCommand(ctx, command)
    ).rejects.toThrow("CORE_ENGINE_NOT_FOUND");
  });

  it("throws CORE_ENGINE_COMMAND_NOT_SUPPORTED for unregistered command (propagates as rejection)", async () => {
    const registry = CoreEngineRegistry.getInstance();
    const engineId = "test.engine.no-cmd";
    registry.registerEngine(makeDescriptor({ engineId }));

    const ctx = makeCtx();
    const command = makeCommand(engineId, "NonExistentCommand");

    // The registry throws synchronously before entering the handler try/catch block
    await expect(
      registry.executeCommand(ctx, command)
    ).rejects.toThrow("CORE_ENGINE_COMMAND_NOT_SUPPORTED");
  });

  it("rejects command dispatch when engine is in MAINTENANCE status", async () => {
    const registry = CoreEngineRegistry.getInstance();
    const engineId = "test.engine.maintenance";
    registry.registerEngine(makeDescriptor({ engineId, status: "MAINTENANCE" }));

    const ctx = makeCtx();
    const command = makeCommand(engineId, "Noop");

    await expect(
      registry.executeCommand(ctx, command)
    ).rejects.toThrow("CORE_ENGINE_UNAVAILABLE");
  });

  it("replays idempotent command without re-executing handler", async () => {
    const registry = CoreEngineRegistry.getInstance();
    const engineId = "test.engine.idempotency";
    let callCount = 0;

    registry.registerEngine(
      makeDescriptor({ engineId, supportedCommands: ["CountCmd"] }),
      {
        commandHandlers: {
          CountCmd: async (ctx, cmd) => {
            callCount++;
            return { commandId: cmd.commandId, success: true, data: {}, eventsPublished: [], executionDurationMs: 0 };
          },
        },
      }
    );

    const ctx = makeCtx();
    const idempotencyKey = randomUUID();
    const command = makeCommand(engineId, "CountCmd", {});
    command.idempotencyKey = idempotencyKey;

    await registry.executeCommand(ctx, command);
    await registry.executeCommand(ctx, command); // same idempotencyKey

    expect(callCount).toBe(1); // handler only called once
  });
});

// ===========================================================================
// 3. CQRS Query Dispatch
// ===========================================================================

describe("CoreEngineRegistry — Query Dispatch", () => {
  it("dispatches a query and returns the handler result", async () => {
    const registry = CoreEngineRegistry.getInstance();
    const engineId = "test.engine.query-dispatch";

    registry.registerEngine(
      makeDescriptor({ engineId, supportedQueries: ["GetData"] }),
      {
        queryHandlers: {
          GetData: async (ctx, qry) => ({ rows: [1, 2, 3], total: 3 }),
        },
      }
    );

    const ctx = makeCtx();
    const result = await registry.executeQuery<{ rows: number[]; total: number }>(ctx, {
      queryId: randomUUID(),
      engineId,
      queryName: "GetData",
      tenantId: "tenant-registry-test-001",
      params: {},
      actorId: "user-registry-test-001",
      issuedAt: new Date().toISOString(),
    });

    expect(result.rows).toEqual([1, 2, 3]);
    expect(result.total).toBe(3);
  });
});

// ===========================================================================
// 4. Dependency Validation & Cycle Detection
// ===========================================================================

describe("CoreEngineRegistry — Dependency Validation", () => {
  it("reports valid=true when all dependencies are satisfied", () => {
    const registry = CoreEngineRegistry.getInstance();
    registry.registerEngine(makeDescriptor({ engineId: "core.event_bus", dependencies: [] }));
    registry.registerEngine(makeDescriptor({ engineId: "core.party", dependencies: ["core.event_bus"] }));

    const { valid, missingDependencies } = registry.validateDependencies();
    expect(valid).toBe(true);
    expect(Object.keys(missingDependencies)).toHaveLength(0);
  });

  it("reports missing dependencies", () => {
    const registry = CoreEngineRegistry.getInstance();
    registry.registerEngine(
      makeDescriptor({ engineId: "core.payment", dependencies: ["core.does_not_exist"] })
    );

    const { valid, missingDependencies } = registry.validateDependencies();
    expect(valid).toBe(false);
    expect(missingDependencies["core.payment"]).toContain("core.does_not_exist");
  });

  it("detects circular dependency cycles", () => {
    const registry = CoreEngineRegistry.getInstance();
    // A → B → A (cycle)
    registry.registerEngine(makeDescriptor({ engineId: "cycle.A", dependencies: ["cycle.B"] }));
    registry.registerEngine(makeDescriptor({ engineId: "cycle.B", dependencies: ["cycle.A"] }));

    const { cycles } = registry.validateDependencies();
    expect(cycles.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 5. Engine Status Management
// ===========================================================================

describe("CoreEngineRegistry — Status Management", () => {
  it("sets engine status from ACTIVE to MAINTENANCE", () => {
    const registry = CoreEngineRegistry.getInstance();
    registry.registerEngine(makeDescriptor({ engineId: "test.status.engine", status: "ACTIVE" }));

    registry.setEngineStatus("test.status.engine", "MAINTENANCE");

    const found = registry.getEngine("test.status.engine");
    expect(found?.status).toBe("MAINTENANCE");
  });

  it("throws CORE_ENGINE_NOT_FOUND when setting status on unknown engine", () => {
    const registry = CoreEngineRegistry.getInstance();
    expect(() =>
      registry.setEngineStatus("unknown.engine", "DISABLED")
    ).toThrow("CORE_ENGINE_NOT_FOUND");
  });
});

// ===========================================================================
// 6. Health Checks
// ===========================================================================

describe("CoreEngineRegistry — Health Checks", () => {
  it("runs health checks and returns HEALTHY for registered engines with custom health check", async () => {
    const registry = CoreEngineRegistry.getInstance();
    registry.registerEngine(
      makeDescriptor({ engineId: "test.health.engine" }),
      {
        healthCheck: async () => ({
          engineId: "test.health.engine",
          status: "HEALTHY",
          timestamp: new Date().toISOString(),
        }),
      }
    );

    const results = await registry.runHealthChecks();
    const engineResult = results.find((r) => r.engineId === "test.health.engine");
    expect(engineResult?.status).toBe("HEALTHY");
  });

  it("reports UNHEALTHY for engines where health check throws", async () => {
    const registry = CoreEngineRegistry.getInstance();
    registry.registerEngine(
      makeDescriptor({ engineId: "test.health.broken" }),
      {
        healthCheck: async () => { throw new Error("Database connection failed"); },
      }
    );

    const results = await registry.runHealthChecks();
    const engineResult = results.find((r) => r.engineId === "test.health.broken");
    expect(engineResult?.status).toBe("UNHEALTHY");
    expect(engineResult?.details).toMatch(/Database connection failed/);
  });
});

// ===========================================================================
// 7. getDependents
// ===========================================================================

describe("CoreEngineRegistry — getDependents", () => {
  it("returns all engines that depend on a given engine", () => {
    const registry = CoreEngineRegistry.getInstance();
    registry.registerEngine(makeDescriptor({ engineId: "core.foundation" }));
    registry.registerEngine(makeDescriptor({ engineId: "core.inventory", dependencies: ["core.foundation"] }));
    registry.registerEngine(makeDescriptor({ engineId: "core.sales", dependencies: ["core.foundation", "core.inventory"] }));

    const dependents = registry.getDependents("core.foundation");
    expect(dependents).toContain("core.inventory");
    expect(dependents).toContain("core.sales");
  });
});
