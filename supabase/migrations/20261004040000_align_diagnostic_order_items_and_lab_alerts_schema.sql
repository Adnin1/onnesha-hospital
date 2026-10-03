-- ==============================================================================
-- OHMS Database Migration 107: Align Diagnostic Order Items and Lab Alerts Schema
--
-- Description:
-- 1. Add organization_id and updated_at to public.diagnostic_order_items.
-- 2. Add processed_at to public.lab_analyzer_transmissions.
-- 3. Add analyzer_id and acknowledged to public.lab_critical_alerts.
-- ==============================================================================

-- 1. Align diagnostic_order_items
ALTER TABLE public.diagnostic_order_items
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.diagnostic_order_items doi
SET organization_id = orders.organization_id
FROM public.diagnostic_orders orders
WHERE doi.order_id = orders.id
  AND doi.organization_id IS NULL;

-- 2. Align lab_analyzer_transmissions
ALTER TABLE public.lab_analyzer_transmissions
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- 3. Align lab_critical_alerts
ALTER TABLE public.lab_critical_alerts
ADD COLUMN IF NOT EXISTS analyzer_id UUID REFERENCES public.lab_analyzers(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE;

ALTER TABLE public.lab_critical_alerts
ALTER COLUMN sample_barcode DROP NOT NULL;
