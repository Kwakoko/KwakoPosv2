-- Audit events are immutable security evidence.
-- UPDATE/DELETE are forbidden at the PostgreSQL persistence boundary.
CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_EVENTS_APPEND_ONLY: audit_events cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON "audit_events";

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_events_mutation();
