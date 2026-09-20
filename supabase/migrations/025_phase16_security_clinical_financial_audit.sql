-- ============================================================================
-- OHMS PHASE 16 MIGRATION: ADVANCED SECURITY HARDENING & AUDIT VAULT ENHANCEMENTS
-- ============================================================================

-- 1. Optimized Compound Indexes for High-Speed Compliance & Forensic Queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_module_action 
  ON audit_logs(organization_id, module, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_entity 
  ON audit_logs(organization_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_user 
  ON audit_logs(organization_id, user_id, created_at DESC);

-- 2. Audit Trail Summary View for Executive & Security Dashboards
CREATE OR REPLACE VIEW audit_trail_summary AS
SELECT 
  organization_id,
  module,
  action,
  COUNT(*) as event_count,
  MAX(created_at) as last_event_at
FROM audit_logs
GROUP BY organization_id, module, action;

-- 3. Stored RPC Function for Multi-Filter Audit Log Retrieval
CREATE OR REPLACE FUNCTION get_audit_trail_logs(
  p_org_id UUID,
  p_module VARCHAR DEFAULT NULL,
  p_action VARCHAR DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  organization_id UUID,
  user_id UUID,
  action VARCHAR,
  module VARCHAR,
  entity_type VARCHAR,
  entity_id VARCHAR,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR,
  user_agent TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.organization_id,
    a.user_id,
    a.action,
    a.module,
    a.entity_type,
    a.entity_id,
    a.old_values,
    a.new_values,
    a.ip_address,
    a.user_agent,
    a.created_at
  FROM audit_logs a
  WHERE a.organization_id = p_org_id
    AND (p_module IS NULL OR a.module = p_module)
    AND (p_action IS NULL OR a.action = p_action)
  ORDER BY a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 4. Enforce Read-Only Access via Settings.Audit Permission
-- Audit records can NEVER be modified or deleted by ANY user
REVOKE UPDATE, DELETE ON audit_logs FROM public;
REVOKE UPDATE, DELETE ON document_print_logs FROM public;
