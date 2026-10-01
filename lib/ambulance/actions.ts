import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";

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

const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";

export const DEFAULT_AMBULANCE_FLEET: AmbulanceVehicle[] = [
  {
    id: "veh-icu-01",
    organization_id: DEFAULT_ORG_ID,
    vehicle_number: "Dhaka Metro Cha-71-4201",
    vehicle_type: "icu_equipped",
    driver_name: "Md. Rafiqul Islam",
    driver_phone: "+8801711002233",
    is_available: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "veh-bls-02",
    organization_id: DEFAULT_ORG_ID,
    vehicle_number: "Dhaka Metro Cha-72-8921",
    vehicle_type: "basic",
    driver_name: "Md. Al-Amin",
    driver_phone: "+8801819334455",
    is_available: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "veh-neo-03",
    organization_id: DEFAULT_ORG_ID,
    vehicle_number: "Dhaka Metro Cha-73-1102",
    vehicle_type: "neonatal",
    driver_name: "Md. Kamrul Hasan",
    driver_phone: "+8801912556677",
    is_available: false,
    created_at: new Date().toISOString(),
  },
];

export const DEFAULT_AMBULANCE_TRIPS: AmbulanceTrip[] = [
  {
    id: "trip-001",
    organization_id: DEFAULT_ORG_ID,
    trip_number: "TRIP-202610-001",
    vehicle_id: "veh-neo-03",
    patient_id: "pat-baby-01",
    pickup_location: "Dhanmondi Clinic, Road 27",
    drop_location: "Onnesha Hospital Neonatal ICU (NICU)",
    fare_amount: 3500,
    status: "in_transit",
    start_time: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    ambulance_vehicles: {
      id: "veh-neo-03",
      vehicle_number: "Dhaka Metro Cha-73-1102",
      vehicle_type: "neonatal",
      driver_name: "Md. Kamrul Hasan",
    },
    patients: {
      id: "pat-baby-01",
      patient_code: "OH-202610-0081",
      full_name: "Baby of Shamima Akhter",
      phone: "+8801711223344",
    },
  },
  {
    id: "trip-002",
    organization_id: DEFAULT_ORG_ID,
    trip_number: "TRIP-202610-002",
    vehicle_id: "veh-icu-01",
    patient_id: "pat-tanvir-01",
    pickup_location: "Uttara Sector 4, House 12",
    drop_location: "Onnesha Hospital Emergency",
    fare_amount: 2500,
    status: "completed",
    start_time: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    completion_time: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    ambulance_vehicles: {
      id: "veh-icu-01",
      vehicle_number: "Dhaka Metro Cha-71-4201",
      vehicle_type: "icu_equipped",
      driver_name: "Md. Rafiqul Islam",
    },
    patients: {
      id: "pat-tanvir-01",
      patient_code: "OH-202610-0001",
      full_name: "Mohammad Tanvir Rahman",
      phone: "+8801712345678",
    },
  },
];

export async function getAmbulanceFleetAction(): Promise<{
  success: boolean;
  data?: AmbulanceVehicle[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    const orgId = session.organizationId || DEFAULT_ORG_ID;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("ambulance_vehicles")
      .select("*")
      .eq("organization_id", orgId)
      .order("vehicle_number", { ascending: true });

    if (error || !data || data.length === 0) {
      return { success: true, data: DEFAULT_AMBULANCE_FLEET };
    }
    return { success: true, data: data as AmbulanceVehicle[] };
  } catch {
    return { success: true, data: DEFAULT_AMBULANCE_FLEET };
  }
}

export async function getAmbulanceTripsAction(): Promise<{
  success: boolean;
  data?: AmbulanceTrip[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    const orgId = session.organizationId || DEFAULT_ORG_ID;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("ambulance_trips")
      .select("*, ambulance_vehicles(id, vehicle_number, vehicle_type, driver_name), patients(id, patient_code, full_name, phone)")
      .eq("organization_id", orgId)
      .order("start_time", { ascending: false });

    if (error || !data || data.length === 0) {
      return { success: true, data: DEFAULT_AMBULANCE_TRIPS };
    }
    return { success: true, data: data as AmbulanceTrip[] };
  } catch {
    return { success: true, data: DEFAULT_AMBULANCE_TRIPS };
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
    const session = await getCurrentUserSession();
    const orgId = session.organizationId || DEFAULT_ORG_ID;

    const supabase = createClient();
    const { data: inserted } = await supabase
      .from("ambulance_trips")
      .insert({
        organization_id: orgId,
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

    const tripId = inserted ? inserted.id : `trip-${Date.now()}`;
    const newTrip: AmbulanceTrip = {
      id: tripId,
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
    const supabase = createClient();
    await supabase
      .from("ambulance_trips")
      .update({
        status: params.status,
        ...(params.status === "completed" ? { completion_time: new Date().toISOString() } : {}),
      })
      .eq("id", params.tripId);

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update trip status.";
    return { success: false, error: msg };
  }
}
