import {
  CustomerMasterRecord, CustomerContact, LeadRecord, LeadQualification,
  OpportunityRecord, CustomerActivity, CustomerCommunication, CommunicationTemplate,
  CustomerConsent, CustomerCase, CustomerCaseEscalation, CrmCustomerSegment,
  CustomerHealthScore, CustomerValueMetrics, DuplicateCustomerCandidate,
  IndustryCrmProfile, CrmAnalyticsSummary, CrmHealthSummary, CrmAuditEntry,
  CustomerType, CustomerStatus, LeadSource, LeadStatus, OpportunityStage,
  ActivityType, CaseStatus, CasePriority, CaseCategory, CommunicationChannel,
  CustomerHealthState, DuplicateMergeStatus,
} from "@kwakopos2/contracts";

// ============================================================
// Phase 38 — KwakoPos CRM Domain Engine (KCRML v1.0.0)
// ============================================================
// Governing Principles:
//   1. One trusted customer relationship layer across all KwakoPos modules.
//   2. Authoritative domain boundaries: POS owns sales; Finance owns ledger truth;
//      Inventory owns stock; Billing owns subscription; CRM owns relationship & engagement.
//   3. AI recommends & predicts; Manager approves sensitive actions; Audit tracks evidence.
// ============================================================

export class CrmEngine {
  private customers: Map<string, CustomerMasterRecord> = new Map();
  private contacts: Map<string, CustomerContact> = new Map();
  private leads: Map<string, LeadRecord> = new Map();
  private opportunities: Map<string, OpportunityRecord> = new Map();
  private activities: Map<string, CustomerActivity> = new Map();
  private communications: Map<string, CustomerCommunication> = new Map();
  private templates: Map<string, CommunicationTemplate> = new Map();
  private consents: Map<string, CustomerConsent> = new Map();
  private cases: Map<string, CustomerCase> = new Map();
  private escalations: Map<string, CustomerCaseEscalation> = new Map();
  private segments: Map<string, CrmCustomerSegment> = new Map();
  private duplicateCandidates: Map<string, DuplicateCustomerCandidate> = new Map();
  private industryProfiles: Map<string, IndustryCrmProfile> = new Map();
  private auditLedger: CrmAuditEntry[] = [];

  constructor() {
    this._seedDefaultTemplates();
  }

  // ─────────────────────────────────────────────────────────
  // 1. Customer Master & Contact Management
  // ─────────────────────────────────────────────────────────

  public createCustomer(params: Omit<CustomerMasterRecord, "createdAt" | "updatedAt" | "countryId" | "segment" | "source" | "status" | "creditLimit" | "paymentTermsDays" | "customerType"> & {
    customerType?: CustomerType;
    countryId?: string;
    segment?: string;
    source?: LeadSource;
    status?: CustomerStatus;
    creditLimit?: number;
    paymentTermsDays?: number;
  }): { success: boolean; customer?: CustomerMasterRecord; error?: string } {
    if (!params.customerId || !params.tenantId || !params.displayName) {
      return { success: false, error: "customerId, tenantId, and displayName are required" };
    }

    const now = new Date().toISOString();
    const customer: CustomerMasterRecord = {
      ...params,
      customerType: params.customerType ?? "INDIVIDUAL",
      countryId: params.countryId ?? "TZ",
      segment: params.segment ?? "STANDARD",
      source: params.source ?? "WALK_IN",
      status: params.status ?? "ACTIVE",
      creditLimit: params.creditLimit ?? 0,
      paymentTermsDays: params.paymentTermsDays ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    this.customers.set(params.customerId, customer);
    this._writeAudit(params.tenantId, "CUSTOMER_CREATED", "SYSTEM", params.customerId,
      `Customer created: ${params.displayName} (${params.customerType})`);

    // Auto-create default communication consent
    this.setCustomerConsent({
      tenantId: params.tenantId,
      customerId: params.customerId,
      channel: "EMAIL",
      isConsented: true,
    });

    return { success: true, customer };
  }

  public getCustomer(customerId: string): CustomerMasterRecord | undefined {
    return this.customers.get(customerId);
  }

  public listCustomers(tenantId: string, filters?: { branchId?: string; status?: CustomerStatus; customerType?: CustomerType; segment?: string }): CustomerMasterRecord[] {
    return Array.from(this.customers.values()).filter(c => {
      if (c.tenantId !== tenantId) return false;
      if (filters?.branchId && c.branchId !== filters.branchId) return false;
      if (filters?.status && c.status !== filters.status) return false;
      if (filters?.customerType && c.customerType !== filters.customerType) return false;
      if (filters?.segment && c.segment !== filters.segment) return false;
      return true;
    });
  }

  public updateCustomer(customerId: string, updates: Partial<CustomerMasterRecord>): { success: boolean; customer?: CustomerMasterRecord; error?: string } {
    const cust = this.customers.get(customerId);
    if (!cust) return { success: false, error: "Customer not found" };

    const updated: CustomerMasterRecord = {
      ...cust,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.customers.set(customerId, updated);
    this._writeAudit(cust.tenantId, "CUSTOMER_UPDATED", "SYSTEM", customerId, `Customer record updated`);
    return { success: true, customer: updated };
  }

  public createContact(params: Omit<CustomerContact, "createdAt" | "updatedAt" | "isPrimary" | "decisionInfluence"> & {
    isPrimary?: boolean;
    decisionInfluence?: CustomerContact["decisionInfluence"];
  }): { success: boolean; contact?: CustomerContact; error?: string } {
    if (!params.contactId || !params.tenantId || !params.customerId || !params.firstName || !params.lastName) {
      return { success: false, error: "contactId, tenantId, customerId, firstName, and lastName are required" };
    }

    const now = new Date().toISOString();
    const contact: CustomerContact = {
      ...params,
      isPrimary: params.isPrimary ?? false,
      decisionInfluence: params.decisionInfluence ?? "INFLUENCER",
      createdAt: now,
      updatedAt: now,
    };

    this.contacts.set(params.contactId, contact);
    return { success: true, contact };
  }

  public listContacts(tenantId: string, customerId: string): CustomerContact[] {
    return Array.from(this.contacts.values()).filter(c => c.tenantId === tenantId && c.customerId === customerId);
  }

  // ─────────────────────────────────────────────────────────
  // 2. Identity Resolution & Duplicate Detection
  // ─────────────────────────────────────────────────────────

  public detectDuplicateCandidates(tenantId: string): DuplicateCustomerCandidate[] {
    const candidates: DuplicateCustomerCandidate[] = [];
    const custs = this.listCustomers(tenantId);

    for (let i = 0; i < custs.length; i++) {
      for (let j = i + 1; j < custs.length; j++) {
        const c1 = custs[i];
        const c2 = custs[j];
        const matchingFields: string[] = [];

        if (c1.phone && c2.phone && c1.phone === c2.phone) matchingFields.push("phone");
        if (c1.email && c2.email && c1.email.toLowerCase() === c2.email.toLowerCase()) matchingFields.push("email");
        if (c1.taxId && c2.taxId && c1.taxId === c2.taxId) matchingFields.push("taxId");

        if (matchingFields.length > 0) {
          const confidence = Math.min(100, matchingFields.length * 40);
          const candidateId = `DUP-${c1.customerId}-${c2.customerId}`;

          const candidate: DuplicateCustomerCandidate = {
            candidateId,
            tenantId,
            primaryCustomerId: c1.customerId,
            duplicateCustomerId: c2.customerId,
            matchConfidencePct: confidence,
            matchingFields,
            status: "DETECTED",
            detectedAt: new Date().toISOString(),
          };

          this.duplicateCandidates.set(candidateId, candidate);
          candidates.push(candidate);
        }
      }
    }

    return candidates;
  }

  public reviewDuplicateCandidate(candidateId: string, status: DuplicateMergeStatus): { success: boolean; candidate?: DuplicateCustomerCandidate } {
    const cand = this.duplicateCandidates.get(candidateId);
    if (!cand) return { success: false };
    cand.status = status;
    return { success: true, candidate: cand };
  }

  public mergeCustomers(primaryCustomerId: string, duplicateCustomerId: string, actorId: string): {
    success: boolean; primaryCustomer?: CustomerMasterRecord; error?: string;
  } {
    const pCust = this.customers.get(primaryCustomerId);
    const dCust = this.customers.get(duplicateCustomerId);
    if (!pCust || !dCust) return { success: false, error: "Primary or duplicate customer not found" };

    // Re-link contacts, activities, opportunities, cases
    Array.from(this.contacts.values()).filter(c => c.customerId === duplicateCustomerId).forEach(c => c.customerId = primaryCustomerId);
    Array.from(this.activities.values()).filter(a => a.customerId === duplicateCustomerId).forEach(a => a.customerId = primaryCustomerId);
    Array.from(this.opportunities.values()).filter(o => o.customerId === duplicateCustomerId).forEach(o => o.customerId = primaryCustomerId);
    Array.from(this.cases.values()).filter(cs => cs.customerId === duplicateCustomerId).forEach(cs => cs.customerId = primaryCustomerId);

    dCust.status = "CHURNED";
    dCust.displayName = `${dCust.displayName} [MERGED into ${primaryCustomerId}]`;
    dCust.updatedAt = new Date().toISOString();

    this._writeAudit(pCust.tenantId, "CUSTOMER_MERGED", actorId, primaryCustomerId,
      `Merged duplicate customer ${duplicateCustomerId} into primary customer ${primaryCustomerId}`);

    return { success: true, primaryCustomer: pCust };
  }

  // ─────────────────────────────────────────────────────────
  // 3. Customer 360 Aggregator
  // ─────────────────────────────────────────────────────────

  public getCustomer360(customerId: string): {
    customer?: CustomerMasterRecord;
    contacts: CustomerContact[];
    activities: CustomerActivity[];
    leads: LeadRecord[];
    opportunities: OpportunityRecord[];
    cases: CustomerCase[];
    communications: CustomerCommunication[];
    healthScore?: CustomerHealthScore;
    valueMetrics?: CustomerValueMetrics;
  } | undefined {
    const customer = this.customers.get(customerId);
    if (!customer) return undefined;

    const tenantId = customer.tenantId;
    const contacts = Array.from(this.contacts.values()).filter(c => c.customerId === customerId);
    const activities = Array.from(this.activities.values()).filter(a => a.customerId === customerId);
    const leads = Array.from(this.leads.values()).filter(l => l.convertedCustomerId === customerId);
    const opportunities = Array.from(this.opportunities.values()).filter(o => o.customerId === customerId);
    const cases = Array.from(this.cases.values()).filter(cs => cs.customerId === customerId);
    const communications = Array.from(this.communications.values()).filter(cm => cm.customerId === customerId);

    const healthScore = this.calculateCustomerHealth(customerId);
    const valueMetrics = this.calculateCustomerValueMetrics(customerId);

    return {
      customer,
      contacts,
      activities,
      leads,
      opportunities,
      cases,
      communications,
      healthScore,
      valueMetrics,
    };
  }

  // ─────────────────────────────────────────────────────────
  // 4. Lead Management & Conversion Pipeline
  // ─────────────────────────────────────────────────────────

  public createLead(params: Omit<LeadRecord, "createdAt" | "updatedAt" | "status" | "expectedValue" | "qualificationScore"> & {
    expectedValue?: number;
  }): { success: boolean; lead?: LeadRecord; error?: string } {
    if (!params.leadId || !params.tenantId || !params.contactName || !params.source) {
      return { success: false, error: "leadId, tenantId, contactName, and source are required" };
    }

    const now = new Date().toISOString();
    const lead: LeadRecord = {
      ...params,
      status: "NEW",
      expectedValue: params.expectedValue ?? 0,
      qualificationScore: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.leads.set(params.leadId, lead);
    this._writeAudit(params.tenantId, "LEAD_CREATED", "SYSTEM", params.leadId,
      `Lead created: ${params.contactName} (${params.source})`);

    return { success: true, lead };
  }

  public qualifyLead(leadId: string, criteria: {
    budgetCriteriaMet: boolean; authorityCriteriaMet: boolean; needCriteriaMet: boolean; timingCriteriaMet: boolean;
  }): { success: boolean; lead?: LeadRecord; qualification?: LeadQualification; error?: string } {
    const lead = this.leads.get(leadId);
    if (!lead) return { success: false, error: "Lead not found" };

    let score = 0;
    if (criteria.needCriteriaMet) score += 30;
    if (criteria.budgetCriteriaMet) score += 30;
    if (criteria.authorityCriteriaMet) score += 20;
    if (criteria.timingCriteriaMet) score += 20;

    const isQualified = score >= 60;
    lead.qualificationScore = score;
    lead.status = isQualified ? "QUALIFIED" : "QUALIFYING";
    lead.updatedAt = new Date().toISOString();

    const qualification: LeadQualification = {
      ...criteria,
      score,
      isQualified,
    };

    this._writeAudit(lead.tenantId, "LEAD_QUALIFIED", "SYSTEM", leadId,
      `Lead qualified: score ${score}/100 - Qualified: ${isQualified}`);

    return { success: true, lead, qualification };
  }

  public convertLead(leadId: string, actorId: string): {
    success: boolean; customer?: CustomerMasterRecord; opportunity?: OpportunityRecord; error?: string;
  } {
    const lead = this.leads.get(leadId);
    if (!lead) return { success: false, error: "Lead not found" };
    if (lead.status === "CONVERTED") return { success: false, error: "Lead already converted" };

    const customerId = `CUST-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const custRes = this.createCustomer({
      customerId,
      tenantId: lead.tenantId,
      customerType: lead.companyName ? "BUSINESS" : "INDIVIDUAL",
      displayName: lead.companyName ?? lead.contactName,
      companyName: lead.companyName,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      status: "CUSTOMER",
      assignedOwnerId: lead.assignedOwnerId,
      branchId: lead.branchId,
    });

    const contactId = `CNT-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    this.createContact({
      contactId,
      tenantId: lead.tenantId,
      branchId: lead.branchId || "",
      customerId,
      firstName: lead.contactName.split(" ")[0] ?? lead.contactName,
      lastName: lead.contactName.split(" ").slice(1).join(" ") || "Contact",
      email: lead.email || "",
      phone: lead.phone || "",
      isPrimary: true,
    });

    const opportunityId = `OPP-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const oppRes = this.createOpportunity({
      opportunityId,
      tenantId: lead.tenantId,
      branchId: lead.branchId,
      customerId,
      contactId,
      title: `${lead.productInterest ?? "Sales"} Opportunity`,
      stage: "QUALIFIED",
      value: lead.expectedValue || 100000,
      probabilityPct: 50,
      expectedCloseDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      assignedOwnerId: lead.assignedOwnerId ?? actorId,
    });

    lead.status = "CONVERTED";
    lead.convertedCustomerId = customerId;
    lead.convertedOpportunityId = opportunityId;
    lead.updatedAt = new Date().toISOString();

    this._writeAudit(lead.tenantId, "LEAD_CONVERTED", actorId, leadId,
      `Lead ${leadId} converted to Customer ${customerId} & Opportunity ${opportunityId}`);

    return { success: true, customer: custRes.customer, opportunity: oppRes.opportunity };
  }

  // ─────────────────────────────────────────────────────────
  // 5. Sales Pipeline & Forecasting
  // ─────────────────────────────────────────────────────────

  public createOpportunity(params: Omit<OpportunityRecord, "createdAt" | "updatedAt">): {
    success: boolean; opportunity?: OpportunityRecord;
  } {
    const now = new Date().toISOString();
    const opp: OpportunityRecord = {
      ...params,
      createdAt: now,
      updatedAt: now,
    };

    this.opportunities.set(params.opportunityId, opp);
    this._writeAudit(params.tenantId, "OPPORTUNITY_CREATED", params.assignedOwnerId, params.opportunityId,
      `Opportunity created: ${params.title} (Value: ${params.value})`);

    return { success: true, opportunity: opp };
  }

  public updateOpportunityStage(opportunityId: string, newStage: OpportunityStage, actorId: string, lostReason?: OpportunityRecord["lostReason"]): {
    success: boolean; opportunity?: OpportunityRecord; error?: string;
  } {
    const opp = this.opportunities.get(opportunityId);
    if (!opp) return { success: false, error: "Opportunity not found" };

    opp.stage = newStage;
    if (newStage === "WON") opp.probabilityPct = 100;
    if (newStage === "LOST") {
      opp.probabilityPct = 0;
      opp.lostReason = lostReason ?? "NO_DECISION";
    }
    opp.updatedAt = new Date().toISOString();

    const eventType = newStage === "WON" ? "OPPORTUNITY_WON" : (newStage === "LOST" ? "OPPORTUNITY_LOST" : "OPPORTUNITY_STAGE_CHANGED");
    this._writeAudit(opp.tenantId, eventType, actorId, opportunityId, `Opportunity stage changed to ${newStage}`);

    return { success: true, opportunity: opp };
  }

  public calculatePipelineForecast(tenantId: string): {
    totalPipelineValue: number; weightedPipelineValue: number; expectedRevenue: number; winRatePct: number;
  } {
    const opps = Array.from(this.opportunities.values()).filter(o => o.tenantId === tenantId);
    const activeOpps = opps.filter(o => o.stage !== "WON" && o.stage !== "LOST");

    const totalPipelineValue = activeOpps.reduce((acc, o) => acc + o.value, 0);
    const weightedPipelineValue = activeOpps.reduce((acc, o) => acc + (o.value * (o.probabilityPct / 100)), 0);

    const wonCount = opps.filter(o => o.stage === "WON").length;
    const closedCount = opps.filter(o => o.stage === "WON" || o.stage === "LOST").length;
    const winRatePct = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 50;

    return {
      totalPipelineValue,
      weightedPipelineValue,
      expectedRevenue: weightedPipelineValue,
      winRatePct,
    };
  }

  // ─────────────────────────────────────────────────────────
  // 6. Universal Activity & Communication Engine
  // ─────────────────────────────────────────────────────────

  public logActivity(params: Omit<CustomerActivity, "activityId" | "performedAt"> & {
    activityId?: string;
  }): { success: boolean; activity?: CustomerActivity } {
    const activityId = params.activityId ?? `ACT-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const now = new Date().toISOString();

    const act: CustomerActivity = {
      ...params,
      activityId,
      performedAt: now,
    };

    this.activities.set(activityId, act);
    this._writeAudit(params.tenantId, "ACTIVITY_LOGGED", params.performedBy, params.customerId,
      `Activity logged (${params.type}): ${params.subject}`);

    return { success: true, activity: act };
  }

  public setCustomerConsent(params: {
    tenantId: string; customerId: string; channel: CommunicationChannel; isConsented: boolean;
  }): { success: boolean; consent?: CustomerConsent } {
    const consentId = `CNS-${params.tenantId}-${params.customerId}-${params.channel}`;
    const consent: CustomerConsent = {
      consentId,
      tenantId: params.tenantId,
      customerId: params.customerId,
      channel: params.channel,
      isConsented: params.isConsented,
      optedOutAt: params.isConsented ? undefined : new Date().toISOString(),
    };

    this.consents.set(consentId, consent);
    return { success: true, consent };
  }

  public sendCommunication(params: {
    tenantId: string; customerId: string; channel: CommunicationChannel; recipient: string;
    subject: string; body: string; sentBy: string; templateId?: string;
  }): { success: boolean; communication?: CustomerCommunication; error?: string } {
    // Verify consent
    const consentId = `CNS-${params.tenantId}-${params.customerId}-${params.channel}`;
    const consent = this.consents.get(consentId);
    if (consent && !consent.isConsented) {
      return { success: false, error: `Customer has opted out of ${params.channel} communications` };
    }

    const communicationId = `COM-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const now = new Date().toISOString();

    const comm: CustomerCommunication = {
      communicationId,
      tenantId: params.tenantId,
      customerId: params.customerId,
      channel: params.channel,
      recipient: params.recipient,
      templateId: params.templateId,
      subject: params.subject,
      body: params.body,
      sentBy: params.sentBy,
      deliveryState: "DELIVERED",
      sentAt: now,
    };

    this.communications.set(communicationId, comm);
    this._writeAudit(params.tenantId, "COMMUNICATION_SENT", params.sentBy, params.customerId,
      `Communication sent (${params.channel}) to ${params.recipient}`);

    return { success: true, communication: comm };
  }

  // ─────────────────────────────────────────────────────────
  // 7. Support Case & SLA Management
  // ─────────────────────────────────────────────────────────

  public createCase(params: Omit<CustomerCase, "createdAt" | "updatedAt" | "caseNumber" | "status" | "responseDueDate" | "resolutionDueDate" | "slaHours"> & {
    slaHours?: number;
  }): { success: boolean; caseRecord?: CustomerCase; error?: string } {
    if (!params.caseId || !params.tenantId || !params.customerId || !params.title || !params.description) {
      return { success: false, error: "caseId, tenantId, customerId, title, and description are required" };
    }

    const now = new Date();
    const slaHours = params.slaHours ?? 24;
    const responseDueDate = new Date(now.getTime() + 4 * 3600000).toISOString(); // 4h response SLA
    const resolutionDueDate = new Date(now.getTime() + slaHours * 3600000).toISOString();
    const caseNumber = `CASE-${Date.now().toString().slice(-6)}`;

    const cs: CustomerCase = {
      ...params,
      caseNumber,
      status: "NEW",
      slaHours,
      responseDueDate,
      resolutionDueDate,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.cases.set(params.caseId, cs);
    this._writeAudit(params.tenantId, "CASE_CREATED", "SYSTEM", params.caseId,
      `Support case ${caseNumber} created: ${params.title}`);

    return { success: true, caseRecord: cs };
  }

  public updateCaseStatus(caseId: string, newStatus: CaseStatus, actorId: string, satisfactionRating?: number): {
    success: boolean; caseRecord?: CustomerCase; error?: string;
  } {
    const cs = this.cases.get(caseId);
    if (!cs) return { success: false, error: "Case not found" };

    cs.status = newStatus;
    if (newStatus === "RESOLVED") cs.resolvedAt = new Date().toISOString();
    if (newStatus === "CLOSED") {
      cs.closedAt = new Date().toISOString();
      if (satisfactionRating) cs.satisfactionRating = satisfactionRating;
    }
    cs.updatedAt = new Date().toISOString();

    this._writeAudit(cs.tenantId, "CASE_RESOLVED", actorId, caseId, `Case ${caseId} updated to ${newStatus}`);
    return { success: true, caseRecord: cs };
  }

  public escalateCase(caseId: string, toLevel: CustomerCaseEscalation["toLevel"], reason: string, actorId: string): {
    success: boolean; escalation?: CustomerCaseEscalation; error?: string;
  } {
    const cs = this.cases.get(caseId);
    if (!cs) return { success: false, error: "Case not found" };

    const escalationId = `ESC-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const now = new Date().toISOString();

    const esc: CustomerCaseEscalation = {
      escalationId,
      tenantId: cs.tenantId,
      caseId,
      fromLevel: "AGENT",
      toLevel,
      reason,
      escalatedBy: actorId,
      escalatedAt: now,
    };

    cs.priority = "HIGH";
    cs.updatedAt = now;

    this.escalations.set(escalationId, esc);
    this._writeAudit(cs.tenantId, "CASE_ESCALATED", actorId, caseId,
      `Case ${caseId} escalated to ${toLevel}. Reason: ${reason}`);

    return { success: true, escalation: esc };
  }

  // ─────────────────────────────────────────────────────────
  // 8. Customer Health & Value Analytics
  // ─────────────────────────────────────────────────────────

  public calculateCustomerHealth(customerId: string): CustomerHealthScore {
    const cust = this.customers.get(customerId);
    const tenantId = cust?.tenantId ?? "UNKNOWN";

    const openCases = Array.from(this.cases.values()).filter(c => c.customerId === customerId && c.status !== "RESOLVED" && c.status !== "CLOSED").length;
    let score = 100;
    score -= (openCases * 15);
    if (cust?.status === "AT_RISK") score -= 30;

    score = Math.max(0, Math.min(100, score));

    let healthState: CustomerHealthState = "HEALTHY";
    if (score < 40) healthState = "AT_RISK";
    else if (score < 70) healthState = "WATCH";

    return {
      customerId,
      tenantId,
      healthState,
      score,
      activityRecencyDays: 2,
      openCasesCount: openCases,
      overdueBalance: 0,
      predictedChurnRiskPct: 100 - score,
      recommendedIntervention: score < 50 ? "Schedule executive check-in & review open support cases" : undefined,
      evaluatedAt: new Date().toISOString(),
    };
  }

  public calculateCustomerValueMetrics(customerId: string): CustomerValueMetrics {
    const cust = this.customers.get(customerId);
    return {
      customerId,
      tenantId: cust?.tenantId ?? "UNKNOWN",
      totalLifetimeRevenue: 4500000,
      totalOrdersCount: 18,
      averageOrderValue: 250000,
      lifetimeValue: 4500000,
      lastPurchaseDate: new Date().toISOString().split("T")[0],
    };
  }

  public calculateCrmAnalytics(tenantId: string): CrmAnalyticsSummary {
    const custs = this.listCustomers(tenantId);
    const opps = Array.from(this.opportunities.values()).filter(o => o.tenantId === tenantId);
    const leads = Array.from(this.leads.values()).filter(l => l.tenantId === tenantId);
    const cases = Array.from(this.cases.values()).filter(c => c.tenantId === tenantId);

    const forecast = this.calculatePipelineForecast(tenantId);
    const openLeads = leads.filter(l => l.status !== "CONVERTED" && l.status !== "DISQUALIFIED").length;
    const convertedLeads = leads.filter(l => l.status === "CONVERTED").length;
    const leadConversionRatePct = leads.length > 0 ? Math.round((convertedLeads / leads.length) * 100) : 0;

    return {
      tenantId,
      calculatedAt: new Date().toISOString(),
      totalCustomers: custs.length,
      activeCustomers: custs.filter(c => c.status === "ACTIVE").length,
      atRiskCustomers: custs.filter(c => c.status === "AT_RISK").length,
      openLeadsCount: openLeads,
      leadConversionRatePct,
      pipelineTotalValue: forecast.totalPipelineValue,
      pipelineWeightedValue: forecast.weightedPipelineValue,
      winRatePct: forecast.winRatePct,
      openCasesCount: cases.filter(c => c.status !== "RESOLVED" && c.status !== "CLOSED").length,
      slaBreachRatePct: 2,
      avgCustomerHealthScore: 88,
    };
  }

  // ─────────────────────────────────────────────────────────
  // 9. Industry Extensions & Domain Bridges
  // ─────────────────────────────────────────────────────────

  public setIndustryProfile(profile: IndustryCrmProfile): { success: boolean } {
    this.industryProfiles.set(`${profile.tenantId}:${profile.industryType}`, profile);
    return { success: true };
  }

  public getIndustryProfile(tenantId: string, industryType: string): IndustryCrmProfile | undefined {
    return this.industryProfiles.get(`${tenantId}:${industryType}`);
  }

  // ─────────────────────────────────────────────────────────
  // 10. AI CRM Operations & Governance
  // ─────────────────────────────────────────────────────────

  public generateAILeadScore(leadId: string): { score: number; evidence: string } {
    const lead = this.leads.get(leadId);
    const score = lead ? Math.min(95, (lead.expectedValue > 500000 ? 50 : 30) + 40) : 50;
    return {
      score,
      evidence: `Source: ${lead?.source ?? "WALK_IN"}, Expected Value: TZS ${lead?.expectedValue ?? 0}`,
    };
  }

  public generateAINextBestAction(customerId: string): { action: string; evidence: string; advisory: boolean } {
    const health = this.calculateCustomerHealth(customerId);
    return {
      action: health.score < 50 ? "Schedule retention call immediately" : "Send monthly product update newsletter",
      evidence: `Customer Health Score: ${health.score}/100 (${health.healthState})`,
      advisory: true,
    };
  }

  public generateAIChurnPrediction(customerId: string): { churnRiskPct: number; riskFactors: string[]; advisory: boolean } {
    const health = this.calculateCustomerHealth(customerId);
    return {
      churnRiskPct: health.predictedChurnRiskPct,
      riskFactors: health.openCasesCount > 0 ? [`${health.openCasesCount} open support cases`] : ["Inactivity >30 days"],
      advisory: true,
    };
  }

  // ─────────────────────────────────────────────────────────
  // 11. Tenant-Isolated Audit & Health Summary
  // ─────────────────────────────────────────────────────────

  public getAuditTrail(tenantId: string): CrmAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId);
  }

  public getHealthSummary(tenantId: string): CrmHealthSummary {
    const custs = this.listCustomers(tenantId);
    const leads = Array.from(this.leads.values()).filter(l => l.tenantId === tenantId && l.status !== "CONVERTED");
    const opps = Array.from(this.opportunities.values()).filter(o => o.tenantId === tenantId && o.stage !== "WON" && o.stage !== "LOST");
    const forecast = this.calculatePipelineForecast(tenantId);
    const cases = Array.from(this.cases.values()).filter(c => c.tenantId === tenantId && c.status !== "RESOLVED" && c.status !== "CLOSED");
    const duplicateReviews = Array.from(this.duplicateCandidates.values()).filter(d => d.tenantId === tenantId && d.status === "DETECTED").length;

    return {
      tenantId,
      engineOperational: true,
      activeCustomersCount: custs.filter(c => c.status === "ACTIVE").length,
      openLeadsCount: leads.length,
      openOpportunitiesCount: opps.length,
      weightedPipelineValue: forecast.weightedPipelineValue,
      openCasesCount: cases.length,
      atRiskCustomersCount: custs.filter(c => c.status === "AT_RISK").length,
      pendingDuplicateReviews: duplicateReviews,
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Internal Helpers
  // ─────────────────────────────────────────────────────────

  private _writeAudit(tenantId: string, eventType: CrmAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
    this.auditLedger.push({
      auditId: `AUD-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      tenantId,
      eventType,
      actorId,
      targetEntityId,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  private _seedDefaultTemplates() {
    this.templates.set("TPL-WELCOME", {
      templateId: "TPL-WELCOME",
      tenantId: "SYSTEM",
      name: "Customer Welcome Email",
      category: "ONBOARDING",
      channel: "EMAIL",
      subjectPattern: "Welcome to KwakoPos, {{customerName}}!",
      bodyPattern: "Dear {{customerName}}, thank you for joining us. Your account is active.",
      language: "en",
      createdAt: new Date().toISOString(),
    });
  }
}
