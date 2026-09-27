CREATE TABLE IF NOT EXISTS sync_control_state (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  sync_epoch UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO sync_control_state (id, sync_epoch)
VALUES (1, gen_random_uuid())
ON CONFLICT (id) DO NOTHING;
