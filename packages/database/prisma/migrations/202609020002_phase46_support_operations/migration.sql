-- sync_operations is a core persistence primitive used by this migration and later sync hardening.
CREATE TABLE IF NOT EXISTS "sync_operations" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "operation_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "operation_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSED',
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "client_created_at" TIMESTAMPTZ NOT NULL,
  "processed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "sync_operations_operation_scope_uq" UNIQUE ("tenant_id", "device_id", "operation_id")
);
CREATE INDEX IF NOT EXISTS "sync_operations_tenant_branch_created_idx" ON "sync_operations" ("tenant_id", "branch_id", "created_at");

-- Phase 46: KwakoPos 360° Customer Support & Autonomous Operations
CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT PRIMARY KEY, "tenant_id" TEXT NOT NULL, "branch_id" TEXT, "created_by_user_id" TEXT,
  "subject" TEXT NOT NULL, "description" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN',
  "severity" TEXT NOT NULL DEFAULT 'P3', "category" TEXT NOT NULL DEFAULT 'GENERAL', "module" TEXT,
  "diagnostic_state" JSONB NOT NULL DEFAULT '{}'::jsonb, "ai_summary" TEXT, "assigned_team" TEXT,
  "sla_due_at" TIMESTAMPTZ, "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "resolved_at" TIMESTAMPTZ
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
CREATE TABLE IF NOT EXISTS "SupportIncidentTenant" (
  "incident_id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("incident_id","tenant_id")
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
CREATE INDEX IF NOT EXISTS "SupportTicket_sla_idx" ON "SupportTicket" ("status", "sla_due_at");
CREATE INDEX IF NOT EXISTS "SupportEvent_tenant_created_idx" ON "SupportEvent" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "SupportEvent_ticket_created_idx" ON "SupportEvent" ("ticket_id", "created_at");
CREATE INDEX IF NOT EXISTS "SupportIncident_status_created_idx" ON "SupportIncident" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "SupportIncidentTenant_tenant_idx" ON "SupportIncidentTenant" ("tenant_id", "last_seen_at");
CREATE INDEX IF NOT EXISTS "SupportRemediation_tenant_created_idx" ON "SupportRemediation" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "sync_operations_tenant_status_created_idx" ON "sync_operations" ("tenant_id", "status", "created_at");
