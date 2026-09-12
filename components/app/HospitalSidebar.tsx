"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  Stethoscope,
  Activity,
  Bed,
  Receipt,
  Microscope,
  Pill,
  Scissors,
  FileText,
  UserCheck,
  BarChart3,
  Settings,
  LogOut,
  ShieldCheck,
  ChevronRight,
  Menu,
  X,
  Radio,
} from "lucide-react";
import { RoleType } from "@/types";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { MOCK_ORGANIZATION } from "@/lib/mock-data";

export function HospitalSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeRole, setActiveRole] = useState<RoleType>("super_admin");
  const [userName, setUserName] = useState("Director / Super Admin");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedRole = (localStorage.getItem("onnesha_user_role") as RoleType) || "super_admin";
      const savedName = localStorage.getItem("onnesha_user_name") || "Director / Super Admin";
      setActiveRole(savedRole);
      setUserName(savedName);
    }
  }, []);

  const handleRoleChange = (newRole: RoleType) => {
    setActiveRole(newRole);
    if (typeof window !== "undefined") {
      localStorage.setItem("onnesha_user_role", newRole);
      document.cookie = `onnesha_role=${newRole}; path=/; max-age=86400`;
    }
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("onnesha_user_role");
      document.cookie = "onnesha_role=; path=/; max-age=0";
    }
    router.push("/login");
  };

  const allowedPermissions = DEFAULT_ROLE_PERMISSIONS[activeRole] || [];

  const navSections = [
    {
      title: "Main",
      items: [
        { href: "/app/dashboard", label: "Executive Dashboard", icon: LayoutDashboard, perm: PERMISSIONS.DASHBOARD_VIEW },
      ],
    },
    {
      title: "Front Desk & Clinical",
      items: [
        { href: "/app/patients", label: "Patient Registry", icon: Users, perm: PERMISSIONS.PATIENTS_VIEW },
        { href: "/app/appointments", label: "Appointments & Tokens", icon: CalendarClock, perm: PERMISSIONS.APPOINTMENTS_VIEW },
        { href: "/app/doctors", label: "Doctors & Roster", icon: Stethoscope, perm: PERMISSIONS.DOCTORS_VIEW },
        { href: "/app/opd", label: "OPD Consultation", icon: Activity, perm: PERMISSIONS.OPD_VIEW },
        { href: "/app/ipd", label: "IPD Admissions", icon: Bed, perm: PERMISSIONS.IPD_VIEW },
        { href: "/app/emergency", label: "24/7 Emergency Triage", icon: Radio, perm: PERMISSIONS.EMERGENCY_VIEW },
      ],
    },
    {
      title: "Diagnostics & Pharmacy",
      items: [
        { href: "/app/lab", label: "Pathology & Tests", icon: Microscope, perm: PERMISSIONS.LAB_VIEW },
        { href: "/app/pharmacy", label: "Pharmacy & Stock POS", icon: Pill, perm: PERMISSIONS.PHARMACY_VIEW },
      ],
    },
    {
      title: "Ward, OT & Rx",
      items: [
        { href: "/app/beds", label: "Bed & Cabin Matrix", icon: Bed, perm: PERMISSIONS.BEDS_VIEW },
        { href: "/app/ot", label: "Operation Theater (OT)", icon: Scissors, perm: PERMISSIONS.OT_VIEW },
        { href: "/app/prescriptions", label: "Digital Prescriptions", icon: FileText, perm: PERMISSIONS.PRESCRIPTIONS_VIEW },
      ],
    },
    {
      title: "Finance, HR & Admin",
      items: [
        { href: "/app/billing", label: "Billing & Cashier", icon: Receipt, perm: PERMISSIONS.BILLING_VIEW },
        { href: "/app/hr", label: "HR & Biometrics", icon: UserCheck, perm: PERMISSIONS.HR_VIEW },
        { href: "/app/reports", label: "Financial Reports", icon: BarChart3, perm: PERMISSIONS.REPORTS_VIEW },
        { href: "/app/settings", label: "Settings & Audit Logs", icon: Settings, perm: PERMISSIONS.SETTINGS_VIEW },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Toggle Button */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-3 bg-sky-600 text-white rounded-full shadow-lg"
          aria-label="Toggle Navigation"
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
          <Link href="/app/dashboard" className="flex items-center space-x-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-sky-600 text-white font-bold flex items-center justify-center text-lg shrink-0 shadow-md">
              OH
            </div>
            {!collapsed && (
              <div className="truncate">
                <span className="font-bold text-sm text-white tracking-tight block">
                  ONNESHA HMS
                </span>
                <span className="text-[10px] text-sky-400 font-medium block">
                  {MOCK_ORGANIZATION.name.split(" ")[0]} Hospital
                </span>
              </div>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:block text-slate-400 hover:text-white p-1 rounded"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${collapsed ? "" : "rotate-180"}`} />
          </button>
        </div>

        {/* Role Switcher Widget */}
        {!collapsed && (
          <div className="p-3 mx-3 my-2 bg-slate-800/80 rounded-xl border border-slate-700/60">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center">
                <ShieldCheck className="w-3 h-3 mr-1 text-emerald-400" />
                Active Staff Role
              </span>
            </div>
            <select
              value={activeRole}
              onChange={(e) => handleRoleChange(e.target.value as RoleType)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs text-white p-1.5 focus:outline-hidden"
            >
              <option value="super_admin">Super Admin (All Access)</option>
              <option value="doctor">Doctor / Consultant</option>
              <option value="receptionist">Reception / Front Desk</option>
              <option value="accountant">Billing & Cashier</option>
              <option value="lab_technician">Lab Technologist</option>
              <option value="pharmacist">Pharmacist</option>
            </select>
          </div>
        )}

        {/* Navigation Links */}
        <div className="grow overflow-y-auto px-3 py-2 space-y-4">
          {navSections.map((section, idx) => {
            const visibleItems = section.items.filter((item) =>
              activeRole === "super_admin" || allowedPermissions.includes(item.perm)
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
                      className={`flex items-center px-2.5 py-2 rounded-xl text-xs font-medium transition ${
                        isActive
                          ? "bg-sky-600 text-white font-semibold shadow-2xs"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="ml-3 truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Bottom User Profile & Sign Out */}
        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center justify-between">
            {!collapsed && (
              <div className="truncate mr-2">
                <p className="text-xs font-semibold text-white truncate">{userName}</p>
                <p className="text-[10px] text-sky-400 font-mono capitalize">
                  {activeRole.replace("_", " ")}
                </p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
