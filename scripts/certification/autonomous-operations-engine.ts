import { AutonomousOperationsEngine } from "@kwakopos2/domain";

export interface AutonomousOperationsCertificationPillar {
  id: string;
  description: string;
  test: (engine: AutonomousOperationsEngine) => boolean | Promise<boolean>;
}

function makePillar(id: string, description: string, test: (engine: AutonomousOperationsEngine) => boolean): AutonomousOperationsCertificationPillar {
  return { id, description, test };
}

export const AUTONOMOUS_OPERATIONS_CERTIFICATION_PILLARS: AutonomousOperationsCertificationPillar[] = [
  makePillar("AUTO-OPS-01", "KwakoPos Autonomous Operations Platform Layer (KAOL v2.0.0) is operational", e => {
    return e.getHealthSummary("CERT").engineOperational === true;
  }),
  makePillar("AUTO-OPS-02", "Registering agent capability records autonomy level, risk class, and financial limit", e => {
    const reg = e.registerAgentCapability({
      agentId: "AGT-INV-01", tenantId: "CERT", agentRole: "Inventory Agent",
      autonomyLevel: "LEVEL_4_CERTIFIED", riskClass: "MEDIUM", financialLimitTzs: 750000,
    });
    return Boolean(reg.success && reg.capability?.autonomyLevel === "LEVEL_4_CERTIFIED");
  }),
  makePillar("AUTO-OPS-03", "Action request within financial limit is authorized and ready for execution", e => {
    const req = e.executeAutonomousRequest({
      requestId: "REQ-01", tenantId: "CERT", agentId: "AGT-INV-01",
      capability: "inventory.reorder.execute", financialCostTzs: 400000,
    });
    return Boolean(req.success && req.request?.state === "AUTHORIZED");
  }),
  makePillar("AUTO-OPS-04", "Action request exceeding financial limit is automatically escalated to human", e => {
    const req = e.executeAutonomousRequest({
      requestId: "REQ-02", tenantId: "CERT", agentId: "AGT-INV-01",
      capability: "inventory.reorder.execute", financialCostTzs: 1500000,
    });
    return Boolean(req.success && req.request?.state === "ESCALATED");
  }),
  makePillar("AUTO-OPS-05", "Independent action verification updates request state and health metrics", e => {
    e.verifyActionResult("REQ-01", true);
    return Boolean(e.getHealthSummary("CERT").verifiedActionsCount >= 1);
  })
];
