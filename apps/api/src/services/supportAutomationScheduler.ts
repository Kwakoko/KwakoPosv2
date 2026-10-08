import { prisma } from "@kwakopos2/database";
import { SupportOperationsService } from "./supportOperationsService.js";

const LOCK_KEY = 460046;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export async function runSupportAutomationCycle(): Promise<{ scanned: boolean; escalated: number; dueSoon: number }> {
  const lockRows = await prisma.$queryRawUnsafe<any[]>(`SELECT pg_try_advisory_lock($1) AS locked`, LOCK_KEY);
  if (!lockRows[0]?.locked) return { scanned: false, escalated: 0, dueSoon: 0 };
  try {
    const service = new SupportOperationsService();
    await service.scanAutonomousSignals("support-automation");
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "id","tenant_id","severity","sla_due_at","status" FROM "SupportTicket" WHERE "status" <> 'RESOLVED' AND "sla_due_at" IS NOT NULL AND "sla_due_at" <= NOW() + INTERVAL '60 minutes' ORDER BY "sla_due_at" ASC LIMIT 500`);
    let escalated = 0; let dueSoon = 0;
    for (const ticket of rows) {
      const breached = new Date(ticket.sla_due_at).getTime() < Date.now();
      const eventType = breached ? "SLA_BREACH_ESCALATED" : "SLA_DUE_SOON";
      const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM "SupportEvent" WHERE "ticket_id"=$1 AND "event_type"=$2 AND "created_at">NOW()-INTERVAL '60 minutes' LIMIT 1`, ticket.id, eventType);
      if (existing.length) continue;
      await prisma.$executeRawUnsafe(`INSERT INTO "SupportEvent" ("id","tenant_id","ticket_id","actor_type","actor_id","event_type","payload") VALUES (gen_random_uuid(),$1,$2,'SYSTEM','support-automation',$3,$4::jsonb)`, ticket.tenant_id, ticket.id, eventType, JSON.stringify({ severity: ticket.severity, slaDueAt: new Date(ticket.sla_due_at).toISOString(), notification: "SUPPORT_SLA" }));
      if (breached) { await prisma.$executeRawUnsafe(`UPDATE "SupportTicket" SET status='ESCALATED',"escalation_level"=GREATEST(COALESCE("escalation_level",0),1),"escalated_at"=COALESCE("escalated_at",NOW()),"escalation_reason"=COALESCE("escalation_reason",'SLA_BREACH'),"updated_at"=NOW() WHERE "id"=$1 AND "tenant_id"=$2 AND "status"<>'RESOLVED'`, ticket.id, ticket.tenant_id); escalated++; } else dueSoon++;
    }
    return { scanned: true, escalated, dueSoon };
  } finally { await prisma.$queryRawUnsafe<any[]>(`SELECT pg_advisory_unlock($1)`, LOCK_KEY); }
}

export function startSupportAutomationScheduler(intervalMs = DEFAULT_INTERVAL_MS): { stop: () => void } {
  let running = false;
  const tick = async () => { if (running) return; running = true; try { await runSupportAutomationCycle(); } catch (error) { console.error("[support-automation] cycle failed", error); } finally { running = false; } };
  const timer = setInterval(() => void tick(), intervalMs);
  void tick();
  return { stop: () => clearInterval(timer) };
}
