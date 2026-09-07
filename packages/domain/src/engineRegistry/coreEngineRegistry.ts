import type {
  EngineDescriptor,
  EngineCommandEnvelope,
  EngineCommandResult,
  EngineQueryEnvelope,
  EngineStatus,
  EngineLayer,
  TenantContext,
} from "@kwakopos2/contracts";

export interface EngineCommandHandler<TIn = any, TOut = any> {
  (ctx: TenantContext, command: EngineCommandEnvelope): Promise<EngineCommandResult>;
}

export interface EngineQueryHandler<TParams = any, TResult = any> {
  (ctx: TenantContext, query: EngineQueryEnvelope): Promise<TResult>;
}

export interface EngineHealthCheckResult {
  engineId: string;
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  details?: string;
  timestamp: string;
}

export interface EngineHealthCheck {
  (): Promise<EngineHealthCheckResult>;
}

export interface RegisteredEngineEntry {
  descriptor: EngineDescriptor;
  commandHandlers: Map<string, EngineCommandHandler>;
  queryHandlers: Map<string, EngineQueryHandler>;
  healthCheck?: EngineHealthCheck;
}

export class CoreEngineRegistry {
  private static instance: CoreEngineRegistry | null = null;
  private engines = new Map<string, RegisteredEngineEntry>();
  private executedCommandIds = new Set<string>();

  public static getInstance(): CoreEngineRegistry {
    if (!CoreEngineRegistry.instance) {
      CoreEngineRegistry.instance = new CoreEngineRegistry();
    }
    return CoreEngineRegistry.instance;
  }

  public static resetInstance(): void {
    CoreEngineRegistry.instance = new CoreEngineRegistry();
  }

  /**
   * Register a new Core Business Engine
   */
  public registerEngine(
    descriptor: EngineDescriptor,
    options?: {
      commandHandlers?: Record<string, EngineCommandHandler>;
      queryHandlers?: Record<string, EngineQueryHandler>;
      healthCheck?: EngineHealthCheck;
    }
  ): void {
    if (this.engines.has(descriptor.engineId)) {
      throw new Error(`CORE_ENGINE_ALREADY_REGISTERED: Engine with id '${descriptor.engineId}' is already registered.`);
    }

    const commandMap = new Map<string, EngineCommandHandler>();
    if (options?.commandHandlers) {
      for (const [cmd, handler] of Object.entries(options.commandHandlers)) {
        commandMap.set(cmd, handler);
      }
    }

    const queryMap = new Map<string, EngineQueryHandler>();
    if (options?.queryHandlers) {
      for (const [q, handler] of Object.entries(options.queryHandlers)) {
        queryMap.set(q, handler);
      }
    }

    this.engines.set(descriptor.engineId, {
      descriptor: { ...descriptor },
      commandHandlers: commandMap,
      queryHandlers: queryMap,
      healthCheck: options?.healthCheck,
    });
  }

  /**
   * Update engine status (ACTIVE, DEGRADED, MAINTENANCE, DISABLED)
   */
  public setEngineStatus(engineId: string, status: EngineStatus): void {
    const entry = this.engines.get(engineId);
    if (!entry) throw new Error(`CORE_ENGINE_NOT_FOUND: Engine '${engineId}' not found.`);
    entry.descriptor.status = status;
  }

  public getEngine(engineId: string): EngineDescriptor | null {
    const entry = this.engines.get(engineId);
    return entry ? { ...entry.descriptor } : null;
  }

  public listEngines(filter?: { layer?: EngineLayer; status?: EngineStatus }): EngineDescriptor[] {
    let list = Array.from(this.engines.values()).map((e) => ({ ...e.descriptor }));
    if (filter?.layer) {
      list = list.filter((e) => e.layer === filter.layer);
    }
    if (filter?.status) {
      list = list.filter((e) => e.status === filter.status);
    }
    return list;
  }

  /**
   * Validate that all engine dependencies are satisfied and no cyclic dependencies exist
   */
  public validateDependencies(): { valid: boolean; missingDependencies: Record<string, string[]>; cycles: string[][] } {
    const missing: Record<string, string[]> = {};
    const cycles: string[][] = [];

    // 1. Missing dependencies check
    for (const [id, entry] of this.engines.entries()) {
      const missingForEngine: string[] = [];
      for (const dep of entry.descriptor.dependencies) {
        if (!this.engines.has(dep)) {
          missingForEngine.push(dep);
        }
      }
      if (missingForEngine.length > 0) {
        missing[id] = missingForEngine;
      }
    }

    // 2. Cycle detection using Tarjan / DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (curr: string, path: string[]) => {
      visited.add(curr);
      recursionStack.add(curr);

      const deps = this.engines.get(curr)?.descriptor.dependencies || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          dfs(dep, [...path, dep]);
        } else if (recursionStack.has(dep)) {
          const cyclePath = [...path.slice(path.indexOf(dep)), dep];
          cycles.push(cyclePath);
        }
      }

      recursionStack.delete(curr);
    };

    for (const id of this.engines.keys()) {
      if (!visited.has(id)) {
        dfs(id, [id]);
      }
    }

    return {
      valid: Object.keys(missing).length === 0 && cycles.length === 0,
      missingDependencies: missing,
      cycles,
    };
  }

  /**
   * Determine which plugins or dependent engines rely on a specified engine
   */
  public getDependents(engineId: string): string[] {
    const dependents: string[] = [];
    for (const [id, entry] of this.engines.entries()) {
      if (entry.descriptor.dependencies.includes(engineId)) {
        dependents.push(id);
      }
    }
    return dependents;
  }

  /**
   * Return the topological ordering of registered engines ensuring dependencies precede dependents.
   */
  public getTopologicalOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (engineId: string) => {
      if (visited.has(engineId)) return;
      if (visiting.has(engineId)) {
        throw new Error(`CYCLIC_DEPENDENCY: Cycle detected involving engine '${engineId}'.`);
      }
      visiting.add(engineId);

      const entry = this.engines.get(engineId);
      if (entry) {
        for (const dep of entry.descriptor.dependencies) {
          if (this.engines.has(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(engineId);
      visited.add(engineId);
      order.push(engineId);
    };

    for (const engineId of this.engines.keys()) {
      visit(engineId);
    }

    return order;
  }


  /**
   * Execute an authoritative command through the Core Engine Layer
   */
  public async executeCommand(ctx: TenantContext, command: EngineCommandEnvelope): Promise<EngineCommandResult> {
    const entry = this.engines.get(command.engineId);
    if (!entry) {
      throw new Error(`CORE_ENGINE_NOT_FOUND: Engine '${command.engineId}' is not registered.`);
    }

    if (entry.descriptor.status === "DISABLED" || entry.descriptor.status === "MAINTENANCE") {
      throw new Error(`CORE_ENGINE_UNAVAILABLE: Engine '${command.engineId}' is currently ${entry.descriptor.status}.`);
    }

    // Check idempotency
    if (this.executedCommandIds.has(command.idempotencyKey)) {
      return {
        commandId: command.commandId,
        success: true,
        data: { idempotencyReplay: true },
        eventsPublished: [],
        executionDurationMs: 0,
      };
    }

    const handler = entry.commandHandlers.get(command.commandName);
    if (!handler) {
      throw new Error(
        `CORE_ENGINE_COMMAND_NOT_SUPPORTED: Command '${command.commandName}' is not registered for engine '${command.engineId}'.`
      );
    }

    const start = performance.now();
    try {
      const result = await handler(ctx, command);
      this.executedCommandIds.add(command.idempotencyKey);
      result.executionDurationMs = Math.round(performance.now() - start);
      return result;
    } catch (err: any) {
      return {
        commandId: command.commandId,
        success: false,
        error: {
          code: err?.code || "COMMAND_EXECUTION_ERROR",
          message: err instanceof Error ? err.message : "Unknown error during command execution",
          details: err?.details,
        },
        eventsPublished: [],
        executionDurationMs: Math.round(performance.now() - start),
      };
    }
  }

  /**
   * Execute a query projection against a registered Core Engine
   */
  public async executeQuery<T = any>(ctx: TenantContext, query: EngineQueryEnvelope): Promise<T> {
    const entry = this.engines.get(query.engineId);
    if (!entry) {
      throw new Error(`CORE_ENGINE_NOT_FOUND: Engine '${query.engineId}' is not registered.`);
    }

    if (entry.descriptor.status === "DISABLED") {
      throw new Error(`CORE_ENGINE_DISABLED: Engine '${query.engineId}' is disabled.`);
    }

    const handler = entry.queryHandlers.get(query.queryName);
    if (!handler) {
      throw new Error(
        `CORE_ENGINE_QUERY_NOT_SUPPORTED: Query '${query.queryName}' is not registered for engine '${query.engineId}'.`
      );
    }

    return handler(ctx, query);
  }

  /**
   * Run health checks across all registered engines
   */
  public async runHealthChecks(): Promise<EngineHealthCheckResult[]> {
    const results: EngineHealthCheckResult[] = [];
    for (const [id, entry] of this.engines.entries()) {
      if (entry.healthCheck) {
        try {
          const res = await entry.healthCheck();
          results.push(res);
        } catch (err: any) {
          results.push({
            engineId: id,
            status: "UNHEALTHY",
            details: err?.message || "Health check failed",
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        results.push({
          engineId: id,
          status: entry.descriptor.status === "ACTIVE" ? "HEALTHY" : "DEGRADED",
          details: `Default status report: ${entry.descriptor.status}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
    return results;
  }
}

export const globalCoreEngineRegistry = CoreEngineRegistry.getInstance();
