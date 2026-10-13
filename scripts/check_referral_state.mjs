import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || '';
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1]] = val;
  }
});

let serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey && fs.existsSync('.env')) {
  const rootEnv = fs.readFileSync('.env', 'utf8');
  rootEnv.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && k.trim() === 'SUPABASE_SERVICE_ROLE_KEY') serviceKey = v.join('=').trim().replace(/^["']|["']$/g, '');
  });
}
const key = serviceKey || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key);

async function check() {
  console.log("Connected to Supabase:", env.NEXT_PUBLIC_SUPABASE_URL);

  const { data: agents, error: aErr } = await supabase.from('referral_agents').select('id, agent_code, full_name, total_commission_settled, total_commission_earned');
  console.log('AGENTS:', agents, aErr);

  const { data: settlements, error: sErr } = await supabase.from('referral_commission_settlements').select('id, settlement_number, referral_agent_id, net_paid_amount, created_at, notes, payment_method');
  console.log('SETTLEMENTS:', settlements, sErr);

  const { data: commissions, error: cErr } = await supabase.from('referral_commissions').select('id, referral_agent_id, patient_id, billing_subtotal, commission_amount, amount_paid, settlement_status, approval_status, created_at');
  console.log('COMMISSIONS:', commissions, cErr);

  const { data: attributions, error: atErr } = await supabase.from('patient_referral_attributions').select('id, referral_agent_id, patient_id, assigned_at');
  console.log('ATTRIBUTIONS:', attributions, atErr);

  const { data: expenses, error: exErr } = await supabase.from('expenses').select('id, title, amount, voucher_number, status, expense_type, notes').order('created_at', { ascending: false }).limit(5);
  console.log('EXPENSES:', expenses, exErr);

  const { data: journalEntries, error: jErr } = await supabase.from('accounting_journal_entries').select('id, entry_number, entry_date, status, total_amount, description').order('created_at', { ascending: false }).limit(5);
  console.log('JOURNAL ENTRIES:', journalEntries, jErr);
}

check().catch(console.error);
