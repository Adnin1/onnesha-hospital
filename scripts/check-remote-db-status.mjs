import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log('Testing Supabase project:', env.NEXT_PUBLIC_SUPABASE_URL);

  // 1. Doctors table: updated_at check
  const { data: doctors, error: docErr } = await client
    .from('doctors')
    .select('id, full_name, updated_at')
    .limit(1);
  console.log('1. Doctors updated_at check:', docErr ? `FAILED (${docErr.message})` : 'PASSED (column exists)');
  if (doctors && doctors.length > 0) {
    console.log('   Sample row:', doctors[0]);
  }

  // 2. Bed Occupancy vs Assignments check
  const { data: beds, error: bedErr } = await client
    .from('beds')
    .select('id, bed_number, status')
    .eq('is_active', true);
  console.log('2. Beds count:', beds ? beds.length : 0, 'error:', bedErr?.message);

  const { data: assignments, error: assignErr } = await client
    .from('bed_assignments')
    .select('id, bed_id, status')
    .eq('status', 'ACTIVE');
  console.log('3. Active assignments count:', assignments ? assignments.length : 0, 'error:', assignErr?.message);

  if (beds && assignments) {
    const activeBedIds = new Set(assignments.map(a => a.bed_id).filter(Boolean));
    const occupiedWithoutAssignment = beds.filter(b => b.status === 'OCCUPIED' && !activeBedIds.has(b.id));
    const vacantWithAssignment = beds.filter(b => b.status === 'VACANT' && activeBedIds.has(b.id));

    console.log('4. Drift analysis:');
    console.log('   - OCCUPIED beds without active assignment:', occupiedWithoutAssignment.length);
    occupiedWithoutAssignment.forEach(b => console.log('     * Bed:', b.bed_number, b.id));
    console.log('   - VACANT beds with active assignment:', vacantWithAssignment.length);
    vacantWithAssignment.forEach(b => console.log('     * Bed:', b.bed_number, b.id));
  }

  // 5. Diagnostics RPC
  const { data: diag, error: diagErr } = await client.rpc('check_system_health_diagnostics');
  console.log('5. check_system_health_diagnostics RPC:');
  console.log('   - Error:', diagErr?.message || 'none');
  console.log('   - Status:', diag?.status);
  console.log('   - Health Score:', diag?.health_score);
  console.log('   - Issues Count:', diag?.issues?.length || 0);
  if (diag?.issues) {
    diag.issues.forEach(i => console.log('     * Issue:', i.id, i.severity, i.title));
  }
}

run().catch(console.error);
