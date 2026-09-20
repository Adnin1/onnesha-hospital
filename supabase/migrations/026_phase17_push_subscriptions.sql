-- Phase 17: Push notification subscription management
-- Idempotent, preserves RLS and tenant isolation

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  browser TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_push_endpoint UNIQUE (endpoint)
);

-- RLS: Tenant isolation
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_tenant_isolation'
  ) THEN
    CREATE POLICY push_subscriptions_tenant_isolation ON push_subscriptions
      FOR ALL
      USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;
END $$;

-- Index for fast endpoint lookup
CREATE INDEX IF NOT EXISTS idx_push_sub_org ON push_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_active ON push_subscriptions(organization_id) WHERE revoked_at IS NULL;
