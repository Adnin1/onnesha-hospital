import { createClient } from "@supabase/supabase-js";

const routes = [
  '/',
  '/login',
  '/appointment',
  '/doctors',
  '/check-token',
  '/services',
  '/about',
  '/contact',
  '/app/dashboard',
  '/app/billing',
  '/app/patients',
  '/app/appointments',
  '/app/ot',
  '/app/hr',
  '/app/settings'
];

const base = 'https://onnesha-hospital.pages.dev';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iuhtzahuszdkdarhxobx.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_OPiG-7uhoIlnysXKrpErsw_rdXEJ4rs';

async function runProductionSmokeTests() {
  console.log('============================================================');
  console.log('OHMS DUAL-LAYER PRODUCTION RUNTIME & SECURITY SMOKE SUITE');
  console.log('Target Host: ' + base);
  console.log('Target Database: ' + supabaseUrl);
  console.log('============================================================\n');

  // LAYER A: Route Reachability & Static Shell Integrity
  console.log('--- LAYER A: Production Route HTTP Reachability ---');
  let layerAPassed = 0;
  for (const r of routes) {
    try {
      const res = await fetch(base + r, { redirect: 'manual' });
      const ok = res.status === 200;
      console.log(`  [${ok ? '✓' : '✗'}] ${r.padEnd(20)} HTTP ${res.status}`);
      if (ok) layerAPassed++;
    } catch (e) {
      console.error(`  [✗] ${r.padEnd(20)} ERROR: ${e.message}`);
    }
  }

  console.log(`\nLayer A Result: ${layerAPassed}/${routes.length} routes reachable.\n`);
  if (layerAPassed !== routes.length) {
    console.error('❌ Layer A Failed: Some routes returned non-200 status.');
    process.exit(1);
  }

  // LAYER B: Forensic Static Export Data Leakage Inspection
  console.log('--- LAYER B: Static Shell Data Leakage Inspection ---');
  const privateRoutes = ['/app/dashboard', '/app/patients', '/app/billing', '/app/settings'];
  let layerBLeakChecks = 0;

  for (const pr of privateRoutes) {
    try {
      const res = await fetch(base + pr);
      const text = await res.text();

      // Ensure no private credentials or live PHI leaked into static HTML
      const hasSecretLeak = text.includes('SERVICE_ROLE_KEY') || text.includes('sb_secret_');
      const hasPatientLeak = /blood_group|medical_history|diagnosis_code/i.test(text);

      if (hasSecretLeak || hasPatientLeak) {
        console.error(`  [✗] ${pr.padEnd(20)} FAILED: Sensitive tokens/PHI detected in static HTML!`);
      } else {
        console.log(`  [✓] ${pr.padEnd(20)} Clean: Zero PHI or secret credentials in unauthenticated shell`);
        layerBLeakChecks++;
      }
    } catch (e) {
      console.error(`  [✗] ${pr.padEnd(20)} Fetch error: ${e.message}`);
    }
  }

  // LAYER C: Live Database RLS & API Data Shielding
  console.log('\n--- LAYER C: Live Database RLS & PostgREST Data Shielding ---');
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  let rlsChecksPassed = 0;

  // 1. Private Patients table read attempt
  const { data: pData, error: pErr } = await anonClient.from('patients').select('id, full_name').limit(5);
  if ((!pErr && (!pData || pData.length === 0)) || (pErr && /violates row-level security|permission denied/i.test(pErr.message))) {
    console.log('  [✓] RLS patients table:       Shielded (0 records accessible anonymously)');
    rlsChecksPassed++;
  } else {
    console.error('  [✗] RLS patients table:       LEAK! Returned data to anonymous caller:', pData);
  }

  // 2. Private Invoices table read attempt
  const { data: iData, error: iErr } = await anonClient.from('invoices').select('id, invoice_number').limit(5);
  if ((!iErr && (!iData || iData.length === 0)) || (iErr && /violates row-level security|permission denied/i.test(iErr.message))) {
    console.log('  [✓] RLS invoices table:       Shielded (0 records accessible anonymously)');
    rlsChecksPassed++;
  } else {
    console.error('  [✗] RLS invoices table:       LEAK! Returned data to anonymous caller:', iData);
  }

  // 3. Organization Integrations credentials read attempt
  const { data: intData, error: intErr } = await anonClient.from('organization_integrations').select('encrypted_credentials').limit(5);
  if ((!intErr && (!intData || intData.length === 0)) || (intErr && /violates row-level security|permission denied/i.test(intErr.message))) {
    console.log('  [✓] RLS integrations table:   Shielded (0 secret credentials accessible)');
    rlsChecksPassed++;
  } else {
    console.error('  [✗] RLS integrations table:   LEAK! Returned data to anonymous caller:', intData);
  }

  // 4. Online payment settlement RPC execution attempt
  const { error: rpcErr } = await anonClient.rpc('verify_and_record_online_payment', {
    p_org_id: 'a0000000-0000-0000-0000-000000000001',
    p_intent_id: 'd0000000-0000-0000-0000-000000000001',
    p_provider_trx_id: 'HACK',
    p_paid_amount: 100,
    p_gateway_method: 'BKASH'
  });
  if (rpcErr && /permission denied|not found/i.test(rpcErr.message)) {
    console.log('  [✓] Settlement RPC execute:   Forbidden to anonymous / client callers');
    rlsChecksPassed++;
  } else {
    console.error('  [✗] Settlement RPC execute:   FAILED: Anonymous caller was not denied execute!');
  }

  console.log(`\n============================================================`);
  console.log(`DUAL-LAYER PRODUCTION VERIFICATION SUMMARY:`);
  console.log(`  • Layer A (Routes 200 OK):     ${layerAPassed}/${routes.length} PASSED`);
  console.log(`  • Layer B (Shell Data Safety): ${layerBLeakChecks}/${privateRoutes.length} PASSED`);
  console.log(`  • Layer C (RLS & RPC Shield):  ${rlsChecksPassed}/4 PASSED`);
  console.log(`============================================================\n`);

  if (layerAPassed === routes.length && layerBLeakChecks === privateRoutes.length && rlsChecksPassed === 4) {
    console.log('🎉 ALL PRODUCTION SANITY & SECURITY GATES PASSED.');
  } else {
    console.error('❌ SOME GATES FAILED.');
    process.exit(1);
  }
}

runProductionSmokeTests();
