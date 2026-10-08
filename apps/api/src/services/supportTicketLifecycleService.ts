import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";

export type SupportTicketPriority = "P0" | "P1" | "P2" | "P3" | "P4";
export type SupportLifecycleStatus = "OPEN" | "INVESTIGATING" | "WAITING_CUSTOMER" | "ESCALATED" | "RESOLVED";

const PRIORITIES = new Set<SupportTicketPriority>(["P0", "P1", "P2", "P3", "P4"]);
const STATUSES = new Set<SupportLifecycleStatus>(["OPEN", "INVESTIGATING", "WAITING_CUSTOMER", "ESCALATED", "RESOLVED"]);

function tenantScope(value: unknown): string {
  const tenantId = String(value || "").trim();
  if (!tenantId) throw new Error("TENANT_SCOPE_REQUIRED");
  return tenantId;
}

function requiredText(value: unknown, code: string): string {
  const text = String(value || "").trim();
  if (!text) throw new Error(code);
  return text;
}

function assertPriority(value: unknown): SupportTicketPriority {
  const priority = String(value || "").trim().toUpperCase() as SupportTicketPriority;
  if (!PRIORITIES.has(priority)) throw new Error("SUPPORT_PRIORITY_INVALID");
  return priority;
}

function assertStatus(value: unknown): SupportLifecycleStatus {
  const status = String(value || "").trim().toUpperCase() as SupportLifecycleStatus;
  if (!STATUSES.has(status)) throw new Error("SUPPORT_STATUS_INVALID");
  return status;
}

async function withTenantTransaction<T>(tenantId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  const t = tenantScope(tenantId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('kwakopos.tenant_id', ${t}, TRUE)`;
    return fn(tx);
  });
}

async function auditTx(
  tx: any,
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
  ticketId?: string,
  actorId?: string,
): Promise<void> {
  await tx.$executeRaw`INSERT INTO "SupportEvent"
    ("id","tenant_id","ticket_id","actor_type","actor_id","event_type","payload")
    VALUES (${randomUUID()},${tenantId},${ticketId ?? null},${actorId ? "USER" : "SYSTEM"},${actorId ?? null},${eventType},${JSON.stringify(payload)}::jsonb)`;
}

async function getTicketOrThrow(tx: any, tenantId: string, ticketId: string): Promise<any> {
  const rows = await tx.$queryRawUnsafe<any[]>(
    `SELECT * FROM "SupportTicket" WHERE "tenant_id"=$1 AND "id"=$2 LIMIT 1`,
    tenantId,
    ticketId,
  );
  if (!rows[0]) throw new Error("SUPPORT_TICKET_NOT_FOUND");
  return rows[0];
}

const ALLOWED_TRANSITIONS: Record<SupportLifecycleStatus, SupportLifecycleStatus[]> = {
  OPEN: ["INVESTIGATING", "WAITING_CUSTOMER", "ESCALATED", "RESOLVED"],
  INVESTIGATING: ["WAITING_CUSTOMER", "ESCALATED", "RESOLVED"],
  WAITING_CUSTOMER: ["INVESTIGATING", "ESCALATED", "RESOLVED"],
  ESCALATED: ["INVESTIGATING", "WAITING_CUSTOMER", "RESOLVED"],
  RESOLVED: [],
};

export class SupportTicketLifecycleService {
  async getTicketWorkspace(tenantId: string, ticketId: string) {
    const t = tenantScope(tenantId);
    return withTenantTransaction(t, async (tx) => {
      const ticket = await getTicketOrThrow(tx, t, ticketId);
      const [comments, attachments, audit] = await Promise.all([
        tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM "SupportTicketComment" WHERE "tenant_id"=$1 AND "ticket_id"=$2 ORDER BY "created_at" ASC LIMIT 500`,
          t,
          ticketId,
        ),
        tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM "SupportTicketAttachment" WHERE "tenant_id"=$1 AND "ticket_id"=$2 ORDER BY "created_at" ASC LIMIT 500`,
          t,
          ticketId,
        ),
        tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM "SupportEvent" WHERE "tenant_id"=$1 AND "ticket_id"=$2 ORDER BY "created_at" DESC LIMIT 500`,
          t,
          ticketId,
        ),
      ]);
      return { ticket, comments, attachments, audit };
    });
  }

  async changeStatus(tenantId: string, ticketId: string, statusInput: SupportLifecycleStatus, actorId: string, note?: string) {
    const t = tenantScope(tenantId);
    const status = assertStatus(statusInput);
    const actor = requiredText(actorId, "SUPPORT_ACTOR_REQUIRED");
    return withTenantTransaction(t, async (tx) => {
      const ticket = await getTicketOrThrow(tx, t, ticketId);
      const current = assertStatus(ticket.status);
      if (current === status) return ticket;
      if (!ALLOWED_TRANSITIONS[current]?.includes(status)) throw new Error(`SUPPORT_INVALID_LIFECYCLE_TRANSITION:${current}->${status}`);
      await tx.$executeRawUnsafe(
        `UPDATE "SupportTicket" SET "status"=$1,"updated_at"=NOW() WHERE "tenant_id"=$2 AND "id"=$3`,
        status,
        t,
        ticketId,
      );
      await auditTx(tx, t, "TICKET_STATUS_CHANGED", { from: current, to: status, note: note?.trim() || null }, ticketId, actor);
      return getTicketOrThrow(tx, t, ticketId);
    });
  }

  async setPriority(tenantId: string, ticketId: string, priorityInput: SupportTicketPriority, actorId: string) {
    const t = tenantScope(tenantId);
    const priority = assertPriority(priorityInput);
    const actor = requiredText(actorId, "SUPPORT_ACTOR_REQUIRED");
    return withTenantTransaction(t, async (tx) => {
      const ticket = await getTicketOrThrow(tx, t, ticketId);
      if (ticket.priority === priority) return ticket;
      await tx.$executeRawUnsafe(
        `UPDATE "SupportTicket" SET "priority"=$1,"severity"=$1,"updated_at"=NOW() WHERE "tenant_id"=$2 AND "id"=$3`,
        priority,
        t,
        ticketId,
      );
      await auditTx(tx, t, "TICKET_PRIORITY_CHANGED", { from: ticket.priority || ticket.severity, to: priority }, ticketId, actor);
      return getTicketOrThrow(tx, t, ticketId);
    });
  }

  async assign(tenantId: string, ticketId: string, actorId: string, assignedToUserId?: string, assignedTeam?: string) {
    const t = tenantScope(tenantId);
    const actor = requiredText(actorId, "SUPPORT_ACTOR_REQUIRED");
    const userId = assignedToUserId ? String(assignedToUserId).trim() : null;
    const team = assignedTeam ? String(assignedTeam).trim() : null;
    if (!userId && !team) throw new Error("SUPPORT_ASSIGNMENT_REQUIRED");

    return withTenantTransaction(t, async (tx) => {
      const ticket = await getTicketOrThrow(tx, t, ticketId);
      if (userId) {
        const users = await tx.$queryRawUnsafe<any[]>(
          `SELECT "id","status" FROM "users" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1`,
          t,
          userId,
        );
        if (!users[0] || users[0].status !== "ACTIVE") throw new Error("SUPPORT_ASSIGNEE_NOT_ACTIVE");
      }
      await tx.$executeRawUnsafe(
        `UPDATE "SupportTicket" SET "assigned_to_user_id"=$1,"assigned_team"=$2,"updated_at"=NOW() WHERE "tenant_id"=$3 AND "id"=$4`,
        userId,
        team,
        t,
        ticketId,
      );
      await auditTx(tx, t, "TICKET_ASSIGNED", { previousUserId: ticket.assigned_to_user_id, previousTeam: ticket.assigned_team, assignedToUserId: userId, assignedTeam: team }, ticketId, actor);
      return getTicketOrThrow(tx, t, ticketId);
    });
  }

  async addComment(tenantId: string, ticketId: string, actorId: string, body: string, internal = false) {
    const t = tenantScope(tenantId);
    const actor = requiredText(actorId, "SUPPORT_ACTOR_REQUIRED");
    const commentBody = requiredText(body, "SUPPORT_COMMENT_REQUIRED");
    return withTenantTransaction(t, async (tx) => {
      const ticket = await getTicketOrThrow(tx, t, ticketId);
      if (ticket.status === "RESOLVED") throw new Error("SUPPORT_TICKET_ALREADY_RESOLVED");
      const id = randomUUID();
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO "SupportTicketComment" ("id","tenant_id","ticket_id","author_user_id","body","internal")
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        id,
        t,
        ticketId,
        actor,
        commentBody,
        Boolean(internal),
      );
      await auditTx(tx, t, "TICKET_COMMENT_ADDED", { commentId: id, internal: Boolean(internal) }, ticketId, actor);
      return rows[0];
    });
  }

  async addAttachment(
    tenantId: string,
    ticketId: string,
    actorId: string,
    input: { fileName: string; mimeType: string; storageKey: string; sizeBytes: number; sha256: string; commentId?: string },
  ) {
    const t = tenantScope(tenantId);
    const actor = requiredText(actorId, "SUPPORT_ACTOR_REQUIRED");
    const fileName = requiredText(input.fileName, "SUPPORT_ATTACHMENT_NAME_REQUIRED");
    const mimeType = requiredText(input.mimeType, "SUPPORT_ATTACHMENT_MIME_REQUIRED").toLowerCase();
    const storageKey = requiredText(input.storageKey, "SUPPORT_ATTACHMENT_STORAGE_KEY_REQUIRED");
    const sizeBytes = Number(input.sizeBytes);
    const sha256 = requiredText(input.sha256, "SUPPORT_ATTACHMENT_HASH_REQUIRED").toLowerCase();
    if (!/^support\/[A-Za-z0-9._/-]{1,500}$/.test(storageKey)) throw new Error("SUPPORT_ATTACHMENT_STORAGE_KEY_INVALID");
    if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 25 * 1024 * 1024) throw new Error("SUPPORT_ATTACHMENT_SIZE_INVALID");
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("SUPPORT_ATTACHMENT_HASH_INVALID");
    const allowedMimes = new Set(["application/pdf", "text/plain", "text/csv", "image/png", "image/jpeg", "image/webp", "application/zip"]);
    if (!allowedMimes.has(mimeType)) throw new Error("SUPPORT_ATTACHMENT_MIME_NOT_ALLOWED");

    return withTenantTransaction(t, async (tx) => {
      await getTicketOrThrow(tx, t, ticketId);
      if (input.commentId) {
        const comments = await tx.$queryRawUnsafe<any[]>(
          `SELECT 1 FROM "SupportTicketComment" WHERE "tenant_id"=$1 AND "ticket_id"=$2 AND "id"=$3 LIMIT 1`,
          t,
          ticketId,
          String(input.commentId),
        );
        if (!comments[0]) throw new Error("SUPPORT_COMMENT_NOT_FOUND");
      }
      const id = randomUUID();
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO "SupportTicketAttachment"
          ("id","tenant_id","ticket_id","comment_id","uploaded_by_user_id","file_name","mime_type","storage_key","size_bytes","sha256")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        id,
        t,
        ticketId,
        input.commentId ? String(input.commentId) : null,
        actor,
        fileName,
        mimeType,
        storageKey,
        sizeBytes,
        sha256,
      );
      await auditTx(tx, t, "TICKET_ATTACHMENT_ADDED", { attachmentId: id, fileName, mimeType, sizeBytes, sha256 }, ticketId, actor);
      return rows[0];
    });
  }

  async escalate(tenantId: string, ticketId: string, actorId: string, reason: string, assignedTeam?: string) {
    const t = tenantScope(tenantId);
    const actor = requiredText(actorId, "SUPPORT_ACTOR_REQUIRED");
    const escalationReason = requiredText(reason, "SUPPORT_ESCALATION_REASON_REQUIRED");
    return withTenantTransaction(t, async (tx) => {
      const ticket = await getTicketOrThrow(tx, t, ticketId);
      const current = assertStatus(ticket.status);
      if (current === "RESOLVED") throw new Error("SUPPORT_TICKET_ALREADY_RESOLVED");
      const nextLevel = Math.min(3, Number(ticket.escalation_level || 0) + 1);
      await tx.$executeRawUnsafe(
        `UPDATE "SupportTicket"
         SET "status"='ESCALATED',"escalation_level"=$1,"escalated_at"=NOW(),"escalated_by_user_id"=$2,
             "escalation_reason"=$3,"assigned_team"=COALESCE($4,"assigned_team"),"updated_at"=NOW()
         WHERE "tenant_id"=$5 AND "id"=$6`,
        nextLevel,
        actor,
        escalationReason,
        assignedTeam?.trim() || null,
        t,
        ticketId,
      );
      await auditTx(tx, t, "TICKET_ESCALATED", { from: current, level: nextLevel, reason: escalationReason, assignedTeam: assignedTeam?.trim() || ticket.assigned_team || null }, ticketId, actor);
      return getTicketOrThrow(tx, t, ticketId);
    });
  }

  async resolve(
    tenantId: string,
    ticketId: string,
    actorId: string,
    input: { verification: string; summary: string; code?: string },
  ) {
    const t = tenantScope(tenantId);
    const actor = requiredText(actorId, "SUPPORT_ACTOR_REQUIRED");
    const verification = requiredText(input.verification, "VERIFICATION_REQUIRED");
    const summary = requiredText(input.summary, "SUPPORT_RESOLUTION_SUMMARY_REQUIRED");
    const code = input.code ? String(input.code).trim().toUpperCase() : "FIXED";
    return withTenantTransaction(t, async (tx) => {
      const ticket = await getTicketOrThrow(tx, t, ticketId);
      const current = assertStatus(ticket.status);
      if (current === "RESOLVED") throw new Error("SUPPORT_TICKET_ALREADY_RESOLVED");
      if (!ALLOWED_TRANSITIONS[current]?.includes("RESOLVED")) throw new Error(`SUPPORT_INVALID_LIFECYCLE_TRANSITION:${current}->RESOLVED`);
      await tx.$executeRawUnsafe(
        `UPDATE "SupportTicket"
         SET "status"='RESOLVED',"resolution_summary"=$1,"resolution_verification"=$2,"resolution_code"=$3,
             "resolved_by_user_id"=$4,"resolved_at"=NOW(),"updated_at"=NOW()
         WHERE "tenant_id"=$5 AND "id"=$6`,
        summary,
        verification,
        code,
        actor,
        t,
        ticketId,
      );
      await auditTx(tx, t, "TICKET_RESOLVED", { code, verificationProvided: true, summary }, ticketId, actor);
      return getTicketOrThrow(tx, t, ticketId);
    });
  }

  async listComments(tenantId: string, ticketId: string) {
    const t = tenantScope(tenantId);
    return withTenantTransaction(t, (tx) => tx.$queryRawUnsafe<any[]>(
      `SELECT * FROM "SupportTicketComment" WHERE "tenant_id"=$1 AND "ticket_id"=$2 ORDER BY "created_at" ASC LIMIT 500`,
      t,
      ticketId,
    ));
  }

  async listAttachments(tenantId: string, ticketId: string) {
    const t = tenantScope(tenantId);
    return withTenantTransaction(t, (tx) => tx.$queryRawUnsafe<any[]>(
      `SELECT * FROM "SupportTicketAttachment" WHERE "tenant_id"=$1 AND "ticket_id"=$2 ORDER BY "created_at" ASC LIMIT 500`,
      t,
      ticketId,
    ));
  }

  async listAudit(tenantId: string, ticketId: string) {
    const t = tenantScope(tenantId);
    return withTenantTransaction(t, (tx) => tx.$queryRawUnsafe<any[]>(
      `SELECT * FROM "SupportEvent" WHERE "tenant_id"=$1 AND "ticket_id"=$2 ORDER BY "created_at" DESC LIMIT 500`,
      t,
      ticketId,
    ));
  }
}

export const globalSupportTicketLifecycleService = new SupportTicketLifecycleService();
