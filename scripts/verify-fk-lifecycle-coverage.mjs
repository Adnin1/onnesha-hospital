#!/usr/bin/env node
/**
 * =====================================================================================
 * OHMS Foreign Key Lifecycle Coverage Engine (Phase 15)
 * =====================================================================================
 * Maps and classifies every inbound Foreign Key referencing critical root entities:
 * - patients
 * - patient_visits
 * - invoices
 * - expenses
 * - diagnostic_orders
 * - blood_transfusion_records
 * 
 * Enforces explicit lifecycle classification:
 * CASCADE_SAFE | SET_NULL_SAFE | VOID_REQUIRED | ARCHIVE_REQUIRED | PURGE_CHILD | BLOCK_DELETE | AUDIT_PRESERVE
 * Fails with CI_FAIL if any dependency is unclassified.
 * =====================================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

const CRITICAL_ROOTS = [
  'patients',
  'patient_visits',
  'invoices',
  'expenses',
  'diagnostic_orders',
  'blood_transfusion_records'
];

/**
 * Authoritative FK Lifecycle Policy Registry (Phase 15)
 */
const FK_LIFECYCLE_REGISTRY = {
  patients: {
    patient_visits: { policy: 'BLOCK_DELETE', rule: 'Active or historic visits require archive; cannot delete patient with clinical records.' },
    patient_episodes: { policy: 'PURGE_CHILD', rule: 'Intake episodes can be cascaded only during accidental registration purge.' },
    patient_care_episodes: { policy: 'PURGE_CHILD', rule: 'Intake care episodes cascade on accidental registration purge.' },
    patient_referral_attributions: { policy: 'PURGE_CHILD', rule: 'Referral attribution tags can be purged with accidental registration.' },
    invoices: { policy: 'BLOCK_DELETE', rule: 'Financial integrity: cannot delete patient with financial history.' },
    prescriptions: { policy: 'ARCHIVE_REQUIRED', rule: 'Medical record law requires prescription retention.' },
    appointments: { policy: 'SET_NULL_SAFE', rule: 'Appointment records can unlink or retain tombstone on cancel.' },
    discharge_summaries: { policy: 'SET_NULL_SAFE', rule: 'Discharge records unlink or archive on accidental registration purge.' },
    blood_transfusion_records: { policy: 'BLOCK_DELETE', rule: 'Transfusion is legally permanent medical record.' },
    diagnostic_orders: { policy: 'BLOCK_DELETE', rule: 'Lab orders require audit retention.' },
    vital_signs: { policy: 'CASCADE_SAFE', rule: 'Vitals attached to visit cascade with visit.' },
    medical_certificates: { policy: 'ARCHIVE_REQUIRED', rule: 'Legal certificates require permanent archive.' },
    patient_allergies: { policy: 'CASCADE_SAFE', rule: 'Clinical allergy tags cascade with patient purge.' },
    patient_contacts: { policy: 'CASCADE_SAFE', rule: 'Next of kin contacts cascade with patient purge.' },
    patient_documents: { policy: 'ARCHIVE_REQUIRED', rule: 'Scanned medical documents require archive.' },
    health_cards: { policy: 'BLOCK_DELETE', rule: 'Active health card numbers must be formally deactivated.' },
    ot_bookings: { policy: 'BLOCK_DELETE', rule: 'Surgical bookings must be formally cancelled.' },
    ot_surgical_cases: { policy: 'BLOCK_DELETE', rule: 'OT surgical logs require permanent audit.' },
    critical_care_admissions: { policy: 'BLOCK_DELETE', rule: 'ICU/CCU admissions cannot be casually deleted.' },
    daycare_admissions: { policy: 'BLOCK_DELETE', rule: 'Daycare admissions require clinical closure.' },
    ambulance_trips: { policy: 'BLOCK_DELETE', rule: 'Ambulance billing and trip records require audit.' },
    dialysis_sessions: { policy: 'BLOCK_DELETE', rule: 'Dialysis clinical charts require audit.' },
    chemo_sessions: { policy: 'BLOCK_DELETE', rule: 'Oncology charts require permanent retention.' },
    bed_assignments: { policy: 'BLOCK_DELETE', rule: 'Bed allocations must be released before deletion.' },
    bed_allocations: { policy: 'BLOCK_DELETE', rule: 'Active bed allocations require discharge.' },
    ipd_admissions: { policy: 'BLOCK_DELETE', rule: 'IPD admissions require formal discharge or purge atomic.' },
    clinical_alerts: { policy: 'CASCADE_SAFE', rule: 'Temporary clinical alerts cascade on accidental purge.' },
    clinical_notes: { policy: 'CASCADE_SAFE', rule: 'Clinical notes cascade with accidental purge.' },
    corporate_beneficiaries: { policy: 'SET_NULL_SAFE', rule: 'Unlinks beneficiary mapping.' },
    dental_examinations: { policy: 'ARCHIVE_REQUIRED', rule: 'Dental exam chart requires archive.' },
    document_print_logs: { policy: 'AUDIT_PRESERVE', rule: 'Immutable audit trail of printed documents.' },
    encounters: { policy: 'BLOCK_DELETE', rule: 'Historic encounters require archive.' },
    episode_service_charges: { policy: 'BLOCK_DELETE', rule: 'Billed charges require financial reconciliation.' },
    episode_service_waivers: { policy: 'BLOCK_DELETE', rule: 'Waivers require audit.' },
    eye_examinations: { policy: 'ARCHIVE_REQUIRED', rule: 'Ophthalmology chart requires archive.' },
    inpatient_doctor_orders: { policy: 'CASCADE_SAFE', rule: 'Doctor orders cascade on purge.' },
    inpatient_progress_notes: { policy: 'CASCADE_SAFE', rule: 'Progress notes cascade on purge.' },
    insurance_claims: { policy: 'BLOCK_DELETE', rule: 'Claims submitted to TPA require retention.' },
    lab_orders: { policy: 'BLOCK_DELETE', rule: 'Lab orders require clinical audit.' },
    lab_to_lab_referrals: { policy: 'BLOCK_DELETE', rule: 'External lab outsourcing requires audit.' },
    notification_outbox: { policy: 'SET_NULL_SAFE', rule: 'SMS/WhatsApp outbox unlinks patient_id.' },
    notification_preferences: { policy: 'CASCADE_SAFE', rule: 'Preferences cascade on patient purge.' },
    nursing_notes: { policy: 'CASCADE_SAFE', rule: 'Nurse notes cascade on purge.' },
    overseas_medical_profiles: { policy: 'ARCHIVE_REQUIRED', rule: 'Overseas health clearance requires archive.' },
    patient_addresses: { policy: 'CASCADE_SAFE', rule: 'Address rows cascade with patient.' },
    patient_complaints: { policy: 'CASCADE_SAFE', rule: 'Chief complaint rows cascade on purge.' },
    patient_consents: { policy: 'ARCHIVE_REQUIRED', rule: 'Legal consent forms require archive.' },
    patient_crm_followups: { policy: 'CASCADE_SAFE', rule: 'CRM followups cascade on purge.' },
    patient_diagnoses: { policy: 'CASCADE_SAFE', rule: 'Diagnoses cascade on purge.' },
    patient_diet_charts: { policy: 'CASCADE_SAFE', rule: 'Diet charts cascade on purge.' },
    patient_feedbacks: { policy: 'CASCADE_SAFE', rule: 'Feedback surveys cascade on purge.' },
    patient_files: { policy: 'ARCHIVE_REQUIRED', rule: 'Attached medical records require archive.' },
    patient_history: { policy: 'CASCADE_SAFE', rule: 'Past medical history cascade on purge.' },
    patient_identifications: { policy: 'CASCADE_SAFE', rule: 'NID/birth cert rows cascade on purge.' },
    patient_medical_history: { policy: 'CASCADE_SAFE', rule: 'Medical history cascade on purge.' },
    patient_merge_requests: { policy: 'BLOCK_DELETE', rule: 'Pending merge requests require resolution.' },
    patient_notes: { policy: 'CASCADE_SAFE', rule: 'General notes cascade on purge.' },
    patient_package_subscriptions: { policy: 'BLOCK_DELETE', rule: 'Health packages require refund/void.' },
    patient_referrals: { policy: 'BLOCK_DELETE', rule: 'Referral tracking requires commission settlement.' },
    patient_transfers: { policy: 'BLOCK_DELETE', rule: 'Inter-department transfers require clinical audit.' },
    patient_vitals_rounds: { policy: 'CASCADE_SAFE', rule: 'Routine vitals rounds cascade on purge.' },
    payment_intents: { policy: 'BLOCK_DELETE', rule: 'Payment gateway intents require financial audit.' },
    pharmacy_sales: { policy: 'BLOCK_DELETE', rule: 'Dispensed pharmacy drugs require inventory/GL reversal.' },
    physiotherapy_sessions: { policy: 'BLOCK_DELETE', rule: 'Physiotherapy treatment logs require audit.' },
    radiology_studies: { policy: 'BLOCK_DELETE', rule: 'Imaging studies require PACS audit.' },
    referral_commission_settlements: { policy: 'BLOCK_DELETE', rule: 'Settled commissions require GL reversal.' },
    referral_commissions: { policy: 'BLOCK_DELETE', rule: 'Accrued commissions require reversal.' },
    scholarship_applications: { policy: 'BLOCK_DELETE', rule: 'Charity/welfare discounts require audit.' }
  },
  patient_visits: {
    discharge_summaries: { policy: 'BLOCK_DELETE', rule: 'Discharge summary must be voided or unlinked by Super Admin purge atomic.' },
    vital_signs: { policy: 'CASCADE_SAFE', rule: 'Vital signs cascade with parent visit.' },
    bed_assignments: { policy: 'BLOCK_DELETE', rule: 'Active beds must be vacated before visit deletion.' },
    bed_allocations: { policy: 'BLOCK_DELETE', rule: 'Active bed allocations must be vacated before visit deletion.' },
    waiting_queue: { policy: 'SET_NULL_SAFE', rule: 'Queue item can unlink visit_id on cancellation.' },
    prescriptions: { policy: 'SET_NULL_SAFE', rule: 'Prescription visit_id unlinks safely (Migration 234).' },
    invoices: { policy: 'BLOCK_DELETE', rule: 'Financial billing links must be settled or voided.' },
    nurse_notes: { policy: 'CASCADE_SAFE', rule: 'Clinical nursing notes cascade with visit in purge.' },
    nursing_notes: { policy: 'CASCADE_SAFE', rule: 'Nurse notes cascade with visit in purge.' },
    doctor_notes: { policy: 'CASCADE_SAFE', rule: 'Progress notes cascade with visit in purge.' },
    treatment_charts: { policy: 'CASCADE_SAFE', rule: 'Medication administration charts cascade with visit.' },
    clinical_alerts: { policy: 'CASCADE_SAFE', rule: 'Temporary warning alerts cascade with visit.' },
    clinical_notes: { policy: 'CASCADE_SAFE', rule: 'Clinical notes cascade with visit.' },
    critical_care_admissions: { policy: 'BLOCK_DELETE', rule: 'ICU admissions require discharge before visit closure.' },
    diagnostic_orders: { policy: 'BLOCK_DELETE', rule: 'Linked diagnostic orders must be cancelled.' },
    inpatient_doctor_orders: { policy: 'CASCADE_SAFE', rule: 'Doctor orders cascade with visit.' },
    inpatient_progress_notes: { policy: 'CASCADE_SAFE', rule: 'Progress notes cascade with visit.' },
    ipd_admissions: { policy: 'BLOCK_DELETE', rule: 'Admission must be formally discharged or cancelled.' },
    lab_orders: { policy: 'BLOCK_DELETE', rule: 'Lab orders require clinical audit.' },
    ot_bookings: { policy: 'BLOCK_DELETE', rule: 'Surgical bookings must be cancelled.' },
    patient_consents: { policy: 'ARCHIVE_REQUIRED', rule: 'Signed legal consents require archive.' },
    patient_diagnoses: { policy: 'CASCADE_SAFE', rule: 'Visit diagnoses cascade with visit.' },
    patient_diet_charts: { policy: 'CASCADE_SAFE', rule: 'Diet charts cascade with visit.' },
    patient_referral_attributions: { policy: 'PURGE_CHILD', rule: 'Referral tags cascade with visit on purge.' },
    patient_transfers: { policy: 'BLOCK_DELETE', rule: 'Transfer records require audit.' },
    patient_vitals_rounds: { policy: 'CASCADE_SAFE', rule: 'Vitals logs cascade with visit.' },
    referral_commissions: { policy: 'BLOCK_DELETE', rule: 'Accrued commissions require reversal.' },
    ot_schedules: { policy: 'SET_NULL_SAFE', rule: 'OT schedule links to visit_id set null on visit purge or reschedule.' },
    referral_commission_claims: { policy: 'SET_NULL_SAFE', rule: 'Referral commission claims unlinks visit_id on admission purge.' }
  },
  invoices: {
    invoice_items: { policy: 'CASCADE_SAFE', rule: 'Line items cascade with parent invoice.' },
    payments: { policy: 'BLOCK_DELETE', rule: 'Invoices with payments must be formally refunded/reversed, never hard deleted.' },
    journal_entries: { policy: 'VOID_REQUIRED', rule: 'GL ledger vouchers must be counter-balanced with void_invoice_and_reverse_gl_atomic.' },
    receipts: { policy: 'AUDIT_PRESERVE', rule: 'Money receipts must retain immutable audit numbers.' },
    referral_commissions: { policy: 'BLOCK_DELETE', rule: 'Commissions accrued against invoice require reversal.' },
    payment_allocations: { policy: 'CASCADE_SAFE', rule: 'Payment allocations cascade when invoice is purged.' },
    billing_transactions: { policy: 'BLOCK_DELETE', rule: 'Ledger transactions require reversal voucher.' },
    dental_examinations: { policy: 'SET_NULL_SAFE', rule: 'Unlinks invoice_id from dental chart.' },
    eye_examinations: { policy: 'SET_NULL_SAFE', rule: 'Unlinks invoice_id from eye chart.' },
    insurance_claims: { policy: 'BLOCK_DELETE', rule: 'Insurance claims linked to invoice require claim void.' },
    invoice_edit_history: { policy: 'AUDIT_PRESERVE', rule: 'Immutable history of invoice amendments.' },
    patient_package_subscriptions: { policy: 'BLOCK_DELETE', rule: 'Package subscriptions require cancellation.' },
    patient_referrals: { policy: 'SET_NULL_SAFE', rule: 'Unlinks invoice_id from referral record.' },
    payment_intents: { policy: 'BLOCK_DELETE', rule: 'Online payment intents require reconciliation.' },
    payment_reconciliations: { policy: 'BLOCK_DELETE', rule: 'Bank reconciliation entries require audit.' },
    pharmacy_sales: { policy: 'BLOCK_DELETE', rule: 'Linked pharmacy sales require stock reversal.' },
    physiotherapy_sessions: { policy: 'SET_NULL_SAFE', rule: 'Unlinks invoice_id from therapy session.' },
    refunds: { policy: 'BLOCK_DELETE', rule: 'Refund vouchers posted to GL require reversal.' }
  },
  expenses: {
    expense_attachments: { policy: 'CASCADE_SAFE', rule: 'Voucher receipt scans cascade with expense record.' },
    journal_entries: { policy: 'VOID_REQUIRED', rule: 'Approved expenses posted to GL require reversal voucher.' },
    referral_commission_settlements: { policy: 'BLOCK_DELETE', rule: 'Referral payouts linked to expense require settlement reversal.' }
  },
  diagnostic_orders: {
    diagnostic_order_items: { policy: 'CASCADE_SAFE', rule: 'Test line items cascade with diagnostic order.' },
    lab_samples: { policy: 'BLOCK_DELETE', rule: 'Accessioned specimens must be cancelled with audit reason.' },
    lab_results: { policy: 'AUDIT_PRESERVE', rule: 'Verified lab results cannot be deleted, only amended.' },
    invoices: { policy: 'BLOCK_DELETE', rule: 'Billed diagnostic orders must be cancelled via refund/void.' },
    diagnostic_report_verification_logs: { policy: 'AUDIT_PRESERVE', rule: 'Pathologist sign-off logs are permanent audit records.' },
    lab_analyzer_transmissions: { policy: 'AUDIT_PRESERVE', rule: 'Raw instrument telemetry logs are permanent audit records.' },
    lab_critical_alerts: { policy: 'AUDIT_PRESERVE', rule: 'Telephonic critical panic value alerts require permanent audit.' }
  },
  blood_transfusion_records: {
    blood_inventory: { policy: 'BLOCK_DELETE', rule: 'Transfused blood bags must NEVER revert to available (Rule 44).' },
    adverse_reaction_reports: { policy: 'AUDIT_PRESERVE', rule: 'Clinical transfusion reaction reports are permanent legal medical records.' }
  }
};

function parseInboundForeignKeys() {
  const inboundFks = new Map(); // root -> Set<childTable>
  for (const root of CRITICAL_ROOTS) {
    inboundFks.set(root, new Set());
  }

  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    // CREATE TABLE ... REFERENCES root(id)
    const tableBlockRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
    let match;
    while ((match = tableBlockRegex.exec(content)) !== null) {
      const childTable = match[1].toLowerCase();
      const body = match[2];

      for (const root of CRITICAL_ROOTS) {
        const refRegex = new RegExp(`REFERENCES\\s+(?:public\\.)?${root}\\s*\\(`, 'i');
        if (refRegex.test(body) && childTable !== root) {
          inboundFks.get(root).add(childTable);
        }
      }
    }

    // ALTER TABLE child ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES root(id)
    const alterFkRegex = /ALTER\s+TABLE(?:\s+IF\s+EXISTS)?(?:\s+ONLY)?\s+(?:public\.)?([a-zA-Z0-9_]+)[\s\S]*?REFERENCES\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
    let alterMatch;
    while ((alterMatch = alterFkRegex.exec(content)) !== null) {
      const childTable = alterMatch[1].toLowerCase();
      const refTable = alterMatch[2].toLowerCase();
      if (inboundFks.has(refTable) && childTable !== refTable) {
        inboundFks.get(refTable).add(childTable);
      }
    }
  }

  return inboundFks;
}

export function verifyFkLifecycleCoverage() {
  console.log('🔗 [FK GRAPH AUTOMATION] Scanning foreign key dependencies for critical roots...');
  const inboundFks = parseInboundForeignKeys();

  let totalFks = 0;
  let unclassifiedCount = 0;
  const unclassifiedList = [];

  for (const root of CRITICAL_ROOTS) {
    const children = Array.from(inboundFks.get(root) || []).sort();
    const rootRegistry = FK_LIFECYCLE_REGISTRY[root] || {};
    console.log(`   Root: '${root}' (${children.length} inbound foreign keys detected)`);

    for (const child of children) {
      totalFks++;
      const entry = rootRegistry[child];
      if (!entry) {
        unclassifiedCount++;
        unclassifiedList.push(`Root '${root}' ← Child '${child}' has no lifecycle classification!`);
      }
    }
  }

  if (unclassifiedCount > 0) {
    console.error(`❌ [FK GRAPH AUTOMATION] Found ${unclassifiedCount} unclassified foreign key dependencies:`);
    for (const item of unclassifiedList) {
      console.error(`   - ${item}`);
    }
    return false;
  }

  console.log(`✅ [FK GRAPH AUTOMATION] 100% of ${totalFks} inbound foreign key dependencies classified with explicit lifecycle policies!\n`);
  return true;
}

if (process.argv[1].endsWith('verify-fk-lifecycle-coverage.mjs')) {
  const ok = verifyFkLifecycleCoverage();
  if (!ok) process.exit(1);
}
