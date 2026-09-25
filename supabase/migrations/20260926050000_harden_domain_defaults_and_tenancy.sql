-- Migration 070: Harden Domain Extension Defaults, Uniqueness Constraints, and Tenant RLS Fallback
-- 1. Updates RLS policies to use private.get_current_org_id() as a reliable fallback when app.current_organization_id GUC is not set.
-- 2. Scopes unique constraints to (organization_id, business_identifier) where appropriate.
-- 3. Adjusts operational defaults (fare_amount, daily_charge, screening_status) to avoid hardcoded mock defaults.

-- Section 1: Update RLS policies to use COALESCE((current_setting('app.current_organization_id', true))::uuid, private.get_current_org_id())

-- Critical Care Units
DROP POLICY IF EXISTS cc_units_select ON public.critical_care_units;
CREATE POLICY cc_units_select ON public.critical_care_units
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS cc_units_insert ON public.critical_care_units;
CREATE POLICY cc_units_insert ON public.critical_care_units
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS cc_units_update ON public.critical_care_units;
CREATE POLICY cc_units_update ON public.critical_care_units
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Critical Care Admissions
DROP POLICY IF EXISTS cc_admissions_select ON public.critical_care_admissions;
CREATE POLICY cc_admissions_select ON public.critical_care_admissions
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS cc_admissions_insert ON public.critical_care_admissions;
CREATE POLICY cc_admissions_insert ON public.critical_care_admissions
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS cc_admissions_update ON public.critical_care_admissions;
CREATE POLICY cc_admissions_update ON public.critical_care_admissions
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Critical Care Observations
DROP POLICY IF EXISTS cc_observations_select ON public.critical_care_observations;
CREATE POLICY cc_observations_select ON public.critical_care_observations
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS cc_observations_insert ON public.critical_care_observations;
CREATE POLICY cc_observations_insert ON public.critical_care_observations
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS cc_observations_update ON public.critical_care_observations;
CREATE POLICY cc_observations_update ON public.critical_care_observations
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Radiology Modalities
DROP POLICY IF EXISTS rad_modalities_select ON public.radiology_modalities;
CREATE POLICY rad_modalities_select ON public.radiology_modalities
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS rad_modalities_insert ON public.radiology_modalities;
CREATE POLICY rad_modalities_insert ON public.radiology_modalities
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS rad_modalities_update ON public.radiology_modalities;
CREATE POLICY rad_modalities_update ON public.radiology_modalities
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Radiology Studies
DROP POLICY IF EXISTS rad_studies_select ON public.radiology_studies;
CREATE POLICY rad_studies_select ON public.radiology_studies
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS rad_studies_insert ON public.radiology_studies;
CREATE POLICY rad_studies_insert ON public.radiology_studies
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS rad_studies_update ON public.radiology_studies;
CREATE POLICY rad_studies_update ON public.radiology_studies
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Blood Donors
DROP POLICY IF EXISTS blood_donors_select ON public.blood_donors;
CREATE POLICY blood_donors_select ON public.blood_donors
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS blood_donors_insert ON public.blood_donors;
CREATE POLICY blood_donors_insert ON public.blood_donors
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS blood_donors_update ON public.blood_donors;
CREATE POLICY blood_donors_update ON public.blood_donors
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Blood Inventory
DROP POLICY IF EXISTS blood_inv_select ON public.blood_inventory;
CREATE POLICY blood_inv_select ON public.blood_inventory
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS blood_inv_insert ON public.blood_inventory;
CREATE POLICY blood_inv_insert ON public.blood_inventory
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS blood_inv_update ON public.blood_inventory;
CREATE POLICY blood_inv_update ON public.blood_inventory
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Blood Transfusion Records
DROP POLICY IF EXISTS blood_transfusion_select ON public.blood_transfusion_records;
CREATE POLICY blood_transfusion_select ON public.blood_transfusion_records
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS blood_transfusion_insert ON public.blood_transfusion_records;
CREATE POLICY blood_transfusion_insert ON public.blood_transfusion_records
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS blood_transfusion_update ON public.blood_transfusion_records;
CREATE POLICY blood_transfusion_update ON public.blood_transfusion_records
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Medical Certificates
DROP POLICY IF EXISTS med_certs_select ON public.medical_certificates;
CREATE POLICY med_certs_select ON public.medical_certificates
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS med_certs_insert ON public.medical_certificates;
CREATE POLICY med_certs_insert ON public.medical_certificates
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS med_certs_update ON public.medical_certificates;
CREATE POLICY med_certs_update ON public.medical_certificates
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Ambulance Vehicles
DROP POLICY IF EXISTS amb_vehicles_select ON public.ambulance_vehicles;
CREATE POLICY amb_vehicles_select ON public.ambulance_vehicles
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS amb_vehicles_insert ON public.ambulance_vehicles;
CREATE POLICY amb_vehicles_insert ON public.ambulance_vehicles
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS amb_vehicles_update ON public.ambulance_vehicles;
CREATE POLICY amb_vehicles_update ON public.ambulance_vehicles
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Ambulance Trips
DROP POLICY IF EXISTS amb_trips_select ON public.ambulance_trips;
CREATE POLICY amb_trips_select ON public.ambulance_trips
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS amb_trips_insert ON public.ambulance_trips;
CREATE POLICY amb_trips_insert ON public.ambulance_trips
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS amb_trips_update ON public.ambulance_trips;
CREATE POLICY amb_trips_update ON public.ambulance_trips
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Health Cards
DROP POLICY IF EXISTS health_cards_select ON public.health_cards;
CREATE POLICY health_cards_select ON public.health_cards
  FOR SELECT USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS health_cards_insert ON public.health_cards;
CREATE POLICY health_cards_insert ON public.health_cards
  FOR INSERT WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));
DROP POLICY IF EXISTS health_cards_update ON public.health_cards;
CREATE POLICY health_cards_update ON public.health_cards
  FOR UPDATE USING (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()))
  WITH CHECK (organization_id = COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id()));

-- Section 2: Scoped Unique Constraints (Tenant isolation)
ALTER TABLE public.blood_donors DROP CONSTRAINT IF EXISTS blood_donors_donor_code_key;
ALTER TABLE public.blood_donors ADD CONSTRAINT blood_donors_org_donor_code_key UNIQUE (organization_id, donor_code);

ALTER TABLE public.blood_inventory DROP CONSTRAINT IF EXISTS blood_inventory_bag_number_key;
ALTER TABLE public.blood_inventory ADD CONSTRAINT blood_inventory_org_bag_number_key UNIQUE (organization_id, bag_number);

ALTER TABLE public.medical_certificates DROP CONSTRAINT IF EXISTS medical_certificates_certificate_number_key;
ALTER TABLE public.medical_certificates ADD CONSTRAINT medical_certificates_org_cert_number_key UNIQUE (organization_id, certificate_number);

ALTER TABLE public.ambulance_vehicles DROP CONSTRAINT IF EXISTS ambulance_vehicles_vehicle_number_key;
ALTER TABLE public.ambulance_vehicles ADD CONSTRAINT ambulance_vehicles_org_vehicle_number_key UNIQUE (organization_id, vehicle_number);

ALTER TABLE public.ambulance_trips DROP CONSTRAINT IF EXISTS ambulance_trips_trip_number_key;
ALTER TABLE public.ambulance_trips ADD CONSTRAINT ambulance_trips_org_trip_number_key UNIQUE (organization_id, trip_number);

ALTER TABLE public.health_cards DROP CONSTRAINT IF EXISTS health_cards_card_number_key;
ALTER TABLE public.health_cards ADD CONSTRAINT health_cards_org_card_number_key UNIQUE (organization_id, card_number);

-- Section 3: Remove arbitrary hardcoded mock operational defaults
ALTER TABLE public.critical_care_units ALTER COLUMN floor DROP DEFAULT;
ALTER TABLE public.critical_care_units ALTER COLUMN total_beds SET DEFAULT 0;
ALTER TABLE public.critical_care_units ALTER COLUMN daily_charge SET DEFAULT 0.00;

ALTER TABLE public.blood_donors ALTER COLUMN screening_status SET DEFAULT 'pending';
ALTER TABLE public.blood_inventory ALTER COLUMN storage_location DROP DEFAULT;

ALTER TABLE public.ambulance_trips ALTER COLUMN fare_amount SET DEFAULT 0.00;
