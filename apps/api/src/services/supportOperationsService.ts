import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";

export type SupportSeverity = "P0" | "P1" | "P2" | "P3" | "P4";
export type SupportStatus = "OPEN" | "INVESTIGATING" | "WAITING_CUSTOMER" | "ESCALATED" | "RESOLVED";
export type RemediationRisk = "SAFE" | "APPROVAL_REQUIRED" | "RESTRICTED";

export interface SupportTicketInput {
  tenantId: string; branchId?: string; createdByUserId?: string; subject: string; description: string;
  severity?: SupportSeverity; category?: string; module?: string;
}

const SLA_MINUTES: Record<SupportSeverity, number> = { P0: 15, P1: 60, P2: 240, P3: 1440, P4: 2880 };
function assertTenant(tenantId: string): string { const value = String(tenantId || "").trim(); if (!value) throw new Error("TENANT_SCOPE_REQUIRED"); return value; }

async function audit(tenantId: string | null, eventType: string, payload: Record<string, unknown>, ticketId?: string, incidentId?: string, actorId?: string) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SupportEvent" ("id","tenant_id","ticket_id","incident_id","actor_type","actor_id","event_type","payload") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    randomUUID(), tenantId, ticketId ?? null, incidentId ?? null, actorId ? "USER" : "SYSTEM", actorId ?? null, eventType, JSON.stringify(payload),
  );
}

async function countByStatus(table: string, tenantId: string): Promise<Record<string, number>> {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "status", COUNT(*)::int AS count FROM ${table} WHERE "tenant_id"=$1 GROUP BY "status"`, tenantId);
  return Object.fromEntries(rows.map((r) => [String(r.status), Number(r.count)]));
}

export class SupportOperationsService {
  async createTicket(input: SupportTicketInput) {
    const tenantId = assertTenant(input.tenantId); const id = randomUUID(); const severity = input.severity ?? "P3";
    const rows = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO "SupportTicket" ("id","tenant_id","branch_id","created_by_user_id","subject","description","severity","category","module") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, id, tenantId, input.branchId ?? null, input.createdByUserId ?? null, input.subject.trim(), input.description.trim(), severity, input.category ?? "GENERAL", input.module ?? null);
    await audit(tenantId, "TICKET_CREATED", { severity, slaMinutes: SLA_MINUTES[severity] }, id, undefined, input.createdByUserId); return rows[0];
  }

  async listTickets(tenantId: string, status?: SupportStatus) {
    const t = assertTenant(tenantId);
    return status ? prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "SupportTicket" WHERE "tenant_id"=$1 AND "status"=$2 ORDER BY "created_at" DESC LIMIT 200`, t, status) : prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "SupportTicket" WHERE "tenant_id"=$1 ORDER BY "created_at" DESC LIMIT 200`, t);
  }

  async getTicket(tenantId: string, ticketId: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "SupportTicket" WHERE "tenant_id"=$1 AND "id"=$2 LIMIT 1`, assertTenant(tenantId), ticketId); return rows[0] ?? null;
  }

  async diagnose(tenantId: string, ticketId: string) {
    const t = assertTenant(tenantId); const ticket = await this.getTicket(t, ticketId); if (!ticket) throw new Error("SUPPORT_TICKET_NOT_FOUND");
    const text = `${ticket.subject} ${ticket.description}`.toLowerCase();
    const signals = { sync: /sync|synchroniz|outbox|offline|not updating/.test(text), inventory: /stock|inventory|variant|ledger/.test(text), authentication: /login|password|session|auth/.test(text), printing: /print|printer|receipt/.test(text), payments: /payment|mpesa|cash|card/.test(text) };
    const matches = Object.entries(signals).filter(([, v]) => v).map(([k]) => k); const category = matches[0] ?? "general";

    const evidence: Record<string, unknown> = { checkedAt: new Date().toISOString() };
    if (signals.sync) {
      const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "status", COUNT(*)::int AS count FROM "sync_operations" WHERE "tenant_id"=$1 GROUP BY "status"`, t);
      evidence.syncOperations = Object.fromEntries(rows.map((r) => [String(r.status), Number(r.count)]));
      const recentFailures = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "sync_operations" WHERE "tenant_id"=$1 AND "status"='FAILED' AND "created_at">NOW()-INTERVAL '24 hours'`, t);
      evidence.failedSync24h = Number(recentFailures[0]?.count ?? 0);
    }
    if (signals.inventory) {
      const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "stock_ledgers" WHERE "tenant_id"=$1`, t);
      evidence.stockLedgerEntries = Number(rows[0]?.count ?? 0);
    }
    if (signals.payments) {
      const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "payments" WHERE "tenant_id"=$1 AND "status"='FAILED'`, t);
      evidence.failedPayments = Number(rows[0]?.count ?? 0);
    }
    const summary = matches.length
      ? `Detected ${matches.join(", ")} support signals. Real backend evidence was collected where applicable. Root cause remains unconfirmed until the relevant verification check passes.`
      : "No known diagnostic pattern matched; human investigation may be required.";
    const state = { version: 2, signals, matches, category, confidence: matches.length ? 0.75 : 0.1, evidence, generatedAt: new Date().toISOString() };
    await prisma.$executeRawUnsafe(`UPDATE "SupportTicket" SET "diagnostic_state"=$1::jsonb,"ai_summary"=$2,"status"='INVESTIGATING',"updated_at"=NOW() WHERE "tenant_id"=$3 AND "id"=$4`, JSON.stringify(state), summary, t, ticketId);
    await audit(t, "DIAGNOSTIC_COMPLETED", { category, signals, evidence }, ticketId); return { ticketId, category, summary, state };
  }

  async requestRemediation(tenantId: string, ticketId: string, action: string, riskLevel: RemediationRisk, requestedBy: string) {
    const t = assertTenant(tenantId); if (riskLevel === "RESTRICTED") throw new Error("REMEDIATION_RESTRICTED");
    if (!(await this.getTicket(t, ticketId))) throw new Error("SUPPORT_TICKET_NOT_FOUND");
    const normalized = String(action || "").trim().toUpperCase(); if (!normalized) throw new Error("REMEDIATION_ACTION_REQUIRED");
    const policyDecision = riskLevel === "SAFE" ? "AUTO_ALLOWED" : "HUMAN_APPROVAL_REQUIRED"; const id = randomUUID();
    const rows = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO "SupportRemediation" ("id","tenant_id","ticket_id","action","risk_level","policy_decision","requested_by") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, id, t, ticketId, normalized, riskLevel, policyDecision, requestedBy);
    await audit(t, "REMEDIATION_REQUESTED", { action: normalized, riskLevel, policyDecision }, ticketId, undefined, requestedBy); return rows[0];
  }

  async executeSafeRemediation(tenantId: string, ticketId: string, remediationId: string, requestedBy: string) {
    const t = assertTenant(tenantId);
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "SupportRemediation" WHERE "tenant_id"=$1 AND "ticket_id"=$2 AND "id"=$3 LIMIT 1`, t, ticketId, remediationId);
    const remediation = rows[0]; if (!remediation) throw new Error("REMEDIATION_NOT_FOUND");
    if (remediation.policy_decision !== "AUTO_ALLOWED" || remediation.risk_level !== "SAFE") throw new Error("REMEDIATION_APPROVAL_REQUIRED");
    if (String(remediation.action) !== "RETRY_FAILED_SYNC") throw new Error("REMEDIATION_ACTION_NOT_ALLOWED");

    const result = await prisma.$transaction(async (tx: any) => {
      const changed = await tx.$executeRawUnsafe(`UPDATE "sync_operations" SET "status"='PENDING',"processed_at"=NULL WHERE "tenant_id"=$1 AND "status"='FAILED' AND "created_at">NOW()-INTERVAL '24 hours'`, t);
      await tx.$executeRawUnsafe(`UPDATE "SupportRemediation" SET "result"=$1,"completed_at"=NOW(),"verification"=$2::jsonb WHERE "id"=$3 AND "tenant_id"=$4`, `Requeued ${changed} failed sync operations`, JSON.stringify({ requeued: Number(changed), status: "PENDING", verifiedAt: new Date().toISOString() }), remediationId, t);
      return Number(changed);
    });
    await audit(t, "SAFE_REMEDIATION_EXECUTED", { remediationId, action: remediation.action, requeued: result }, ticketId, undefined, requestedBy);
    return { remediationId, action: remediation.action, requeued: result, verification: { required: true, state: "PENDING_RETRY_VERIFICATION" } };
  }

  async resolveTicket(tenantId: string, ticketId: string, actorId: string, verification: string) {
    const t = assertTenant(tenantId); if (!verification.trim()) throw new Error("VERIFICATION_REQUIRED");
    const result = await prisma.$executeRawUnsafe(`UPDATE "SupportTicket" SET "status"='RESOLVED',"resolved_at"=NOW(),"updated_at"=NOW() WHERE "tenant_id"=$1 AND "id"=$2 AND "status"<>'RESOLVED'`, t, ticketId);
    if (!result) throw new Error("SUPPORT_TICKET_NOT_FOUND");
    await audit(t, "TICKET_RESOLVED", { verification }, ticketId, undefined, actorId); return this.getTicket(t, ticketId);
  }

  async summary(tenantId: string) {
    const t = assertTenant(tenantId); const tickets = await prisma.$queryRawUnsafe<any[]>(`SELECT "status",COUNT(*)::int AS count FROM "SupportTicket" WHERE "tenant_id"=$1 GROUP BY "status" ORDER BY "status"` , t);
    const events = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "SupportEvent" WHERE "tenant_id"=$1 AND "created_at">NOW()-INTERVAL '24 hours'`, t);
    return { tenantId: t, ticketsByStatus: tickets, eventsLast24h: Number(events[0]?.count ?? 0), slaMinutes: SLA_MINUTES };
  }

  async controlTower() {
    const [tenants, tickets, incidents, remediations, events] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "tenants" WHERE "status"='ACTIVE'`),
      prisma.$queryRawUnsafe<any[]>(`SELECT "status", "severity", COUNT(*)::int AS count FROM "SupportTicket" WHERE "status"<>'RESOLVED' GROUP BY "status","severity" ORDER BY "severity"`),
      prisma.$queryRawUnsafe<any[]>(`SELECT "id","severity","status","title","affected_module","affected_version","created_at","updated_at" FROM "SupportIncident" WHERE "status"<>'RESOLVED' ORDER BY "created_at" DESC LIMIT 50`),
      prisma.$queryRawUnsafe<any[]>(`SELECT "policy_decision","result",COUNT(*)::int AS count FROM "SupportRemediation" GROUP BY "policy_decision","result" ORDER BY count DESC`),
      prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "SupportEvent" WHERE "created_at">NOW()-INTERVAL '24 hours'`),
    ]);
    return { activeTenants: Number(tenants[0]?.count ?? 0), openTickets: tickets, activeIncidents: incidents, remediationStats: remediations, supportEvents24h: Number(events[0]?.count ?? 0), generatedAt: new Date().toISOString() };
  }

  async tenantHealth(tenantId: string) {
    const t = assertTenant(tenantId);
    const [ticketRows, syncRows, ledgerRows] = await Promise.all([
      countByStatus('"SupportTicket"', t),
      prisma.$queryRawUnsafe<any[]>(`SELECT "status",COUNT(*)::int AS count FROM "sync_operations" WHERE "tenant_id"=$1 GROUP BY "status"`, t),
      prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "stock_ledgers" WHERE "tenant_id"=$1`, t),
    ]);
    const sync = Object.fromEntries(syncRows.map((r) => [String(r.status), Number(r.count)]));
    const failed = Number(sync.FAILED ?? 0); const pending = Number(sync.PENDING ?? 0);
    const health = failed === 0 ? (pending === 0 ? "HEALTHY" : "DEGRADED") : "AT_RISK";
    return { tenantId: t, health, tickets: ticketRows, sync: { ...sync, failedLastCheck: failed, pendingLastCheck: pending }, stockLedgerEntries: Number(ledgerRows[0]?.count ?? 0), checkedAt: new Date().toISOString() };
  }

  async incidentCreateFromSignal(title: string, severity: SupportSeverity, affectedModule: string, evidence: Record<string, unknown>, actorId?: string) {
    const id = randomUUID();
    const rows = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO "SupportIncident" ("id","severity","status","title","affected_module","evidence") VALUES ($1,$2,'INVESTIGATING',$3,$4,$5::jsonb) RETURNING *`, id, severity, title.trim(), affectedModule || null, JSON.stringify(evidence));
    await audit(null, "INCIDENT_CREATED", { title, severity, affectedModule, evidence }, undefined, id, actorId); return rows[0];
  }
}

export const globalSupportOperationsService = new SupportOperationsService();
