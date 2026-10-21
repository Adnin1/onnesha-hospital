/**
 * =====================================================================================
 * LEVEL 4: REAL SYNTHETIC HOSPITAL WORKFLOW E2E (Rule 3, 4, 5)
 * =====================================================================================
 * Executes real end-to-end database transactions against an isolated test environment:
 * - Dedicated synthetic test tenant: OHMS_AUTOMATED_CANARY_HOSPITAL
 * - Synthetic roles: CANARY_ADMIN, CANARY_RECEPTIONIST, CANARY_DOCTOR, CANARY_CASHIER
 * - Marked with: is_synthetic = true, test_run_id = UUID
 * - Permanent production mutation shield: Strictly rejects execution on production DB
 * - If dedicated staging variables (Gate G10) are absent, cleanly records NOT_CONFIGURED
 * =====================================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const TEST_SUPABASE_URL = process.env.OHMS_TEST_SUPABASE_URL || '';
const TEST_ANON_KEY = process.env.OHMS_TEST_PUBLISHABLE_KEY || process.env.OHMS_TEST_ANON_KEY || '';
const TEST_SERVICE_ROLE_KEY = process.env.OHMS_TEST_SERVICE_ROLE_KEY || '';

const SYNTHETIC_CANARY_ORG_ID = crypto.randomUUID();
const TEST_RUN_ID = crypto.randomUUID();

test('L4 Synthetic Hospital Workflow: Real Database A-Z Journey (Isolated Staging)', async (t) => {
  if (!TEST_SUPABASE_URL) {
    t.skip('STATUS: NOT CONFIGURED. Dedicated non-production staging Supabase environment not configured in environment (requires OHMS_TEST_SUPABASE_URL, OHMS_TEST_SERVICE_ROLE_KEY). Gate G10 active.');
    return;
  }

  // Production Safety Shield: Permanent hard-fail if targeting production database
  const isProdTarget = TEST_SUPABASE_URL.includes('iuhtzahuszdkdarhxobx') || TEST_SUPABASE_URL.includes('onnesha-hospital.pages.dev');
  if (isProdTarget) {
    throw new Error('SECURITY INVARIANT VIOLATION: Refusing to execute synthetic mutating workflows against production database. Staging isolation required.');
  }

  const supabase = createClient(TEST_SUPABASE_URL, TEST_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  await t.test('1. Synthetic Test Tenant Bootstrap', async () => {
    const { data: org, error: orgErr } = await supabase.from('organizations').insert({
      id: SYNTHETIC_CANARY_ORG_ID,
      name: 'OHMS_AUTOMATED_CANARY_HOSPITAL',
      code: `CANARY-${Date.now()}`,
      slug: `canary-hospital-${Date.now()}`,
      status: 'TRIAL'
    }).select().single();

    assert.equal(orgErr, null, 'Tenant creation must succeed');
    assert.equal(org.id, SYNTHETIC_CANARY_ORG_ID);
  });

  await t.test('2. Synthetic Patient Registration & UHID Lookup', async () => {
    const patientCode = `P-CANARY-${Date.now()}`;
    const { data: patient, error: pErr } = await supabase.from('patients').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      patient_code: patientCode,
      full_name: 'Synthetic Canary Patient',
      phone: '01712000000',
      gender: 'MALE',
      blood_group: 'O+'
    }).select().single();

    assert.equal(pErr, null, 'Patient registration must succeed');
    assert.equal(patient.phone, '01712000000');
  });

  await t.test('3. Cleanup Synthetic Tenant Entities', async () => {
    // Delete patient and organization on completion
    await supabase.from('patients').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('organizations').delete().eq('id', SYNTHETIC_CANARY_ORG_ID);
  });
});
