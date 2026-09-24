"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  User,
} from "lucide-react";
import { HOSPITAL_NAV_SECTIONS } from "@/config/navigation";
import { RoleType } from "@/types";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { getCurrentUserSession } from "@/lib/auth/session";
import { normalizeRole } from "@/lib/utils";

export function HospitalSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeRole, setActiveRole] = useState<RoleType | null>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [userName, setUserName] = useState<string>("Hospital Staff");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function initSession() {
      try {
        setIsLoadingSession(true);
        const session = await getCurrentUserSession();
        if (isMounted) {
          if (session.userId) {
            const rawRole = normalizeRole(session.roles[0]) as RoleType;
            const validRoles: RoleType[] = [
              "super_admin",
              "hospital_administrator",
              "admin",
              "doctor",
              "receptionist",
              "nurse",
              "pharmacist",
              "lab_technologist",
              "lab_technician",
              "accountant",
              "hr_payroll",
              "hr",
            ];
            const primaryRole: RoleType | null = validRoles.includes(rawRole)
              ? rawRole
              : null;

            setActiveRole(primaryRole);
            setUserPermissions(
              session.permissions.length > 0
                ? session.permissions
                : (primaryRole ? DEFAULT_ROLE_PERMISSIONS[primaryRole] : []) || []
            );
            setUserName(session.profile?.full_name || session.email?.split("@")[0] || "Hospital Staff");
            setUserEmail(session.email);
          } else {
            // Unauthenticated state
            setActiveRole(null);
            setUserPermissions([]);
            setUserName("Unauthenticated");
            setUserEmail(null);
          }
          setIsLoadingSession(false);
        }
      } catch {
        if (isMounted) {
          setActiveRole(null);
          setUserPermissions([]);
          setIsLoadingSession(false);
        }
      }
    }

    void initSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      const { createBrowserClientInstance } = await import("@/lib/supabase/browser");
      const supabase = createBrowserClientInstance();
      await supabase.auth.signOut();
    } catch {
      // Ignored
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // Privacy mode safety
      }
    }
    router.push("/login");
  };

  const isSuperAdmin = activeRole === "super_admin";

  return (
    <>
      {/* Mobile Toggle Button */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-3 bg-sky-600 hover:bg-sky-500 text-white rounded-full shadow-lg transition focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={mobileOpen ? "Close Navigation Menu" : "Open Navigation Menu"}
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 bg-slate-900 text-slate-200 border-r border-slate-800 flex flex-col transition-all duration-300 no-print ${
          collapsed ? "w-20" : "w-64"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          <Link href="/app/dashboard" className="flex items-center space-x-3 overflow-hidden focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-lg">
            <div className="w-9 h-9 rounded-xl bg-sky-600 text-white font-bold flex items-center justify-center text-lg shrink-0 shadow-md">
              OH
            </div>
            {!collapsed && (
              <div className="truncate">
                <span className="font-bold text-sm text-white tracking-tight block">
                  ONNESHA ERP
                </span>
                <span className="text-[10px] text-sky-400 font-medium block">
                  Hospital Portal
                </span>
              </div>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[32px] min-w-[32px] items-center justify-center"
            aria-label={collapsed ? "Expand sidebar navigation" : "Collapse sidebar navigation"}
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${collapsed ? "" : "rotate-180"}`} />
          </button>
        </div>

        {/* Real Authenticated Role Badge (No local role switcher) */}
        {!collapsed && (
          <div className="p-3 mx-3 my-2 bg-slate-800/80 rounded-xl border border-slate-700/60">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Verified Staff Role
              </span>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
            <div className="mt-1.5">
              {isLoadingSession ? (
                <div className="h-5 bg-slate-700 animate-pulse rounded text-[11px] px-2 py-0.5 text-slate-400">
                  Verifying session...
                </div>
              ) : activeRole ? (
                <div className="text-xs font-semibold text-white tracking-wide uppercase bg-slate-900 border border-slate-700 rounded-md px-2 py-1">
                  {activeRole.replace(/_/g, " ")}
                </div>
              ) : (
                <div className="text-[11px] text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded-md px-2 py-1">
                  Restricted Access
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="grow overflow-y-auto px-3 py-2 space-y-4" aria-label="Hospital ERP Navigation">
          {HOSPITAL_NAV_SECTIONS.map((section, idx) => {
            const visibleItems = section.items.filter((item) =>
              isSuperAdmin || userPermissions.includes(item.perm)
            );

            if (visibleItems.length === 0) return null;

            return (
              <div key={idx} className="space-y-1">
                {!collapsed && (
                  <h4 className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {section.title}
                  </h4>
                )}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center px-2.5 py-2 rounded-xl text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                        isActive
                          ? "bg-sky-600 text-white font-semibold shadow-2xs"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="ml-3 truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Bottom User Profile & Sign Out */}
        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center justify-between">
            {!collapsed && (
              <div className="truncate mr-2 flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-white truncate">{userName}</p>
                  <p className="text-[10px] text-slate-400 font-mono truncate" title={userEmail || ""}>
                    {userEmail || (activeRole ? activeRole.replace(/_/g, " ") : "staff")}
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Sign Out"
              aria-label="Sign Out of Session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
