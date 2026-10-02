import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { PERMISSIONS } from "@/lib/permissions";
import { OTBookingRecord, OTRoomRecord } from "@/types/beds-ot";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ActiveVisitRecord {
  id: string;
  visit_number: string;
  patient_id: string;
  visit_type: string;
  patient?: {
    id: string;
    patient_code: string;
    full_name: string;
    phone: string;
  };
}

/**
 * 1. Fetch OT Rooms
 */
export async function getOTRoomsAction(): Promise<
  ActionResult<{ rooms: OTRoomRecord[] }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.OT_VIEW);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ot_rooms")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("room_number", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { rooms: data || [] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load OT rooms";
    return { success: false, error: msg };
  }
}

/**
 * 2. Fetch OT Bookings
 */
export async function getOTBookingsAction(): Promise<
  ActionResult<{ bookings: OTBookingRecord[] }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.OT_VIEW);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ot_bookings")
      .select(`
        *,
        ot_rooms (*),
        lead_surgeon:doctors!ot_bookings_lead_surgeon_id_fkey (*),
        patient_visits (
          patients (id, patient_code, full_name, phone)
        )
      `)
      .eq("organization_id", session.organizationId)
      .order("scheduled_start", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    interface OtBookingRow {
      id: string;
      organization_id: string;
      visit_id: string;
      ot_room_id: string;
      procedure_name: string;
      lead_surgeon_id: string;
      anesthetist_id?: string | null;
      anesthesia_type?: string;
      scheduled_start: string;
      scheduled_end: string;
      status: "SCHEDULED" | "IN_SURGERY" | "COMPLETED" | "CANCELLED";
      ot_charge: number;
      created_at?: string;
      ot_rooms?: OTRoomRecord | null;
      lead_surgeon?: {
        id: string;
        full_name: string;
        specialization: string;
        designation?: string;
      } | null;
      patient_visits?: {
        patients?: {
          id: string;
          patient_code: string;
          full_name: string;
          phone: string;
        } | null;
      } | null;
    }

    const bookings: OTBookingRecord[] = ((data || []) as unknown as OtBookingRow[]).map((b) => ({
      ...b,
      ot_room: b.ot_rooms || undefined,
      lead_surgeon: b.lead_surgeon || undefined,
      patient: b.patient_visits?.patients || undefined,
    }));

    return { success: true, data: { bookings } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load OT bookings";
    return { success: false, error: msg };
  }
}

/**
 * 3. Book Operation Theater
 */
export async function bookOTAction(params: {
  visitId: string;
  otRoomId: string;
  procedureName: string;
  leadSurgeonId: string;
  anesthetistId?: string;
  anesthesiaType?: string;
  scheduledStart: string;
  scheduledEnd: string;
  otCharge?: number;
}): Promise<ActionResult<{ bookingId: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("ot.manage");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: ot.manage required" };
  }

  if (!params.procedureName || !params.procedureName.trim()) {
    return { success: false, error: "Procedure name is required" };
  }

  if (new Date(params.scheduledEnd).getTime() <= new Date(params.scheduledStart).getTime()) {
    return { success: false, error: "Scheduled end time must be after scheduled start time" };
  }

  if (!params.otRoomId) {
    return { success: false, error: "OT Room is required" };
  }

  if (!params.leadSurgeonId) {
    return { success: false, error: "Lead Surgeon is required" };
  }

  if (!params.visitId || params.visitId === "00000000-0000-0000-0000-000000000000") {
    return { success: false, error: "A valid patient visit is required" };
  }

  try {
    const supabase = await createClient();

    // Verify room belongs to active organization
    const { data: room } = await supabase
      .from("ot_rooms")
      .select("id")
      .eq("id", params.otRoomId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (!room) {
      return { success: false, error: "OT Room not found in this organization" };
    }

    // Verify lead surgeon belongs to active organization
    const { data: surgeon } = await supabase
      .from("doctors")
      .select("id")
      .eq("id", params.leadSurgeonId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (!surgeon) {
      return { success: false, error: "Lead Surgeon not found in this organization" };
    }

    // Verify patient visit belongs to active organization
    const { data: visit } = await supabase
      .from("patient_visits")
      .select("id")
      .eq("id", params.visitId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (!visit) {
      return { success: false, error: "Patient visit not found in this organization" };
    }

    // Check for overlapping bookings in the same room
    const { data: overlappingBookings, error: overlapErr } = await supabase
      .from("ot_bookings")
      .select("id")
      .eq("organization_id", session.organizationId)
      .eq("ot_room_id", params.otRoomId)
      .in("status", ["SCHEDULED", "IN_SURGERY"])
      .lt("scheduled_start", params.scheduledEnd)
      .gt("scheduled_end", params.scheduledStart);

    if (overlapErr) {
      return { success: false, error: overlapErr.message };
    }

    if (overlappingBookings && overlappingBookings.length > 0) {
      return { success: false, error: "OT Room is already booked for the selected time window" };
    }

    const { data, error } = await supabase
      .from("ot_bookings")
      .insert({
        organization_id: session.organizationId,
        visit_id: params.visitId,
        ot_room_id: params.otRoomId,
        procedure_name: params.procedureName.trim(),
        lead_surgeon_id: params.leadSurgeonId,
        anesthetist_id: params.anesthetistId || null,
        anesthesia_type: params.anesthesiaType || "GENERAL",
        scheduled_start: params.scheduledStart,
        scheduled_end: params.scheduledEnd,
        ot_charge: params.otCharge || 5000.0,
        status: "SCHEDULED",
      })
      .select()
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to book OT" };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "IPD",
      entityType: "ot_booking",
      entityId: data.id,
      newValues: {
        procedureName: params.procedureName,
        otRoomId: params.otRoomId,
        leadSurgeonId: params.leadSurgeonId,
        scheduledStart: params.scheduledStart,
      },
    });

    return { success: true, data: { bookingId: data.id } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to book OT";
    return { success: false, error: msg };
  }
}

/**
 * 4. Update OT Booking Status
 */
export async function updateOTBookingStatusAction(params: {
  bookingId: string;
  status: "SCHEDULED" | "IN_SURGERY" | "COMPLETED" | "CANCELLED";
}): Promise<ActionResult<{ success: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("ot.manage");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: ot.manage required" };
  }

  try {
    const supabase = await createClient();
    const { data: booking, error } = await supabase
      .from("ot_bookings")
      .update({ status: params.status })
      .eq("id", params.bookingId)
      .eq("organization_id", session.organizationId)
      .select("ot_room_id")
      .single();

    if (error || !booking) {
      return { success: false, error: error?.message || "Failed to update OT status" };
    }

    if (params.status === "IN_SURGERY") {
      await supabase
        .from("ot_rooms")
        .update({ status: "IN_SURGERY" })
        .eq("id", booking.ot_room_id)
        .eq("organization_id", session.organizationId);
    } else if (params.status === "COMPLETED") {
      await supabase
        .from("ot_rooms")
        .update({ status: "STERILIZING" })
        .eq("id", booking.ot_room_id)
        .eq("organization_id", session.organizationId);
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "IPD",
      entityType: "ot_booking",
      entityId: params.bookingId,
      newValues: { status: params.status },
    });

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update OT status";
    return { success: false, error: msg };
  }
}

/**
 * 5. Fetch Active Patient Visits for OT Booking
 */
export async function getActiveVisitsAction(): Promise<
  ActionResult<{ visits: ActiveVisitRecord[] }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.OT_VIEW);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("patient_visits")
      .select(`
        id,
        visit_number,
        patient_id,
        visit_type,
        patients (
          id,
          patient_code,
          full_name,
          phone
        )
      `)
      .eq("organization_id", session.organizationId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    interface VisitDbRow {
      id: string;
      visit_number: string;
      patient_id: string;
      visit_type: string;
      patients?: {
        id: string;
        patient_code: string;
        full_name: string;
        phone: string;
      } | null;
    }

    const visits: ActiveVisitRecord[] = ((data || []) as unknown as VisitDbRow[]).map((v) => ({
      id: v.id,
      visit_number: v.visit_number,
      patient_id: v.patient_id,
      visit_type: v.visit_type,
      patient: v.patients || undefined,
    }));

    return { success: true, data: { visits } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load active patient visits";
    return { success: false, error: msg };
  }
}
