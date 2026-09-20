# COMPREHENSIVE DATA DICTIONARY
**Project:** Onnesha Hospital Management System (OHMS)  
**Database:** Supabase PostgreSQL  

---

## 1. Multi-Tenant & IAM Core
- **`organizations`**: Master tenant entity. Columns: `id` (UUID PK), `name` (VARCHAR), `code` (VARCHAR Unique, e.g. 'OH'), `slug` (VARCHAR Unique), `status` ('ACTIVE'|'SUSPENDED'|'TRIAL').
- **`organization_settings`**: Tenant-specific parameters. Columns: `organization_id` (UUID PK FK), `currency` (VARCHAR, 'BDT'), `timezone` (VARCHAR, 'Asia/Dhaka'), `patient_id_prefix` (VARCHAR, 'OH-P-'), `invoice_prefix` (VARCHAR, 'OH-INV-'), `max_cashier_discount_pct` (NUMERIC).
- **`profiles`**: User identities extending auth.users. Columns: `id` (UUID PK), `phone` (VARCHAR Unique), `full_name` (VARCHAR), `email` (VARCHAR), `avatar_url` (TEXT), `is_active` (BOOLEAN).
- **`roles`**: Security roles per tenant. Columns: `id` (UUID PK), `organization_id` (UUID FK), `name` (VARCHAR), `is_system` (BOOLEAN).
- **`permissions`**: Fine-grained access keys. Columns: `key` (VARCHAR PK), `module` (VARCHAR), `description` (TEXT).
- **`user_roles`**: Maps user profiles to organization roles. Columns: `id` (UUID PK), `organization_id` (UUID FK), `user_id` (UUID FK), `role_id` (UUID FK).

## 2. Patients & Visits
- **`patients`**: Master demographic record. Columns: `id` (UUID PK), `organization_id` (UUID FK), `patient_code` (VARCHAR Unique per org), `full_name` (VARCHAR), `phone` (VARCHAR), `gender` ('MALE'|'FEMALE'|'OTHER'), `dob` (DATE), `blood_group` (VARCHAR), `is_deleted` (BOOLEAN).
- **`patient_visits`**: Clinical encounters. Columns: `id` (UUID PK), `organization_id` (UUID FK), `patient_id` (UUID FK), `visit_type` ('OPD'|'IPD'|'EMERGENCY'), `status` ('ACTIVE'|'DISCHARGED'|'TRANSFERRED'|'CANCELLED'), `admitted_at` (TIMESTAMPTZ).
- **`vital_signs`**: Clinical physiological telemetry. Columns: `id` (UUID PK), `visit_id` (UUID FK), `pulse_rate` (INT), `systolic_bp` (INT), `diastolic_bp` (INT), `temperature_c` (NUMERIC), `recorded_at` (TIMESTAMPTZ).

## 3. Doctors & Appointments
- **`doctors`**: Physician profiles. Columns: `id` (UUID PK), `organization_id` (UUID FK), `full_name` (VARCHAR), `degrees` (VARCHAR), `designation` (VARCHAR), `room_number` (VARCHAR), `opd_fee` (NUMERIC), `bmdc_reg_number` (VARCHAR).
- **`appointments`**: Patient booking records. Columns: `id` (UUID PK), `organization_id` (UUID FK), `patient_id` (UUID FK), `doctor_id` (UUID FK), `appointment_date` (DATE), `token_number` (INT), `status` ('BOOKED'|'WAITING'|'IN_CHAMBER'|'COMPLETED'|'CANCELLED').
- **`token_counters`**: High-concurrency sequential counter table. Columns: `id` (UUID PK), `organization_id` (UUID FK), `doctor_id` (UUID FK), `counter_date` (DATE), `last_token` (INT).

## 4. Diagnostics & Lab
- **`diagnostic_tests`**: Test catalog. Columns: `id` (UUID PK), `organization_id` (UUID FK), `category_id` (UUID FK), `test_code` (VARCHAR), `test_name` (VARCHAR), `specimen_type` (VARCHAR), `price` (NUMERIC).
- **`diagnostic_orders`**: Requisitions. Columns: `id` (UUID PK), `organization_id` (UUID FK), `patient_id` (UUID FK), `order_number` (VARCHAR), `status` ('ORDERED'|'PAID'|'SAMPLE_COLLECTED'|'VERIFIED').
- **`sample_collections`**: Phlebotomy tracking. Columns: `id` (UUID PK), `order_item_id` (UUID FK Unique), `barcode` (VARCHAR), `collected_at` (TIMESTAMPTZ).
- **`diagnostic_report_verifications`**: Electronic signature locks. Columns: `id` (UUID PK), `order_item_id` (UUID FK Unique), `verified_by` (UUID FK), `signature_hash` (VARCHAR), `verified_at` (TIMESTAMPTZ).

## 5. Billing & Financial Ledger
- **`invoices`**: Consolidated bills. Columns: `id` (UUID PK), `organization_id` (UUID FK), `invoice_number` (VARCHAR Unique), `patient_id` (UUID FK), `subtotal` (NUMERIC), `discount_amount` (NUMERIC), `grand_total` (NUMERIC), `paid_amount` (NUMERIC), `due_amount` (NUMERIC), `status` ('UNPAID'|'PARTIAL'|'PAID'|'VOID').
- **`invoice_items`**: Line items. Columns: `id` (UUID PK), `invoice_id` (UUID FK), `service_category` (VARCHAR), `item_name` (VARCHAR), `unit_price` (NUMERIC), `quantity` (NUMERIC), `total_price` (NUMERIC).
- **`payments`**: Payment receipts. Columns: `id` (UUID PK), `organization_id` (UUID FK), `invoice_id` (UUID FK), `receipt_number` (VARCHAR), `payment_method` ('CASH'|'BKASH'|'NAGAD'|'CARD'), `amount` (NUMERIC).
- **`refunds`**: Audited money returns. Columns: `id` (UUID PK), `organization_id` (UUID FK), `invoice_id` (UUID FK), `amount` (NUMERIC), `reason` (TEXT), `approved_by` (UUID FK).

## 6. Pharmacy & Stock Ledger
- **`medicines`**: Drug catalog. Columns: `id` (UUID PK), `organization_id` (UUID FK), `brand_name` (VARCHAR), `dosage_form` (VARCHAR), `strength` (VARCHAR), `manufacturer` (VARCHAR).
- **`medicine_batches`**: Batch inventory. Columns: `id` (UUID PK), `organization_id` (UUID FK), `medicine_id` (UUID FK), `batch_number` (VARCHAR), `expiry_date` (DATE), `purchase_rate` (NUMERIC), `mrp` (NUMERIC), `current_stock` (INT).
- **`stock_transactions`**: Double-entry ledger. Columns: `id` (UUID PK), `organization_id` (UUID FK), `batch_id` (UUID FK), `transaction_type` ('PURCHASE'|'SALE'|'DAMAGE'|'ADJUSTMENT'), `quantity_in` (INT), `quantity_out` (INT), `running_balance` (INT).

## 7. Wards, Beds & Cabins
- **`beds`**: Patient beds. Columns: `id` (UUID PK), `organization_id` (UUID FK), `ward_id` (UUID FK), `bed_number` (VARCHAR), `status` ('VACANT'|'OCCUPIED'|'CLEANING').
- **`cabins`**: Private rooms. Columns: `id` (UUID PK), `organization_id` (UUID FK), `cabin_number` (VARCHAR), `cabin_type` (VARCHAR), `daily_rate` (NUMERIC), `status` ('VACANT'|'OCCUPIED').
- **`bed_assignments`**: Active and historical stays. Columns: `id` (UUID PK), `organization_id` (UUID FK), `visit_id` (UUID FK), `bed_id` (UUID FK), `cabin_id` (UUID FK), `assigned_at` (TIMESTAMPTZ), `vacated_at` (TIMESTAMPTZ), `daily_charge` (NUMERIC).

## 8. HR & Immutable Audit Vault
- **`employees`**: Staff records. Columns: `id` (UUID PK), `organization_id` (UUID FK), `employee_code` (VARCHAR), `full_name` (VARCHAR), `designation_id` (UUID FK), `basic_salary` (NUMERIC).
- **`attendance_records`**: Biometric punches. Columns: `id` (UUID PK), `organization_id` (UUID FK), `employee_id` (UUID FK), `punch_time` (TIMESTAMPTZ), `punch_type` ('CHECK_IN'|'CHECK_OUT'), `verification_mode` ('FINGERPRINT'|'FACE').
- **`audit_logs`**: Immutable security vault. Columns: `id` (BIGSERIAL PK), `organization_id` (UUID FK), `user_id` (UUID FK), `action` (VARCHAR), `module` (VARCHAR), `entity_type` (VARCHAR), `entity_id` (VARCHAR), `old_values` (JSONB), `new_values` (JSONB), `ip_address` (VARCHAR), `created_at` (TIMESTAMPTZ).

## 9. Phase 3 Clinical Foundation Tables
- **`patient_merge_requests`**: Record merge requests for consolidating duplicate patient charts. Columns: `id` (UUID PK), `organization_id` (UUID FK), `source_patient_id` (UUID FK), `target_patient_id` (UUID FK), `reason` (TEXT), `status` ('PENDING'|'APPROVED'|'REJECTED'), `requested_by` (UUID FK), `approved_by` (UUID FK).
- **`patient_allergies`**: Documented clinical allergies. Columns: `id` (UUID PK), `organization_id` (UUID FK), `patient_id` (UUID FK), `allergen` (VARCHAR), `allergy_type` (VARCHAR), `severity` ('MILD'|'MODERATE'|'SEVERE'|'LIFE_THREATENING'), `reaction` (TEXT), `status` ('ACTIVE'|'RESOLVED'|'REFUTED').
- **`clinical_alerts`**: High-risk medical warnings (Fall risk, DNR, bleeding diathesis). Columns: `id` (UUID PK), `organization_id` (UUID FK), `patient_id` (UUID FK), `alert_type` (VARCHAR), `severity` ('INFO'|'WARNING'|'CRITICAL'), `message` (TEXT), `is_active` (BOOLEAN).
- **`patient_diagnoses`**: Coded and clinical diagnoses. Columns: `id` (UUID PK), `organization_id` (UUID FK), `patient_id` (UUID FK), `visit_id` (UUID FK), `diagnosis_name` (VARCHAR), `diagnosis_type` ('PRIMARY'|'SECONDARY'|'PROVISIONAL'|'FINAL'), `icd_code` (VARCHAR), `notes` (TEXT).
- **`clinical_notes`**: SOAP and progress notes. Columns: `id` (UUID PK), `organization_id` (UUID FK), `patient_id` (UUID FK), `visit_id` (UUID FK), `note_type` (VARCHAR), `note_content` (TEXT), `author_name` (VARCHAR).
- **`patient_transfers`**: Intra-hospital bed and ward relocations. Columns: `id` (UUID PK), `organization_id` (UUID FK), `visit_id` (UUID FK), `patient_id` (UUID FK), `from_ward_id` (UUID FK), `to_ward_id` (UUID FK), `from_bed_id` (UUID FK), `to_bed_id` (UUID FK), `reason` (TEXT), `transfer_time` (TIMESTAMPTZ), `authorized_by` (UUID FK).
- **`patient_consents`**: Medicolegal treatment and surgical consents. Columns: `id` (UUID PK), `organization_id` (UUID FK), `patient_id` (UUID FK), `consent_type` (VARCHAR), `status` ('GRANTED'|'REVOKED'|'REFUSED'), `captured_at` (TIMESTAMPTZ).
