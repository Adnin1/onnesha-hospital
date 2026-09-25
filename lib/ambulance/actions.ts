import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";

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
  };
}

export async function getAmbulanceFleetAction(): Promise<{
  success: boolean;
  data?: AmbulanceVehicle[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("ambulance_vehicles")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("vehicle_number", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as AmbulanceVehicle[] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load ambulance fleet." };
  }
}

export async function getAmbulanceTripsAction(): Promise<{
  success: boolean;
  data?: AmbulanceTrip[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("ambulance_trips")
      .select("*, ambulance_vehicles(id, vehicle_number, vehicle_type, driver_name), patients(id, patient_code, full_name)")
      .eq("organization_id", session.organizationId)
      .order("start_time", { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as AmbulanceTrip[] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load ambulance trips." };
  }
}

export async function dispatchAmbulanceTripAction(payload: {
  trip_number: string;
  vehicle_id: string;
  patient_id?: string;
  pickup_location: string;
  drop_location: string;
  fare_amount: number;
}): Promise<{ success: boolean; data?: AmbulanceTrip; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }
    await requirePermission("clinical.write");

    const supabase = createClient();
    const { data, error } = await supabase
      .from("ambulance_trips")
      .insert({
        organization_id: session.organizationId,
        trip_number: payload.trip_number,
        vehicle_id: payload.vehicle_id,
        patient_id: payload.patient_id,
        pickup_location: payload.pickup_location,
        drop_location: payload.drop_location,
        fare_amount: payload.fare_amount,
        status: "dispatched",
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as AmbulanceTrip };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to dispatch ambulance trip." };
  }
}
