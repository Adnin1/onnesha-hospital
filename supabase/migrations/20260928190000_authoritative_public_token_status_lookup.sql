-- Migration 88: Authoritative Public Token Status Lookup RPC
-- Provides deterministic token status search covering all appointments (active, calling, serving, done, skipped)
-- without relying on client-side array search over a partial active queue slice.
-- Strictly zero PHI: never returns patient name, phone, NID, or clinical notes.

CREATE OR REPLACE FUNCTION public.get_public_token_status(
    p_org_id UUID,
    p_token_query TEXT,
    p_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_today DATE;
    v_target_date DATE;
    v_clean_str TEXT;
    v_clean_num INT := NULL;
    v_org_exists BOOLEAN;
    v_appt RECORD;
    v_other_date DATE := NULL;
    v_queue_ahead INT := 0;
    v_status_key TEXT;
    v_status_label TEXT;
BEGIN
    -- 1. Validate organization
    SELECT EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = p_org_id AND is_active = TRUE
    ) INTO v_org_exists;

    IF NOT v_org_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid or inactive hospital organization.'
        );
    END IF;

    -- 2. Input normalization & sanitization
    v_clean_str := TRIM(REGEXP_REPLACE(COALESCE(p_token_query, ''), '^[#\s]+', ''));
    IF v_clean_str = '' OR LENGTH(v_clean_str) > 30 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid token number specified.'
        );
    END IF;

    -- Attempt integer parse if numeric
    BEGIN
        v_clean_num := v_clean_str::INT;
    EXCEPTION WHEN OTHERS THEN
        v_clean_num := NULL;
    END;

    -- 3. Determine target date (Asia/Dhaka timezone)
    v_today := (timezone('Asia/Dhaka', NOW()))::DATE;
    v_target_date := COALESCE(p_date, v_today);

    -- 4. Search for appointment on target date
    SELECT 
        a.id,
        a.token_number,
        a.status,
        a.appointment_date,
        d.full_name AS doctor_name,
        COALESCE(d.room_number, '') AS room_number,
        a.created_at
    INTO v_appt
    FROM public.appointments a
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE a.organization_id = p_org_id
      AND a.appointment_date = v_target_date
      AND (
          (v_clean_num IS NOT NULL AND a.token_number = v_clean_num::text)
          OR a.token_number = v_clean_str
      )
    LIMIT 1;

    -- 5. If found on target date, compute status and queue position
    IF v_appt.id IS NOT NULL THEN
        -- Status mapping
        CASE 
            WHEN v_appt.status IN ('IN_CONSULTATION', 'IN_CHAMBER') THEN
                v_status_key := 'serving';
                v_status_label := 'In Consultation Room';
            WHEN v_appt.status = 'CONFIRMED' THEN
                v_status_key := 'calling';
                v_status_label := 'Now Calling';
            WHEN v_appt.status = 'COMPLETED' THEN
                v_status_key := 'done';
                v_status_label := 'Consultation Completed';
            WHEN v_appt.status IN ('CANCELLED', 'NO_SHOW') THEN
                v_status_key := 'skipped';
                v_status_label := 'Appointment Cancelled';
            ELSE
                v_status_key := 'waiting';
                v_status_label := 'Waiting in Queue';
        END CASE;

        -- Count waiting patients ahead with smaller token numbers
        IF v_status_key = 'waiting' THEN
            SELECT COUNT(*)
            INTO v_queue_ahead
            FROM public.appointments a2
            WHERE a2.organization_id = p_org_id
              AND a2.appointment_date = v_target_date
              AND a2.doctor_id = (SELECT doctor_id FROM public.appointments WHERE id = v_appt.id)
              AND a2.status IN ('WAITING', 'SCHEDULED')
              AND a2.token_number < v_appt.token_number;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'found', true,
            'token_number', '#' || v_appt.token_number::text,
            'status', v_status_key,
            'status_label', v_status_label,
            'doctor_name', v_appt.doctor_name,
            'room_number', v_appt.room_number,
            'appointment_date', v_appt.appointment_date,
            'queue_ahead', v_queue_ahead,
            'called_at', TO_CHAR(timezone('Asia/Dhaka', v_appt.created_at), 'HH12:MI AM')
        );
    END IF;

    -- 6. If not found for target date, check if exists on upcoming date
    SELECT a.appointment_date
    INTO v_other_date
    FROM public.appointments a
    WHERE a.organization_id = p_org_id
      AND (
          (v_clean_num IS NOT NULL AND a.token_number = v_clean_num::text)
          OR a.token_number = v_clean_str
      )
      AND a.appointment_date >= v_today
    ORDER BY a.appointment_date ASC
    LIMIT 1;

    IF v_other_date IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'found', false,
            'token_number', '#' || v_clean_str,
            'has_other_date', true,
            'scheduled_date', v_other_date,
            'message', 'This token is scheduled for a different date: ' || v_other_date::text
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'found', false,
        'token_number', '#' || v_clean_str,
        'has_other_date', false,
        'message', 'Token not found for today''s active consultation schedule.'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'Failed to query token status.'
    );
END;
$$;

COMMENT ON FUNCTION public.get_public_token_status(UUID, TEXT, DATE) IS
'Authoritative public token status lookup. Returns safe chamber status and queue position without exposing patient names, phone, or clinical details.';

REVOKE ALL ON FUNCTION public.get_public_token_status(UUID, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_token_status(UUID, TEXT, DATE) TO anon, authenticated, service_role;
