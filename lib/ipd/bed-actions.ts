import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { BedRecord, CabinRecord, WardRecord, BedAssignmentRecord } from "@/types/beds-ot";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 1. Fetch all Wards, Beds, Cabins, and active patient assignments
 */
export async function getBedsAndCabinsAction(): Promise<
  ActionResult<{ beds: BedRecord[]; cabins: CabinRecord[]; wards: WardRecord[] }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();

    // 1. Wards
    const { data: wards, error: wardsErr } = await supabase
      .from("wards")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("name", { ascending: true });

    if (wardsErr) {
      return { success: false, error: wardsErr.message };
    }

    // 2. Beds with ward and bed_type
    const { data: beds, error: bedsErr } = await supabase
      .from("beds")
      .select("*, wards(*), bed_types(*)")
      .eq("organization_id", session.organizationId)
      .order("bed_number", { ascending: true });

    if (bedsErr) {
      return { success: false, error: bedsErr.message };
    }

    // 3. Cabins
    const { data: cabins, error: cabinsErr } = await supabase
      .from("cabins")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("cabin_number", { ascending: true });

    if (cabinsErr) {
      return { success: false, error: cabinsErr.message };
    }

    // 4. Active Bed Assignments with patient details
    const { data: activeAssignments } = await supabase
      .from("bed_assignments")
      .select("*, patients(id, patient_code, full_name, phone, gender)")
      .eq("organization_id", session.organizationId)
      .eq("status", "ACTIVE");

    interface AssignmentRow {
      id: string;
      organization_id: string;
      visit_id: string;
      patient_id: string;
      bed_id?: string | null;
      cabin_id?: string | null;
      assigned_at: string;
      vacated_at?: string | null;
      daily_charge: number;
      status: "ACTIVE" | "TRANSFERRED" | "VACATED";
      assigned_by?: string | null;
      patients?: {
        id?: string;
        patient_code: string;
        full_name: string;
        phone: string;
        gender?: string;
      } | null;
    }

    const assignmentsMap = new Map<string, BedAssignmentRecord>();
    const cabinAssignmentsMap = new Map<string, BedAssignmentRecord>();

    ((activeAssignments || []) as unknown as AssignmentRow[]).forEach((a) => {
      const record: BedAssignmentRecord = {
        ...a,
        patient: a.patients || undefined,
      };
      if (a.bed_id) assignmentsMap.set(a.bed_id, record);
      if (a.cabin_id) cabinAssignmentsMap.set(a.cabin_id, record);
    });

    interface BedRow {
      id: string;
      organization_id: string;
      ward_id: string;
      bed_type_id: string;
      bed_number: string;
      status: "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";
      is_active: boolean;
      created_at?: string;
      wards?: WardRecord | null;
      bed_types?: {
        id: string;
        organization_id: string;
        name: string;
        daily_rate: number;
        description?: string;
      } | null;
    }

    const bedRecords: BedRecord[] = ((beds || []) as unknown as BedRow[]).map((b) => ({
      ...b,
      ward: b.wards || undefined,
      bed_type: b.bed_types || undefined,
      current_assignment: assignmentsMap.get(b.id),
    }));

    const cabinRecords: CabinRecord[] = (cabins || []).map((c) => ({
      ...c,
      current_assignment: cabinAssignmentsMap.get(c.id),
    }));

    return {
      success: true,
      data: {
        beds: bedRecords,
        cabins: cabinRecords,
        wards: wards || [],
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load beds and cabins";
    return { success: false, error: msg };
  }
}

/**
 * 2. Assign Bed or Cabin to Inpatient Admission
 */
export async function assignBedAction(params: {
  visitId: string;
  patientId: string;
  bedId?: string;
  cabinId?: string;
  dailyCharge: number;
}): Promise<ActionResult<{ assignmentId: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("ipd.manage");
  } catch {
    return { success: false, error: "403 Forbidden: ipd.manage required" };
  }

  if (!params.bedId && !params.cabinId) {
    return { success: false, error: "Either Bed ID or Cabin ID must be selected." };
  }

  try {
    const supabase = await createClient();

    // Verify bed or cabin availability
    if (params.bedId) {
      const { data: bed } = await supabase
        .from("beds")
        .select("id, status, bed_number")
        .eq("id", params.bedId)
        .single();

      if (!bed || bed.status !== "VACANT") {
        return { success: false, error: `Bed ${bed?.bed_number || params.bedId} is not vacant.` };
      }

      await supabase.from("beds").update({ status: "OCCUPIED" }).eq("id", params.bedId);
    } else if (params.cabinId) {
      const { data: cabin } = await supabase
        .from("cabins")
        .select("id, status, cabin_number")
        .eq("id", params.cabinId)
        .single();

      if (!cabin || cabin.status !== "VACANT") {
        return { success: false, error: `Cabin ${cabin?.cabin_number || params.cabinId} is not vacant.` };
      }

      await supabase.from("cabins").update({ status: "OCCUPIED" }).eq("id", params.cabinId);
    }

    // Insert bed_assignment
    const { data: assignment, error: assignErr } = await supabase
      .from("bed_assignments")
      .insert({
        organization_id: session.organizationId,
        visit_id: params.visitId,
        patient_id: params.patientId,
        bed_id: params.bedId || null,
        cabin_id: params.cabinId || null,
        daily_charge: params.dailyCharge,
        status: "ACTIVE",
        assigned_by: session.userId,
      })
      .select()
      .single();

    if (assignErr || !assignment) {
      return { success: false, error: assignErr?.message || "Failed to create bed assignment" };
    }

    // Audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "IPD",
      entityType: "bed_assignment",
      entityId: assignment.id,
      newValues: {
        visitId: params.visitId,
        patientId: params.patientId,
        bedId: params.bedId,
        cabinId: params.cabinId,
        dailyCharge: params.dailyCharge,
      },
    });

    return { success: true, data: { assignmentId: assignment.id } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to assign bed";
    return { success: false, error: msg };
  }
}

/**
 * 3. Vacate Bed or Cabin upon discharge or transfer
 */
export async function vacateBedAction(params: {
  assignmentId: string;
  bedId?: string;
  cabinId?: string;
}): Promise<ActionResult<{ vacated: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("ipd.manage");
  } catch {
    return { success: false, error: "403 Forbidden: ipd.manage required" };
  }

  try {
    const supabase = await createClient();

    // Mark assignment vacated
    await supabase
      .from("bed_assignments")
      .update({
        vacated_at: new Date().toISOString(),
        status: "VACATED",
      })
      .eq("id", params.assignmentId);

    // Update bed or cabin to CLEANING
    if (params.bedId) {
      await supabase.from("beds").update({ status: "CLEANING" }).eq("id", params.bedId);
    }
    if (params.cabinId) {
      await supabase.from("cabins").update({ status: "CLEANING" }).eq("id", params.cabinId);
    }

    // Audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "IPD",
      entityType: "bed_assignment",
      entityId: params.assignmentId,
      newValues: { status: "VACATED" },
    });

    return { success: true, data: { vacated: true } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to vacate bed";
    return { success: false, error: msg };
  }
}

/**
 * 4. Update Bed Status (e.g. CLEANING -> VACANT, MAINTENANCE)
 */
export async function updateBedStatusAction(params: {
  bedId: string;
  status: "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";
}): Promise<ActionResult<{ success: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("ipd.manage");
  } catch {
    return { success: false, error: "403 Forbidden: ipd.manage required" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("beds")
      .update({ status: params.status })
      .eq("id", params.bedId)
      .eq("organization_id", session.organizationId);

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "IPD",
      entityType: "bed",
      entityId: params.bedId,
      newValues: { status: params.status },
    });

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update bed status";
    return { success: false, error: msg };
  }
}
