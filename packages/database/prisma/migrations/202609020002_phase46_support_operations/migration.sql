-- Phase 46: KwakoPos 360° Customer Support & Autonomous Operations
CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT NOT NULL, "branch_id" TEXT, "created_by_user_id" TEXT,
  "subject" TEXT NOT NULL, "description" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN',
  "severity" TEXT NOT NULL DEFAULT 'P3', "category" TEXT NOT NULL DEFAULT 'GENERAL', "module" TEXT,
  "diagnostic_state" JSONB NOT NULL DEFAULT '{}'::jsonb, "ai_summary" TEXT, "assigned_team" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "resolved_at" TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS "SupportEvent" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT, "ticket_id" TEXT, "incident_id" TEXT, "actor_type" TEXT NOT NULL,
  "actor_id" TEXT, "event_type" TEXT NOT NULL, "payload" JSONB NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "SupportIncident" (
  "id" TEXT PRIMARY KEY, "severity" TEXT NOT NULL DEFAULT 'P2', "status" TEXT NOT NULL DEFAULT 'INVESTIGATING',
  "title" TEXT NOT NULL, "root_cause" TEXT, "affected_module" TEXT, "affected_version" TEXT,
  "evidence" JSONB NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "resolved_at" TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS "SupportRemediation" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT NOT NULL, "ticket_id" TEXT, "action" TEXT NOT NULL, "risk_level" TEXT NOT NULL,
  "policy_decision" TEXT NOT NULL, "requested_by" TEXT NOT NULL, "result" TEXT, "verification" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "completed_at" TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS "SupportKnowledgeArticle" (
  "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "problem_pattern" TEXT NOT NULL, "resolution" TEXT NOT NULL, "verification" TEXT NOT NULL,
  "module" TEXT, "version" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT', "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "SupportTicket_tenant_status_idx" ON "SupportTicket" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "SupportTicket_tenant_severity_idx" ON "SupportTicket" ("tenant_id", "severity", "created_at");
CREATE INDEX IF NOT EXISTS "SupportEvent_tenant_created_idx" ON "SupportEvent" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "SupportEvent_ticket_created_idx" ON "SupportEvent" ("ticket_id", "created_at");
CREATE INDEX IF NOT EXISTS "SupportIncident_status_created_idx" ON "SupportIncident" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "SupportRemediation_tenant_created_idx" ON "SupportRemediation" ("tenant_id", "created_at");
