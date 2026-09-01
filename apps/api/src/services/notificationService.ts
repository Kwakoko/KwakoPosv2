import { NotificationEngine } from "@kwakopos2/domain";
import { NotificationChannelType } from "@kwakopos2/contracts";

export class NotificationService {
  private engine: NotificationEngine;

  constructor(engine?: NotificationEngine) {
    this.engine = engine ?? new NotificationEngine();
  }

  public getEngine(): NotificationEngine {
    return this.engine;
  }

  public sendNotification(params: Parameters<NotificationEngine["sendNotification"]>[0]) {
    return this.engine.sendNotification(params);
  }

  public registerOptOut(tenantId: string, channel: NotificationChannelType, recipient: string) {
    return this.engine.registerOptOut(tenantId, channel, recipient);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalNotificationService = new NotificationService();
