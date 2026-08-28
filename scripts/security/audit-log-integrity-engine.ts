import { createHash, randomUUID } from "crypto";

export interface TamperEvidentAuditRecord {
  recordId: string;
  sequenceNumber: number;
  tenantId: string;
  branchId: string;
  actorId: string;
  role: string;
  timestamp: string;
  action: string;
  resource: string;
  previousValue?: string;
  newValue?: string;
  deviceId: string;
  operationId: string;
  idempotencyKey: string;
  outcome: "SUCCESS" | "BLOCKED" | "FAILED";
  securityClassification: "CONFIDENTIAL" | "RESTRICTED" | "CRITICAL";
  previousHash: string;
  hash: string;
}

export class AuditLogIntegrityEngine {
  private chain: TamperEvidentAuditRecord[] = [];
  private genesisHash: string = "0000000000000000000000000000000000000000000000000000000000000000";

  public appendEvent(eventData: Omit<TamperEvidentAuditRecord, "recordId" | "sequenceNumber" | "previousHash" | "hash">): TamperEvidentAuditRecord {
    const sequenceNumber = this.chain.length + 1;
    const recordId = `AUD-${String(sequenceNumber).padStart(8, "0")}-${randomUUID().slice(0, 8)}`;
    const previousHash = this.chain.length > 0 ? this.chain[this.chain.length - 1].hash : this.genesisHash;

    const payloadString = JSON.stringify({
      recordId,
      sequenceNumber,
      tenantId: eventData.tenantId,
      branchId: eventData.branchId,
      actorId: eventData.actorId,
      role: eventData.role,
      timestamp: eventData.timestamp,
      action: eventData.action,
      resource: eventData.resource,
      previousValue: eventData.previousValue || null,
      newValue: eventData.newValue || null,
      deviceId: eventData.deviceId,
      operationId: eventData.operationId,
      idempotencyKey: eventData.idempotencyKey,
      outcome: eventData.outcome,
      securityClassification: eventData.securityClassification,
      previousHash,
    });

    const hash = createHash("sha256").update(payloadString).digest("hex");

    const record: TamperEvidentAuditRecord = {
      ...eventData,
      recordId,
      sequenceNumber,
      previousHash,
      hash,
    };

    this.chain.push(record);
    return record;
  }

  public verifyChainIntegrity(): {
    chainIntact: boolean;
    totalRecords: number;
    corruptedRecordId?: string;
    reason?: string;
  } {
    if (this.chain.length === 0) {
      return { chainIntact: true, totalRecords: 0 };
    }

    for (let i = 0; i < this.chain.length; i++) {
      const current = this.chain[i];
      const expectedPreviousHash = i === 0 ? this.genesisHash : this.chain[i - 1].hash;

      if (current.previousHash !== expectedPreviousHash) {
        return {
          chainIntact: false,
          totalRecords: this.chain.length,
          corruptedRecordId: current.recordId,
          reason: `Previous hash mismatch at sequence ${current.sequenceNumber}. Expected ${expectedPreviousHash}, got ${current.previousHash}`,
        };
      }

      const payloadString = JSON.stringify({
        recordId: current.recordId,
        sequenceNumber: current.sequenceNumber,
        tenantId: current.tenantId,
        branchId: current.branchId,
        actorId: current.actorId,
        role: current.role,
        timestamp: current.timestamp,
        action: current.action,
        resource: current.resource,
        previousValue: current.previousValue || null,
        newValue: current.newValue || null,
        deviceId: current.deviceId,
        operationId: current.operationId,
        idempotencyKey: current.idempotencyKey,
        outcome: current.outcome,
        securityClassification: current.securityClassification,
        previousHash: current.previousHash,
      });

      const recomputedHash = createHash("sha256").update(payloadString).digest("hex");
      if (recomputedHash !== current.hash) {
        return {
          chainIntact: false,
          totalRecords: this.chain.length,
          corruptedRecordId: current.recordId,
          reason: `Hash corruption detected at sequence ${current.sequenceNumber}. Expected ${recomputedHash}, got ${current.hash}`,
        };
      }
    }

    return { chainIntact: true, totalRecords: this.chain.length };
  }

  public getChain(): TamperEvidentAuditRecord[] {
    return [...this.chain];
  }
}

export function runAuditIntegrityCheck(): {
  verified: boolean;
  totalAuditRecords: number;
  chainDigest: string;
} {
  const engine = new AuditLogIntegrityEngine();

  engine.appendEvent({
    tenantId: "TENANT-SEC-01",
    branchId: "BRANCH-SEC-01",
    actorId: "USER-ADMIN-01",
    role: "SUPER_ADMIN",
    timestamp: new Date().toISOString(),
    action: "SECURITY_POLICY_UPDATE",
    resource: "KISB_BASELINE",
    newValue: "Updated Baseline v2.2.0",
    deviceId: "DEV-ADMIN-01",
    operationId: "OP-AUD-01",
    idempotencyKey: "IDEM-AUD-01",
    outcome: "SUCCESS",
    securityClassification: "CRITICAL",
  });

  engine.appendEvent({
    tenantId: "TENANT-SEC-01",
    branchId: "BRANCH-SEC-01",
    actorId: "USER-FINANCE-01",
    role: "FINANCE_MANAGER",
    timestamp: new Date().toISOString(),
    action: "JOURNAL_ENTRY_POST",
    resource: "GENERAL_LEDGER",
    previousValue: "0",
    newValue: "500000 TZS",
    deviceId: "DEV-FIN-01",
    operationId: "OP-AUD-02",
    idempotencyKey: "IDEM-AUD-02",
    outcome: "SUCCESS",
    securityClassification: "CONFIDENTIAL",
  });

  const check = engine.verifyChainIntegrity();
  const lastHash = engine.getChain()[engine.getChain().length - 1].hash;

  return {
    verified: check.chainIntact,
    totalAuditRecords: check.totalRecords,
    chainDigest: `sha256:${lastHash}`,
  };
}

if (process.argv[1]?.endsWith("audit-log-integrity-engine.ts")) {
  console.log(runAuditIntegrityCheck());
}
