import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";

export type SupportSeverity = "P0" | "P1" | "P2" | "P3" | "P4";
export type SupportStatus = "OPEN" | "INVESTIGATING" | "WAITING_CUSTOMER" | "ESCALATED" | "RESOLVED";
export type RemediationRisk = "SAFE" | "APPROVAL_REQUIRED" | "RESTRICTED";
function safeQuery<T = unknown>(query: string, ...values: unknown[]) {
  const parts = query.split(/\\$\\d+/);
  if (parts.length !== values.length + 1) throw new Error("SAFE_SQL_PARAMETER_MISMATCH");
  return prisma.$queryRaw<T>(Prisma.sql(parts, ...values) as any);
}

function safeExecute(query: string, ...values: unknown[]) {
  const parts = query.split(/\\$\\d+/);
  if (parts.length !== values.length + 1) throw new Error("SAFE_SQL_PARAMETER_MISMATCH");
  return prisma.$executeRaw(Prisma.sql(parts, ...values) as any);
}


export interface SupportTicketInput { tenantId: string; branchId?: string; createdByUserId?: string; subject: string; description: string; severity?: SupportSeverity; category?: string; module?: string; }
const SLA_MINUTES: Record<SupportSeverity, number> = { P0: 15, P1: 60, P2: 240, P3: 1440, P4: 2880 };
function assertTenant(tenantId: string): string { const value = String(tenantId || "").trim(); if (!value) throw new Error("TENANT_SCOPE_REQUIRED"); return value; }

async function audit(tenantId: string | null, eventType: string, payload: Record<string, unknown>, ticketId?: string, incidentId?: string, actorId?: string) {
  await prisma.$executeRaw`INSERT INTO "SupportEvent" ("id","tenant_id","ticket_id","incident_id","actor_type","actor_id","event_type","payload") VALUES (${randomUUID()},${tenantId},${ticketId ?? null},${incidentId ?? null},${actorId ? "USER" : "SYSTEM"},${actorId ?? null},${eventType},${JSON.stringify(payload)}::jsonb)`;
}
// countByStatus is only used for "SupportTicket" which uses snake_case raw-SQL columns — tenant_id is correct
async function countSupportTicketsByStatus(tenantId: string): Promise<Record<string, number>> {
  const rows = await safeQuery<any[]>(`SELECT "status", COUNT(*)::int AS count FROM "SupportTicket" WHERE "tenant_id"=$1 GROUP BY "status"`, tenantId);
  return Object.fromEntries(rows.map((r) => [String(r.status), Number(r.count)]));
}

export class SupportOperationsService {
  async createTicket(input: SupportTicketInput) {
    const tenantId = assertTenant(input.tenantId); const id = randomUUID(); const severity = input.severity ?? "P3"; const slaDueAt = new Date(Date.now() + SLA_MINUTES[severity] * 60000);
    const rows = await safeQuery<any[]>(`INSERT INTO "SupportTicket" ("id","tenant_id","branch_id","created_by_user_id","subject","description","severity","category","module","sla_due_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, id, tenantId, input.branchId ?? null, input.createdByUserId ?? null, input.subject.trim(), input.description.trim(), severity, input.category ?? "GENERAL", input.module ?? null, slaDueAt);
    await audit(tenantId, "TICKET_CREATED", { severity, slaMinutes: SLA_MINUTES[severity], slaDueAt: slaDueAt.toISOString() }, id, undefined, input.createdByUserId); return rows[0];
  }
  async listTickets(tenantId: string, status?: SupportStatus) { const t = assertTenant(tenantId); return status ? safeQuery<any[]>(`SELECT * FROM "SupportTicket" WHERE "tenant_id"=$1 AND "status"=$2 ORDER BY "created_at" DESC LIMIT 200`, t, status) : safeQuery<any[]>(`SELECT * FROM "SupportTicket" WHERE "tenant_id"=$1 ORDER BY "created_at" DESC LIMIT 200`, t); }
  async getTicket(tenantId: string, ticketId: string) { const rows = await safeQuery<any[]>(`SELECT * FROM "SupportTicket" WHERE "tenant_id"=$1 AND "id"=$2 LIMIT 1`, assertTenant(tenantId), ticketId); return rows[0] ?? null; }

  async diagnose(tenantId: string, ticketId: string) {
    const t = assertTenant(tenantId); const ticket = await this.getTicket(t, ticketId); if (!ticket) throw new Error("SUPPORT_TICKET_NOT_FOUND"); const text = `${ticket.subject} ${ticket.description}`.toLowerCase();
    const signals = { sync: /sync|synchroniz|outbox|offline|not updating/.test(text), inventory: /stock|inventory|variant|ledger/.test(text), authentication: /login|password|session|auth/.test(text), printing: /print|printer|receipt/.test(text), payments: /payment|mpesa|cash|card/.test(text) };
    const matches = Object.entries(signals).filter(([, v]) => v).map(([k]) => k); const category = matches[0] ?? "general"; const evidence: Record<string, unknown> = { checkedAt: new Date().toISOString() };
    // sync_operations uses Prisma camelCase: tenantId, status, createdAt
    if (signals.sync) { const rows = await safeQuery<any[]>(`SELECT "status", COUNT(*)::int AS count FROM "sync_operations" WHERE tenant_id=$1 GROUP BY "status"`, t); evidence.syncOperations = Object.fromEntries(rows.map((r) => [String(r.status), Number(r.count)])); const failures = await safeQuery<any[]>(`SELECT COUNT(*)::int AS count FROM "sync_operations" WHERE tenant_id=$1 AND "status"='FAILED' AND created_at>NOW()-INTERVAL '24 hours'`, t); evidence.failedSync24h = Number(failures[0]?.count ?? 0); }
    // stock_ledgers uses Prisma camelCase: tenantId
    if (signals.inventory) { const rows = await safeQuery<any[]>(`SELECT COUNT(*)::int AS count FROM "stock_ledgers" WHERE tenant_id=$1`, t); evidence.stockLedgerEntries = Number(rows[0]?.count ?? 0); }
    // payments uses Prisma camelCase: tenantId, status
    if (signals.payments) { const rows = await safeQuery<any[]>(`SELECT COUNT(*)::int AS count FROM "payments" WHERE tenant_id=$1 AND "status"='FAILED'`, t); evidence.failedPayments = Number(rows[0]?.count ?? 0); }
    const summary = matches.length ? `Detected ${matches.join(", ")} support signals. Real backend evidence was collected where applicable. Root cause remains unconfirmed until verification passes.` : "No known diagnostic pattern matched; human investigation may be required.";
    const state = { version: 3, signals, matches, category, confidence: matches.length ? 0.75 : 0.1, evidence, generatedAt: new Date().toISOString() };
    await safeExecute(`UPDATE "SupportTicket" SET "diagnostic_state"=$1::jsonb,"ai_summary"=$2,"status"='INVESTIGATING',"updated_at"=NOW() WHERE "tenant_id"=$3 AND "id"=$4`, JSON.stringify(state), summary, t, ticketId); await audit(t, "DIAGNOSTIC_COMPLETED", { category, signals, evidence }, ticketId); return { ticketId, category, summary, state };
  }

  async requestRemediation(tenantId: string, ticketId: string, action: string, riskLevel: RemediationRisk, requestedBy: string) {
    const t = assertTenant(tenantId); if (riskLevel === "RESTRICTED") throw new Error("REMEDIATION_RESTRICTED"); if (!(await this.getTicket(t, ticketId))) throw new Error("SUPPORT_TICKET_NOT_FOUND"); const normalized = String(action || "").trim().toUpperCase(); if (!normalized) throw new Error("REMEDIATION_ACTION_REQUIRED"); const policyDecision = riskLevel === "SAFE" ? "AUTO_ALLOWED" : "HUMAN_APPROVAL_REQUIRED"; const id = randomUUID();
    const rows = await safeQuery<any[]>(`INSERT INTO "SupportRemediation" ("id","tenant_id","ticket_id","action","risk_level","policy_decision","requested_by") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, id, t, ticketId, normalized, riskLevel, policyDecision, requestedBy); await audit(t, "REMEDIATION_REQUESTED", { action: normalized, riskLevel, policyDecision }, ticketId, undefined, requestedBy); return rows[0];
  }

  async executeSafeRemediation(tenantId: string, ticketId: string, remediationId: string, requestedBy: string) {
    const t = assertTenant(tenantId); const rows = await safeQuery<any[]>(`SELECT * FROM "SupportRemediation" WHERE "tenant_id"=$1 AND "ticket_id"=$2 AND "id"=$3 LIMIT 1`, t, ticketId, remediationId); const remediation = rows[0]; if (!remediation) throw new Error("REMEDIATION_NOT_FOUND"); if (remediation.policy_decision !== "AUTO_ALLOWED" || remediation.risk_level !== "SAFE") throw new Error("REMEDIATION_APPROVAL_REQUIRED"); if (String(remediation.action) !== "RETRY_FAILED_SYNC") throw new Error("REMEDIATION_ACTION_NOT_ALLOWED");
    // sync_operations camelCase: tenantId, status, createdAt, processedAt
    const result = await prisma.$transaction(async (tx: any) => { const changed = await tx.$executeRawUnsafe(`UPDATE "sync_operations" SET "status"='PENDING',"processedAt"=NULL WHERE tenant_id=$1 AND "status"='FAILED' AND created_at>NOW()-INTERVAL '24 hours'`, t); await tx.$executeRawUnsafe(`UPDATE "SupportRemediation" SET "result"=$1,"completed_at"=NOW(),"verification"=$2::jsonb WHERE "id"=$3 AND "tenant_id"=$4`, `Requeued ${changed} failed sync operations`, JSON.stringify({ requeued: Number(changed), status: "PENDING_RETRY_VERIFICATION", executedAt: new Date().toISOString() }), remediationId, t); return Number(changed); });
    await audit(t, "SAFE_REMEDIATION_EXECUTED", { remediationId, action: remediation.action, requeued: result }, ticketId, undefined, requestedBy); return { remediationId, action: remediation.action, requeued: result, verification: { required: true, state: "PENDING_RETRY_VERIFICATION" } };
  }

  async verifyRemediation(tenantId: string, ticketId: string, remediationId: string, actorId: string) {
    const t = assertTenant(tenantId); const rows = await safeQuery<any[]>(`SELECT * FROM "SupportRemediation" WHERE "tenant_id"=$1 AND "ticket_id"=$2 AND "id"=$3 LIMIT 1`, t, ticketId, remediationId); const remediation = rows[0]; if (!remediation) throw new Error("REMEDIATION_NOT_FOUND");
    // sync_operations camelCase: tenantId, status, createdAt
    const failedRows = await safeQuery<any[]>(`SELECT COUNT(*)::int AS count FROM "sync_operations" WHERE tenant_id=$1 AND "status"='FAILED' AND created_at>NOW()-INTERVAL '24 hours'`, t); const pendingRows = await safeQuery<any[]>(`SELECT COUNT(*)::int AS count FROM "sync_operations" WHERE tenant_id=$1 AND "status"='PENDING'`, t); const failed = Number(failedRows[0]?.count ?? 0); const pending = Number(pendingRows[0]?.count ?? 0); const previous = remediation.verification && typeof remediation.verification === "object" ? remediation.verification : {}; const requeued = Number((previous as any).requeued ?? 0); const verified = remediation.action === "RETRY_FAILED_SYNC" && (requeued === 0 || pending >= requeued || failed === 0); const verification = { ...previous, verifiedAt: new Date().toISOString(), state: verified ? "VERIFIED" : "VERIFICATION_FAILED", failedSync24h: failed, pendingSync: pending };
    await safeExecute(`UPDATE "SupportRemediation" SET "verification"=$1::jsonb WHERE "tenant_id"=$2 AND "id"=$3`, JSON.stringify(verification), t, remediationId); await audit(t, verified ? "REMEDIATION_VERIFIED" : "REMEDIATION_VERIFICATION_FAILED", { remediationId, failedSync24h: failed, pendingSync: pending, requeued }, ticketId, undefined, actorId); return { remediationId, verified, verification };
  }

  async resolveTicket(tenantId: string, ticketId: string, actorId: string, verification: string) { const t = assertTenant(tenantId); if (!verification.trim()) throw new Error("VERIFICATION_REQUIRED"); const result = await safeExecute(`UPDATE "SupportTicket" SET "status"='RESOLVED',"resolved_at"=NOW(),"updated_at"=NOW() WHERE "tenant_id"=$1 AND "id"=$2 AND "status"<>'RESOLVED'`, t, ticketId); if (!result) throw new Error("SUPPORT_TICKET_NOT_FOUND"); await audit(t, "TICKET_RESOLVED", { verification }, ticketId, undefined, actorId); return this.getTicket(t, ticketId); }
  async summary(tenantId: string) { const t = assertTenant(tenantId); const tickets = await safeQuery<any[]>(`SELECT "status",COUNT(*)::int AS count FROM "SupportTicket" WHERE "tenant_id"=$1 GROUP BY "status" ORDER BY "status"`, t); const events = await safeQuery<any[]>(`SELECT COUNT(*)::int AS count FROM "SupportEvent" WHERE "tenant_id"=$1 AND "created_at">NOW()-INTERVAL '24 hours'`, t); return { tenantId: t, ticketsByStatus: tickets, eventsLast24h: Number(events[0]?.count ?? 0), slaMinutes: SLA_MINUTES }; }

  async controlTower() {
    const [tenants, tickets, incidents, remediations, events, sla] = await Promise.all([
      safeQuery<any[]>(`SELECT COUNT(*)::int AS count FROM "tenants" WHERE "status"='ACTIVE'`),
      safeQuery<any[]>(`SELECT "status", "severity", COUNT(*)::int AS count FROM "SupportTicket" WHERE "status"<>'RESOLVED' GROUP BY "status","severity" ORDER BY "severity"`),
      safeQuery<any[]>(`SELECT "id","severity","status","title","affected_module","affected_version","created_at","updated_at" FROM "SupportIncident" WHERE "status"<>'RESOLVED' ORDER BY "created_at" DESC LIMIT 50`),
      safeQuery<any[]>(`SELECT "policy_decision","result",COUNT(*)::int AS count FROM "SupportRemediation" GROUP BY "policy_decision","result" ORDER BY count DESC`),
      safeQuery<any[]>(`SELECT COUNT(*)::int AS count FROM "SupportEvent" WHERE "created_at">NOW()-INTERVAL '24 hours'`),
      safeQuery<any[]>(`SELECT COUNT(*) FILTER (WHERE "status"<>'RESOLVED' AND "sla_due_at" IS NOT NULL AND "sla_due_at"<NOW())::int AS breached, COUNT(*) FILTER (WHERE "status"<>'RESOLVED' AND "sla_due_at" IS NOT NULL AND "sla_due_at">=NOW() AND "sla_due_at"<NOW()+INTERVAL '60 minutes')::int AS due_soon FROM "SupportTicket"`),
    ]);
    return { activeTenants: Number(tenants[0]?.count ?? 0), openTickets: tickets, activeIncidents: incidents, remediationStats: remediations, supportEvents24h: Number(events[0]?.count ?? 0), sla: { breached: Number(sla[0]?.breached ?? 0), dueSoon: Number(sla[0]?.due_soon ?? 0) }, generatedAt: new Date().toISOString() };
  }

  async tenantHealth(tenantId: string) {
    const t = assertTenant(tenantId);
    // sync_operations uses Prisma camelCase: tenantId, status
    // stock_ledgers uses Prisma camelCase: tenantId
    const [ticketRows, syncRows, ledgerRows] = await Promise.all([
      countSupportTicketsByStatus(t),
      safeQuery<any[]>(`SELECT "status",COUNT(*)::int AS count FROM "sync_operations" WHERE tenant_id=$1 GROUP BY "status"`, t),
      safeQuery<any[]>(`SELECT COUNT(*)::int AS count FROM "stock_ledgers" WHERE tenant_id=$1`, t),
    ]);
    const sync = Object.fromEntries(syncRows.map((r) => [String(r.status), Number(r.count)])); const failed = Number(sync.FAILED ?? 0); const pending = Number(sync.PENDING ?? 0); const health = failed === 0 ? (pending === 0 ? "HEALTHY" : "DEGRADED") : "AT_RISK"; return { tenantId: t, health, tickets: ticketRows, sync: { ...sync, failedLastCheck: failed, pendingLastCheck: pending }, stockLedgerEntries: Number(ledgerRows[0]?.count ?? 0), checkedAt: new Date().toISOString() };
  }

  async scanAutonomousSignals(actorId = "system") {
    const tenants = await safeQuery<any[]>(`SELECT "id" FROM "tenants" WHERE "status"='ACTIVE' ORDER BY "id"`); const signals: any[] = [];
    // sync_operations uses Prisma camelCase: tenantId, status, createdAt
    for (const row of tenants) {
      const tenantId = String(row.id);
      const failedRows = await safeQuery<any[]>(`SELECT COUNT(*)::int AS count FROM "sync_operations" WHERE tenant_id=$1 AND "status"='FAILED' AND created_at>NOW()-INTERVAL '24 hours'`, tenantId);
      const failed = Number(failedRows[0]?.count ?? 0); if (failed < 5) continue;
      const existing = await safeQuery<any[]>(`SELECT "id" FROM "SupportIncident" WHERE "status"<>'RESOLVED' AND "affected_module"='SYNC' AND "title"='Elevated sync failures' LIMIT 1`); let incidentId = String(existing[0]?.id || "");
      if (!incidentId) incidentId = String((await this.incidentCreateFromSignal("Elevated sync failures", failed >= 50 ? "P1" : "P2", "SYNC", { tenantId, failedSync24h: failed, threshold: 5, detectedAt: new Date().toISOString() }, actorId)).id);
      await safeExecute(`INSERT INTO "SupportIncidentTenant" ("incident_id","tenant_id") VALUES ($1,$2) ON CONFLICT ("incident_id","tenant_id") DO UPDATE SET "last_seen_at"=NOW()`, incidentId, tenantId);
      await audit(tenantId, "AUTONOMOUS_SIGNAL_DETECTED", { incidentId, signal: "ELEVATED_SYNC_FAILURES", failedSync24h: failed, threshold: 5 }, undefined, incidentId);
      signals.push({ tenantId, incidentId, signal: "ELEVATED_SYNC_FAILURES", failedSync24h: failed });
    }
    return { scannedTenants: tenants.length, signals, scannedAt: new Date().toISOString() };
  }

  async incidentDetails(incidentId: string) { const incidents = await safeQuery<any[]>(`SELECT * FROM "SupportIncident" WHERE "id"=$1 LIMIT 1`, incidentId); if (!incidents[0]) throw new Error("SUPPORT_INCIDENT_NOT_FOUND"); const tenants = await safeQuery<any[]>(`SELECT "tenant_id","first_seen_at","last_seen_at" FROM "SupportIncidentTenant" WHERE "incident_id"=$1 ORDER BY "last_seen_at" DESC`, incidentId); const events = await safeQuery<any[]>(`SELECT * FROM "SupportEvent" WHERE "incident_id"=$1 ORDER BY "created_at" DESC LIMIT 200`, incidentId); return { incident: incidents[0], affectedTenants: tenants, timeline: events }; }

  async incidentCreateFromSignal(title: string, severity: SupportSeverity, affectedModule: string, evidence: Record<string, unknown>, actorId?: string) { const id = randomUUID(); const rows = await safeQuery<any[]>(`INSERT INTO "SupportIncident" ("id","severity","status","title","affected_module","evidence") VALUES ($1,$2,'INVESTIGATING',$3,$4,$5::jsonb) RETURNING *`, id, severity, title.trim(), affectedModule || null, JSON.stringify(evidence)); await audit(null, "INCIDENT_CREATED", { title, severity, affectedModule, evidence }, undefined, id, actorId); return rows[0]; }
}
export const globalSupportOperationsService = new SupportOperationsService();
