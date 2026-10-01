import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { BedRecord, CabinRecord, WardRecord, BedAssignmentRecord } from "@/types/beds-ot";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";

export const DEFAULT_HOSPITAL_WARDS: WardRecord[] = [
  {
    id: "ward-001-male",
    organization_id: DEFAULT_ORG_ID,
    name: "পুরুষ জেনারেল ওয়ার্ড (Male Medical Ward)",
    ward_type: "Male Ward",
    floor_number: "2nd Floor",
    total_beds: 8,
  },
  {
    id: "ward-002-female",
    organization_id: DEFAULT_ORG_ID,
    name: "মহিলা জেনারেল ওয়ার্ড (Female Medical Ward)",
    ward_type: "Female Ward",
    floor_number: "2nd Floor",
    total_beds: 8,
  },
  {
    id: "ward-003-postop",
    organization_id: DEFAULT_ORG_ID,
    name: "পোস্ট-অপারেটিভ রিকভারি ওয়ার্ড (Post-Op Ward)",
    ward_type: "Post-Op",
    floor_number: "3rd Floor",
    total_beds: 4,
  },
  {
    id: "ward-004-pediatric",
    organization_id: DEFAULT_ORG_ID,
    name: "শিশু ওয়ার্ড (Pediatric Ward)",
    ward_type: "Pediatric Ward",
    floor_number: "3rd Floor",
    total_beds: 4,
  },
  {
    id: "ward-005-icu",
    organization_id: DEFAULT_ORG_ID,
    name: "ইনটেনসিভ কেয়ার ইউনিট (ICU Complex)",
    ward_type: "ICU",
    floor_number: "4th Floor",
    total_beds: 4,
  },
];

export const DEFAULT_HOSPITAL_BEDS: BedRecord[] = [
  { id: "bed-mw-101", organization_id: DEFAULT_ORG_ID, ward_id: "ward-001-male", bed_type_id: "bt-gen", bed_number: "MW-101", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[0], bed_type: { id: "bt-gen", organization_id: DEFAULT_ORG_ID, name: "General Bed", daily_rate: 500 } },
  { id: "bed-mw-102", organization_id: DEFAULT_ORG_ID, ward_id: "ward-001-male", bed_type_id: "bt-gen", bed_number: "MW-102", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[0], bed_type: { id: "bt-gen", organization_id: DEFAULT_ORG_ID, name: "General Bed", daily_rate: 500 } },
  { id: "bed-mw-103", organization_id: DEFAULT_ORG_ID, ward_id: "ward-001-male", bed_type_id: "bt-gen", bed_number: "MW-103", status: "CLEANING", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[0], bed_type: { id: "bt-gen", organization_id: DEFAULT_ORG_ID, name: "General Bed", daily_rate: 500 } },
  { id: "bed-mw-104", organization_id: DEFAULT_ORG_ID, ward_id: "ward-001-male", bed_type_id: "bt-gen", bed_number: "MW-104", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[0], bed_type: { id: "bt-gen", organization_id: DEFAULT_ORG_ID, name: "General Bed", daily_rate: 500 } },

  { id: "bed-fw-201", organization_id: DEFAULT_ORG_ID, ward_id: "ward-002-female", bed_type_id: "bt-gen", bed_number: "FW-201", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[1], bed_type: { id: "bt-gen", organization_id: DEFAULT_ORG_ID, name: "General Bed", daily_rate: 500 } },
  { id: "bed-fw-202", organization_id: DEFAULT_ORG_ID, ward_id: "ward-002-female", bed_type_id: "bt-gen", bed_number: "FW-202", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[1], bed_type: { id: "bt-gen", organization_id: DEFAULT_ORG_ID, name: "General Bed", daily_rate: 500 } },
  { id: "bed-fw-203", organization_id: DEFAULT_ORG_ID, ward_id: "ward-002-female", bed_type_id: "bt-gen", bed_number: "FW-203", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[1], bed_type: { id: "bt-gen", organization_id: DEFAULT_ORG_ID, name: "General Bed", daily_rate: 500 } },

  { id: "bed-po-301", organization_id: DEFAULT_ORG_ID, ward_id: "ward-003-postop", bed_type_id: "bt-postop", bed_number: "PO-301", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[2], bed_type: { id: "bt-postop", organization_id: DEFAULT_ORG_ID, name: "Post-Op Bed", daily_rate: 1200 } },
  { id: "bed-po-302", organization_id: DEFAULT_ORG_ID, ward_id: "ward-003-postop", bed_type_id: "bt-postop", bed_number: "PO-302", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[2], bed_type: { id: "bt-postop", organization_id: DEFAULT_ORG_ID, name: "Post-Op Bed", daily_rate: 1200 } },

  { id: "bed-ped-401", organization_id: DEFAULT_ORG_ID, ward_id: "ward-004-pediatric", bed_type_id: "bt-ped", bed_number: "PED-401", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[3], bed_type: { id: "bt-ped", organization_id: DEFAULT_ORG_ID, name: "Pediatric Bed", daily_rate: 600 } },
  { id: "bed-ped-402", organization_id: DEFAULT_ORG_ID, ward_id: "ward-004-pediatric", bed_type_id: "bt-ped", bed_number: "PED-402", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[3], bed_type: { id: "bt-ped", organization_id: DEFAULT_ORG_ID, name: "Pediatric Bed", daily_rate: 600 } },

  { id: "bed-icu-01", organization_id: DEFAULT_ORG_ID, ward_id: "ward-005-icu", bed_type_id: "bt-icu", bed_number: "ICU-01", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[4], bed_type: { id: "bt-icu", organization_id: DEFAULT_ORG_ID, name: "ICU High-Dependency", daily_rate: 5000 } },
  { id: "bed-icu-02", organization_id: DEFAULT_ORG_ID, ward_id: "ward-005-icu", bed_type_id: "bt-icu", bed_number: "ICU-02", status: "VACANT", is_active: true, ward: DEFAULT_HOSPITAL_WARDS[4], bed_type: { id: "bt-icu", organization_id: DEFAULT_ORG_ID, name: "ICU High-Dependency", daily_rate: 5000 } },
];

export const DEFAULT_HOSPITAL_CABINS: CabinRecord[] = [
  { id: "cab-501", organization_id: DEFAULT_ORG_ID, cabin_number: "CAB-501 (VIP Suite)", cabin_type: "VIP_SUITE", floor_number: "5th Floor", daily_rate: 5000, status: "VACANT", amenities: "Central AC, LED TV, Refrigerator, Attendant Bed, Intercom, Attached Luxury Bath" },
  { id: "cab-502", organization_id: DEFAULT_ORG_ID, cabin_number: "CAB-502 (AC Deluxe)", cabin_type: "AC_DELUXE", floor_number: "5th Floor", daily_rate: 2500, status: "VACANT", amenities: "Split AC, TV, Attendant Bed, Attached Bath" },
  { id: "cab-503", organization_id: DEFAULT_ORG_ID, cabin_number: "CAB-503 (Standard AC)", cabin_type: "AC_DELUXE", floor_number: "5th Floor", daily_rate: 2000, status: "VACANT", amenities: "Split AC, Single Sofa, Attached Bath" },
  { id: "cab-504", organization_id: DEFAULT_ORG_ID, cabin_number: "CAB-504 (Non-AC Standard)", cabin_type: "NON_AC_STANDARD", floor_number: "5th Floor", daily_rate: 1200, status: "VACANT", amenities: "Ceiling Fan, Attendant Stool, Attached Bath" },
];

/**
 * 1. Fetch all Wards, Beds, Cabins, and active patient assignments
 */
export async function getBedsAndCabinsAction(): Promise<
  ActionResult<{ beds: BedRecord[]; cabins: CabinRecord[]; wards: WardRecord[] }>
> {
  const session = await getCurrentUserSession();
  const orgId = session.organizationId || DEFAULT_ORG_ID;

  try {
    const supabase = await createClient();

    // 1. Wards
    const { data: dbWards } = await supabase
      .from("wards")
      .select("*")
      .eq("organization_id", orgId)
      .order("name", { ascending: true });

    // 2. Beds (Safe select without embedded relationship that triggers PGRST200)
    const { data: dbBeds } = await supabase
      .from("beds")
      .select("*")
      .eq("organization_id", orgId)
      .order("bed_number", { ascending: true });

    // 3. Cabins
    const { data: dbCabins } = await supabase
      .from("cabins")
      .select("*")
      .eq("organization_id", orgId)
      .order("cabin_number", { ascending: true });

    // 4. Bed Types
    const { data: dbBedTypes } = await supabase
      .from("bed_types")
      .select("*")
      .eq("organization_id", orgId);

    // 5. Active Bed Assignments with patient details
    const { data: activeAssignments } = await supabase
      .from("bed_assignments")
      .select("*, patients(id, patient_code, full_name, phone, gender)")
      .eq("organization_id", orgId)
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

    // Resolve final wards
    const resolvedWards: WardRecord[] = (dbWards && dbWards.length > 0)
      ? (dbWards as WardRecord[])
      : DEFAULT_HOSPITAL_WARDS;

    interface BedRow {
      id: string;
      organization_id: string;
      ward_id?: string;
      bed_type_id?: string;
      bed_number: string;
      daily_rate?: number;
      bed_type?: string;
      status: "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE" | "available" | "occupied" | "cleaning" | "maintenance";
      is_active?: boolean;
      created_at?: string;
    }

    // Resolve final beds
    let resolvedBeds: BedRecord[] = [];
    if (dbBeds && dbBeds.length > 0) {
      resolvedBeds = (dbBeds as BedRow[]).map((b) => {
        const normalizedStatus = (b.status ? b.status.toUpperCase() : "VACANT") as "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";
        const wardObj = resolvedWards.find((w) => w.id === b.ward_id) || resolvedWards[0];
        const typeObj = (dbBedTypes || []).find((bt) => bt.id === b.bed_type_id) || {
          id: b.bed_type_id || "gen",
          organization_id: orgId,
          name: typeof b.bed_type === "string" ? b.bed_type : "General Bed",
          daily_rate: Number(b.daily_rate || 500),
        };
        return {
          id: b.id,
          organization_id: b.organization_id || orgId,
          ward_id: b.ward_id || wardObj.id,
          bed_type_id: b.bed_type_id || typeObj.id,
          bed_number: b.bed_number,
          status: normalizedStatus === "OCCUPIED" || normalizedStatus === "CLEANING" || normalizedStatus === "MAINTENANCE" ? normalizedStatus : "VACANT",
          is_active: b.is_active !== false,
          ward: wardObj,
          bed_type: typeObj,
          current_assignment: assignmentsMap.get(b.id),
        };
      });
    } else {
      resolvedBeds = DEFAULT_HOSPITAL_BEDS.map((b) => ({
        ...b,
        current_assignment: assignmentsMap.get(b.id),
      }));
    }

    // Resolve final cabins
    let resolvedCabins: CabinRecord[] = [];
    if (dbCabins && dbCabins.length > 0) {
      resolvedCabins = (dbCabins as CabinRecord[]).map((c) => ({
        ...c,
        current_assignment: cabinAssignmentsMap.get(c.id),
      }));
    } else {
      resolvedCabins = DEFAULT_HOSPITAL_CABINS.map((c) => ({
        ...c,
        current_assignment: cabinAssignmentsMap.get(c.id),
      }));
    }

    return {
      success: true,
      data: {
        beds: resolvedBeds,
        cabins: resolvedCabins,
        wards: resolvedWards,
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
  await requirePermission("ipd.manage");
  const orgId = session.organizationId || DEFAULT_ORG_ID;
  const userId = session.userId || "usr-system-admin";

  if (!params.bedId && !params.cabinId) {
    return { success: false, error: "Either Bed ID or Cabin ID must be selected." };
  }

  try {
    const supabase = await createClient();

    // Verify bed or cabin availability
    if (params.bedId) {
      const { data: bed } = await supabase.from("beds").select("status").eq("id", params.bedId).single();
      if (bed && bed.status !== "VACANT") {
        return { success: false, error: "Selected bed is not vacant." };
      }
      await supabase.from("beds").update({ status: "OCCUPIED" }).eq("id", params.bedId);
    } else if (params.cabinId) {
      const { data: cabin } = await supabase.from("cabins").select("status").eq("id", params.cabinId).single();
      if (cabin && cabin.status !== "VACANT") {
        return { success: false, error: "Selected cabin is not vacant." };
      }
      await supabase.from("cabins").update({ status: "OCCUPIED" }).eq("id", params.cabinId);
    }

    // Insert bed_assignment
    const { data: assignment } = await supabase
      .from("bed_assignments")
      .insert({
        organization_id: orgId,
        visit_id: params.visitId,
        patient_id: params.patientId,
        bed_id: params.bedId || null,
        cabin_id: params.cabinId || null,
        daily_charge: params.dailyCharge,
        status: "ACTIVE",
        assigned_by: userId,
      })
      .select()
      .single();

    const assignmentId = assignment ? assignment.id : `asg-${Date.now()}`;

    // Audit log
    await recordAuditLog({
      organizationId: orgId,
      userId: userId,
      action: "CREATE",
      module: "IPD",
      entityType: "bed_assignment",
      entityId: assignmentId,
      newValues: {
        visitId: params.visitId,
        patientId: params.patientId,
        bedId: params.bedId,
        cabinId: params.cabinId,
        dailyCharge: params.dailyCharge,
      },
    });

    return { success: true, data: { assignmentId } };
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
  const orgId = session.organizationId || DEFAULT_ORG_ID;
  const userId = session.userId || "usr-system-admin";

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
      organizationId: orgId,
      userId: userId,
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
  await requirePermission("ipd.manage");
  const orgId = session.organizationId || DEFAULT_ORG_ID;
  const userId = session.userId || "usr-system-admin";

  try {
    const supabase = await createClient();
    await supabase
      .from("beds")
      .update({ status: params.status })
      .eq("id", params.bedId);

    await recordAuditLog({
      organizationId: orgId,
      userId: userId,
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

/**
 * 5. Update Cabin Status (e.g. CLEANING -> VACANT, MAINTENANCE)
 */
export async function updateCabinStatusAction(params: {
  cabinId: string;
  status: "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";
}): Promise<ActionResult<{ success: boolean }>> {
  const session = await getCurrentUserSession();
  const orgId = session.organizationId || DEFAULT_ORG_ID;
  const userId = session.userId || "usr-system-admin";

  try {
    const supabase = await createClient();
    await supabase
      .from("cabins")
      .update({ status: params.status })
      .eq("id", params.cabinId);

    await recordAuditLog({
      organizationId: orgId,
      userId: userId,
      action: "UPDATE",
      module: "IPD",
      entityType: "cabin",
      entityId: params.cabinId,
      newValues: { status: params.status },
    });

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update cabin status";
    return { success: false, error: msg };
  }
}

/**
 * 6. Add New Bed Dynamically
 */
export async function addBedAction(payload: {
  bed_number: string;
  ward_id: string;
  daily_rate: number;
  bed_type?: string;
}): Promise<ActionResult<{ bed: BedRecord }>> {
  const session = await getCurrentUserSession();
  const orgId = session.organizationId || DEFAULT_ORG_ID;
  const userId = session.userId || "usr-system-admin";

  try {
    const supabase = await createClient();
    const { data: inserted } = await supabase
      .from("beds")
      .insert({
        organization_id: orgId,
        bed_number: payload.bed_number.trim(),
        daily_rate: payload.daily_rate,
        status: "VACANT",
        bed_type: payload.bed_type || "General",
      })
      .select()
      .single();

    const bedId = inserted ? inserted.id : `bed-${Date.now()}`;
    const newBed: BedRecord = {
      id: bedId,
      organization_id: orgId,
      ward_id: payload.ward_id,
      bed_type_id: "bt-custom",
      bed_number: payload.bed_number,
      status: "VACANT",
      is_active: true,
      bed_type: {
        id: "bt-custom",
        organization_id: orgId,
        name: payload.bed_type || "General",
        daily_rate: payload.daily_rate,
      },
    };

    await recordAuditLog({
      organizationId: orgId,
      userId: userId,
      action: "CREATE",
      module: "IPD",
      entityType: "bed",
      entityId: bedId,
      newValues: payload,
    });

    return { success: true, data: { bed: newBed } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to add bed";
    return { success: false, error: msg };
  }
}

/**
 * 7. Add New Cabin Dynamically
 */
export async function addCabinAction(payload: {
  cabin_number: string;
  cabin_type: "AC_DELUXE" | "NON_AC_STANDARD" | "VIP_SUITE";
  floor_number: string;
  daily_rate: number;
  amenities?: string;
}): Promise<ActionResult<{ cabin: CabinRecord }>> {
  const session = await getCurrentUserSession();
  const orgId = session.organizationId || DEFAULT_ORG_ID;
  const userId = session.userId || "usr-system-admin";

  try {
    const supabase = await createClient();
    const { data: inserted } = await supabase
      .from("cabins")
      .insert({
        organization_id: orgId,
        cabin_number: payload.cabin_number.trim(),
        cabin_type: payload.cabin_type,
        floor_number: payload.floor_number,
        daily_rate: payload.daily_rate,
        status: "VACANT",
        amenities: payload.amenities || "AC, TV, Attached Bath",
      })
      .select()
      .single();

    const cabinId = inserted ? inserted.id : `cab-${Date.now()}`;
    const newCabin: CabinRecord = {
      id: cabinId,
      organization_id: orgId,
      cabin_number: payload.cabin_number,
      cabin_type: payload.cabin_type,
      floor_number: payload.floor_number,
      daily_rate: payload.daily_rate,
      status: "VACANT",
      amenities: payload.amenities || "AC, TV, Attached Bath",
    };

    await recordAuditLog({
      organizationId: orgId,
      userId: userId,
      action: "CREATE",
      module: "IPD",
      entityType: "cabin",
      entityId: cabinId,
      newValues: payload,
    });

    return { success: true, data: { cabin: newCabin } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to add cabin";
    return { success: false, error: msg };
  }
}
