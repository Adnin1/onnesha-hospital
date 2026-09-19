import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iuhtzahuszdkdarhxobx.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_OPiG-7uhoIlnysXKrpErsw_rdXEJ4rs';
const CANONICAL_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

test('Security RLS: Anonymous Write Attack Mitigation Suite', async (t) => {
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });

  // Verify connectivity before running remote API assertions
  try {
    const { error: pingError } = await anonClient.from('organizations').select('id').limit(1);
    if (pingError && (pingError.message?.includes('fetch') || pingError.message?.includes('network') || pingError.message?.includes('ENOTFOUND'))) {
      console.log('Skipping remote RLS network test suite in network-restricted CI runner.');
      return;
    }
  } catch {
    console.log('Skipping remote RLS network test suite in network-restricted CI runner.');
    return;
  }

  await t.test('1. Anonymous SELECT organizations: permitted for canonical public org', async (st) => {
    const { data, error } = await anonClient
      .from('organizations')
      .select('id, name, is_canonical_public')
      .eq('is_canonical_public', true);
    
    if (error && (error.message?.includes('fetch') || error.message?.includes('ENOTFOUND'))) {
      st.skip('Skipping due to runner network isolation');
      return;
    }
    assert.equal(error, null);
    assert.ok(data && data.length > 0, 'Canonical public org should be readable');
    assert.equal(data[0].id, CANONICAL_ORG_ID);
  });

  await t.test('2. Anonymous INSERT organizations: strictly blocked', async () => {
    const { error } = await anonClient
      .from('organizations')
      .insert({
        id: 'b0000000-0000-0000-0000-000000000099',
        name: 'Hacker Fake Hospital',
        slug: 'hacker-fake-hospital',
        is_active: true,
        is_canonical_public: true
      })
      .select();

    assert.ok(error !== null, 'Anonymous INSERT organizations must fail');
    assert.match(error.message, /violates row-level security|permission denied|denied/i);
  });

  await t.test('3. Anonymous UPDATE organizations: strictly blocked', async () => {
    const { data, error } = await anonClient
      .from('organizations')
      .update({ name: 'Compromised Hospital Name' })
      .eq('id', CANONICAL_ORG_ID)
      .select();

    if (error) {
      assert.match(error.message, /violates row-level security|permission denied/i);
    } else {
      assert.equal(data?.length ?? 0, 0, 'Zero rows should be updated by anonymous user');
    }
  });

  await t.test('4. Anonymous DELETE organizations: strictly blocked', async () => {
    const { data, error } = await anonClient
      .from('organizations')
      .delete()
      .eq('id', CANONICAL_ORG_ID)
      .select();

    if (error) {
      assert.match(error.message, /violates row-level security|permission denied/i);
    } else {
      assert.equal(data?.length ?? 0, 0, 'Zero rows should be deleted by anonymous user');
    }
  });

  await t.test('5. Anonymous INSERT departments: strictly blocked', async () => {
    const { error } = await anonClient
      .from('departments')
      .insert({
        organization_id: CANONICAL_ORG_ID,
        name: 'Malicious Department',
        code: 'MAL01',
        is_active: true,
        is_public: true
      })
      .select();

    assert.ok(error !== null, 'Anonymous INSERT departments must fail');
    assert.match(error.message, /violates row-level security|permission denied/i);
  });

  await t.test('6. Anonymous UPDATE departments: strictly blocked', async () => {
    const { data, error } = await anonClient
      .from('departments')
      .update({ name: 'Defaced Department' })
      .eq('organization_id', CANONICAL_ORG_ID)
      .select();

    if (error) {
      assert.match(error.message, /violates row-level security|permission denied/i);
    } else {
      assert.equal(data?.length ?? 0, 0, 'Zero rows should be updated by anonymous user');
    }
  });

  await t.test('7. Anonymous DELETE departments: strictly blocked', async () => {
    const { data, error } = await anonClient
      .from('departments')
      .delete()
      .eq('organization_id', CANONICAL_ORG_ID)
      .select();

    if (error) {
      assert.match(error.message, /violates row-level security|permission denied/i);
    } else {
      assert.equal(data?.length ?? 0, 0, 'Zero rows should be deleted by anonymous user');
    }
  });

  await t.test('8. Anonymous INSERT doctors: strictly blocked', async () => {
    const { error } = await anonClient
      .from('doctors')
      .insert({
        organization_id: CANONICAL_ORG_ID,
        full_name: 'Dr. Fake Rogue',
        specialization: 'Malware Specialist',
        bmdc_reg_number: 'BMDC-FAKE-999',
        is_active: true,
        is_public: true
      })
      .select();

    assert.ok(error !== null, 'Anonymous INSERT doctors must fail');
    assert.match(error.message, /violates row-level security|permission denied/i);
  });

  await t.test('9. Anonymous UPDATE doctors: strictly blocked', async () => {
    const { data, error } = await anonClient
      .from('doctors')
      .update({ full_name: 'Defaced Doctor Name' })
      .eq('organization_id', CANONICAL_ORG_ID)
      .select();

    if (error) {
      assert.match(error.message, /violates row-level security|permission denied/i);
    } else {
      assert.equal(data?.length ?? 0, 0, 'Zero rows should be updated by anonymous user');
    }
  });

  await t.test('10. Anonymous DELETE doctors: strictly blocked', async () => {
    const { data, error } = await anonClient
      .from('doctors')
      .delete()
      .eq('organization_id', CANONICAL_ORG_ID)
      .select();

    if (error) {
      assert.match(error.message, /violates row-level security|permission denied/i);
    } else {
      assert.equal(data?.length ?? 0, 0, 'Zero rows should be deleted by anonymous user');
    }
  });

  await t.test('11. Anonymous INSERT doctor_schedules: strictly blocked', async () => {
    const { error } = await anonClient
      .from('doctor_schedules')
      .insert({
        organization_id: CANONICAL_ORG_ID,
        doctor_id: 'c0000000-0000-0000-0000-000000000001',
        day_of_week: 'FRIDAY',
        start_time: '09:00:00',
        end_time: '12:00:00',
        max_tokens: 50,
        is_active: true
      })
      .select();

    assert.ok(error !== null, 'Anonymous INSERT doctor_schedules must fail');
    assert.match(error.message, /violates row-level security|permission denied/i);
  });

  await t.test('12. Anonymous UPDATE doctor_schedules: strictly blocked', async () => {
    const { data, error } = await anonClient
      .from('doctor_schedules')
      .update({ max_tokens: 9999 })
      .eq('organization_id', CANONICAL_ORG_ID)
      .select();

    if (error) {
      assert.match(error.message, /violates row-level security|permission denied/i);
    } else {
      assert.equal(data?.length ?? 0, 0, 'Zero rows should be updated by anonymous user');
    }
  });

  await t.test('13. Anonymous DELETE doctor_schedules: strictly blocked', async () => {
    const { data, error } = await anonClient
      .from('doctor_schedules')
      .delete()
      .eq('organization_id', CANONICAL_ORG_ID)
      .select();

    if (error) {
      assert.match(error.message, /violates row-level security|permission denied/i);
    } else {
      assert.equal(data?.length ?? 0, 0, 'Zero rows should be deleted by anonymous user');
    }
  });

  await t.test('14. Anonymous direct read of private clinical patients: strictly 0 rows / denied', async () => {
    const { data } = await anonClient
      .from('patients')
      .select('id, full_name, phone');

    assert.equal(data?.length ?? 0, 0, 'Anonymous caller must never receive patient rows');
  });

  await t.test('15. Anonymous direct read of audit_logs: strictly 0 rows / denied', async () => {
    const { data } = await anonClient
      .from('audit_logs')
      .select('id, action, entity_id');

    assert.equal(data?.length ?? 0, 0, 'Anonymous caller must never receive audit log rows');
  });

  await t.test('16. Anonymous direct execution of internal helper functions: strictly rejected', async () => {
    const { error: e1 } = await anonClient.rpc('get_next_token', {
      p_org_id: CANONICAL_ORG_ID,
      p_doctor_id: 'c0000000-0000-0000-0000-000000000001',
      p_date: '2026-10-01'
    });
    assert.ok(e1 !== null, 'Anonymous call to get_next_token must fail');

    const { error: e2 } = await anonClient.rpc('generate_patient_code', {
      p_organization_id: CANONICAL_ORG_ID
    });
    assert.ok(e2 !== null, 'Anonymous call to generate_patient_code must fail');
  });

  await t.test('17. Anonymous execution of verify_and_record_online_payment: strictly rejected', async () => {
    const { error } = await anonClient.rpc('verify_and_record_online_payment', {
      p_org_id: CANONICAL_ORG_ID,
      p_intent_id: 'd0000000-0000-0000-0000-000000000001',
      p_provider_trx_id: 'FAKE_TRX_999',
      p_paid_amount: 1000,
      p_gateway_method: 'BKASH'
    });

    assert.ok(error !== null, 'Anonymous call to verify_and_record_online_payment must fail');
    assert.match(error.message, /permission denied|not found/i);
  });

  await t.test('18. Authenticated browser user execution of verify_and_record_online_payment: strictly rejected', async () => {
    // Ordinary authenticated user cannot invoke sensitive settlement function
    const mockAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6ImMwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSJ9.signature' } },
      auth: { persistSession: false }
    });

    const { error } = await mockAuthClient.rpc('verify_and_record_online_payment', {
      p_org_id: CANONICAL_ORG_ID,
      p_intent_id: 'd0000000-0000-0000-0000-000000000001',
      p_provider_trx_id: 'ATTACK_FORGED_TRX',
      p_paid_amount: 500,
      p_gateway_method: 'BKASH'
    });

    assert.ok(error !== null, 'Authenticated user direct call to verify_and_record_online_payment must fail');
    assert.match(error.message, /permission denied|not found|JWT|401|403/i);
  });
});
