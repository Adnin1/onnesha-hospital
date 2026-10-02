import { createClient } from "../supabase/server";
import { UserProfile, RoleType } from "../../types/database";
import { normalizeRole } from "../utils";
import { DEFAULT_ROLE_PERMISSIONS } from "../permissions";

export interface ServerUserSessionState {
  userId: string | null;
  email: string | null;
  profile: UserProfile | null;
  organizationId: string | null;
  roles: RoleType[];
  permissions: string[];
  aalLevel: "aal1" | "aal2" | null;
  mfaFactorsCount: number;
}

const EMPTY_SERVER_SESSION: ServerUserSessionState = {
  userId: null,
  email: null,
  profile: null,
  organizationId: null,
  roles: [],
  permissions: [],
  aalLevel: null,
  mfaFactorsCount: 0,
};

/**
 * Server-Authoritative User Session Resolver.
 *
 * Derived exclusively from server cookies/headers via `@/lib/supabase/server`.
 * NEVER trusts client-supplied actorUserId, organizationId, or role headers.
 * Resolves user identity, tenant organization boundaries, active roles, and permissions.
 */
export async function getServerUserSession(): Promise<ServerUserSessionState> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return EMPTY_SERVER_SESSION;
    }

    // 1. Fetch user profile from database
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.status === "inactive" || profile.status === "suspended") {
      return EMPTY_SERVER_SESSION;
    }

    const organizationId = profile.organization_id || null;

    // 2. Resolve MFA assurance level
    let aalLevel: "aal1" | "aal2" | null = "aal1";
    let mfaFactorsCount = 0;
    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData) {
        aalLevel = aalData.currentLevel as "aal1" | "aal2";
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (factors?.totp) {
        mfaFactorsCount = factors.totp.filter((f) => f.status === "verified").length;
      }
    } catch (err: unknown) {
      console.error("[ServerSession] MFA metadata lookup error:", err);
    }

    // 3. Resolve active roles strictly scoped to organization
    const roles: RoleType[] = [];
    if (profile.role) {
      const normalized = normalizeRole(profile.role);
      if (normalized) {
        roles.push(normalized as RoleType);
      }
    }

    if (organizationId) {
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role_id, roles(name)")
        .eq("user_id", user.id)
        .eq("organization_id", organizationId);

      if (userRoles) {
        for (const ur of userRoles as unknown as Array<{ roles: { name: string } | null }>) {
          if (ur.roles?.name) {
            const normalized = normalizeRole(ur.roles.name);
            if (normalized && !roles.includes(normalized as RoleType)) {
              roles.push(normalized as RoleType);
            }
          }
        }
      }
    }

    // 4. Resolve permissions for active roles
    const permissionSet = new Set<string>();
    for (const role of roles) {
      const rolePerms = (DEFAULT_ROLE_PERMISSIONS as Record<string, string[]>)[role];
      if (rolePerms) {
        for (const p of rolePerms) {
          permissionSet.add(p);
        }
      }
    }

    return {
      userId: user.id,
      email: user.email || null,
      profile: profile as UserProfile,
      organizationId,
      roles,
      permissions: Array.from(permissionSet),
      aalLevel,
      mfaFactorsCount,
    };
  } catch (err: unknown) {
    console.error("[getServerUserSession exception]", err instanceof Error ? err.message : err);
    return EMPTY_SERVER_SESSION;
  }
}

/**
 * Server-side permission assertion.
 * Throws 401 or 403 error if the user lacks the required permission or tenant scope.
 */
export async function requireServerPermission(
  permissionKey: string,
  expectedOrgId?: string
): Promise<ServerUserSessionState> {
  const session = await getServerUserSession();

  if (!session.userId) {
    throw new Error("401 Unauthorized: Valid authenticated session required.");
  }

  if (expectedOrgId && session.organizationId !== expectedOrgId) {
    throw new Error("403 Forbidden: Cross-tenant access is strictly prohibited.");
  }

  // Super Admin bypass
  if (session.roles.includes("super_admin")) {
    return session;
  }

  if (!session.permissions.includes(permissionKey)) {
    throw new Error(`403 Forbidden: Missing required server permission [${permissionKey}].`);
  }

  return session;
}

/**
 * Server-side AAL2 assertion for sensitive administrative/clinical actions.
 */
export async function requireServerAAL2(): Promise<ServerUserSessionState> {
  const session = await getServerUserSession();

  if (!session.userId) {
    throw new Error("401 Unauthorized: Valid authenticated session required.");
  }

  if (session.mfaFactorsCount <= 0) {
    throw new Error("403 Forbidden: MFA factor registration required for high-risk action.");
  }

  if (session.aalLevel !== "aal2") {
    throw new Error(
      "401 Unauthorized: Verified AAL2 Multi-Factor Authentication session required for high-risk action."
    );
  }

  return session;
}
