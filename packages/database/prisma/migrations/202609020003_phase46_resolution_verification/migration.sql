CREATE OR REPLACE FUNCTION enforce_support_ticket_resolution_verification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'RESOLVED' AND OLD.status <> 'RESOLVED' THEN
    IF EXISTS (
      SELECT 1
      FROM "SupportRemediation" r
      WHERE r."ticket_id" = NEW."id"
        AND r."tenant_id" = NEW."tenant_id"
        AND COALESCE(r."verification"->>'state', '') <> 'VERIFIED'
    ) THEN
      RAISE EXCEPTION 'SUPPORT_REMEDIATION_VERIFICATION_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_resolution_verification ON "SupportTicket";
CREATE TRIGGER support_ticket_resolution_verification
BEFORE UPDATE OF "status" ON "SupportTicket"
FOR EACH ROW
EXECUTE FUNCTION enforce_support_ticket_resolution_verification();
