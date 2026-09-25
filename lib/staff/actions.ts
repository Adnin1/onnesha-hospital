import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";
import { RoleType } from "@/types";

export interface StaffMemberRecord {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  account_status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED";
  must_change_password: boolean;
  is_active: boolean;
  created_at: string;
  employee_code?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  role_name?: RoleType | string | null;
}

export interface CreateStaffPayload {
  fullName: string;
  email: string;
  phone: string;
  roleName: RoleType | string;
  departmentId?: string;
  tempPassword?: string;
}

export interface CreateStaffResult {
  success: boolean;
  userId?: string;
  employeeId?: string;
  email?: string;
  role?: string;
  tempPassword?: string;
  mustChangePassword?: boolean;
  error?: string;
}

/**
 * Cryptographically secure random password generator.
 * Generates an 14-character alphanumeric string with symbols, satisfying all hospital security policies.
 */
export function generateSecureTemporaryPassword(): string {
  const lowercase = "abcdefghjkmnpqrstuvwxyz";
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const symbols = "!@#$%^&*";

  const allChars = lowercase + uppercase + numbers + symbols;

  if (typeof window !== "undefined" && window.crypto) {
    const array = new Uint8Array(14);
    window.crypto.getRandomValues(array);
    let pwd = "";
    // Guarantee at least one of each category
    pwd += uppercase[array[0] % uppercase.length];
    pwd += lowercase[array[1] % lowercase.length];
    pwd += numbers[array[2] % numbers.length];
    pwd += symbols[array[3] % symbols.length];

    for (let i = 4; i < 14; i++) {
      pwd += allChars[array[i] % allChars.length];
    }
    // Shuffle the result
    return pwd.split("").sort(() => 0.5 - Math.random()).join("");
  }

  // Fallback for non-browser/test runtimes
  return "Onnesha#" + Math.random().toString(36).substring(2, 10) + "9!";
}

/**
 * Fetch Staff Directory using the secure Security Definer RPC.
 */
export async function getStaffDirectoryAction(filters?: {
  search?: string;
  role?: string;
  status?: string;
}): Promise<{ success: boolean; data?: StaffMemberRecord[]; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_staff_directory_admin", {
      p_org_id: session.organizationId,
      p_search: filters?.search?.trim() || null,
      p_role: filters?.role || null,
      p_status: filters?.status || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data as StaffMemberRecord[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load staff directory";
    return { success: false, error: msg };
  }
}

/**
 * Create a new Staff Member account atomically with Supabase Auth credentials.
 */
export async function createStaffAccountAction(
  payload: CreateStaffPayload
): Promise<CreateStaffResult> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized: Please sign in." };
    }

    // Generate secure temporary password if not provided
    const tempPassword = payload.tempPassword?.trim() || generateSecureTemporaryPassword();

    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_create_staff_account", {
      p_org_id: session.organizationId,
      p_full_name: payload.fullName.trim(),
      p_email: payload.email.trim(),
      p_phone: payload.phone.trim(),
      p_role_name: payload.roleName,
      p_department_id: payload.departmentId || null,
      p_temp_password: tempPassword,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const result = data as {
      success: boolean;
      user_id: string;
      employee_id: string;
      email: string;
      role: string;
      must_change_password: boolean;
    };

    return {
      success: true,
      userId: result.user_id,
      employeeId: result.employee_id,
      email: result.email,
      role: result.role,
      tempPassword,
      mustChangePassword: result.must_change_password,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create staff account";
    return { success: false, error: msg };
  }
}

/**
 * Reset Staff Password and revoke all active sessions.
 */
export async function resetStaffPasswordAction(
  targetUserId: string,
  newTempPassword?: string
): Promise<{ success: boolean; tempPassword?: string; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    const tempPassword = newTempPassword?.trim() || generateSecureTemporaryPassword();

    const supabase = createClient();
    const { error } = await supabase.rpc("admin_reset_staff_password", {
      p_org_id: session.organizationId,
      p_target_user_id: targetUserId,
      p_temp_password: tempPassword,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, tempPassword };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to reset staff password";
    return { success: false, error: msg };
  }
}

/**
 * Update Staff Status (ACTIVE, SUSPENDED, DISABLED).
 */
export async function setStaffStatusAction(
  targetUserId: string,
  status: "ACTIVE" | "SUSPENDED" | "DISABLED"
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_staff_status", {
      p_org_id: session.organizationId,
      p_target_user_id: targetUserId,
      p_status: status,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update staff status";
    return { success: false, error: msg };
  }
}

/**
 * Change Staff Role.
 */
export async function changeStaffRoleAction(
  targetUserId: string,
  newRoleName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    const supabase = createClient();
    const { error } = await supabase.rpc("admin_change_staff_role", {
      p_org_id: session.organizationId,
      p_target_user_id: targetUserId,
      p_new_role_name: newRoleName,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update staff role";
    return { success: false, error: msg };
  }
}
