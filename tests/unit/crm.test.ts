import { describe, it, expect, beforeEach } from "vitest";
import { CrmEngine } from "@kwakopos2/domain";

describe("Phase 38 — KwakoPos CRM Operating Layer (KCRML v1.0.0)", () => {
  let engine: CrmEngine;

  beforeEach(() => {
    engine = new CrmEngine();
  });

  it("should create customer master, contacts, and detect duplicate candidates", () => {
    const c1 = engine.createCustomer({
      customerId: "CUST-T1", tenantId: "TEN-01", displayName: "Safari Tours", customerType: "BUSINESS",
      phone: "+255755123456", email: "info@safari.co.tz",
    });
    expect(c1.success).toBe(true);
    expect(c1.customer?.customerId).toBe("CUST-T1");

    const c2 = engine.createCustomer({
      customerId: "CUST-T2", tenantId: "TEN-01", displayName: "Safari Tours Tanzania", customerType: "BUSINESS",
      phone: "+255755123456", email: "info@safari.co.tz",
    });
    expect(c2.success).toBe(true);

    const dups = engine.detectDuplicateCandidates("TEN-01");
    expect(dups.length).toBeGreaterThanOrEqual(1);

    const merge = engine.mergeCustomers("CUST-T1", "CUST-T2", "USR-MGR");
    expect(merge.success).toBe(true);
  });

  it("should process lead capture, qualification, and lead conversion", () => {
    const ld = engine.createLead({
      leadId: "LD-T1", tenantId: "TEN-01", source: "WEBSITE", contactName: "Alice Walker",
      companyName: "Walker Enterprises", expectedValue: 15000000,
    });
    expect(ld.success).toBe(true);

    const q = engine.qualifyLead("LD-T1", {
      budgetCriteriaMet: true, authorityCriteriaMet: true, needCriteriaMet: true, timingCriteriaMet: true,
    });
    expect(q.success).toBe(true);
    expect(q.lead?.status).toBe("QUALIFIED");

    const conv = engine.convertLead("LD-T1", "USR-SALES");
    expect(conv.success).toBe(true);
    expect(conv.customer).toBeDefined();
    expect(conv.opportunity).toBeDefined();
  });

  it("should manage sales opportunities, stage transitions, and pipeline forecasting", () => {
    const opp = engine.createOpportunity({
      opportunityId: "OPP-T1", tenantId: "TEN-01", customerId: "CUST-T1",
      title: "Warehouse Management System", stage: "PROPOSAL", value: 30000000, probabilityPct: 60,
      expectedCloseDate: "2026-11-01", assignedOwnerId: "USR-REP1",
    });
    expect(opp.success).toBe(true);

    const fc = engine.calculatePipelineForecast("TEN-01");
    expect(fc.totalPipelineValue).toBeGreaterThanOrEqual(30000000);

    const won = engine.updateOpportunityStage("OPP-T1", "WON", "USR-REP1");
    expect(won.success).toBe(true);
    expect(won.opportunity?.probabilityPct).toBe(100);
  });

  it("should process support cases, escalations, AI predictions, and health summary", () => {
    const cust = engine.createCustomer({
      customerId: "CUST-T3", tenantId: "TEN-01", displayName: "Metro Hardware", customerType: "BUSINESS",
    });

    const cs = engine.createCase({
      caseId: "CASE-T1", tenantId: "TEN-01", customerId: "CUST-T3", title: "POS Printer Offline",
      description: "Thermal printer disconnected", category: "TECHNICAL", priority: "HIGH",
    });
    expect(cs.success).toBe(true);

    const esc = engine.escalateCase("CASE-T1", "SUPERVISOR", "Field technician required", "USR-AGENT1");
    expect(esc.success).toBe(true);

    const churn = engine.generateAIChurnPrediction("CUST-T3");
    expect(churn.advisory).toBe(true);

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.activeCustomersCount).toBeGreaterThanOrEqual(1);
  });
});
