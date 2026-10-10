DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'journal_entries'
      AND c.conname = 'journal_entries_idempotencyKey_key'
  ) THEN
    ALTER TABLE public.journal_entries DROP CONSTRAINT "journal_entries_idempotencyKey_key";
  END IF;
END $$;
DROP INDEX IF EXISTS public."journal_entries_idempotencyKey_key";
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE "idempotencyKey" IS NOT NULL
    GROUP BY "tenantId", "branchId", "idempotencyKey"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot scope journal idempotency: duplicate keys already exist within a tenant/branch';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_tenantId_branchId_idempotencyKey_key"
  ON public.journal_entries ("tenantId", "branchId", "idempotencyKey");