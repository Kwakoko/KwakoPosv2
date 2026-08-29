import { CrmEngine } from "@kwakopos2/domain";
import {
  CustomerMasterRecord, CustomerContact, LeadRecord, OpportunityRecord,
  CustomerActivity, CustomerCommunication, CustomerCase, CustomerCaseEscalation,
  DuplicateMergeStatus, CaseStatus, OpportunityStage, LeadSource, CustomerType, CustomerStatus,
} from "@kwakopos2/contracts";

export class CrmService {
  private engine: CrmEngine;

  constructor(engine?: CrmEngine) {
    this.engine = engine ?? new CrmEngine();
  }

  public getEngine(): CrmEngine {
    return this.engine;
  }

  public createCustomer(params: Parameters<CrmEngine["createCustomer"]>[0]) {
    return this.engine.createCustomer(params);
  }

  public getCustomer(customerId: string) {
    return this.engine.getCustomer(customerId);
  }

  public listCustomers(tenantId: string, filters?: { branchId?: string; status?: CustomerStatus; customerType?: CustomerType; segment?: string }) {
    return this.engine.listCustomers(tenantId, filters);
  }

  public updateCustomer(customerId: string, updates: Partial<CustomerMasterRecord>) {
    return this.engine.updateCustomer(customerId, updates);
  }

  public createContact(params: Parameters<CrmEngine["createContact"]>[0]) {
    return this.engine.createContact(params);
  }

  public listContacts(tenantId: string, customerId: string) {
    return this.engine.listContacts(tenantId, customerId);
  }

  public detectDuplicates(tenantId: string) {
    return this.engine.detectDuplicateCandidates(tenantId);
  }

  public reviewDuplicate(candidateId: string, status: DuplicateMergeStatus) {
    return this.engine.reviewDuplicateCandidate(candidateId, status);
  }

  public mergeCustomers(primaryCustomerId: string, duplicateCustomerId: string, actorId: string) {
    return this.engine.mergeCustomers(primaryCustomerId, duplicateCustomerId, actorId);
  }

  public getCustomer360(customerId: string) {
    return this.engine.getCustomer360(customerId);
  }

  public createLead(params: Parameters<CrmEngine["createLead"]>[0]) {
    return this.engine.createLead(params);
  }

  public qualifyLead(leadId: string, criteria: Parameters<CrmEngine["qualifyLead"]>[1]) {
    return this.engine.qualifyLead(leadId, criteria);
  }

  public convertLead(leadId: string, actorId: string) {
    return this.engine.convertLead(leadId, actorId);
  }

  public createOpportunity(params: Parameters<CrmEngine["createOpportunity"]>[0]) {
    return this.engine.createOpportunity(params);
  }

  public updateOpportunityStage(opportunityId: string, newStage: OpportunityStage, actorId: string, lostReason?: Parameters<CrmEngine["updateOpportunityStage"]>[3]) {
    return this.engine.updateOpportunityStage(opportunityId, newStage, actorId, lostReason);
  }

  public getPipelineForecast(tenantId: string) {
    return this.engine.calculatePipelineForecast(tenantId);
  }

  public logActivity(params: Parameters<CrmEngine["logActivity"]>[0]) {
    return this.engine.logActivity(params);
  }

  public setConsent(params: Parameters<CrmEngine["setCustomerConsent"]>[0]) {
    return this.engine.setCustomerConsent(params);
  }

  public sendCommunication(params: Parameters<CrmEngine["sendCommunication"]>[0]) {
    return this.engine.sendCommunication(params);
  }

  public createCase(params: Parameters<CrmEngine["createCase"]>[0]) {
    return this.engine.createCase(params);
  }

  public updateCaseStatus(caseId: string, newStatus: CaseStatus, actorId: string, satisfactionRating?: number) {
    return this.engine.updateCaseStatus(caseId, newStatus, actorId, satisfactionRating);
  }

  public escalateCase(caseId: string, toLevel: CustomerCaseEscalation["toLevel"], reason: string, actorId: string) {
    return this.engine.escalateCase(caseId, toLevel, reason, actorId);
  }

  public getCustomerHealth(customerId: string) {
    return this.engine.calculateCustomerHealth(customerId);
  }

  public getCrmAnalytics(tenantId: string) {
    return this.engine.calculateCrmAnalytics(tenantId);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalCrmService = new CrmService();
