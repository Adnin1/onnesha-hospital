import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'lib/referrals/actions.ts'), 'utf8');
const start = source.indexOf('export async function recordReferralCommissionPayoutAction');
const end = source.indexOf('export async function recordDiscretionaryCommissionPayoutAction', start);
assert.ok(start >= 0 && end > start, 'Canonical referral payout action must exist');
const action = source.slice(start, end);

test('Referral payout action enforces the session permission before it calls the database', () => {
  assert.match(action, /getCurrentUserSession\(\)/);
  assert.match(action, /referral\.commission\.pay/);
  assert.match(action, /referral\.manage/);
  assert.match(action, /403 Forbidden: Missing referral\.commission\.pay permission/);
  assert.ok(action.indexOf('const canPay') < action.indexOf('supabase.rpc('), 'permission gate must precede the RPC');
});

test('Referral payout action only uses the canonical atomic RPC and fails closed on RPC error', () => {
  assert.match(action, /supabase\.rpc\("record_referral_commission_payout_atomic"/);
  assert.doesNotMatch(action, /record_discretionary_referral_payout_atomic/);
  assert.doesNotMatch(action, /\.from\("referral_commission_settlements"\)\s*\.insert/);
  assert.doesNotMatch(action, /\.from\("expenses"\)\s*\.insert/);
  assert.match(action, /if \(rpcErr\)/);
  assert.match(action, /no direct-write fallback was attempted/);
});
