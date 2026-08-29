import { IntegrationEngine } from "@kwakopos2/domain";
import {
  IntegrationCategory, IntegrationStatus, ConflictPolicy, SyncMode, SyncDirection,
} from "@kwakopos2/contracts";

export class IntegrationService {
  private engine: IntegrationEngine;

  constructor(engine?: IntegrationEngine) {
    this.engine = engine ?? new IntegrationEngine();
  }

  public getEngine(): IntegrationEngine {
    return this.engine;
  }

  public listConnectors(category?: IntegrationCategory) {
    return this.engine.listConnectors(category);
  }

  public getConnector(connectorId: string) {
    return this.engine.getConnector(connectorId);
  }

  public installIntegration(params: Parameters<IntegrationEngine["installIntegration"]>[0]) {
    return this.engine.installIntegration(params);
  }

  public getIntegration(integrationId: string) {
    return this.engine.getIntegration(integrationId);
  }

  public listIntegrations(tenantId: string) {
    return this.engine.listIntegrations(tenantId);
  }

  public updateIntegrationStatus(integrationId: string, status: IntegrationStatus, actorId: string) {
    return this.engine.updateIntegrationStatus(integrationId, status, actorId);
  }

  public setCredential(params: Parameters<IntegrationEngine["setCredential"]>[0]) {
    return this.engine.setCredential(params);
  }

  public rotateCredential(credentialId: string, newEncryptedSecret: string, actorId: string) {
    return this.engine.rotateCredential(credentialId, newEncryptedSecret, actorId);
  }

  public registerWebhookSubscription(params: Parameters<IntegrationEngine["registerWebhookSubscription"]>[0]) {
    return this.engine.registerWebhookSubscription(params);
  }

  public receiveWebhookEvent(params: Parameters<IntegrationEngine["receiveWebhookEvent"]>[0]) {
    return this.engine.receiveWebhookEvent(params);
  }

  public retryWebhookEvent(eventId: string) {
    return this.engine.retryWebhookEvent(eventId);
  }

  public createFieldMappingRule(params: Parameters<IntegrationEngine["createFieldMappingRule"]>[0]) {
    return this.engine.createFieldMappingRule(params);
  }

  public transformPayload(integrationId: string, entityType: string, sourcePayload: Record<string, any>) {
    return this.engine.transformPayload(integrationId, entityType, sourcePayload);
  }

  public linkEntityMapping(params: Parameters<IntegrationEngine["linkEntityMapping"]>[0]) {
    return this.engine.linkEntityMapping(params);
  }

  public startSyncJob(params: Parameters<IntegrationEngine["startSyncJob"]>[0]) {
    return this.engine.startSyncJob(params);
  }

  public executeSync(jobId: string, localItems: any[], remoteItems: any[]) {
    return this.engine.executeSync(jobId, localItems, remoteItems);
  }

  public evaluateCircuitBreaker(integrationId: string, errorRatePct: number) {
    return this.engine.evaluateCircuitBreaker(integrationId, errorRatePct);
  }

  public getHealthMetric(tenantId: string, integrationId: string) {
    return this.engine.getHealthMetric(tenantId, integrationId);
  }

  public diagnoseFailure(targetId: string) {
    return this.engine.diagnoseIntegrationFailure(targetId);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalIntegrationService = new IntegrationService();
