import { createClient } from "@/lib/supabase/client";
import { UserProfile, RoleType } from "@/types/database";

/**
 * Server-side helper to retrieve the authenticated user session and database profile.
 */
export async function getCurrentUserSession(): Promise<{
  userId: string | null;
  email: string | null;
  profile: UserProfile | null;
  organizationId: string | null;
  roles: RoleType[];
  permissions: string[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        userId: null,
        email: null,
        profile: null,
        organizationId: null,
        roles: [],
        permissions: [],
      };
    }

    // Retrieve profile from database
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // Retrieve user roles for active organization
    const { data: userRoleRecords } = await supabase
      .from("user_roles")
      .select("role_id, organization_id, roles(name)")
      .eq("user_id", user.id);

    const roles: RoleType[] = [];
    let organizationId = profile?.active_organization_id || null;

    interface UserRoleRecord {
      role_id: string;
      organization_id?: string;
      roles: { name: string } | null;
    }

    interface RolePermissionRecord {
      permission_key: string;
    }

    if (userRoleRecords && userRoleRecords.length > 0) {
      (userRoleRecords as unknown as UserRoleRecord[]).forEach((ur) => {
        if (ur.roles?.name) {
          roles.push(ur.roles.name.toLowerCase() as RoleType);
        }
        if (!organizationId && ur.organization_id) {
          organizationId = ur.organization_id;
        }
      });
    }

    // Retrieve permissions
    const roleIds = (userRoleRecords as unknown as UserRoleRecord[])?.map((r) => r.role_id) || [];
    const { data: permRecords } = await supabase
      .from("role_permissions")
      .select("permission_key")
      .in("role_id", roleIds);

    const permissions = (permRecords as unknown as RolePermissionRecord[])?.map((p) => p.permission_key) || [];

    return {
      userId: user.id,
      email: user.email || null,
      profile: profile || null,
      organizationId,
      roles,
      permissions,
    };
  } catch {
    return {
      userId: null,
      email: null,
      profile: null,
      organizationId: null,
      roles: [],
      permissions: [],
    };
  }
}

/**
 * Server-side check for specific permission.
 */
export async function hasPermission(permissionKey: string): Promise<boolean> {
  const session = await getCurrentUserSession();
  if (session.roles.includes("super_admin") || session.roles.includes("admin")) {
    return true;
  }
  return session.permissions.includes(permissionKey);
}

/**
 * Server-side assertion that throws or returns false if unauthorized.
 */
export async function requirePermission(permissionKey: string): Promise<void> {
  const permitted = await hasPermission(permissionKey);
  if (!permitted) {
    throw new Error(`403 Forbidden: Missing required permission [${permissionKey}]`);
  }
}
