-- Migration 164: Allow 'ACCEPTED' status in diagnostic_orders and diagnostic_order_items constraints
-- Enables standard hospital staff workflow: Order -> Accept -> Sample & Barcode -> Result Entry -> Doctor Sign & Print

-- 1. Update diagnostic_orders status constraint
ALTER TABLE public.diagnostic_orders 
  DROP CONSTRAINT IF EXISTS diagnostic_orders_status_check;

ALTER TABLE public.diagnostic_orders 
  ADD CONSTRAINT diagnostic_orders_status_check 
  CHECK (status IN (
    'ORDERED', 
    'PENDING', 
    'PAID', 
    'ACCEPTED', 
    'SAMPLE_COLLECTED', 
    'PROCESSING', 
    'VERIFIED', 
    'DELIVERED', 
    'CANCELLED'
  ));

-- 2. Update diagnostic_order_items status constraint
ALTER TABLE public.diagnostic_order_items 
  DROP CONSTRAINT IF EXISTS diagnostic_order_items_status_check;

ALTER TABLE public.diagnostic_order_items 
  ADD CONSTRAINT diagnostic_order_items_status_check 
  CHECK (status IN (
    'ORDERED', 
    'PENDING', 
    'ACCEPTED', 
    'SAMPLE_COLLECTED', 
    'PROCESSING', 
    'VERIFIED', 
    'DELIVERED', 
    'CANCELLED'
  ));

COMMENT ON CONSTRAINT diagnostic_orders_status_check ON public.diagnostic_orders IS 
  'Enforces canonical diagnostic order statuses including staff ACCEPTED state';
