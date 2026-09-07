import { randomUUID } from "crypto";
import type { DomainEventEnvelope, TenantContext } from "@kwakopos2/contracts";

export type DomainEventListener<T = any> = (event: DomainEventEnvelope) => Promise<void> | void;

export type PublishDomainEventInput = Omit<
  DomainEventEnvelope,
  "eventId" | "timestamp" | "version" | "correlationId" | "causationId" | "branchId"
> & {
  eventId?: string;
  timestamp?: string;
  branchId?: string | null;
  version?: number;
  correlationId?: string | null;
  causationId?: string | null;
};

export class DomainEventBusEngine {
  private static instance: DomainEventBusEngine | null = null;
  private listeners = new Map<string, Set<DomainEventListener>>();
  private wildcardListeners = new Set<DomainEventListener>();
  private processedEventIds = new Set<string>();
  private eventLog: DomainEventEnvelope[] = [];

  public static getInstance(): DomainEventBusEngine {
    if (!DomainEventBusEngine.instance) {
      DomainEventBusEngine.instance = new DomainEventBusEngine();
    }
    return DomainEventBusEngine.instance;
  }

  public static resetInstance(): void {
    DomainEventBusEngine.instance = new DomainEventBusEngine();
  }

  /**
   * Subscribe to a specific domain event type
   */
  public subscribe(eventType: string, listener: DomainEventListener): () => void {
    if (eventType === "*") {
      this.wildcardListeners.add(listener);
      return () => this.wildcardListeners.delete(listener);
    }

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    const set = this.listeners.get(eventType)!;
    set.add(listener);

    return () => set.delete(listener);
  }

  /**
   * Publish a typed domain event across the platform
   */
  public async publish(
    event: PublishDomainEventInput
  ): Promise<DomainEventEnvelope> {
    const fullEvent: DomainEventEnvelope = {
      eventId: event.eventId || randomUUID(),
      timestamp: event.timestamp || new Date().toISOString(),
      eventType: event.eventType,
      engineId: event.engineId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      tenantId: event.tenantId,
      branchId: event.branchId ?? null,
      actorId: event.actorId,
      payload: event.payload || {},
      version: event.version || 1,
      correlationId: event.correlationId ?? null,
      causationId: event.causationId ?? null,
    };

    // Prevent double processing
    if (this.processedEventIds.has(fullEvent.eventId)) {
      return fullEvent;
    }
    this.processedEventIds.add(fullEvent.eventId);
    this.eventLog.push(fullEvent);

    // Keep log bounded
    if (this.eventLog.length > 5000) {
      this.eventLog.shift();
    }

    // Dispatch to specific listeners
    const specific = this.listeners.get(fullEvent.eventType);
    const promises: Promise<void>[] = [];

    if (specific) {
      for (const listener of specific) {
        try {
          const res = listener(fullEvent);
          if (res instanceof Promise) promises.push(res);
        } catch (err) {
          console.error(`Error in domain event listener for '${fullEvent.eventType}':`, err);
        }
      }
    }

    // Dispatch to wildcard listeners
    for (const listener of this.wildcardListeners) {
      try {
        const res = listener(fullEvent);
        if (res instanceof Promise) promises.push(res);
      } catch (err) {
        console.error(`Error in wildcard domain event listener:`, err);
      }
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }

    return fullEvent;
  }

  /**
   * Query recent domain events filtered by tenant or aggregate
   */
  public getEvents(filter?: {
    tenantId?: string;
    aggregateType?: string;
    aggregateId?: string;
    eventType?: string;
    since?: string;
  }): DomainEventEnvelope[] {
    let result = [...this.eventLog];

    if (filter?.tenantId) {
      result = result.filter((e) => e.tenantId === filter.tenantId);
    }
    if (filter?.aggregateType) {
      result = result.filter((e) => e.aggregateType === filter.aggregateType);
    }
    if (filter?.aggregateId) {
      result = result.filter((e) => e.aggregateId === filter.aggregateId);
    }
    if (filter?.eventType) {
      result = result.filter((e) => e.eventType === filter.eventType);
    }
    if (filter?.since) {
      const sinceTime = new Date(filter.since).getTime();
      result = result.filter((e) => new Date(e.timestamp).getTime() >= sinceTime);
    }

    return result;
  }
}

export const globalDomainEventBus = DomainEventBusEngine.getInstance();
