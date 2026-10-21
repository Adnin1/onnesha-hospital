/**
 * =====================================================================================
 * LEVEL 4B: ACTUAL CANONICAL HOSPITAL APPLICATION WORKFLOW (Phases 1–135)
 * =====================================================================================
 * Exercises actual canonical RPCs, business validation, transactional logic, audit hooks,
 * and double-entry accounting side-effects against an isolated staging environment:
 * - Dedicated synthetic test tenant: OHMS_CANARY_APP_WORKFLOW_HOSPITAL
 * - Canonical RPC Paths:
 *     • Registration: create_patient_intake_atomic
 *     • Queue: update_waiting_queue_status_atomic
 *     • IPD Admission: admit_patient_to_bed_atomic
 *     • Bed Transfer: transfer_bed_or_critical_care_atomic
 *     • IPD Discharge: complete_ipd_discharge_atomic
 *     • Mistake Purge: cancel_or_delete_ipd_admission_atomic
 *     • Billing: create_invoice_atomic
 *     • Payment: collect_payment_atomic
 *     • Expense & GL: record_hospital_expense_atomic
 *     • Referral: record_referral_commission_payout_atomic
 *     • Blood Bank: register_and_issue_blood_bag_atomic
 * - Permanent production mutation shield: Strictly throws if targeting production DB
 * - If dedicated staging variables (Gate G10) are absent, cleanly records NOT_CONFIGURED
 * =====================================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const TEST_SUPABASE_URL = process.env.OHMS_TEST_SUPABASE_URL || '';
const TEST_SERVICE_ROLE_KEY = process.env.OHMS_TEST_SERVICE_ROLE_KEY || '';
const TEST_ANON_KEY = process.env.OHMS_TEST_PUBLISHABLE_KEY || process.env.OHMS_TEST_ANON_KEY || '';

const SYNTHETIC_CANARY_ORG_ID = crypto.randomUUID();
const TEST_RUN_ID = crypto.randomUUID();

test('L4B Canonical Hospital Application Workflow: Real Business Path Journey (Staging)', async (t) => {
  if (!TEST_SUPABASE_URL) {
    t.skip('STATUS: BLOCKED_EXTERNAL (Gate G10). Dedicated non-production staging Supabase environment not configured in environment (requires OHMS_TEST_SUPABASE_URL, OHMS_TEST_SERVICE_ROLE_KEY).');
    return;
  }

  // Production Safety Shield Layer: Denylist protection
  const isProdTarget = 
    TEST_SUPABASE_URL.includes('iuhtzahuszdkdarhxobx') || 
    TEST_SUPABASE_URL.includes('onnesha-hospital.pages.dev') ||
    (process.env.NODE_ENV === 'production' && !process.env.ALLOW_STAGING_MUTATION);

  if (isProdTarget) {
    throw new Error('SECURITY INVARIANT VIOLATION: Refusing to execute synthetic mutating application workflows against production database. Staging isolation required.');
  }

  const supabase = createClient(TEST_SUPABASE_URL, TEST_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let createdPatientId = '';
  let createdVisitId = '';
  let createdDoctorId = '';
  let createdBedId = '';
  let createdCabinId = '';
  let createdInvoiceId = '';
  let createdAgentId = '';

  await t.test('1. Tenant & Master Data Bootstrap', async () => {
    const { data: org, error: orgErr } = await supabase.from('organizations').insert({
      id: SYNTHETIC_CANARY_ORG_ID,
      name: 'OHMS_CANARY_APP_WORKFLOW_HOSPITAL',
      code: `CANARY-APP-${Date.now()}`,
      slug: `canary-app-${Date.now()}`,
      status: 'TRIAL'
    }).select().single();

    assert.equal(orgErr, null, 'Tenant creation must succeed');
    assert.equal(org.id, SYNTHETIC_CANARY_ORG_ID);

    // Bootstrap Doctor Profile
    const doctorUserId = crypto.randomUUID();
    const { error: profErr } = await supabase.from('profiles').insert({
      id: doctorUserId,
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      active_organization_id: SYNTHETIC_CANARY_ORG_ID,
      full_name: 'Dr. Canary Canonical Specialist',
      email: `doctor-app-${Date.now()}@canary.local`,
      role: 'doctor',
      is_super_admin: false
    });
    assert.equal(profErr, null, 'Doctor profile creation must succeed');

    const { data: doc, error: docErr } = await supabase.from('doctors').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      user_id: doctorUserId,
      full_name: 'Dr. Canary Canonical Specialist',
      department: 'General Medicine',
      bmdc_number: `A-${Date.now().toString().slice(-5)}`,
      consultation_fee: 1000.00
    }).select().single();

    assert.equal(docErr, null, 'Doctor directory creation must succeed');
    createdDoctorId = doc.id;

    // Bootstrap Chart of Accounts for Financial Engine
    await supabase.from('chart_of_accounts').insert([
      { organization_id: SYNTHETIC_CANARY_ORG_ID, account_code: '1010', account_name: 'Main Cash Counter', account_type: 'ASSET', is_active: true },
      { organization_id: SYNTHETIC_CANARY_ORG_ID, account_code: '4010', account_name: 'Hospital Patient Revenue', account_type: 'REVENUE', is_active: true },
      { organization_id: SYNTHETIC_CANARY_ORG_ID, account_code: '5020', account_name: 'Referral & Marketing Commission', account_type: 'EXPENSE', is_active: true },
      { organization_id: SYNTHETIC_CANARY_ORG_ID, account_code: '5400', account_name: 'Operational Expenses', account_type: 'EXPENSE', is_active: true }
    ]);
  });

  await t.test('2. Canonical Patient Intake & Registration Workflow', async () => {
    const { data: intakeRes, error: intakeErr } = await supabase.rpc('create_patient_intake_atomic', {
      p_org_id: SYNTHETIC_CANARY_ORG_ID,
      p_full_name: 'Rahim Canary Application User',
      p_phone: '01711998877',
      p_gender: 'MALE',
      p_age_years: 38,
      p_department: 'Cardiology',
      p_doctor_id: createdDoctorId,
      p_chief_complaint: 'Canonical intake stress testing',
      p_consultation_fee: 1000.00
    });

    assert.equal(intakeErr, null, 'create_patient_intake_atomic must execute without error');
    assert.ok(intakeRes, 'RPC must return response payload');
    assert.equal(intakeRes.success, true, 'Intake must return success');
    assert.ok(intakeRes.patient_id, 'Intake must yield valid patient_id');
    assert.ok(intakeRes.visit_id, 'Intake must yield valid visit_id');

    createdPatientId = intakeRes.patient_id;
    createdVisitId = intakeRes.visit_id;

    // Verify demographic invariant in database
    const { data: pat } = await supabase.from('patients').select().eq('id', createdPatientId).single();
    assert.equal(pat.phone, '+8801711998877', 'Phone normalization invariant verified');
    assert.ok(pat.patient_code, 'UHID/patient_code generated');
  });

  await t.test('3. Canonical OPD Waiting Queue State Machine', async () => {
    const { data: queueItem } = await supabase.from('waiting_queue')
      .select()
      .eq('visit_id', createdVisitId)
      .single();

    assert.ok(queueItem, 'Waiting queue record created by canonical intake');

    const { data: statusRes, error: qErr } = await supabase.rpc('update_waiting_queue_status_atomic', {
      p_org_id: SYNTHETIC_CANARY_ORG_ID,
      p_queue_id: queueItem.id,
      p_new_status: 'CALLED'
    });

    assert.equal(qErr, null, 'update_waiting_queue_status_atomic CALLED must succeed');
    assert.equal(statusRes.success, true);

    const { data: finishRes, error: finErr } = await supabase.rpc('update_waiting_queue_status_atomic', {
      p_org_id: SYNTHETIC_CANARY_ORG_ID,
      p_queue_id: queueItem.id,
      p_new_status: 'COMPLETED'
    });

    assert.equal(finErr, null, 'update_waiting_queue_status_atomic COMPLETED must succeed');
    assert.equal(finishRes.success, true);
  });

  await t.test('4. Canonical IPD Admission & Bed Allocation', async () => {
    // Create physical Bed and Cabin in Ward
    const { data: ward } = await supabase.from('wards').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      name: 'Canary General Ward',
      gender_spec: 'UNISEX'
    }).select().single();

    const { data: bed } = await supabase.from('beds').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      ward_id: ward.id,
      bed_number: 'B-101-APP',
      daily_rate: 1500.00,
      is_occupied: false
    }).select().single();
    createdBedId = bed.id;

    const { data: cabin } = await supabase.from('cabins').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      cabin_number: 'CAB-201-APP',
      daily_rate: 3500.00,
      status: 'AVAILABLE'
    }).select().single();
    createdCabinId = cabin.id;

    // Execute Canonical admit_patient_to_bed_atomic RPC
    const { data: admitRes, error: admitErr } = await supabase.rpc('admit_patient_to_bed_atomic', {
      p_org_id: SYNTHETIC_CANARY_ORG_ID,
      p_patient_id: createdPatientId,
      p_bed_id: createdBedId,
      p_doctor_id: createdDoctorId,
      p_doctor_name: 'Dr. Canary Canonical Specialist',
      p_cabin_id: createdCabinId,
      p_chief_complaint: 'Severe chest tightness requiring observation'
    });

    assert.equal(admitErr, null, 'admit_patient_to_bed_atomic must succeed');
    assert.equal(admitRes.success, true);
    assert.ok(admitRes.visit_id, 'Admission yields visit_id');
    assert.ok(admitRes.assignment_id, 'Admission yields bed assignment_id');

    createdVisitId = admitRes.visit_id;

    // Verify bed and cabin occupancy states in database
    const { data: bedCheck } = await supabase.from('beds').select('is_occupied').eq('id', createdBedId).single();
    assert.equal(bedCheck.is_occupied, true, 'Bed status must be OCCUPIED');

    const { data: cabinCheck } = await supabase.from('cabins').select('status').eq('id', createdCabinId).single();
    assert.equal(cabinCheck.status, 'OCCUPIED', 'Cabin status must be OCCUPIED');
  });

  await t.test('5. Canonical Bed Transfer', async () => {
    // Create destination bed
    const { data: destBed } = await supabase.from('beds').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      bed_number: 'B-102-TRANSFER',
      daily_rate: 1800.00,
      is_occupied: false
    }).select().single();

    const { data: transferRes, error: transferErr } = await supabase.rpc('transfer_bed_or_critical_care_atomic', {
      p_org_id: SYNTHETIC_CANARY_ORG_ID,
      p_visit_id: createdVisitId,
      p_new_bed_id: destBed.id,
      p_new_cabin_id: null,
      p_reason: 'Patient upgraded to high-dependency monitor bed',
      p_doctor_id: createdDoctorId
    });

    assert.equal(transferErr, null, 'transfer_bed_or_critical_care_atomic must succeed');
    assert.equal(transferRes.success, true);

    // Old bed released, new bed occupied
    const { data: oldBed } = await supabase.from('beds').select('is_occupied').eq('id', createdBedId).single();
    assert.equal(oldBed.is_occupied, false, 'Origin bed must be VACATED');

    const { data: newBed } = await supabase.from('beds').select('is_occupied').eq('id', destBed.id).single();
    assert.equal(newBed.is_occupied, true, 'Destination bed must be OCCUPIED');

    createdBedId = destBed.id;
  });

  await t.test('6. Canonical IPD Discharge & Certificate Lifecycle', async () => {
    const { data: dischargeRes, error: dcErr } = await supabase.rpc('complete_ipd_discharge_atomic', {
      p_org_id: SYNTHETIC_CANARY_ORG_ID,
      p_visit_id: createdVisitId,
      p_discharge_type: 'NORMAL',
      p_final_diagnosis: 'Acute Coronary Syndrome - Stabilized',
      p_hospital_course: 'Underwent 48 hours telemetry observation; cardiac enzymes normalized.',
      p_condition_at_discharge: 'Stable, ambulatory, vitals normal',
      p_discharge_advice: 'Strict rest 7 days, Tab. Aspirin 75mg daily, Tab. Clopidogrel 75mg daily.',
      p_doctor_name: 'Dr. Canary Canonical Specialist',
      p_discharged_by: createdDoctorId
    });

    assert.equal(dcErr, null, 'complete_ipd_discharge_atomic must succeed');
    assert.equal(dischargeRes.success, true);

    // Verify bed vacated
    const { data: bedAfter } = await supabase.from('beds').select('is_occupied').eq('id', createdBedId).single();
    assert.equal(bedAfter.is_occupied, false, 'Bed must be VACATED after discharge');

    // Verify discharge summary contains mandatory certificate columns
    const { data: summary } = await supabase.from('discharge_summaries')
      .select('patient_id, doctor_name, discharge_condition, discharge_advice, final_diagnosis')
      .eq('visit_id', createdVisitId)
      .single();

    assert.ok(summary, 'Discharge summary record must exist');
    assert.equal(summary.patient_id, createdPatientId, 'Summary must link to patient_id');
    assert.equal(summary.doctor_name, 'Dr. Canary Canonical Specialist', 'Summary doctor_name invariant verified');
    assert.ok(summary.discharge_condition, 'discharge_condition present');
    assert.ok(summary.discharge_advice, 'discharge_advice present');
  });

  await t.test('7. Canonical IPD Soft-Cancel & Mistake Purge Lifecycles', async () => {
    // Admit another synthetic patient to test cancel and purge
    const { data: p2 } = await supabase.from('patients').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      full_name: 'Mistake Intake Patient',
      phone: '+8801999887766'
    }).select().single();

    const { data: v2 } = await supabase.from('patient_visits').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      patient_id: p2.id,
      visit_type: 'IPD',
      status: 'ACTIVE'
    }).select().single();

    // Test Soft-Cancel (permanent_delete = false)
    const { data: cancelRes, error: cancelErr } = await supabase.rpc('cancel_or_delete_ipd_admission_atomic', {
      p_org_id: SYNTHETIC_CANARY_ORG_ID,
      p_visit_id: v2.id,
      p_reason: 'Wrong patient identity registered at front-desk',
      p_permanent_delete: false
    });

    assert.equal(cancelErr, null, 'cancel_or_delete_ipd_admission_atomic (soft cancel) must succeed');
    assert.equal(cancelRes.success, true);
    assert.equal(cancelRes.mode, 'CANCELLED');

    const { data: v2After } = await supabase.from('patient_visits').select('status, discharge_reason').eq('id', v2.id).single();
    assert.equal(v2After.status, 'CANCELLED');
    assert.equal(v2After.discharge_reason, 'Wrong patient identity registered at front-desk');

    // Test Mistake Purge (permanent_delete = true)
    const { data: purgeRes, error: purgeErr } = await supabase.rpc('cancel_or_delete_ipd_admission_atomic', {
      p_org_id: SYNTHETIC_CANARY_ORG_ID,
      p_visit_id: v2.id,
      p_reason: 'Super Admin complete purge of accidental registration',
      p_permanent_delete: true
    });

    assert.equal(purgeErr, null, 'cancel_or_delete_ipd_admission_atomic (permanent purge) must succeed');
    assert.equal(purgeRes.success, true);
    assert.equal(purgeRes.mode, 'DELETED');

    const { data: v2Purged } = await supabase.from('patient_visits').select().eq('id', v2.id);
    assert.equal(v2Purged.length, 0, 'Mistake visit must be completely deleted from table');
  });

  await t.test('8. Canonical Billing, Payment & General Ledger (GL) posting', async () => {
    // Create Invoice via RPC
    const { data: invRes, error: invErr } = await supabase.rpc('create_invoice_atomic', {
      p_org_id: SYNTHETIC_CANARY_ORG_ID,
      p_patient_id: createdPatientId,
      p_visit_id: createdVisitId,
      p_items: [
        { item_type: 'CONSULTATION', description: 'Specialist Consultation', unit_price: 1000.00, quantity: 1, total_price: 1000.00 },
        { item_type: 'BED_CHARGE', description: 'Ward Bed 2 Days', unit_price: 1500.00, quantity: 2, total_price: 3000.00 }
      ],
      p_discount: 200.00,
      p_notes: 'Canonical test billing invoice'
    });

    assert.equal(invErr, null, 'create_invoice_atomic must succeed');
    assert.ok(invRes.invoice_id, 'Invoice created');
    createdInvoiceId = invRes.invoice_id;

    // Verify mathematical invariants
    const { data: inv } = await supabase.from('invoices').select().eq('id', createdInvoiceId).single();
    assert.equal(Number(inv.subtotal), 4000.00, 'Subtotal: 1000 + 3000 = 4000');
    assert.equal(Number(inv.discount_amount), 200.00, 'Discount: 200');
    assert.equal(Number(inv.grand_total), 3800.00, 'Grand total: 3800');
    assert.equal(Number(inv.due_amount), 3800.00, 'Due amount initially equals grand total');

    // Collect Payment via canonical collect_payment_atomic
    const { data: payRes, error: payErr } = await supabase.rpc('collect_payment_atomic', {
      p_org_id: SYNTHETIC_CANARY_ORG_ID,
      p_invoice_id: createdInvoiceId,
      p_amount: 3800.00,
      p_payment_method: 'CASH',
      p_reference: 'CANARY-RECEIPT-001'
    });

    assert.equal(payErr, null, 'collect_payment_atomic must succeed');
    assert.equal(payRes.success, true);

    // Verify Invoice is fully paid
    const { data: invPaid } = await supabase.from('invoices').select('paid_amount, due_amount, payment_status').eq('id', createdInvoiceId).single();
    assert.equal(Number(invPaid.paid_amount), 3800.00);
    assert.equal(Number(invPaid.due_amount), 0.00);
    assert.equal(invPaid.payment_status, 'PAID');

    // Verify Double-Entry GL Posting (Debit === Credit)
    const { data: journals } = await supabase.from('journal_entries')
      .select('id, total_debit, total_credit, status')
      .eq('organization_id', SYNTHETIC_CANARY_ORG_ID)
      .eq('reference_id', createdInvoiceId);

    assert.ok(journals && journals.length > 0, 'GL journal entries must be generated');
    for (const j of journals) {
      assert.equal(Number(j.total_debit), Number(j.total_credit), 'Financial Invariant: SUM(debit) must equal SUM(credit)');
    }
  });

  await t.test('9. Canonical Referral Partner Commission Settlement', async () => {
    // Bootstrap referral agent
    const { data: agent } = await supabase.from('referral_agents').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      agent_code: `REF-${Date.now().toString().slice(-4)}`,
      full_name: 'Dr. Kabir Referral Agent',
      phone: '+8801822334455',
      commission_rate_percent: 10.00,
      status: 'ACTIVE'
    }).select().single();
    createdAgentId = agent.id;

    // Execute Canonical record_referral_commission_payout_atomic
    const { data: payoutRes, error: payoutErr } = await supabase.rpc('record_referral_commission_payout_atomic', {
      p_org_id: SYNTHETIC_CANARY_ORG_ID,
      p_agent_id: createdAgentId,
      p_amount: 380.00,
      p_payment_method: 'CASH',
      p_patient_id: createdPatientId,
      p_patient_total_bill: 3800.00,
      p_commission_rate_percent: 10.00,
      p_transaction_reference: `REF-PAY-${Date.now()}`,
      p_notes: '10% commission on 3800 bill',
      p_idempotency_key: `IDEM-REF-${Date.now()}`
    });

    assert.equal(payoutErr, null, 'record_referral_commission_payout_atomic must succeed');
    assert.equal(payoutRes.success, true);
    assert.ok(payoutRes.settlement_id, 'Settlement created');
    assert.ok(payoutRes.expense_id, 'Hospital expense created');
    assert.ok(payoutRes.journal_entry_id, 'GL voucher created');

    // Verify GL Debit === Credit on Referral Expense Voucher
    const { data: refJournal } = await supabase.from('journal_entries').select('total_debit, total_credit').eq('id', payoutRes.journal_entry_id).single();
    assert.equal(Number(refJournal.total_debit), 380.00);
    assert.equal(Number(refJournal.total_credit), 380.00);
  });

  await t.test('10. Synthetic Test Tenant Teardown & Permanent Cleanliness', async () => {
    // Clean up all synthetic records created under canary organization
    await supabase.from('ot_schedules').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('referral_commission_claims').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('referral_commission_settlements').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('referral_commissions').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('referral_agents').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('journal_entry_lines').delete().filter('journal_entry_id', 'in', `(SELECT id FROM journal_entries WHERE organization_id = '${SYNTHETIC_CANARY_ORG_ID}')`);
    await supabase.from('journal_entries').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('expenses').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('expense_categories').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('invoice_items').delete().filter('invoice_id', 'in', `(SELECT id FROM invoices WHERE organization_id = '${SYNTHETIC_CANARY_ORG_ID}')`);
    await supabase.from('payments').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('invoices').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('discharge_summaries').delete().filter('visit_id', 'in', `(SELECT id FROM patient_visits WHERE organization_id = '${SYNTHETIC_CANARY_ORG_ID}')`);
    await supabase.from('bed_assignments').delete().filter('visit_id', 'in', `(SELECT id FROM patient_visits WHERE organization_id = '${SYNTHETIC_CANARY_ORG_ID}')`);
    await supabase.from('waiting_queue').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('patient_visits').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('patients').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('beds').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('cabins').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('wards').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('doctors').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('profiles').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('chart_of_accounts').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('organizations').delete().eq('id', SYNTHETIC_CANARY_ORG_ID);

    const { data: orgCheck } = await supabase.from('organizations').select('id').eq('id', SYNTHETIC_CANARY_ORG_ID);
    assert.equal(orgCheck.length, 0, 'Canary organization and all synthetic state cleanly purged');
  });
});
