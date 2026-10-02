import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";

export interface AmbulanceVehicle {
  id: string;
  organization_id: string;
  vehicle_number: string;
  vehicle_type: "basic" | "icu_equipped" | "neonatal";
  driver_name: string;
  driver_phone: string;
  is_available: boolean;
  created_at: string;
}

export interface AmbulanceTrip {
  id: string;
  organization_id: string;
  trip_number: string;
  vehicle_id: string;
  patient_id?: string;
  pickup_location: string;
  drop_location: string;
  fare_amount: number;
  status: "dispatched" | "in_transit" | "completed" | "cancelled";
  start_time: string;
  completion_time?: string;
  created_at: string;
  ambulance_vehicles?: {
    id: string;
    vehicle_number: string;
    vehicle_type: string;
    driver_name: string;
  };
  patients?: {
    id: string;
    patient_code: string;
    full_name: string;
    phone?: string;
  };
}

export async function getAmbulanceFleetAction(): Promise<{
  success: boolean;
  data?: AmbulanceVehicle[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    await requirePermission(PERMISSIONS.AMBULANCE_VIEW);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("ambulance_vehicles")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("vehicle_number", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as AmbulanceVehicle[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load ambulance fleet.";
    return { success: false, error: msg };
  }
}

export async function getAmbulanceTripsAction(): Promise<{
  success: boolean;
  data?: AmbulanceTrip[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    await requirePermission(PERMISSIONS.AMBULANCE_VIEW);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("ambulance_trips")
      .select("*, ambulance_vehicles(id, vehicle_number, vehicle_type, driver_name), patients(id, patient_code, full_name, phone)")
      .eq("organization_id", session.organizationId)
      .order("start_time", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as AmbulanceTrip[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load ambulance trips.";
    return { success: false, error: msg };
  }
}

export async function dispatchAmbulanceTripAction(payload: {
  trip_number: string;
  vehicle_id: string;
  patient_id?: string;
  pickup_location: string;
  drop_location: string;
  fare_amount: number;
  patient_name?: string;
  patient_code?: string;
  vehicle_number?: string;
  driver_name?: string;
  vehicle_type?: string;
}): Promise<{ success: boolean; data?: AmbulanceTrip; error?: string }> {
  try {
    if (!payload.pickup_location || payload.pickup_location.trim().length < 2) {
      return { success: false, error: "পিকআপ লোকেশন উল্লেখ করা আবশ্যক।" };
    }
    if (!payload.drop_location || payload.drop_location.trim().length < 2) {
      return { success: false, error: "গন্তব্য / ড্রপ লোকেশন উল্লেখ করা আবশ্যক।" };
    }
    if (payload.fare_amount < 0) {
      return { success: false, error: "ভাড়া ঋণাত্মক হতে পারে না।" };
    }

    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    await requirePermission(PERMISSIONS.AMBULANCE_MANAGE);

    const orgId = session.organizationId;
    const supabase = createClient();

    // Set vehicle status to on_trip and is_available to false
    const { error: vehicleErr } = await supabase
      .from("ambulance_vehicles")
      .update({ status: "on_trip", is_available: false })
      .eq("id", payload.vehicle_id)
      .eq("organization_id", orgId);

    if (vehicleErr) {
      return { success: false, error: vehicleErr.message };
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("ambulance_trips")
      .insert({
        organization_id: orgId,
        trip_number: payload.trip_number,
        vehicle_id: payload.vehicle_id,
        patient_id: payload.patient_id,
        pickup_location: payload.pickup_location.trim(),
        drop_location: payload.drop_location.trim(),
        fare_amount: payload.fare_amount,
        status: "dispatched",
      })
      .select()
      .single();

    if (insertErr || !inserted) {
      // Rollback vehicle status on trip failure
      await supabase
        .from("ambulance_vehicles")
        .update({ status: "available", is_available: true })
        .eq("id", payload.vehicle_id)
        .eq("organization_id", orgId);

      return {
        success: false,
        error: insertErr?.message || "Failed to dispatch ambulance trip.",
      };
    }

    const newTrip: AmbulanceTrip = {
      id: inserted.id,
      organization_id: orgId,
      trip_number: payload.trip_number,
      vehicle_id: payload.vehicle_id,
      patient_id: payload.patient_id,
      pickup_location: payload.pickup_location,
      drop_location: payload.drop_location,
      fare_amount: payload.fare_amount,
      status: "dispatched",
      start_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
      ambulance_vehicles: {
        id: payload.vehicle_id,
        vehicle_number: payload.vehicle_number || "Dhaka Metro Cha-71-4201",
        vehicle_type: payload.vehicle_type || "icu_equipped",
        driver_name: payload.driver_name || "Assigned Driver",
      },
      patients: payload.patient_id ? {
        id: payload.patient_id,
        patient_code: payload.patient_code || "OH-P-001",
        full_name: payload.patient_name || "Emergency Patient",
      } : undefined,
    };

    return { success: true, data: newTrip };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to dispatch ambulance trip.";
    return { success: false, error: msg };
  }
}

export async function updateAmbulanceTripStatusAction(params: {
  tripId: string;
  status: "dispatched" | "in_transit" | "completed" | "cancelled";
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    await requirePermission(PERMISSIONS.AMBULANCE_MANAGE);

    const orgId = session.organizationId;
    const supabase = createClient();

    const { error: tripUpdateErr } = await supabase
      .from("ambulance_trips")
      .update({
        status: params.status,
        ...(params.status === "completed" ? { completion_time: new Date().toISOString() } : {}),
      })
      .eq("id", params.tripId)
      .eq("organization_id", orgId);

    if (tripUpdateErr) {
      return { success: false, error: tripUpdateErr.message };
    }

    // Release vehicle upon completion or cancellation, or set busy upon dispatch or transit
    const { data: trip } = await supabase
      .from("ambulance_trips")
      .select("vehicle_id")
      .eq("id", params.tripId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (trip && trip.vehicle_id) {
      if (params.status === "completed" || params.status === "cancelled") {
        await supabase
          .from("ambulance_vehicles")
          .update({ status: "available", is_available: true })
          .eq("id", trip.vehicle_id)
          .eq("organization_id", orgId);
      } else if (params.status === "dispatched" || params.status === "in_transit") {
        await supabase
          .from("ambulance_vehicles")
          .update({ status: "on_trip", is_available: false })
          .eq("id", trip.vehicle_id)
          .eq("organization_id", orgId);
      }
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update trip status.";
    return { success: false, error: msg };
  }
}
