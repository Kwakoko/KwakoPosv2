import {
  OrganizationNode, ConsolidatedMetricRecord, MultiSiteHealthSummary, MultiSiteAuditEntry,
  OrganizationLevel,
} from "@kwakopos2/contracts";

export class MultiSiteEngine {
  private nodes: Map<string, OrganizationNode> = new Map();
  private metrics: Map<string, ConsolidatedMetricRecord> = new Map();
  private auditLedger: MultiSiteAuditEntry[] = [];

  public createOrganizationNode(params: Omit<OrganizationNode, "createdAt" | "updatedAt" | "countryId" | "currency" | "isActive"> & {
    countryId?: string;
    currency?: string;
    isActive?: boolean;
  }): {
    success: boolean; node?: OrganizationNode; error?: string;
  } {
    if (!params.nodeId || !params.tenantId || !params.name || !params.level) {
      return { success: false, error: "nodeId, tenantId, name, and level are required" };
    }

    const now = new Date().toISOString();
    const node: OrganizationNode = {
      ...params,
      countryId: params.countryId ?? "TZ",
      currency: params.currency ?? "TZS",
      isActive: params.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.nodes.set(params.nodeId, node);
    this._writeAudit(params.tenantId, "ORGANIZATION_NODE_CREATED", "SYSTEM", params.nodeId,
      `Organization node created: ${params.name} (${params.level})`);

    return { success: true, node };
  }

  public listOrganizationNodes(tenantId: string, level?: OrganizationLevel): OrganizationNode[] {
    const list = Array.from(this.nodes.values()).filter(n => n.tenantId === tenantId);
    if (level) return list.filter(n => n.level === level);
    return list;
  }

  public recordConsolidatedMetric(params: Omit<ConsolidatedMetricRecord, "calculatedAt">): {
    success: boolean; record?: ConsolidatedMetricRecord;
  } {
    const now = new Date().toISOString();
    const record: ConsolidatedMetricRecord = {
      ...params,
      calculatedAt: now,
    };

    this.metrics.set(params.recordId, record);
    this._writeAudit(params.tenantId, "METRICS_CONSOLIDATED", "SYSTEM", params.nodeId,
      `Consolidated metric recorded for node ${params.nodeId}: TZS ${params.totalSalesVolume}`);

    return { success: true, record };
  }

  public getHealthSummary(tenantId: string): MultiSiteHealthSummary {
    const nodeList = this.listOrganizationNodes(tenantId);
    const subCount = nodeList.filter(n => n.level === "SUBSIDIARY").length;
    const branchCount = nodeList.filter(n => n.level === "BRANCH").length;

    const metricList = Array.from(this.metrics.values()).filter(m => m.tenantId === tenantId);
    const totalVolume = metricList.reduce((acc, m) => acc + m.totalSalesVolume, 0);

    return {
      tenantId,
      engineOperational: true,
      totalNodesCount: nodeList.length,
      subsidiariesCount: subCount,
      branchesCount: branchCount,
      totalConsolidatedSalesVolume: totalVolume,
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string): MultiSiteAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId);
  }

  private _writeAudit(tenantId: string, eventType: MultiSiteAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
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
}
