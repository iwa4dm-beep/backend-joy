-- Pluto BaaS — job tokens (server-to-server, dedicated pool role)
-- Frontend contract: /jobs/v1/tokens (GET/POST), /jobs/v1/tokens/:id (DELETE),
--                   /jobs/v1/exec, /jobs/v1/rpc/:job (worker endpoints).

CREATE TABLE IF NOT EXISTS admin.job_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  scope        text[] NOT NULL DEFAULT '{}',
  token_hash   text NOT NULL UNIQUE,   -- sha256(hex) of the raw pjt_ token
  token_prefix text NOT NULL,          -- first 12 chars for lookup UI (e.g. "pjt_A1B2C3D4")
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  use_count    bigint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS job_tokens_active_idx
  ON admin.job_tokens (expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS job_tokens_prefix_idx
  ON admin.job_tokens (token_prefix);

-- Only the API process (service_role) reads/writes; no direct authenticated access.
GRANT SELECT, INSERT, UPDATE, DELETE ON admin.job_tokens TO authenticated;
