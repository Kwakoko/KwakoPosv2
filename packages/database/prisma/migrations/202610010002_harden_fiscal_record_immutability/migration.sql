CREATE OR REPLACE FUNCTION kwakopos_protect_fiscal_receipt_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TRA_VFD_FISCAL_RECORD_IMMUTABLE';
  END IF;

  IF OLD.tenantId IS DISTINCT FROM NEW.tenantId
     OR OLD.branchId IS DISTINCT FROM NEW.branchId
     OR OLD.receiptId IS DISTINCT FROM NEW.receiptId
     OR OLD.transactionId IS DISTINCT FROM NEW.transactionId
     OR OLD.deviceId IS DISTINCT FROM NEW.deviceId
     OR OLD.requestPayload IS DISTINCT FROM NEW.requestPayload
     OR OLD.createdAt IS DISTINCT FROM NEW.createdAt
     OR OLD.chainSequence IS DISTINCT FROM NEW.chainSequence
     OR OLD.previousReceiptHash IS DISTINCT FROM NEW.previousReceiptHash
     OR OLD.receiptHash IS DISTINCT FROM NEW.receiptHash THEN
    RAISE EXCEPTION 'TRA_VFD_FISCAL_RECORD_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tra_vfd_fiscal_chain_immutable ON "tra_vfd_fiscalizations";
CREATE TRIGGER tra_vfd_fiscal_chain_immutable
BEFORE UPDATE OR DELETE ON "tra_vfd_fiscalizations"
FOR EACH ROW EXECUTE FUNCTION kwakopos_protect_fiscal_receipt_chain();
