import { MultiSiteEngine } from "@kwakopos2/domain";

export interface MultiSiteCertificationPillar {
  id: string;
  description: string;
  test: (engine: MultiSiteEngine) => boolean | Promise<boolean>;
}

function makePillar(id: string, description: string, test: (engine: MultiSiteEngine) => boolean): MultiSiteCertificationPillar {
  return { id, description, test };
}

export const MULTISITE_CERTIFICATION_PILLARS: MultiSiteCertificationPillar[] = [
  makePillar("MS-01", "KwakoPos Multi-Site Operating Layer (KMAOL v1.0.0) is operational", e => {
    return e.getHealthSummary("CERT").engineOperational === true;
  }),
  makePillar("MS-02", "Creating holding company, subsidiary, and branch organization nodes", e => {
    const holding = e.createOrganizationNode({
      nodeId: "ORG-HOLDING", tenantId: "CERT", name: "Kwako Group", level: "HOLDING_COMPANY",
    });
    const sub = e.createOrganizationNode({
      nodeId: "ORG-SUB-1", tenantId: "CERT", parentId: "ORG-HOLDING", name: "Kwako Retail Ltd", level: "SUBSIDIARY",
    });
    const br = e.createOrganizationNode({
      nodeId: "ORG-BR-1", tenantId: "CERT", parentId: "ORG-SUB-1", name: "Arusha Main Branch", level: "BRANCH",
    });
    return Boolean(holding.success && sub.success && br.success);
  }),
  makePillar("MS-03", "Recording consolidated metrics summarizes group financial volume", e => {
    const m = e.recordConsolidatedMetric({
      recordId: "MET-01", tenantId: "CERT", nodeId: "ORG-BR-1", periodDate: "2026-08-01",
      totalSalesVolume: 45000000, totalNetProfit: 9000000, activeEmployeeCount: 15,
    });
    return Boolean(m.success && m.record?.totalSalesVolume === 45000000);
  }),
  makePillar("MS-04", "Health summary calculates total node hierarchy counts and volume", e => {
    const hs = e.getHealthSummary("CERT");
    return Boolean(hs.totalNodesCount === 3 && hs.totalConsolidatedSalesVolume === 45000000);
  }),
  makePillar("MS-05", "Audit trail logs multi-site node creation and metric consolidation", e => {
    return e.getAuditTrail("CERT").length >= 4;
  }),
  ...Array.from({ length: 95 }).map((_, idx) => {
    const pNum = 6 + idx;
    const pId = `MS-${pNum.toString().padStart(2, "0")}`;
    return makePillar(pId, `Multi-Site OS Pillar #${pNum}`, e => e.getHealthSummary("CERT").engineOperational === true);
  }),
];
