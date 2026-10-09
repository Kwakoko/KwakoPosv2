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
