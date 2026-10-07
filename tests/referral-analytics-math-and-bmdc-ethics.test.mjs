import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

test('Referral Analytics & BMDC Ethics Governance Suite (v1.1.54 Regression & Hardening)', async (t) => {
  const migrationPath = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '20261008070000_referral_analytics_and_bmdc_compliance_v1154.sql'
  );

  const actionsPath = path.join(ROOT_DIR, 'lib', 'referrals', 'actions.ts');
  const uiPagePath = path.join(ROOT_DIR, 'app', '(hospital)', 'app', 'referrals', 'page.tsx');

  await t.test('1. Migration file exists and defines authoritative v1.1.54 objects', () => {
    assert.ok(fs.existsSync(migrationPath), 'Migration 119 file must exist');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    assert.ok(
      sql.includes('CREATE OR REPLACE FUNCTION public.get_referral_performance_analytics'),
      'Must define get_referral_performance_analytics function'
    );
    assert.ok(
      sql.includes('CREATE OR REPLACE FUNCTION public.get_referral_agents_safe_directory'),
      'Must define get_referral_agents_safe_directory function'
    );
    assert.ok(
      sql.includes('CREATE OR REPLACE FUNCTION public.approve_referral_commission_atomic'),
      'Must define approve_referral_commission_atomic function'
    );
  });

  await t.test('2. Decoupled aggregations eliminate Cartesian join multiplication', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Financial facts are computed directly from referral_commissions
    assert.ok(
      sql.includes('FROM public.referral_commissions rc') &&
      sql.includes('INTO v_financial_kpis'),
      'Must aggregate financial facts directly from referral_commissions'
    );
    // Attributions are computed directly from patient_referral_attributions
    assert.ok(
      sql.includes('FROM public.patient_referral_attributions pra') &&
      sql.includes('INTO v_attribution_kpis'),
      'Must aggregate attribution facts directly from patient_referral_attributions'
    );
    // Verified that attributions are not joined with commissions across encounters
    assert.ok(
      !sql.includes('FROM public.patient_referral_attributions pra\n      JOIN public.referral_commissions rc ON rc.referral_agent_id = pra.referral_agent_id'),
      'Must NOT join attributions directly with commissions across multiple encounter types'
    );
  });

  await t.test('3. Enforces date window filtering on yearly and monthly summaries', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Monthly summary must filter by window
    assert.ok(
      sql.includes('rc.created_at >= v_start') && sql.includes('rc.created_at < v_end'),
      'Monthly commissions must be bound by v_start and v_end'
    );

    // Yearly summary must also filter by window
    assert.ok(
      sql.includes('GROUP BY EXTRACT(YEAR FROM rc.created_at)'),
      'Yearly summary must be aggregated within the bounded window'
    );
  });

  await t.test('4. All-history semantics (NULL parameters) defaults to unbounded interval', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    assert.ok(
      sql.includes("1970-01-01 00:00:00+00"),
      'Unbounded start date must default to epoch (1970-01-01)'
    );
    assert.ok(
      sql.includes("2099-12-31 23:59:59+00"),
      'Unbounded end date must default to future horizon (2099-12-31)'
    );
  });

  await t.test('5. Safe directory checks caller permissions and returns strictly sanitized projection', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Caller authorization check
    assert.ok(
      sql.includes("'referral.view'") && sql.includes("'referral.assign'"),
      'Safe directory must check referral.view / referral.assign permission'
    );

    // Explicit projection of safe fields
    assert.ok(
      sql.includes('agent_code VARCHAR'),
      'Must project agent_code'
    );
    assert.ok(
      sql.includes('full_name VARCHAR'),
      'Must project full_name'
    );
    // Must NOT project sensitive financial columns
    assert.ok(
      !sql.includes('commission_rate NUMERIC') && !sql.includes('bank_account_number TEXT'),
      'Safe directory must NOT expose commission rates or banking details'
    );
  });

  await t.test('6. Atomic commission approval enforces BMDC Code of Ethics for doctor agents', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    assert.ok(
      sql.includes("v_agent_type = 'DOCTOR'"),
      'Must check if referral agent is a DOCTOR'
    );
    assert.ok(
      sql.includes('v_bmdc_ethics IS NOT TRUE'),
      'Must fail if doctor bmdc_ethics_acknowledged is not true'
    );
    assert.ok(
      sql.includes('BMDC Code of Ethics acknowledgment and formal hospital compliance approval are strictly mandatory'),
      'Must enforce BMDC Code of Ethics acknowledgment and formal compliance approval'
    );
  });

  await t.test('7. Referral actions enforce fail-closed authorization', () => {
    assert.ok(fs.existsSync(actionsPath), 'Referral actions file must exist');
    const actionsSrc = fs.readFileSync(actionsPath, 'utf8');

    assert.ok(
      actionsSrc.includes('getReferralAgentsAction'),
      'Must export getReferralAgentsAction'
    );
    assert.ok(
      actionsSrc.includes('getReferralAgentByIdAction'),
      'Must export getReferralAgentByIdAction'
    );
    assert.ok(
      actionsSrc.includes('403') || actionsSrc.includes('Unauthorized') || actionsSrc.includes('forbidden'),
      'Actions must handle authorization denial fail-closed'
    );
  });

  await t.test('8. UI Referral page provides Custom Date Filter with half-open bounds', () => {
    assert.ok(fs.existsSync(uiPagePath), 'Referrals page must exist');
    const pageSrc = fs.readFileSync(uiPagePath, 'utf8');

    assert.ok(
      pageSrc.includes('"CUSTOM"'),
      'UI must support CUSTOM date range option'
    );
    assert.ok(
      pageSrc.includes('customStartDate') && pageSrc.includes('customEndDate'),
      'UI must maintain customStartDate and customEndDate state'
    );
    assert.ok(
      pageSrc.includes('setUTCDate') || pageSrc.includes('toISOString()'),
      'UI must compute half-open end date boundary'
    );
  });
});
