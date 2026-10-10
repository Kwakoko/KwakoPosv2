-- Inventory production lock: durable transfers, physical counts, bundles/kits, wastage.
CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  destination_branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  transfer_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  notes TEXT,
  requested_by_id TEXT,
  submitted_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_by_id TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stock_transfers_tenant_number_uq UNIQUE (tenant_id, transfer_number),
  CONSTRAINT stock_transfers_source_idem_uq UNIQUE (tenant_id, source_branch_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS stock_transfers_source_status_idx ON stock_transfers(tenant_id, source_branch_id, status);
CREATE INDEX IF NOT EXISTS stock_transfers_destination_status_idx ON stock_transfers(tenant_id, destination_branch_id, status);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity NUMERIC(12,4) NOT NULL,
  unit_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_variant_idx ON stock_transfer_items(transfer_id, variant_id);

CREATE TABLE IF NOT EXISTS stock_counts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  session_number TEXT NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'FULL_STORE',
  status TEXT NOT NULL DEFAULT 'COUNTING',
  category_id TEXT,
  location_id TEXT,
  notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  created_by_id TEXT NOT NULL,
  approved_by_id TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stock_counts_scope_idem_uq UNIQUE (tenant_id, branch_id, idempotency_key),
  CONSTRAINT stock_counts_session_uq UNIQUE (tenant_id, branch_id, session_number)
);
CREATE INDEX IF NOT EXISTS stock_counts_scope_status_idx ON stock_counts(tenant_id, branch_id, status);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id TEXT PRIMARY KEY,
  count_id TEXT NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  system_quantity NUMERIC(12,4) NOT NULL,
  counted_quantity NUMERIC(12,4),
  variance_quantity NUMERIC(12,4) NOT NULL DEFAULT 0,
  variance_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  counted_by_user_id TEXT,
  counted_at TIMESTAMPTZ,
  notes TEXT,
  posted_adjustment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_count_items_count_variant_idx ON stock_count_items(count_id, variant_id);

CREATE TABLE IF NOT EXISTS product_bundles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  notes TEXT,
  created_by_id TEXT,
  last_assembly_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_bundles_scope_idem_uq UNIQUE (tenant_id, branch_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS product_bundles_scope_product_idx ON product_bundles(tenant_id, branch_id, product_id, status);

CREATE TABLE IF NOT EXISTS product_bundle_items (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
  component_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity NUMERIC(12,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_bundle_items_bundle_variant_idx ON product_bundle_items(bundle_id, component_variant_id);

CREATE TABLE IF NOT EXISTS wastage_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity NUMERIC(12,4) NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unit_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  ledger_id TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED',
  created_by_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wastage_records_scope_idem_uq UNIQUE (tenant_id, branch_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS wastage_records_scope_occurred_idx ON wastage_records(tenant_id, branch_id, occurred_at);
CREATE INDEX IF NOT EXISTS wastage_records_scope_variant_idx ON wastage_records(tenant_id, branch_id, variant_id);
