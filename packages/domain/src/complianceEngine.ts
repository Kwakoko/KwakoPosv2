import {
  ComplianceRule, ImmutableAuditRecord, ComplianceHealthSummary,
  ComplianceFramework, ComplianceStatus,
} from "@kwakopos2/contracts";

export class ComplianceEngine {
  private rules: Map<string, ComplianceRule> = new Map();
  private auditChain: ImmutableAuditRecord[] = [];
  private lastHash: string = "GENESIS_HASH_0000000000000000";

  public evaluateRule(params: Omit<ComplianceRule, "evaluatedAt">): {
    success: boolean; rule?: ComplianceRule;
  } {
    const now = new Date().toISOString();
    const rule: ComplianceRule = {
      ...params,
      evaluatedAt: now,
    };
    this.rules.set(params.ruleId, rule);
    this.appendAuditRecord(params.tenantId, "COMPLIANCE_RULE", "EVALUATE", "SYSTEM", params.ruleId);
    return { success: true, rule };
  }

  public appendAuditRecord(tenantId: string, moduleName: string, action: string, actorId: string, resourceId: string): ImmutableAuditRecord {
    const recordId = `AUD-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const now = new Date().toISOString();
    const previousHash = this.lastHash;
    const currentHash = `HASH-${recordId}-${previousHash.slice(-8)}`;

    const record: ImmutableAuditRecord = {
      recordId,
      tenantId,
      moduleName,
      action,
      actorId,
      resourceId,
      previousHash,
      currentHash,
      timestamp: now,
    };

    this.lastHash = currentHash;
    this.auditChain.push(record);
    return record;
  }

  public verifyAuditChain(tenantId: string): boolean {
    const records = this.auditChain.filter(r => r.tenantId === tenantId);
    if (records.length === 0) return true;

    for (let i = 1; i < records.length; i++) {
      if (records[i].previousHash !== records[i - 1].currentHash) {
        return false;
      }
    }
    return true;
  }

  public getHealthSummary(tenantId: string): ComplianceHealthSummary {
    const rList = Array.from(this.rules.values()).filter(r => r.tenantId === tenantId);
    const compliant = rList.filter(r => r.status === "COMPLIANT").length;
    const nonCompliant = rList.filter(r => r.status === "NON_COMPLIANT").length;
    const chainValid = this.verifyAuditChain(tenantId);
    const auditRecords = this.auditChain.filter(r => r.tenantId === tenantId).length;

    return {
      tenantId,
      engineOperational: true,
      totalRulesCount: rList.length,
      compliantRulesCount: compliant,
      nonCompliantRulesCount: nonCompliant,
      auditLogChainVerified: chainValid,
      totalAuditRecordsCount: auditRecords,
    };
  }
}
