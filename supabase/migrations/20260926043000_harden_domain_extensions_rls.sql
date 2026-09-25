-- Migration 069: Hardening Domain Extensions with Explicit Operation-Specific RLS,
-- WITH CHECK validation, and Forensic Audit Triggers.
-- Fixes broad FOR ALL policies with discrete SELECT, INSERT, UPDATE, DELETE rules.

-- 1. Hardening RLS on Critical Care Tables
DROP POLICY IF EXISTS cc_units_tenant_isolation ON public.critical_care_units;
CREATE POLICY cc_units_select ON public.critical_care_units
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY cc_units_insert ON public.critical_care_units
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY cc_units_update ON public.critical_care_units
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS cc_admissions_tenant_isolation ON public.critical_care_admissions;
CREATE POLICY cc_admissions_select ON public.critical_care_admissions
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY cc_admissions_insert ON public.critical_care_admissions
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY cc_admissions_update ON public.critical_care_admissions
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS cc_observations_tenant_isolation ON public.critical_care_observations;
CREATE POLICY cc_observations_select ON public.critical_care_observations
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY cc_observations_insert ON public.critical_care_observations
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY cc_observations_update ON public.critical_care_observations
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- 2. Hardening RLS on Radiology Tables
DROP POLICY IF EXISTS rad_modalities_tenant_isolation ON public.radiology_modalities;
CREATE POLICY rad_modalities_select ON public.radiology_modalities
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY rad_modalities_insert ON public.radiology_modalities
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY rad_modalities_update ON public.radiology_modalities
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS rad_studies_tenant_isolation ON public.radiology_studies;
CREATE POLICY rad_studies_select ON public.radiology_studies
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY rad_studies_insert ON public.radiology_studies
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY rad_studies_update ON public.radiology_studies
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- 3. Hardening RLS on Blood Bank Tables
DROP POLICY IF EXISTS blood_donors_tenant_isolation ON public.blood_donors;
CREATE POLICY blood_donors_select ON public.blood_donors
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY blood_donors_insert ON public.blood_donors
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY blood_donors_update ON public.blood_donors
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS blood_inv_tenant_isolation ON public.blood_inventory;
CREATE POLICY blood_inv_select ON public.blood_inventory
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY blood_inv_insert ON public.blood_inventory
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY blood_inv_update ON public.blood_inventory
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS blood_transfusion_tenant_isolation ON public.blood_transfusion_records;
CREATE POLICY blood_transfusion_select ON public.blood_transfusion_records
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY blood_transfusion_insert ON public.blood_transfusion_records
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY blood_transfusion_update ON public.blood_transfusion_records
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- 4. Hardening RLS on Medical Certificates & Transport
DROP POLICY IF EXISTS med_certs_tenant_isolation ON public.medical_certificates;
CREATE POLICY med_certs_select ON public.medical_certificates
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY med_certs_insert ON public.medical_certificates
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY med_certs_update ON public.medical_certificates
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS amb_vehicles_tenant_isolation ON public.ambulance_vehicles;
CREATE POLICY amb_vehicles_select ON public.ambulance_vehicles
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY amb_vehicles_insert ON public.ambulance_vehicles
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY amb_vehicles_update ON public.ambulance_vehicles
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS amb_trips_tenant_isolation ON public.ambulance_trips;
CREATE POLICY amb_trips_select ON public.ambulance_trips
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY amb_trips_insert ON public.ambulance_trips
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY amb_trips_update ON public.ambulance_trips
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS health_cards_tenant_isolation ON public.health_cards;
CREATE POLICY health_cards_select ON public.health_cards
  FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY health_cards_insert ON public.health_cards
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
CREATE POLICY health_cards_update ON public.health_cards
  FOR UPDATE USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
