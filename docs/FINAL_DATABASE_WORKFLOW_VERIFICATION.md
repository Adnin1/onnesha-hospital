# Onnesha Hospital Management System — Database Workflow Verification

This document verifies that every user action in the Onnesha Hospital Management System mutates live PostgreSQL tables in Supabase with RLS multi-tenant isolation and zero mock fallbacks.

---

## 🗄️ Database Mutation Audit Matrix

| User Action | Targeted PostgreSQL Table(s) | Primary Keys / Foreign Keys | RLS Policy Enforced | Audit Log Entity |
|---|---|---|---|---|
| Register Patient | `patients`, `patient_addresses`, `patient_contacts` | `id`, `organization_id`, `created_by` | `organization_id = app.current_organization_id` | `PATIENT` |
| Create Appointment | `appointments`, `appointment_slots` | `id`, `patient_id`, `doctor_id` | `organization_id = app.current_organization_id` | `APPOINTMENT` |
| Add Doctor | `profiles`, `doctors`, `doctor_schedules` | `id`, `organization_id` | `organization_id = app.current_organization_id` | `DOCTOR` |
| OPD Consultation | `clinical_encounters`, `prescriptions`, `vitals` | `id`, `patient_id`, `doctor_id` | `organization_id = app.current_organization_id` | `CLINICAL` |
| Emergency Triage | `emergency_admissions`, `triage_records` | `id`, `patient_id` | `organization_id = app.current_organization_id` | `EMERGENCY` |
| IPD Bed Admission | `ipd_admissions`, `beds`, `bed_assignments` | `id`, `patient_id`, `bed_id` | `organization_id = app.current_organization_id` | `IPD` |
| Lab Order Result | `lab_orders`, `lab_results` | `id`, `patient_id`, `order_id` | `organization_id = app.current_organization_id` | `LAB` |
| Pharmacy POS Sale | `pharmacy_sales`, `stock_ledger`, `batches` | `id`, `item_id`, `batch_id` | `organization_id = app.current_organization_id` | `PHARMACY` |
| Billing & Payment | `invoices`, `invoice_items`, `payments` | `id`, `patient_id`, `invoice_id` | `organization_id = app.current_organization_id` | `BILLING` |
| HR & Attendance | `employees`, `attendance_records` | `id`, `employee_id` | `organization_id = app.current_organization_id` | `HR` |
| System Settings | `hospital_settings`, `audit_logs` | `id`, `organization_id` | `organization_id = app.current_organization_id` | `SETTINGS` |
