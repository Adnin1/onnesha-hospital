import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const CANONICAL_ORG_ID = 'a0000000-0000-0000-0000-000000000001';
const NON_CANONICAL_ORG_ID = '00000000-0000-0000-0000-000000000002';

const migration251Path = path.join(
  ROOT,
  'supabase/migrations/20261022140000_migration_251_harden_public_booking_anti_abuse_and_rate_limits.sql'
);

test('1. Migration 251 exists and defines hardened public RPCs', () => {
  assert.ok(fs.existsSync(migration251Path), 'Migration 251 file must exist');
  const sql = fs.readFileSync(migration251Path, 'utf8');

  assert.ok(sql.includes('submit_public_contact_inquiry'), 'Must define submit_public_contact_inquiry');
  assert.ok(sql.includes('book_online_appointment'), 'Must define book_online_appointment');
});

test('2. Migration 251 enforces transactional concurrency serialization per phone number', () => {
  const sql = fs.readFileSync(migration251Path, 'utf8');

  assert.ok(sql.includes("hashtext('contact_phone:' || v_clean_phone)"), 'Must lock on contact phone');
  assert.ok(sql.includes("hashtext('booking_phone:' || v_clean_phone)"), 'Must lock on booking phone');
  assert.ok(sql.includes('pg_advisory_xact_lock'), 'Must use pg_advisory_xact_lock');
});

test('3. Migration 251 enforces rapid-fire burst throttling on bookings', () => {
  const sql = fs.readFileSync(migration251Path, 'utf8');

  assert.ok(sql.includes("INTERVAL '15 seconds'"), 'Must enforce 15-second rapid burst throttle');
  assert.ok(sql.includes('Rapid consecutive submissions are throttled for security'), 'Must return informative throttle message');
});

test('4. Migration 251 enforces daily appointment booking quota per phone number', () => {
  const sql = fs.readFileSync(migration251Path, 'utf8');

  assert.ok(sql.includes('v_phone_daily_count >= 3'), 'Must enforce max 3 active appointments per day');
  assert.ok(sql.includes('Daily booking limit reached'), 'Must inform user of daily quota');
});

test('5. Migration 251 enforces idempotent duplicate-booking protection', () => {
  const sql = fs.readFileSync(migration251Path, 'utf8');

  assert.ok(sql.includes('already_booked'), 'Must set already_booked flag on re-query');
  assert.ok(sql.includes('v_existing_appt_id IS NOT NULL'), 'Must check existing appointment');
  assert.ok(sql.includes('is already confirmed for this patient'), 'Must return existing token notice');
});

test('6. Migration 251 preserves empty search_path, tenant guards, and anon execute grants', () => {
  const sql = fs.readFileSync(migration251Path, 'utf8');

  assert.ok(sql.includes("SET search_path = ''"), 'Must enforce SET search_path = empty');
  assert.ok(sql.includes('is_canonical_public = TRUE'), 'Must enforce canonical tenant guard');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;'));
});

test('7. Live database validation of hardened booking & inquiry anti-abuse guards (if credentials available)', async () => {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;

  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  envContent.split('\n').forEach((line) => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  });

  if (
    !env.NEXT_PUBLIC_SUPABASE_URL ||
    !env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') ||
    env.NEXT_PUBLIC_SUPABASE_URL.includes('ci-hermetic') ||
    !env.NEXT_PUBLIC_SUPABASE_URL.startsWith('https://')
  ) {
    console.log('Skipping live DB check: Hermetic CI environment or placeholder credentials detected');
    return;
  }

  const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // A. Non-canonical organization must be rejected with 403
  const { data: nonCanonicalRes } = await anonClient.rpc('book_online_appointment', {
    p_org_id: NON_CANONICAL_ORG_ID,
    p_doctor_id: '00000000-0000-0000-0000-000000000000',
    p_schedule_id: '00000000-0000-0000-0000-000000000000',
    p_appointment_date: '2026-10-25',
    p_patient_name: 'Synthetic Test',
    p_patient_phone: '01711111111',
  });
  if (nonCanonicalRes) {
    const parsed = typeof nonCanonicalRes === 'string' ? JSON.parse(nonCanonicalRes) : nonCanonicalRes;
    assert.equal(parsed.success, false, 'Non-canonical org must be rejected by book_online_appointment');
    assert.match(parsed.error, /403 Forbidden/, 'Must return 403 Forbidden error');
  }

  // B. Past-date booking must be rejected
  const { data: pastDateRes } = await anonClient.rpc('book_online_appointment', {
    p_org_id: CANONICAL_ORG_ID,
    p_doctor_id: '00000000-0000-0000-0000-000000000000',
    p_schedule_id: '00000000-0000-0000-0000-000000000000',
    p_appointment_date: '2020-01-01',
    p_patient_name: 'Synthetic Test',
    p_patient_phone: '01711111111',
  });
  if (pastDateRes) {
    const parsed = typeof pastDateRes === 'string' ? JSON.parse(pastDateRes) : pastDateRes;
    assert.equal(parsed.success, false);
    assert.match(parsed.error, /Cannot book appointments for past dates/i);
  }

  // C. Invalid Bangladeshi phone format must be rejected
  const { data: badPhoneRes } = await anonClient.rpc('book_online_appointment', {
    p_org_id: CANONICAL_ORG_ID,
    p_doctor_id: '00000000-0000-0000-0000-000000000000',
    p_schedule_id: '00000000-0000-0000-0000-000000000000',
    p_appointment_date: '2026-10-25',
    p_patient_name: 'Synthetic Test',
    p_patient_phone: '12345',
  });
  if (badPhoneRes) {
    const parsed = typeof badPhoneRes === 'string' ? JSON.parse(badPhoneRes) : badPhoneRes;
    assert.equal(parsed.success, false);
    assert.match(parsed.error, /Invalid phone format/i);
  }

  // D. Contact inquiry invalid phone format must be rejected
  const { data: badContactRes } = await anonClient.rpc('submit_public_contact_inquiry', {
    p_org_id: CANONICAL_ORG_ID,
    p_name: 'Valid Name',
    p_phone: '000',
    p_message: 'This is a valid length test message for hospital contact.',
  });
  if (badContactRes) {
    const parsed = typeof badContactRes === 'string' ? JSON.parse(badContactRes) : badContactRes;
    assert.equal(parsed.success, false);
    assert.match(parsed.error, /valid 11-digit Bangladeshi mobile number/i);
  }
});
