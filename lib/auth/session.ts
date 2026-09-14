import { createBrowserClient } from "../supabase/client";
import { UserProfile, RoleType } from "../../types/database";

export interface UserSessionState {
  userId: string | null;
  email: string | null;
  profile: UserProfile | null;
  organizationId: string | null;
  roles: RoleType[];
  permissions: string[];
  aalLevel: "aal1" | "aal2" | null;
  nextAalLevel: "aal1" | "aal2" | null;
  mfaFactorsCount: number;
}

/**
 * Universal helper to retrieve the authenticated user session, database profile,
 * organization roles, permissions, and MFA assurance level (AAL1 vs AAL2).
 * Universal across Client Components, Server Components, and Server Actions.
 */
export async function getCurrentUserSession(): Promise<UserSessionState> {
  try {
    const supabase = createBrowserClient();

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
        aalLevel: null,
        nextAalLevel: null,
        mfaFactorsCount: 0,
      };
    }

    // Retrieve MFA Assurance Level
    let aalLevel: "aal1" | "aal2" | null = "aal1";
    let nextAalLevel: "aal1" | "aal2" | null = "aal1";
    let mfaFactorsCount = 0;

    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData) {
        aalLevel = aalData.currentLevel as "aal1" | "aal2";
        nextAalLevel = aalData.nextLevel as "aal1" | "aal2";
      }

      const { data: factorData } = await supabase.auth.mfa.listFactors();
      if (factorData && factorData.all) {
        mfaFactorsCount = factorData.all.filter((f) => f.status === "verified").length;
      }
    } catch {
      // Fallback if MFA API is unavailable
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
    const permissions: string[] = [];

    if (roleIds.length > 0) {
      const { data: permRecords } = await supabase
        .from("role_permissions")
        .select("permission_key")
        .in("role_id", roleIds);

      if (permRecords) {
        (permRecords as unknown as RolePermissionRecord[]).forEach((p) => {
          permissions.push(p.permission_key);
        });
      }
    }

    return {
      userId: user.id,
      email: user.email || null,
      profile: profile || null,
      organizationId,
      roles,
      permissions,
      aalLevel,
      nextAalLevel,
      mfaFactorsCount,
    };
  } catch {
    return {
      userId: null,
      email: null,
      profile: null,
      organizationId: null,
      roles: [],
      permissions: [],
      aalLevel: null,
      nextAalLevel: null,
      mfaFactorsCount: 0,
    };
  }
}

/**
 * Check for specific permission.
 */
export async function hasPermission(permissionKey: string): Promise<boolean> {
  const session = await getCurrentUserSession();
  if (session.roles.includes("super_admin") || session.roles.includes("admin")) {
    return true;
  }
  return session.permissions.includes(permissionKey);
}

/**
 * Assertion that throws or returns false if unauthorized.
 */
export async function requirePermission(permissionKey: string): Promise<void> {
  const permitted = await hasPermission(permissionKey);
  if (!permitted) {
    throw new Error(`403 Forbidden: Missing required permission [${permissionKey}]`);
  }
}

/**
 * Assertion requiring AAL2 assurance for high-risk operations.
 * Fails closed: if user has enrolled MFA factors and current level is not AAL2, or if session/auth fails.
 */
export async function requireAAL2(): Promise<void> {
  const session = await getCurrentUserSession();
  if (!session.userId) {
    throw new Error("401 Unauthorized: Valid user session required.");
  }

  // If user has verified MFA factors, current level MUST be AAL2
  if (session.mfaFactorsCount > 0 && session.aalLevel !== "aal2") {
    throw new Error("401 Unauthorized: AAL2 Multi-Factor Authentication required for high-risk action.");
  }

  // Admin users performing high-risk actions must have active verified MFA
  const isAdmin = session.roles.includes("admin") || session.roles.includes("super_admin");
  if (isAdmin && session.mfaFactorsCount > 0 && session.aalLevel !== "aal2") {
    throw new Error("403 Forbidden: Admin high-risk action requires verified AAL2 TOTP MFA.");
  }
}
