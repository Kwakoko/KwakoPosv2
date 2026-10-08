-- Support Production Lock v1
-- Durable lifecycle, assignment, priority, comments, attachment metadata, escalation and audit hardening.

ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'P3',
  ADD COLUMN IF NOT EXISTS "assigned_to_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "escalation_level" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "escalated_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "escalated_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "escalation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_verification" TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_code" TEXT,
  ADD COLUMN IF NOT EXISTS "resolved_by_user_id" TEXT;

UPDATE "SupportTicket"
SET "priority" = CASE
  WHEN COALESCE("severity",'P3') IN ('P0','P1','P2','P3','P4') THEN COALESCE("severity",'P3')
  ELSE 'P3'
END
WHERE "priority" IS NULL OR "priority" = '' OR ("priority" = 'P3' AND COALESCE("severity",'P3') <> 'P3');

CREATE OR REPLACE FUNCTION sync_support_ticket_priority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."priority" = 'P3' AND COALESCE(NEW."severity", 'P3') <> 'P3' THEN
    NEW."priority" := NEW."severity";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_priority_sync ON "SupportTicket";
CREATE TRIGGER support_ticket_priority_sync
BEFORE INSERT ON "SupportTicket"
FOR EACH ROW
EXECUTE FUNCTION sync_support_ticket_priority();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_ticket_priority_chk'
  ) THEN
    ALTER TABLE "SupportTicket"
      ADD CONSTRAINT support_ticket_priority_chk CHECK ("priority" IN ('P0','P1','P2','P3','P4'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_ticket_escalation_level_chk'
  ) THEN
    ALTER TABLE "SupportTicket"
      ADD CONSTRAINT support_ticket_escalation_level_chk CHECK ("escalation_level" BETWEEN 0 AND 3);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SupportTicketComment" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL REFERENCES "SupportTicket"("id") ON DELETE CASCADE,
  "author_user_id" TEXT,
  "body" TEXT NOT NULL,
  "internal" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "SupportTicketAttachment" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL REFERENCES "SupportTicket"("id") ON DELETE CASCADE,
  "comment_id" TEXT REFERENCES "SupportTicketComment"("id") ON DELETE SET NULL,
  "uploaded_by_user_id" TEXT,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "sha256" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "SupportTicket_assignment_idx"
  ON "SupportTicket" ("tenant_id","assigned_to_user_id","status","updated_at");
CREATE INDEX IF NOT EXISTS "SupportTicket_priority_idx"
  ON "SupportTicket" ("tenant_id","priority","status","created_at");
CREATE INDEX IF NOT EXISTS "SupportTicketComment_ticket_created_idx"
  ON "SupportTicketComment" ("tenant_id","ticket_id","created_at");
CREATE INDEX IF NOT EXISTS "SupportTicketAttachment_ticket_created_idx"
  ON "SupportTicketAttachment" ("tenant_id","ticket_id","created_at");

CREATE OR REPLACE FUNCTION enforce_support_ticket_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" = 'RESOLVED' THEN
      RAISE EXCEPTION 'SUPPORT_TICKET_ALREADY_RESOLVED';
    END IF;

    IF NOT (
      (OLD."status" = 'OPEN' AND NEW."status" IN ('INVESTIGATING','WAITING_CUSTOMER','ESCALATED','RESOLVED'))
      OR
      (OLD."status" = 'INVESTIGATING' AND NEW."status" IN ('WAITING_CUSTOMER','ESCALATED','RESOLVED'))
      OR
      (OLD."status" = 'WAITING_CUSTOMER' AND NEW."status" IN ('INVESTIGATING','ESCALATED','RESOLVED'))
      OR
      (OLD."status" = 'ESCALATED' AND NEW."status" IN ('INVESTIGATING','WAITING_CUSTOMER','RESOLVED'))
    ) THEN
      RAISE EXCEPTION 'SUPPORT_INVALID_LIFECYCLE_TRANSITION:%->%', OLD."status", NEW."status";
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_lifecycle_guard ON "SupportTicket";
CREATE TRIGGER support_ticket_lifecycle_guard
BEFORE UPDATE OF "status" ON "SupportTicket"
FOR EACH ROW
EXECUTE FUNCTION enforce_support_ticket_lifecycle();

ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_support_tickets ON "SupportTicket";
CREATE POLICY kwakopos_tenant_support_tickets ON "SupportTicket"
  USING ("tenant_id" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "SupportTicketComment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_support_ticket_comments ON "SupportTicketComment";
CREATE POLICY kwakopos_tenant_support_ticket_comments ON "SupportTicketComment"
  USING ("tenant_id" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "SupportTicketAttachment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_support_ticket_attachments ON "SupportTicketAttachment";
CREATE POLICY kwakopos_tenant_support_ticket_attachments ON "SupportTicketAttachment"
  USING ("tenant_id" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "SupportEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_support_events ON "SupportEvent";
CREATE POLICY kwakopos_tenant_support_events ON "SupportEvent"
  USING ("tenant_id" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);
