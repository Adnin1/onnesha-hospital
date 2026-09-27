-- Migration: 20260928093000_configure_sslcommerz_running_domain.sql
-- Enables SSLCommerz payment gateway integration on the canonical hospital organization
-- Configured for immediate execution using the running Cloudflare Pages domain (https://onnesha-hospital.pages.dev).

INSERT INTO public.organization_integrations (
  organization_id,
  integration_type,
  provider_name,
  environment,
  sender_id,
  encrypted_credentials,
  is_enabled,
  created_at,
  updated_at
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'PAYMENT_GATEWAY',
  'SSLCOMMERZ',
  'SANDBOX',
  'SSLCOMMERZ',
  '{"store_id": "testbox", "store_passwd": "qwerty"}'::jsonb,
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (organization_id, integration_type, provider_name, environment) DO UPDATE
SET encrypted_credentials = EXCLUDED.encrypted_credentials,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = NOW();
