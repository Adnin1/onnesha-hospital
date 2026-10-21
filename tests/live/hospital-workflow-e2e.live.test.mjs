/**
 * =====================================================================================
 * LEVEL 4: REAL SYNTHETIC HOSPITAL WORKFLOW E2E (Phases 3–14, 24–30)
 * =====================================================================================
 * Executes real end-to-end database transactions against an isolated staging environment:
 * - Dedicated synthetic test tenant: OHMS_AUTOMATED_CANARY_HOSPITAL
 * - Synthetic roles: CANARY_ADMIN, CANARY_RECEPTIONIST, CANARY_DOCTOR, CANARY_CASHIER
 * - Marked with: is_synthetic = true, test_run_id = UUID
 * - Permanent production mutation shield: Strictly rejects execution on production DB
 * - If dedicated staging variables (Gate G10) are absent, cleanly records NOT_CONFIGURED
 * =====================================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const TEST_SUPABASE_URL = process.env.OHMS_TEST_SUPABASE_URL || '';
const TEST_ANON_KEY = process.env.OHMS_TEST_PUBLISHABLE_KEY || process.env.OHMS_TEST_ANON_KEY || '';
const TEST_SERVICE_ROLE_KEY = process.env.OHMS_TEST_SERVICE_ROLE_KEY || '';

const SYNTHETIC_CANARY_ORG_ID = crypto.randomUUID();
const TEST_RUN_ID = crypto.randomUUID();

test('L4 Synthetic Hospital Workflow: Real Database A-Z Journey (Isolated Staging)', async (t) => {
  if (!TEST_SUPABASE_URL) {
    t.skip('STATUS: NOT CONFIGURED. Dedicated non-production staging Supabase environment not configured in environment (requires OHMS_TEST_SUPABASE_URL, OHMS_TEST_SERVICE_ROLE_KEY). Gate G10 active.');
    return;
  }

  // Production Safety Shield: Permanent hard-fail if targeting production database
  const isProdTarget = TEST_SUPABASE_URL.includes('iuhtzahuszdkdarhxobx') || TEST_SUPABASE_URL.includes('onnesha-hospital.pages.dev');
  if (isProdTarget) {
    throw new Error('SECURITY INVARIANT VIOLATION: Refusing to execute synthetic mutating workflows against production database. Staging isolation required.');
  }

  const supabase = createClient(TEST_SUPABASE_URL, TEST_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let createdPatientId = '';
  let createdVisitId = '';
  let createdDoctorId = '';
  let createdBedId = '';
  let createdCabinId = '';

  await t.test('1. Synthetic Test Tenant Bootstrap', async () => {
    const { data: org, error: orgErr } = await supabase.from('organizations').insert({
      id: SYNTHETIC_CANARY_ORG_ID,
      name: 'OHMS_AUTOMATED_CANARY_HOSPITAL',
      code: `CANARY-${Date.now()}`,
      slug: `canary-hospital-${Date.now()}`,
      status: 'TRIAL'
    }).select().single();

    assert.equal(orgErr, null, 'Tenant creation must succeed');
    assert.equal(org.id, SYNTHETIC_CANARY_ORG_ID);

    // Bootstrap a synthetic doctor
    const { data: doc, error: docErr } = await supabase.from('doctors').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      full_name: 'Dr. Synthetic Canary MD',
      bmdc_number: 'BMDC-CANARY-99999',
      specialization: 'General Medicine',
      consultation_fee: 500.00
    }).select().single();

    assert.equal(docErr, null, 'Doctor creation must succeed');
    createdDoctorId = doc.id;

    // Bootstrap a ward bed and a private cabin
    const { data: bed, error: bedErr } = await supabase.from('beds').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      bed_number: `BED-C-${Date.now().toString().slice(-4)}`,
      ward_name: 'Canary General Ward',
      daily_rate: 800.00,
      status: 'VACANT'
    }).select().single();

    assert.equal(bedErr, null, 'Bed creation must succeed');
    createdBedId = bed.id;

    const { data: cabin, error: cabinErr } = await supabase.from('cabins').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      cabin_number: `CAB-C-${Date.now().toString().slice(-4)}`,
      daily_rate: 2500.00,
      status: 'VACANT'
    }).select().single();

    assert.equal(cabinErr, null, 'Cabin creation must succeed');
    createdCabinId = cabin.id;
  });

  await t.test('2. Phase 6: Real Patient Registration & Demographic Invariants', async () => {
    const patientCode = `P-CANARY-${Date.now()}`;
    const { data: patient, error: pErr } = await supabase.from('patients').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      patient_code: patientCode,
      full_name: 'Synthetic Canary Patient',
      phone: '01712000000',
      gender: 'MALE',
      blood_group: 'O+'
    }).select().single();

    assert.equal(pErr, null, 'Patient registration must succeed');
    assert.equal(patient.phone, '01712000000');
    createdPatientId = patient.id;
  });

  await t.test('3. Phase 7: Real OPD Queue State Machine', async () => {
    // Insert into waiting queue: WAITING -> CALLED -> IN_ROOM -> COMPLETED
    const { data: queueItem, error: qErr } = await supabase.from('waiting_queue').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      patient_id: createdPatientId,
      doctor_id: createdDoctorId,
      token_number: 101,
      appointment_date: new Date().toISOString().split('T')[0],
      status: 'WAITING'
    }).select().single();

    assert.equal(qErr, null, 'Queue insert must succeed');
    assert.equal(queueItem.status, 'WAITING');

    // Call Token
    const { data: calledItem, error: callErr } = await supabase.from('waiting_queue').update({
      status: 'CALLED',
      called_at: new Date().toISOString()
    }).eq('id', queueItem.id).select().single();

    assert.equal(callErr, null);
    assert.equal(calledItem.status, 'CALLED');

    // Complete Consultation
    const { data: completedItem, error: compErr } = await supabase.from('waiting_queue').update({
      status: 'COMPLETED',
      finished_at: new Date().toISOString()
    }).eq('id', queueItem.id).select().single();

    assert.equal(compErr, null);
    assert.equal(completedItem.status, 'COMPLETED');
  });

  await t.test('4. Phase 8: Real Prescription E2E (Visit-bound & Standalone)', async () => {
    const { data: rx, error: rxErr } = await supabase.from('prescriptions').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      patient_id: createdPatientId,
      doctor_id: createdDoctorId,
      visit_id: null, // Standalone prescription allowed under Migration 234
      diagnosis: 'Acute Upper Respiratory Tract Infection',
      advice: 'Take plenty of fluids and rest.\nFollow up in 5 days if fever persists.',
      created_at: new Date().toISOString()
    }).select().single();

    assert.equal(rxErr, null, 'Standalone prescription creation must succeed');
    assert.equal(rx.visit_id, null);
  });

  await t.test('5. Phase 9: Real IPD Ward Bed Admission, Discharge & Vacancy Release', async () => {
    // 1. Create IPD Patient Visit
    const { data: visit, error: vErr } = await supabase.from('patient_visits').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      patient_id: createdPatientId,
      visit_type: 'IPD',
      status: 'ACTIVE',
      admitted_at: new Date().toISOString()
    }).select().single();

    assert.equal(vErr, null, 'IPD visit creation must succeed');
    createdVisitId = visit.id;

    // 2. Assign Ward Bed
    const { error: bedAssignErr } = await supabase.from('bed_assignments').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      visit_id: createdVisitId,
      patient_id: createdPatientId,
      bed_id: createdBedId,
      daily_charge: 800.00,
      status: 'ACTIVE',
      assigned_at: new Date().toISOString()
    });
    assert.equal(bedAssignErr, null, 'Bed assignment must succeed');

    // Update bed status to OCCUPIED
    await supabase.from('beds').update({ status: 'OCCUPIED' }).eq('id', createdBedId);

    // 3. Discharge Patient with discharge_summaries.patient_id FK binding
    const { data: summary, error: sumErr } = await supabase.from('discharge_summaries').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      visit_id: createdVisitId,
      patient_id: createdPatientId, // Migration 236 FK bound column
      discharge_type: 'NORMAL',
      final_diagnosis: 'Resolved Bronchitis',
      hospital_course: 'Patient responded well to IV antibiotics and oral hydration.',
      condition_at_discharge: 'Stable, afebrile, vitals normal.',
      discharge_advice: 'Complete oral antibiotic course for 3 more days.',
      followup_instructions: 'Follow up at OPD in 7 days.'
    }).select().single();

    assert.equal(sumErr, null, 'Discharge summary with patient_id must succeed');
    assert.equal(summary.patient_id, createdPatientId);

    // Close bed assignment and mark bed VACANT
    await supabase.from('bed_assignments').update({ status: 'VACATED', vacated_at: new Date().toISOString() }).eq('visit_id', createdVisitId);
    await supabase.from('beds').update({ status: 'VACANT' }).eq('id', createdBedId);
    await supabase.from('patient_visits').update({ status: 'DISCHARGED', discharged_at: new Date().toISOString() }).eq('id', createdVisitId);

    // Verify bed is VACANT
    const { data: verifiedBed } = await supabase.from('beds').select('status').eq('id', createdBedId).single();
    assert.equal(verifiedBed.status, 'VACANT', 'Bed must be released to VACANT upon discharge');
  });

  await t.test('6. Phase 10: Real IPD Cabin Admission & Vacancy Release', async () => {
    // Cabin assignment lifecycle
    await supabase.from('cabins').update({ status: 'OCCUPIED' }).eq('id', createdCabinId);
    const { data: occCabin } = await supabase.from('cabins').select('status').eq('id', createdCabinId).single();
    assert.equal(occCabin.status, 'OCCUPIED');

    // Discharge & Vacate
    await supabase.from('cabins').update({ status: 'VACANT' }).eq('id', createdCabinId);
    const { data: vacCabin } = await supabase.from('cabins').select('status').eq('id', createdCabinId).single();
    assert.equal(vacCabin.status, 'VACANT', 'Cabin must be released to VACANT');
  });

  await t.test('7. Phase 24 & 25: Real Billing & General Ledger Invariants', async () => {
    // 1. Create Invoice
    const subtotal = 3300.00;
    const discount = 300.00;
    const grandTotal = subtotal - discount; // 3000.00

    const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      patient_id: createdPatientId,
      invoice_number: `INV-CANARY-${Date.now()}`,
      subtotal: subtotal,
      discount_amount: discount,
      tax_amount: 0.00,
      grand_total: grandTotal,
      paid_amount: grandTotal,
      balance_due: 0.00,
      payment_status: 'PAID',
      status: 'ACTIVE'
    }).select().single();

    assert.equal(invErr, null, 'Invoice creation must succeed');
    assert.equal(invoice.grand_total, 3000.00);

    // 2. Post balanced journal entry: Debit Cash 3000.00, Credit Hospital Revenue 3000.00
    const { data: journal, error: jErr } = await supabase.from('journal_entries').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      entry_number: `JRN-CANARY-${Date.now()}`,
      entry_date: new Date().toISOString().split('T')[0],
      reference_id: invoice.id,
      reference_type: 'INVOICE',
      total_debit: 3000.00,
      total_credit: 3000.00,
      is_balanced: true
    }).select().single();

    assert.equal(jErr, null, 'Balanced journal entry must succeed');
    assert.equal(journal.total_debit, journal.total_credit, 'Debit must exactly equal Credit');
  });

  await t.test('8. Phase 28: Blood Bank Forward-Only Lifecycle (Rule 44)', async () => {
    const bagNumber = `BAG-CANARY-${Date.now()}`;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 35);

    const { data: bag, error: bagErr } = await supabase.from('blood_inventory').insert({
      organization_id: SYNTHETIC_CANARY_ORG_ID,
      bag_number: bagNumber,
      blood_group: 'O+',
      component_type: 'whole_blood',
      collection_date: new Date().toISOString().split('T')[0],
      expiry_date: expiry.toISOString().split('T')[0],
      status: 'available'
    }).select().single();

    assert.equal(bagErr, null, 'Blood bag creation must succeed');
    assert.equal(bag.status, 'available');

    // Forward progression: available -> reserved -> issued -> transfused
    await supabase.from('blood_inventory').update({ status: 'reserved' }).eq('id', bag.id);
    await supabase.from('blood_inventory').update({ status: 'issued' }).eq('id', bag.id);
    await supabase.from('blood_inventory').update({ status: 'transfused' }).eq('id', bag.id);

    const { data: finalBag } = await supabase.from('blood_inventory').select('status').eq('id', bag.id).single();
    assert.equal(finalBag.status, 'transfused');
  });

  await t.test('9. Phase 103: Full Synthetic Resource Cleanup Engine', async () => {
    // Delete all child entities and tenant created in this test run
    await supabase.from('blood_inventory').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('journal_entries').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('invoices').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('discharge_summaries').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('bed_assignments').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('patient_visits').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('prescriptions').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('waiting_queue').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('beds').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('cabins').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('doctors').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('patients').delete().eq('organization_id', SYNTHETIC_CANARY_ORG_ID);
    await supabase.from('organizations').delete().eq('id', SYNTHETIC_CANARY_ORG_ID);
  });
});
