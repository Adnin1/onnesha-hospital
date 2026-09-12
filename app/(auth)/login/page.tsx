"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  Mail,
  ShieldCheck,
  UserCheck,
  Stethoscope,
  Receipt,
  Microscope,
  Pill,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { MOCK_ORGANIZATION } from "@/lib/mock-data";
import { RoleType } from "@/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@onneshahospital.com");
  const [password, setPassword] = useState("••••••••");
  const [selectedRole, setSelectedRole] = useState<RoleType>("super_admin");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Save active role and session token in localStorage for client-side demo and SSR cookies
    if (typeof window !== "undefined") {
      localStorage.setItem("onnesha_user_role", selectedRole);
      localStorage.setItem("onnesha_user_name", getRoleDisplayName(selectedRole));
      document.cookie = `onnesha_role=${selectedRole}; path=/; max-age=86400`;
    }

    setTimeout(() => {
      setIsLoading(false);
      router.push("/app/dashboard");
    }, 600);
  };

  const setDemoRole = (role: RoleType, demoEmail: string) => {
    setSelectedRole(role);
    setEmail(demoEmail);
  };

  const getRoleDisplayName = (r: RoleType) => {
    switch (r) {
      case "super_admin":
        return "Director / Super Admin";
      case "admin":
        return "Hospital Administrator";
      case "doctor":
        return "Prof. Dr. M. A. Rahman (Doctor)";
      case "receptionist":
        return "Apon Mia (Front Desk)";
      case "accountant":
        return "Jewel Hossain (Cashier & Accounts)";
      case "lab_technician":
        return "Kazi Jahangir (Lab Technologist)";
      case "pharmacist":
        return "Main Pharmacist";
      default:
        return "Staff Member";
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Container */}
      <div className="max-w-md w-full space-y-6">
        {/* Logo & Header */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white font-bold flex items-center justify-center text-2xl shadow-lg">
              OH
            </div>
          </Link>
          <h1 className="mt-3 text-2xl font-extrabold text-white tracking-tight">
            {MOCK_ORGANIZATION.name}
          </h1>
          <p className="text-xs text-sky-400 font-medium">
            Unified Hospital Management System (HMS) Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl backdrop-blur-xs">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Official Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Access Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs py-3 rounded-xl shadow-lg transition"
            >
              {isLoading ? (
                <span>Verifying Credentials...</span>
              ) : (
                <>
                  <span>Sign In as {getRoleDisplayName(selectedRole)}</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </button>
          </form>

          {/* Quick Switch Demo Roles */}
          <div className="mt-8 pt-6 border-t border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center">
                <Sparkles className="w-3 h-3 mr-1 text-amber-400" />
                Test Specific Staff Role
              </span>
              <span className="text-[10px] text-slate-500">1-Click Switch</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setDemoRole("super_admin", "admin@onneshahospital.com")}
                className={`p-2 rounded-lg border text-left transition flex items-center space-x-2 ${
                  selectedRole === "super_admin"
                    ? "bg-sky-950 border-sky-500 text-sky-300 font-bold"
                    : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate text-[11px]">Super Admin</span>
              </button>

              <button
                type="button"
                onClick={() => setDemoRole("doctor", "doctor.rahman@onneshahospital.com")}
                className={`p-2 rounded-lg border text-left transition flex items-center space-x-2 ${
                  selectedRole === "doctor"
                    ? "bg-sky-950 border-sky-500 text-sky-300 font-bold"
                    : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate text-[11px]">Doctor / OPD</span>
              </button>

              <button
                type="button"
                onClick={() => setDemoRole("receptionist", "reception@onneshahospital.com")}
                className={`p-2 rounded-lg border text-left transition flex items-center space-x-2 ${
                  selectedRole === "receptionist"
                    ? "bg-sky-950 border-sky-500 text-sky-300 font-bold"
                    : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate text-[11px]">Front Desk</span>
              </button>

              <button
                type="button"
                onClick={() => setDemoRole("accountant", "billing@onneshahospital.com")}
                className={`p-2 rounded-lg border text-left transition flex items-center space-x-2 ${
                  selectedRole === "accountant"
                    ? "bg-sky-950 border-sky-500 text-sky-300 font-bold"
                    : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                <Receipt className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate text-[11px]">Billing / Cashier</span>
              </button>

              <button
                type="button"
                onClick={() => setDemoRole("lab_technician", "lab@onneshahospital.com")}
                className={`p-2 rounded-lg border text-left transition flex items-center space-x-2 ${
                  selectedRole === "lab_technician"
                    ? "bg-sky-950 border-sky-500 text-sky-300 font-bold"
                    : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                <Microscope className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate text-[11px]">Lab & Diagnostic</span>
              </button>

              <button
                type="button"
                onClick={() => setDemoRole("pharmacist", "pharmacy@onneshahospital.com")}
                className={`p-2 rounded-lg border text-left transition flex items-center space-x-2 ${
                  selectedRole === "pharmacist"
                    ? "bg-sky-950 border-sky-500 text-sky-300 font-bold"
                    : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                <Pill className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="truncate text-[11px]">Pharmacy POS</span>
              </button>
            </div>
          </div>
        </div>

        {/* Back to website */}
        <div className="text-center text-xs text-slate-500">
          <Link href="/" className="hover:text-sky-400 transition">
            ← Return to Public Website
          </Link>
        </div>
      </div>
    </div>
  );
}
