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

// Load .env.local if available and neither key is set in process.env
if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}
// Prefer modern publishable key (Supabase 2026); fall back to legacy anon key
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function runProductionSmokeTests() {
  console.log('============================================================');
  console.log('OHMS FOUR-LAYER PRODUCTION RUNTIME & SECURITY SMOKE SUITE');
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

  // LAYER B: Static Shell Data Leakage Inspection
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

  // LAYER C: Live Database Table PostgREST Shielding (Read & Write)
  console.log('\n--- LAYER C: Live Database Table PostgREST Shielding ---');
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  let layerCPassed = 0;

  // 1. Private Patients table read attempt
  const { data: pData, error: pErr } = await anonClient.from('patients').select('id, full_name').limit(5);
  if (!pErr && Array.isArray(pData) && pData.length === 0) {
    console.log('  [✓] Table Read: patients        Shielded (0 records accessible anonymously)');
    layerCPassed++;
  } else {
    console.error('  [✗] Table Read: patients        LEAK! Returned data to anonymous caller:', pData);
  }

  // 2. Private Invoices table read attempt
  const { data: iData, error: iErr } = await anonClient.from('invoices').select('id, invoice_number').limit(5);
  if (!iErr && Array.isArray(iData) && iData.length === 0) {
    console.log('  [✓] Table Read: invoices        Shielded (0 records accessible anonymously)');
    layerCPassed++;
  } else {
    console.error('  [✗] Table Read: invoices        LEAK! Returned data to anonymous caller:', iData);
  }

  // 3. Organization Integrations credentials read attempt
  const { data: intData, error: intErr } = await anonClient.from('organization_integrations').select('encrypted_credentials').limit(5);
  const isIntShielded = (!intErr && Array.isArray(intData) && intData.length === 0) || (intErr && (intErr.code === '42501' || /permission denied/i.test(intErr.message)));
  if (isIntShielded) {
    console.log('  [✓] Table Read: integrations    Shielded (0 secret credentials accessible / permission denied)');
    layerCPassed++;
  } else {
    console.error('  [✗] Table Read: integrations    LEAK! Returned data or unshielded state:', intErr || intData);
  }

  // 4. Production mutation is intentionally not attempted.
  // Authenticated INSERT/UPDATE/DELETE isolation is covered only by the disposable staging suite.
  console.log('  [✓] Table Write: patients       NOT MUTATED (staging suite owns write-authorization testing)');

  // LAYER D: PostgREST RPC Endpoint Access Control
  console.log('\n--- LAYER D: PostgREST RPC Endpoint Access Control ---');
  let layerDPassed = 0;

  // 1. Online payment settlement RPC execution attempt (restricted to service_role)
  const { error: rpcErr } = await anonClient.rpc('verify_and_record_online_payment', {
    p_org_id: 'a0000000-0000-0000-0000-000000000001',
    p_intent_id: 'd0000000-0000-0000-0000-000000000001',
    p_provider_trx_id: 'HACK',
    p_paid_amount: 100,
    p_gateway_method: 'BKASH'
  });
  if (rpcErr && /permission denied|not found/i.test(rpcErr.message)) {
    console.log('  [✓] RPC: verify_and_record_online_payment  Forbidden to anonymous / client callers');
    layerDPassed++;
  } else {
    console.error('  [✗] RPC: verify_and_record_online_payment  FAILED: Caller was not denied execute!');
  }

  // 2. get_current_org_id RPC execution attempt (unexposed to client / revoked from anon)
  const { error: getOrgErr } = await anonClient.rpc('get_current_org_id');
  if (getOrgErr && /permission denied|not found/i.test(getOrgErr.message)) {
    console.log('  [✓] RPC: get_current_org_id                Forbidden / unexposed to client callers');
    layerDPassed++;
  } else {
    console.error('  [✗] RPC: get_current_org_id                FAILED: Anonymous caller was able to invoke get_current_org_id:', getOrgErr);
  }

  console.log(`\n============================================================`);
  console.log(`FOUR-LAYER PRODUCTION VERIFICATION SUMMARY:`);
  console.log(`  • Layer A (Routes 200 OK):          ${layerAPassed}/${routes.length} PASSED`);
  console.log(`  • Layer B (Shell Data Safety):      ${layerBLeakChecks}/${privateRoutes.length} PASSED`);
  console.log(`  • Layer C (Anonymous Read Shield):  ${layerCPassed}/3 PASSED`);
  console.log(`  • Layer D (RPC Endpoint Access):    ${layerDPassed}/2 PASSED`);
  console.log(`============================================================\n`);

  if (layerAPassed === routes.length && layerBLeakChecks === privateRoutes.length && layerCPassed === 3 && layerDPassed === 2) {
    console.log('✓ ALL FOUR NON-MUTATING PRODUCTION QUALITY & SECURITY LAYERS PASSED.');
  } else {
    console.error('❌ SOME GATES FAILED.');
    process.exit(1);
  }
}

runProductionSmokeTests();
