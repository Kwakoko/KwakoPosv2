-- KwakoPos Inter-Vertical Commerce Gateway
-- Gateway records store scoped tenant and branch references. Native transaction records remain tenant-bound.

CREATE TABLE IF NOT EXISTS inter_vertical_connections (
  id TEXT PRIMARY KEY, buyer_tenant_id TEXT NOT NULL, buyer_branch_id TEXT NOT NULL,
  seller_tenant_id TEXT NOT NULL, seller_branch_id TEXT, buyer_supplier_id TEXT, seller_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING', requested_by_user_id TEXT NOT NULL, accepted_by_user_id TEXT,
  notes TEXT NOT NULL DEFAULT '', idempotency_key TEXT NOT NULL, seller_response_idempotency_key TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (buyer_tenant_id, buyer_branch_id, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS inter_vertical_connections_active_pair_uq
  ON inter_vertical_connections (buyer_tenant_id, buyer_branch_id, seller_tenant_id, seller_branch_id) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS inter_vertical_connections_buyer_idx ON inter_vertical_connections (buyer_tenant_id, buyer_branch_id, status);
CREATE INDEX IF NOT EXISTS inter_vertical_connections_seller_idx ON inter_vertical_connections (seller_tenant_id, seller_branch_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS inter_vertical_connections_seller_response_uq ON inter_vertical_connections (seller_tenant_id, seller_branch_id, seller_response_idempotency_key) WHERE seller_response_idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS inter_vertical_orders (
  id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, connection_id TEXT NOT NULL, buyer_purchase_order_id TEXT,
  buyer_tenant_id TEXT NOT NULL, buyer_branch_id TEXT NOT NULL, seller_tenant_id TEXT NOT NULL, seller_branch_id TEXT NOT NULL,
  buyer_supplier_id TEXT NOT NULL, seller_customer_id TEXT NOT NULL, status TEXT NOT NULL,
  finance_status TEXT NOT NULL DEFAULT 'OPEN', currency TEXT NOT NULL DEFAULT 'TZS',
  items JSONB NOT NULL DEFAULT '[]'::jsonb, logistics JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', rejection_reason TEXT,
  created_by_user_id TEXT NOT NULL, accepted_by_user_id TEXT, idempotency_key TEXT NOT NULL,
  settled_amount NUMERIC(14,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (buyer_tenant_id, buyer_branch_id, idempotency_key)
);
ALTER TABLE inter_vertical_orders ADD COLUMN IF NOT EXISTS buyer_purchase_order_id TEXT;
CREATE INDEX IF NOT EXISTS inter_vertical_orders_buyer_idx ON inter_vertical_orders (buyer_tenant_id, buyer_branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS inter_vertical_orders_seller_idx ON inter_vertical_orders (seller_tenant_id, seller_branch_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS inter_vertical_order_events (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL, action TEXT NOT NULL, from_status TEXT, to_status TEXT,
  idempotency_key TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, branch_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS inter_vertical_order_events_order_idx ON inter_vertical_order_events (order_id, created_at);

CREATE TABLE IF NOT EXISTS inter_vertical_finance_documents (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUYER','SELLER')), document_type TEXT NOT NULL, document_id TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL, paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (side, document_type, document_id)
);
CREATE INDEX IF NOT EXISTS inter_vertical_finance_documents_order_idx ON inter_vertical_finance_documents (order_id, side, created_at);

CREATE TABLE IF NOT EXISTS inter_vertical_payment_requests (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL,
  submitted_by_user_id TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL, payment_method TEXT NOT NULL,
  provider TEXT, provider_reference TEXT, notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION', idempotency_key TEXT NOT NULL,
  buyer_payment_id TEXT, seller_payment_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ, UNIQUE (tenant_id, branch_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS inter_vertical_payment_requests_order_idx ON inter_vertical_payment_requests (order_id, status, created_at);
-- Durable inbound logistics records; tenant/branch identify the receiving Retail scope.
CREATE TABLE IF NOT EXISTS supply_chain_shipments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  po_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  gateway_order_id TEXT,
  source_tenant_id TEXT,
  source_branch_id TEXT,
  carrier_name TEXT NOT NULL,
  tracking_number TEXT,
  status TEXT NOT NULL CHECK (status IN ('PLANNED','CONFIRMED','IN_TRANSIT','ARRIVED','RECEIVING','RECEIVED','EXCEPTION','CANCELLED')),
  supplier_eta TIMESTAMPTZ NOT NULL,
  carrier_eta TIMESTAMPTZ,
  actual_arrival_date TIMESTAMPTZ,
  destination_warehouse_id TEXT,
  created_by_user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS supply_chain_shipments_gateway_order_idx
  ON supply_chain_shipments (tenant_id, branch_id, gateway_order_id, created_at);
CREATE INDEX IF NOT EXISTS supply_chain_shipments_po_idx
  ON supply_chain_shipments (tenant_id, branch_id, po_id, status);

CREATE TABLE IF NOT EXISTS supply_chain_shipment_lines (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES supply_chain_shipments(id) ON DELETE CASCADE,
  gateway_line_id TEXT,
  seller_variant_id TEXT,
  buyer_variant_id TEXT,
  product_id TEXT,
  sku TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity_shipped NUMERIC(12,4) NOT NULL CHECK (quantity_shipped > 0),
  quantity_received NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0 AND quantity_received <= quantity_shipped),
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supply_chain_shipment_lines_shipment_idx ON supply_chain_shipment_lines (shipment_id);
CREATE INDEX IF NOT EXISTS supply_chain_shipment_lines_gateway_line_idx ON supply_chain_shipment_lines (gateway_line_id);

