"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { normalizeRole } from "@/lib/utils";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkAuthAndMfa() {
      try {
        const supabase = createBrowserClient();
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error || !user) {
          if (isMounted) {
            setIsAuthenticated(false);
            router.push(`/login?redirectTo=${encodeURIComponent(pathname)}`);
          }
          return;
        }

        // Retrieve user profile for active and must_change_password check
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_active, account_status, must_change_password")
          .eq("id", user.id)
          .maybeSingle();

        // 1. Account Status Enforcement (Fail-closed)
        if (profile) {
          const status = profile.account_status || (profile.is_active ? "ACTIVE" : "DISABLED");
          if (status === "SUSPENDED" || status === "DISABLED" || profile.is_active === false) {
            await supabase.auth.signOut();
            if (isMounted) {
              setIsAuthenticated(false);
              router.push(`/login?error=account_deactivated`);
            }
            return;
          }

          // 2. Forced First-Login Password Change Enforcement
          if (profile.must_change_password && !pathname.startsWith("/reset-password")) {
            if (isMounted) {
              setIsAuthenticated(false);
              router.push(`/reset-password?forced=true`);
            }
            return;
          }
        }

        // Retrieve user roles
        const { data: userRoleRecords } = await supabase
          .from("user_roles")
          .select("roles(name)")
          .eq("user_id", user.id);

        const roles: string[] = [];
        if (userRoleRecords) {
          userRoleRecords.forEach((ur: Record<string, unknown>) => {
            const roleObj = ur.roles as { name: string } | null;
            if (roleObj?.name) {
              roles.push(normalizeRole(roleObj.name));
            }
          });
        }

        const isAdmin = roles.includes("super_admin") || roles.includes("hospital_administrator") || roles.includes("admin");

        // Check MFA Assurance Level
        if (isAdmin) {
          const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          const { data: factorData } = await supabase.auth.mfa.listFactors();

          const hasVerifiedFactors = Boolean(
            factorData?.all && factorData.all.some((f: { status: string }) => f.status === "verified")
          );

          if (hasVerifiedFactors && aalData?.currentLevel === "aal1") {
            if (isMounted) {
              setIsAuthenticated(false);
              router.push(`/auth/mfa?redirectTo=${encodeURIComponent(pathname)}`);
            }
            return;
          }
        }

        if (isMounted) {
          setIsAuthenticated(true);
        }
      } catch {
        if (isMounted) {
          setIsAuthenticated(false);
          router.push(`/login?redirectTo=${encodeURIComponent(pathname)}`);
        }
      }
    }

    void checkAuthAndMfa();

    return () => {
      isMounted = false;
    };
  }, [pathname, router]);

  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]" role="status" aria-label="Authenticating session">
        <div className="text-center space-y-3">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-sky-600 border-r-transparent" />
          <p className="text-xs text-slate-500 font-medium">অথেন্টিকেশন সিকিউরিটি যাচাই করা হচ্ছে...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
