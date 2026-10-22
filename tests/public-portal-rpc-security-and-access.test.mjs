import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const CANONICAL_ORG_ID = '00000000-0000-0000-0000-000000000001';
const NON_CANONICAL_ORG_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const migration250Path = path.join(
  ROOT,
  'supabase/migrations/20261022130000_migration_250_restore_public_rpc_grants_and_tenant_guards.sql'
);

test('1. Migration 250 exists and defines canonical public RPCs', () => {
  assert.ok(fs.existsSync(migration250Path), 'Migration 250 file must exist');
  const sql = fs.readFileSync(migration250Path, 'utf8');

  assert.ok(sql.includes('get_public_doctors_directory'), 'Must define get_public_doctors_directory');
  assert.ok(sql.includes('get_public_doctor_schedules'), 'Must define get_public_doctor_schedules');
  assert.ok(sql.includes('get_public_live_queue'), 'Must define get_public_live_queue');
  assert.ok(sql.includes('get_public_token_status'), 'Must define get_public_token_status');
  assert.ok(sql.includes('submit_public_contact_inquiry'), 'Must define submit_public_contact_inquiry');
  assert.ok(sql.includes('book_online_appointment'), 'Must define book_online_appointment');
});

test('2. Migration 250 enforces empty search_path on all public SECURITY DEFINER RPCs', () => {
  const sql = fs.readFileSync(migration250Path, 'utf8');

  // Verify all function definitions set search_path = ''
  const searchPathMatches = sql.match(/SET\s+search_path\s*=\s*''/gi) || [];
  assert.ok(searchPathMatches.length >= 6, `Expected at least 6 empty search_path statements, found ${searchPathMatches.length}`);
  assert.ok(!sql.includes("SET search_path = public"), "Must not set search_path = public");
});

test('3. Migration 250 enforces canonical public tenant guards (is_canonical_public = TRUE)', () => {
  const sql = fs.readFileSync(migration250Path, 'utf8');

  const canonicalChecks = sql.match(/is_canonical_public\s*=\s*TRUE/gi) || [];
  assert.ok(canonicalChecks.length >= 6, `Expected is_canonical_public = TRUE in all public RPCs, found ${canonicalChecks.length}`);
});

test('4. Migration 250 explicitly grants execute on public endpoints to anon, authenticated, and service_role', () => {
  const sql = fs.readFileSync(migration250Path, 'utf8');

  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_public_doctors_directory(UUID) TO anon, authenticated, service_role;'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_public_doctor_schedules(UUID, UUID) TO anon, authenticated, service_role;'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_public_live_queue(UUID) TO anon, authenticated, service_role;'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_public_token_status(UUID, TEXT, DATE, TEXT) TO anon, authenticated, service_role;'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;'));
});

test('5. Migration 250 drops legacy book_online_appointment overloads and unifies parameter handling', () => {
  const sql = fs.readFileSync(migration250Path, 'utf8');

  assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, UUID, INT, TEXT);'));
  assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, INT, TEXT);'));
  assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT);'));
  assert.ok(sql.includes('p_patient_notes     TEXT DEFAULT NULL'));
  assert.ok(sql.includes('p_notes             TEXT DEFAULT NULL'));
});

test('6. Frontend lib/public/actions.ts aligns with authoritative RPC contracts', () => {
  const actionsPath = path.join(ROOT, 'lib/public/actions.ts');
  const code = fs.readFileSync(actionsPath, 'utf8');

  assert.match(code, /rpc\(\s*["']get_public_doctors_directory["']/);
  assert.match(code, /rpc\(\s*["']get_public_doctor_schedules["']/);
  assert.match(code, /rpc\(\s*["']get_public_live_queue["']/);
  assert.match(code, /rpc\(\s*["']get_public_token_status["']/);
  assert.match(code, /rpc\(\s*["']submit_public_contact_inquiry["']/);
  assert.match(code, /rpc\(\s*["']book_online_appointment["']/);
  assert.ok(code.includes('p_patient_notes: notes || null'));
});

test('7. config/rpc-access-policy.json lists all 6 public RPCs under public_exceptions', () => {
  const policyPath = path.join(ROOT, 'config/rpc-access-policy.json');
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

  const publicNames = policy.public_exceptions.map((e) => e.name);
  assert.ok(publicNames.includes('get_public_doctors_directory'));
  assert.ok(publicNames.includes('get_public_doctor_schedules'));
  assert.ok(publicNames.includes('get_public_live_queue'));
  assert.ok(publicNames.includes('get_public_token_status'));
  assert.ok(publicNames.includes('book_online_appointment'));
  assert.ok(publicNames.includes('submit_public_contact_inquiry'));
});

test('8. Live database permission verification for anon role (if credentials available)', async () => {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.log('Skipping live DB check: .env.local not found');
    return;
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  envContent.split('\n').forEach(line => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  });

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.log('Skipping live DB check: Supabase URL or ANON key missing');
    return;
  }

  const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // A. Operational / Admin RPCs MUST remain blocked (42501 or PGRST202)
  const blockedRpcs = [
    { name: 'update_ipd_admission_atomic', params: { p_org_id: CANONICAL_ORG_ID, p_visit_id: CANONICAL_ORG_ID } },
    { name: 'update_waiting_queue_status_atomic', params: { p_org_id: CANONICAL_ORG_ID, p_queue_id: CANONICAL_ORG_ID, p_status: 'CALLED' } },
  ];

  for (const b of blockedRpcs) {
    const { error } = await anonClient.rpc(b.name, b.params);
    assert.ok(error, `Administrative RPC ${b.name} must be blocked for anon role`);
    assert.equal(error.code, '42501', `Expected 42501 for ${b.name}, got: ${error.code}`);
  }

  // B. Cross-tenant probe: Non-canonical org ID must be rejected by public RPCs (fail closed)
  const { data: nonCanonicalQueue } = await anonClient.rpc('get_public_live_queue', {
    p_org_id: NON_CANONICAL_ORG_ID,
  });
  if (nonCanonicalQueue) {
    const parsedQueue = typeof nonCanonicalQueue === 'string' ? JSON.parse(nonCanonicalQueue) : nonCanonicalQueue;
    assert.equal(parsedQueue.success, false, 'Non-canonical org must be rejected by get_public_live_queue');
  }

  const { data: nonCanonicalToken } = await anonClient.rpc('get_public_token_status', {
    p_org_id: NON_CANONICAL_ORG_ID,
    p_token_query: '1',
  });
  if (nonCanonicalToken) {
    const parsedToken = typeof nonCanonicalToken === 'string' ? JSON.parse(nonCanonicalToken) : nonCanonicalToken;
    assert.equal(parsedToken.success, false, 'Non-canonical org must be rejected by get_public_token_status');
  }

  const { data: nonCanonicalDocs } = await anonClient.rpc('get_public_doctors_directory', {
    p_org_id: NON_CANONICAL_ORG_ID,
  });
  if (nonCanonicalDocs) {
    const docs = typeof nonCanonicalDocs === 'string' ? JSON.parse(nonCanonicalDocs) : nonCanonicalDocs;
    assert.ok(Array.isArray(docs) && docs.length === 0, 'Non-canonical org must return empty doctor directory');
  }

  // C. Public RPC execution: anon MUST have EXECUTE on all 6 public RPCs (never 42501)
  const publicCalls = [
    { name: 'get_public_doctors_directory', params: { p_org_id: CANONICAL_ORG_ID } },
    { name: 'get_public_doctor_schedules', params: { p_org_id: CANONICAL_ORG_ID, p_doctor_id: '00000000-0000-0000-0000-000000000000' } },
    { name: 'get_public_live_queue', params: { p_org_id: CANONICAL_ORG_ID } },
    { name: 'get_public_token_status', params: { p_org_id: CANONICAL_ORG_ID, p_token_query: '1' } },
    { name: 'submit_public_contact_inquiry', params: { p_org_id: CANONICAL_ORG_ID, p_name: 'Test Visitor', p_phone: '01711111111', p_message: 'Valid test message length over 10 chars.' } },
    { name: 'book_online_appointment', params: { p_org_id: CANONICAL_ORG_ID, p_doctor_id: '00000000-0000-0000-0000-000000000000', p_schedule_id: '00000000-0000-0000-0000-000000000000', p_appointment_date: '2026-10-25', p_patient_name: 'Test Patient', p_patient_phone: '01711111111' } },
  ];

  for (const pc of publicCalls) {
    const res = await anonClient.rpc(pc.name, pc.params);
    if (res.error) {
      assert.notEqual(res.error.code, '42501', `Public RPC ${pc.name} must not be denied with 42501 to anon role`);
      assert.ok(!res.error.message.toLowerCase().includes('permission denied'), `Public RPC ${pc.name} must not fail with permission denied: ${res.error.message}`);
    }
  }
});
