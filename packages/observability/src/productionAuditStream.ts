import { randomUUID } from "crypto";

export type AuditEventType =
  | "RELEASE_CREATED"
  | "CANDIDATE_DEPLOYED"
  | "CERTIFICATION_COMPLETED"
  | "TRAFFIC_PROMOTED"
  | "CANARY_STAGE_ADVANCED"
  | "ROLLBACK_TRIGGERED"
  | "ROLLBACK_COMPLETED"
  | "PRODUCTION_FREEZE_CHANGED"
  | "FEATURE_FLAG_UPDATED"
  | "CONFIG_CHANGED"
  | "INCIDENT_OPENED"
  | "INCIDENT_RESOLVED"
  | "INVENTORY_RECONCILIATION_RUN"
  | "BACKUP_VERIFICATION_RUN";

export interface OperationalAuditEvent {
  eventId: string;
  eventType: AuditEventType;
  timestamp: string;
  actor: {
    userId?: string;
    email?: string;
    role?: string;
    systemProcess?: string;
  };
  releaseContext: {
    appVersion: string;
    gitSha?: string;
    cloudRunRevision?: string;
    environment: string;
  };
  details: Record<string, any>;
  beforeValue?: any;
  afterValue?: any;
}

export class ProductionAuditStream {
  private static events: OperationalAuditEvent[] = [];

  public static record(event: Omit<OperationalAuditEvent, "eventId" | "timestamp">): OperationalAuditEvent {
    const fullEvent: OperationalAuditEvent = {
      eventId: `AUD-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      ...event,
    };

    this.events.push(fullEvent);

    // Keep up to 1,000 in-memory operational audit entries
    if (this.events.length > 1000) {
      this.events.shift();
    }

    return fullEvent;
  }

  public static getRecentEvents(limit: number = 100): OperationalAuditEvent[] {
    return [...this.events].slice(-limit).reverse();
  }

  public static filterEvents(criteria: {
    eventType?: AuditEventType;
    appVersion?: string;
    actorEmail?: string;
    limit?: number;
  }): OperationalAuditEvent[] {
    return this.events
      .filter((e) => {
        if (criteria.eventType && e.eventType !== criteria.eventType) return false;
        if (criteria.appVersion && e.releaseContext.appVersion !== criteria.appVersion) return false;
        if (criteria.actorEmail && e.actor.email !== criteria.actorEmail) return false;
        return true;
      })
      .slice(-(criteria.limit || 100))
      .reverse();
  }
}