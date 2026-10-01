CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "tra_vfd_fiscalizations"
ADD COLUMN "chainSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "previousReceiptHash" TEXT,
ADD COLUMN "receiptHash" TEXT;

DO $$
DECLARE
  r RECORD;
  seq INTEGER;
  prev TEXT;
  invoice TEXT;
  ts TEXT;
  total TEXT;
  tax TEXT;
  current_hash TEXT;
BEGIN
  FOR r IN
    SELECT id, "tenantId", "branchId", "deviceId", "transactionId",
           "requestPayload", "createdAt"
    FROM "tra_vfd_fiscalizations"
    ORDER BY "tenantId", "branchId", "deviceId", "createdAt", id
  LOOP
    SELECT COALESCE(MAX("chainSequence"), 0) + 1
      INTO seq
      FROM "tra_vfd_fiscalizations"
     WHERE "tenantId" = r."tenantId"
       AND "branchId" = r."branchId"
       AND "deviceId" = r."deviceId"
       AND "id" <> r.id;

    seq := GREATEST(seq, 1);
    SELECT "receiptHash"
      INTO prev
      FROM "tra_vfd_fiscalizations"
     WHERE "tenantId" = r."tenantId"
       AND "branchId" = r."branchId"
       AND "deviceId" = r."deviceId"
       AND "chainSequence" = seq - 1
     LIMIT 1;

    prev := COALESCE(prev, 'GENESIS');
    invoice := COALESCE(NULLIF(r."requestPayload"->>'invoiceNumber', ''),
                        NULLIF(r."requestPayload"->>'receiptNumber', ''),
                        r."transactionId");
    ts := to_char(r."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    total := to_char(COALESCE(NULLIF(r."requestPayload"->>'grandTotal', ''),
                              NULLIF(r."requestPayload"->>'total', ''), '0')::numeric,
                     'FM999999999999990.00');
    tax := to_char(COALESCE(NULLIF(r."requestPayload"->>'taxTotal', ''),
                            NULLIF(r."requestPayload"->>'taxAmount', ''), '0')::numeric,
                   'FM999999999999990.00');
    current_hash := encode(digest(prev || '|' || invoice || '|' || ts || '|' || total || '|' || tax, 'sha256'), 'hex');

    UPDATE "tra_vfd_fiscalizations"
       SET "chainSequence" = seq,
           "previousReceiptHash" = prev,
           "receiptHash" = current_hash
     WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX "tra_vfd_fiscalizations_tenant_branch_device_chain_key"
ON "tra_vfd_fiscalizations"("tenantId", "branchId", "deviceId", "chainSequence");

CREATE OR REPLACE FUNCTION kwakopos_protect_fiscal_receipt_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TRA_VFD_FISCAL_RECORD_IMMUTABLE';
  END IF;
  IF OLD.chainSequence IS DISTINCT FROM NEW.chainSequence
     OR OLD.previousReceiptHash IS DISTINCT FROM NEW.previousReceiptHash
     OR OLD.receiptHash IS DISTINCT FROM NEW.receiptHash THEN
    RAISE EXCEPTION 'TRA_VFD_FISCAL_CHAIN_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tra_vfd_fiscal_chain_immutable ON "tra_vfd_fiscalizations";
CREATE TRIGGER tra_vfd_fiscal_chain_immutable
BEFORE UPDATE OR DELETE ON "tra_vfd_fiscalizations"
FOR EACH ROW EXECUTE FUNCTION kwakopos_protect_fiscal_receipt_chain();
