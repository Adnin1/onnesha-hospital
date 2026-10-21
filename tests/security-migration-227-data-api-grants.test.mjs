import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iuhtzahuszdkdarhxobx.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

describe('Migration 227: Data API Grants & Future-Proofing Verification', () => {
  const isLiveEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('ci-hermetic') &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('127.0.0.1') &&
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes('placeholder')
  );
  const client = createClient(SUPABASE_URL, ANON_KEY);

  test('Public portal tables allow anonymous SELECT queries via Data API', async (t) => {
    if (!isLiveEnv) {
      t.skip('Skipped in hermetic environment without live Supabase');
      return;
    }

    const publicTables = ['doctors', 'departments', 'hospital_service_tariffs'];
    for (const tbl of publicTables) {
      const { data, error } = await client.from(tbl).select('id').limit(1);
      assert.equal(error, null, `Public table "${tbl}" should allow anonymous SELECT without permission denied`);
      assert.ok(Array.isArray(data), `Expected data array from "${tbl}"`);
    }
  });

  test('Sensitive medical/financial tables enforce RLS against anonymous callers', async (t) => {
    if (!isLiveEnv) {
      t.skip('Skipped in hermetic environment without live Supabase');
      return;
    }

    // Patients table has RLS enabled; anonymous caller should return empty data or be denied
    const { data, error } = await client.from('patients').select('id').limit(1);
    if (!error) {
      assert.equal(data.length, 0, 'Anonymous caller must never see patient records');
    } else {
      assert.ok(error.message.includes('permission') || error.message.includes('policy') || error.code === '42501' || error.code === 'PGRST301');
    }
  });

  test('System health diagnostics RPC retains fail-closed behavior for anonymous caller', async (t) => {
    if (!isLiveEnv) {
      t.skip('Skipped in hermetic environment without live Supabase');
      return;
    }

    const { data, error } = await client.rpc('check_system_health_diagnostics');
    assert.equal(error, null, 'Public health RPC should return structured audit response');
    assert.equal(data.status, 'AUDIT_UNAUTHORIZED', 'Anonymous probe must return AUDIT_UNAUTHORIZED');
  });

  test('Telegram worker-only RPCs remain strictly non-executable by anon (Migration 226 Invariant)', async (t) => {
    if (!isLiveEnv) {
      t.skip('Skipped in hermetic environment without live Supabase');
      return;
    }

    const { error: err1 } = await client.rpc('claim_next_telegram_command_atomic');
    assert.ok(err1, 'claim_next_telegram_command_atomic must reject anonymous execution');

    const { error: err2 } = await client.rpc('claim_telegram_update_atomic', { p_bot_instance: 'test' });
    assert.ok(err2, 'claim_telegram_update_atomic must reject anonymous execution');

    const { error: err3 } = await client.rpc('complete_telegram_update_atomic', { p_update_id: 1 });
    assert.ok(err3, 'complete_telegram_update_atomic must reject anonymous execution');
  });
});
