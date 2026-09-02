import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";

export type SupportSeverity = "P0" | "P1" | "P2" | "P3" | "P4";
export type SupportStatus = "OPEN" | "INVESTIGATING" | "WAITING_CUSTOMER" | "ESCALATED" | "RESOLVED";

export interface SupportTicketInput {
  tenantId: string;
  branchId?: string;
  createdByUserId?: string;
  subject: string;
  description: string;
  severity?: SupportSeverity;
  category?: string;
  module?: string;
}

const SLA_MINUTES: Record<SupportSeverity, number> = { P0: 15, P1: 60, P2: 240, P3: 1440, P4: 2880 };

function assertTenant(tenantId: string): string {
  const value = String(tenantId || "").trim();
  if (!value) throw new Error("TENANT_SCOPE_REQUIRED");
  return value;
}

async function audit(tenantId: string | null, eventType: string, payload: Record<string, unknown>, ticketId?: string, incidentId?: string, actorId?: string) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SupportEvent" ("id","tenant_id","ticket_id","incident_id","actor_type","actor_id","event_type","payload") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    randomUUID(), tenantId, ticketId ?? null, incidentId ?? null, actorId ? "USER" : "SYSTEM", actorId ?? null, eventType, JSON.stringify(payload)
  );
}

export class SupportOperationsService {
  async createTicket(input: SupportTicketInput) {
    const tenantId = assertTenant(input.tenantId);
    const id = randomUUID();
    const severity = input.severity ?? "P3";
    const ticket = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "SupportTicket" ("id","tenant_id","branch_id","created_by_user_id","subject","description","severity","category","module") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      id, tenantId, input.branchId ?? null, input.createdByUserId ?? null, input.subject.trim(), input.description.trim(), severity, input.category ?? "GENERAL", input.module ?? null
    );
    await audit(tenantId, "TICKET_CREATED", { severity, slaMinutes: SLA_MINUTES[severity] }, id, undefined, input.createdByUserId);
    return ticket[0];
  }

  async listTickets(tenantId: string, status?: SupportStatus) {
    const scopedTenant = assertTenant(tenantId);
    if (status) return prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "SupportTicket" WHERE "tenant_id"=$1 AND "status"=$2 ORDER BY "created_at" DESC LIMIT 200`, scopedTenant, status);
    return prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "SupportTicket" WHERE "tenant_id"=$1 ORDER BY "created_at" DESC LIMIT 200`, scopedTenant);
  }

  async getTicket(tenantId: string, ticketId: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "SupportTicket" WHERE "tenant_id"=$1 AND "id"=$2 LIMIT 1`, assertTenant(tenantId), ticketId);
    return rows[0] ?? null;
  }

  async diagnose(tenantId: string, ticketId: string) {
    const ticket = await this.getTicket(tenantId, ticketId);
    if (!ticket) throw new Error("SUPPORT_TICKET_NOT_FOUND");
    const text = `${ticket.subject} ${ticket.description}`.toLowerCase();
    const signals = {
      sync: /sync|synchroniz|outbox|offline|not updating/.test(text),
      inventory: /stock|inventory|variant|ledger/.test(text),
      authentication: /login|password|session|auth/.test(text),
      printing: /print|printer|receipt/.test(text),
      payments: /payment|mpesa|cash|card/.test(text),
    };
    const matches = Object.entries(signals).filter(([, value]) => value).map(([key]) => key);
    const category = matches[0] ?? "general";
    const summary = matches.length ? `Detected support signals: ${matches.join(", ")}. Evidence is symptom-based; root cause is not yet confirmed.` : "No known diagnostic pattern matched; human investigation may be required.";
    const state = { version: 1, signals, matches, confidence: matches.length ? 0.65 : 0.1, generatedAt: new Date().toISOString() };
    await prisma.$executeRawUnsafe(`UPDATE "SupportTicket" SET "diagnostic_state"=$1::jsonb,"ai_summary"=$2,"status"='INVESTIGATING',"updated_at"=NOW() WHERE "tenant_id"=$3 AND "id"=$4`, JSON.stringify(state), summary, assertTenant(tenantId), ticketId);
    await audit(tenantId, "DIAGNOSTIC_COMPLETED", { category, signals }, ticketId);
    return { ticketId, category, summary, state };
  }

  async requestRemediation(tenantId: string, ticketId: string, action: string, riskLevel: "SAFE" | "APPROVAL_REQUIRED" | "RESTRICTED", requestedBy: string) {
    const scopedTenant = assertTenant(tenantId);
    if (riskLevel === "RESTRICTED") throw new Error("REMEDIATION_RESTRICTED");
    const policyDecision = riskLevel === "SAFE" ? "AUTO_ALLOWED" : "HUMAN_APPROVAL_REQUIRED";
    const id = randomUUID();
    const rows = await prisma.$queryRawUnsafe<any[]>(`INSERT INTO "SupportRemediation" ("id","tenant_id","ticket_id","action","risk_level","policy_decision","requested_by") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, id, scopedTenant, ticketId, action, riskLevel, policyDecision, requestedBy);
    await audit(scopedTenant, "REMEDIATION_REQUESTED", { action, riskLevel, policyDecision }, ticketId, undefined, requestedBy);
    return rows[0];
  }

  async resolveTicket(tenantId: string, ticketId: string, actorId: string, verification: string) {
    const scopedTenant = assertTenant(tenantId);
    if (!verification.trim()) throw new Error("VERIFICATION_REQUIRED");
    const result = await prisma.$executeRawUnsafe(`UPDATE "SupportTicket" SET "status"='RESOLVED',"resolved_at"=NOW(),"updated_at"=NOW() WHERE "tenant_id"=$1 AND "id"=$2`, scopedTenant, ticketId);
    if (!result) throw new Error("SUPPORT_TICKET_NOT_FOUND");
    await audit(scopedTenant, "TICKET_RESOLVED", { verification }, ticketId, undefined, actorId);
    return this.getTicket(scopedTenant, ticketId);
  }

  async summary(tenantId: string) {
    const scopedTenant = assertTenant(tenantId);
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "status",COUNT(*)::int AS count FROM "SupportTicket" WHERE "tenant_id"=$1 GROUP BY "status" ORDER BY "status"`, scopedTenant);
    const events = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "SupportEvent" WHERE "tenant_id"=$1 AND "created_at">NOW()-INTERVAL '24 hours'`, scopedTenant);
    return { tenantId: scopedTenant, ticketsByStatus: rows, eventsLast24h: Number(events[0]?.count ?? 0), slaMinutes: SLA_MINUTES };
  }
}

export const globalSupportOperationsService = new SupportOperationsService();
