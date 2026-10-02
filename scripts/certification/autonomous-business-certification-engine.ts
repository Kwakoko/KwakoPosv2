import { AutonomousBusinessEngine } from "@kwakopos2/domain";

export interface AutonomousBusinessCertificationPillar {
  id: string;
  description: string;
  test: (engine: AutonomousBusinessEngine) => boolean | Promise<boolean>;
}

function makePillar(id: string, description: string, test: (engine: AutonomousBusinessEngine) => boolean): AutonomousBusinessCertificationPillar {
  return { id, description, test };
}

export const AUTONOMOUS_BUSINESS_CERTIFICATION_PILLARS: AutonomousBusinessCertificationPillar[] = [
  makePillar("AUTO-01", "KwakoPos Autonomous Business Operations Layer (KABO v1.0.0) is operational", e => {
    return e.getHealthSummary("CERT").engineOperational === true;
  }),
  makePillar("AUTO-02", "Configuring agent policy sets max financial limit and approval threshold", e => {
    const p = e.configurePolicy({
      policyId: "POL-AUTO-01", tenantId: "CERT", agentRole: "INVENTORY_REPLENISHER",
      maxFinancialLimitTzs: 2000000, requiresHumanApprovalAboveTzs: 500000,
    });
    return Boolean(p.success && p.policy?.maxFinancialLimitTzs === 2000000);
  }),
  makePillar("AUTO-03", "Autonomous action below approval threshold executes automatically", e => {
    const act = e.triggerAutonomousAction({
      actionId: "ACT-CERT-01", tenantId: "CERT", agentRole: "INVENTORY_REPLENISHER",
      targetEntityId: "PO-1001", actionDescription: "Auto-reorder 50 units Paracetamol 500mg",
      financialImpactTzs: 350000,
    });
    return Boolean(act.success && act.action?.state === "EXECUTED");
  }),
  makePillar("AUTO-04", "Autonomous action above approval threshold requires human approval before execution", e => {
    const act = e.triggerAutonomousAction({
      actionId: "ACT-CERT-02", tenantId: "CERT", agentRole: "INVENTORY_REPLENISHER",
      targetEntityId: "PO-1002", actionDescription: "Auto-reorder 500 units Amoxicillin",
      financialImpactTzs: 800000,
    });
    const expectProposedState = Boolean(act.success && act.action?.state === "PROPOSED");
    const app = e.approveAction("ACT-CERT-02", "USR-SUPPLY-LEAD");
    return Boolean(expectProposedState && app.success && app.action?.state === "EXECUTED");
  }),
  makePillar("AUTO-05", "Tenant kill switch immediately blocks all subsequent autonomous actions", e => {
    e.activateTenantKillSwitch("CERT", "USR-ADMIN");
    const act = e.triggerAutonomousAction({
      actionId: "ACT-CERT-03", tenantId: "CERT", agentRole: "PRICE_OPTIMIZER",
      targetEntityId: "PR-201", actionDescription: "Dynamic repricing discount 5%",
      financialImpactTzs: 50000,
    });
    return Boolean(act.success === false && e.getHealthSummary("CERT").isGlobalKillSwitchActive === true);
  })
];
