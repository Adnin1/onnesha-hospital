"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  UserPlus,
  Search,
  Filter,
  RefreshCw,
  KeyRound,
  UserCheck,
  UserX,
  AlertTriangle,
  Copy,
  Check,
  Building,
  Mail,
  Phone,
  BadgeAlert,
  Lock,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import {
  StaffMemberRecord,
  getStaffDirectoryAction,
  createStaffAccountAction,
  resetStaffPasswordAction,
  setStaffStatusAction,
  changeStaffRoleAction,
  generateSecureTemporaryPassword,
} from "@/lib/staff/actions";
import { RoleType } from "@/types";

const CANONICAL_ROLES: { id: RoleType; label: string; desc: string }[] = [
  { id: "super_admin", label: "Super Admin", desc: "Full administrative & system authority" },
  { id: "hospital_administrator", label: "Hospital Admin", desc: "Hospital operations & department manager" },
  { id: "accountant", label: "Accountant / Cashier", desc: "Billing, invoices, accounts & cash collection" },
  { id: "doctor", label: "Doctor / Consultant", desc: "OPD, prescriptions, clinical notes & orders" },
  { id: "nurse", label: "Nurse / In-Charge", desc: "Vitals, bed management & ward care" },
  { id: "lab_technologist", label: "Lab Technologist", desc: "Diagnostic specimen tests & lab reports" },
  { id: "pharmacist", label: "Pharmacist", desc: "Medicine dispensing & inventory stock" },
  { id: "hr_payroll", label: "HR & Payroll", desc: "Staff attendance, salary & rosters" },
  { id: "receptionist", label: "Receptionist / Front Desk", desc: "Patient registration & appointment tokens" },
];

export default function StaffManagementPage() {
  const [staffList, setStaffList] = useState<StaffMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState<StaffMemberRecord | null>(null);
  const [showResetModal, setShowResetModal] = useState<StaffMemberRecord | null>(null);

  // One-time credential disclosure modal state
  const [credentialModal, setCredentialModal] = useState<{
    fullName: string;
    email: string;
    employeeId: string;
    role: string;
    tempPassword: string;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form State for Creation
  const [newStaffFullName, setNewStaffFullName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<RoleType>("doctor");
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Role Change Form State
  const [selectedNewRole, setSelectedNewRole] = useState<RoleType>("doctor");
  const [submittingRoleChange, setSubmittingRoleChange] = useState(false);

  // Password Reset Form State
  const [submittingReset, setSubmittingReset] = useState(false);

  const fetchDirectory = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getStaffDirectoryAction({
        search: searchQuery.trim() || undefined,
        role: roleFilter !== "ALL" ? roleFilter : undefined,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
      });

      if (res.success && res.data) {
        setStaffList(res.data);
      } else {
        setErrorMsg(res.error || "স্টাফ তালিকা লোড করতে সমস্যা হয়েছে।");
      }
    } catch {
      setErrorMsg("সার্ভারে সংযোগ ব্যর্থ হয়েছে।");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, roleFilter, statusFilter]);

  useEffect(() => {
    fetchDirectory();
  }, [fetchDirectory]);

  const triggerToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // 1. Create Staff Account
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffFullName.trim() || !newStaffEmail.trim() || !newStaffPhone.trim()) {
      alert("অনুগ্রহ করে সকল প্রয়োজনীয় ফিল্ড পূরণ করুন।");
      return;
    }

    setSubmittingCreate(true);
    try {
      const tempPassword = generateSecureTemporaryPassword();
      const res = await createStaffAccountAction({
        fullName: newStaffFullName.trim(),
        email: newStaffEmail.trim().toLowerCase(),
        phone: newStaffPhone.trim(),
        roleName: newStaffRole,
        tempPassword,
      });

      if (res.success) {
        setShowCreateModal(false);
        setCredentialModal({
          fullName: newStaffFullName,
          email: res.email || newStaffEmail,
          employeeId: res.employeeId || "PENDING",
          role: res.role || newStaffRole,
          tempPassword: res.tempPassword || tempPassword,
        });

        // Reset form
        setNewStaffFullName("");
        setNewStaffEmail("");
        setNewStaffPhone("");
        setNewStaffRole("doctor");

        fetchDirectory();
        triggerToast("নতুন স্টাফ অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!");
      } else {
        alert("অ্যাকাউন্ট তৈরি ব্যর্থ: " + (res.error || "Unknown error"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating staff";
      alert("ব্যর্থ: " + msg);
    } finally {
      setSubmittingCreate(false);
    }
  };

  // 2. Change Staff Role
  const handleChangeRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRoleModal) return;

    setSubmittingRoleChange(true);
    try {
      const res = await changeStaffRoleAction(showRoleModal.id, selectedNewRole);
      if (res.success) {
        setShowRoleModal(null);
        fetchDirectory();
        triggerToast("স্টাফ রোল সফলভাবে পরিবর্তন করা হয়েছে!");
      } else {
        alert("রোল পরিবর্তন ব্যর্থ: " + (res.error || "Unknown error"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error updating role";
      alert("ব্যর্থ: " + msg);
    } finally {
      setSubmittingRoleChange(false);
    }
  };

  // 3. Toggle Status (Active / Suspended / Disabled)
  const handleStatusChange = async (
    staff: StaffMemberRecord,
    newStatus: "ACTIVE" | "SUSPENDED" | "DISABLED"
  ) => {
    const confirmMsg =
      newStatus === "SUSPENDED"
        ? `আপনি কি নিশ্চিতভাবে ${staff.full_name}-এর অ্যাকাউন্ট সাময়িকভাবে স্থগিত (SUSPEND) করতে চান? তার সকল একটিভ সেশন সাথে সাথে বাতিল হবে।`
        : newStatus === "DISABLED"
        ? `আপনি কি নিশ্চিতভাবে ${staff.full_name}-এর অ্যাকাউন্ট স্থায়ীভাবে নিষ্ক্রিয় (DISABLE) করতে চান?`
        : `আপনি কি ${staff.full_name}-এর অ্যাকাউন্ট পুনরায় সক্রিয় (ACTIVATE) করতে চান?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await setStaffStatusAction(staff.id, newStatus);
      if (res.success) {
        fetchDirectory();
        triggerToast(`অ্যাকাউন্ট স্ট্যাটাস সফলভাবে '${newStatus}' করা হয়েছে।`);
      } else {
        alert("স্ট্যাটাস পরিবর্তন ব্যর্থ: " + (res.error || "Unknown error"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error updating status";
      alert("ব্যর্থ: " + msg);
    }
  };

  // 4. Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResetModal) return;

    setSubmittingReset(true);
    try {
      const newTempPassword = generateSecureTemporaryPassword();
      const res = await resetStaffPasswordAction(showResetModal.id, newTempPassword);

      if (res.success) {
        const staff = showResetModal;
        setShowResetModal(null);

        setCredentialModal({
          fullName: staff.full_name,
          email: staff.email || "No email",
          employeeId: staff.employee_code || "N/A",
          role: String(staff.role_name || "Staff"),
          tempPassword: res.tempPassword || newTempPassword,
        });

        fetchDirectory();
        triggerToast("পাসওয়ার্ড সফলভাবে রিসেট করা হয়েছে এবং পূর্বের সকল সেশন বাতিল করা হয়েছে।");
      } else {
        alert("পাসওয়ার্ড রিসেট ব্যর্থ: " + (res.error || "Unknown error"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error resetting password";
      alert("ব্যর্থ: " + msg);
    } finally {
      setSubmittingReset(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 py-4">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/app/settings"
              className="text-xs text-sky-600 hover:text-sky-700 flex items-center font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Settings & Audit
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              IAM & Staff Management
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-sky-600" />
            Hospital Staff Directory & Access Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Create authenticated Supabase staff accounts, manage canonical roles, enforce password policies & suspend access.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchDirectory()}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition flex items-center justify-center text-xs font-semibold"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create Staff Member</span>
          </button>
        </div>
      </div>

      {/* Success Notification Toast */}
      {successToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-300 text-red-900 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by name, email, phone, employee ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="p-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">All Roles</option>
              {CANONICAL_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="p-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="DISABLED">DISABLED</option>
            </select>
          </div>
        </div>
      </div>

      {/* Staff Directory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Staff Member</th>
                <th className="py-3.5 px-4">Employee ID</th>
                <th className="py-3.5 px-4">Assigned Role</th>
                <th className="py-3.5 px-4">Account Status</th>
                <th className="py-3.5 px-4">Security Flag</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-600" />
                    <span>Loading staff directory...</span>
                  </td>
                </tr>
              ) : staffList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <span>No staff members match the selected criteria.</span>
                  </td>
                </tr>
              ) : (
                staffList.map((staff) => {
                  const status = staff.account_status || (staff.is_active ? "ACTIVE" : "DISABLED");
                  const isSuspended = status === "SUSPENDED";
                  const isDisabled = status === "DISABLED";
                  const isActive = status === "ACTIVE";

                  return (
                    <tr key={staff.id} className="hover:bg-slate-50/60 transition">
                      {/* Name & Contact */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{staff.full_name}</div>
                        <div className="flex flex-col text-[11px] text-slate-500 mt-0.5 space-y-0.5">
                          {staff.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-400" />
                              {staff.email}
                            </span>
                          )}
                          {staff.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {staff.phone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Employee Code */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-700 font-semibold border border-slate-200">
                          {staff.employee_code || "—"}
                        </span>
                      </td>

                      {/* Assigned Role */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200 uppercase tracking-wide">
                          {staff.role_name ? String(staff.role_name).replace(/_/g, " ") : "NO ROLE"}
                        </span>
                      </td>

                      {/* Account Status Badge */}
                      <td className="py-3 px-4">
                        {isActive && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                            ACTIVE
                          </span>
                        )}
                        {isSuspended && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
                            SUSPENDED
                          </span>
                        )}
                        {isDisabled && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5" />
                            DISABLED
                          </span>
                        )}
                      </td>

                      {/* Security Flag */}
                      <td className="py-3 px-4">
                        {staff.must_change_password ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <BadgeAlert className="w-3 h-3 text-amber-500" />
                            Password Change Pending
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">
                            Standard Login
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Role Change Button */}
                          <button
                            onClick={() => {
                              setSelectedNewRole((staff.role_name as RoleType) || "doctor");
                              setShowRoleModal(staff);
                            }}
                            className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                            title="Change Role"
                          >
                            Change Role
                          </button>

                          {/* Reset Password Button */}
                          <button
                            onClick={() => setShowResetModal(staff)}
                            className="px-2.5 py-1 text-[11px] font-medium bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg transition flex items-center gap-1"
                            title="Reset Password & Revoke Sessions"
                          >
                            <KeyRound className="w-3 h-3" />
                            Reset Password
                          </button>

                          {/* Status Toggle Buttons */}
                          {isActive ? (
                            <button
                              onClick={() => handleStatusChange(staff, "SUSPENDED")}
                              className="px-2.5 py-1 text-[11px] font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition"
                              title="Suspend Account"
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStatusChange(staff, "ACTIVE")}
                              className="px-2.5 py-1 text-[11px] font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition"
                              title="Activate Account"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: CREATE STAFF ACCOUNT                            */}
      {/* ======================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center font-bold">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Create Staff Member</h2>
                  <p className="text-xs text-slate-500">
                    Provisions Supabase Auth account & hospital IAM profile
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name (পূর্ণ নাম) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Mohammad Masud Parvez"
                  value={newStaffFullName}
                  onChange={(e) => setNewStaffFullName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Official Email Address (অফিসিয়াল ইমেইল) *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. masud@onneshahospital.com"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone Number (মোবাইল নম্বর) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 01712345678"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Canonical Staff Role (নির্ধারিত পদবী) *
                </label>
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value as RoleType)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                >
                  {CANONICAL_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} — {r.desc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1">
                <span className="font-bold text-slate-700 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-sky-600" />
                  Security Credential Generation
                </span>
                <p>
                  A cryptographically secure temporary password will be generated automatically. You will be shown the password ONCE in the next step to copy and share securely with the employee.
                </p>
                <p className="text-amber-700 font-medium">
                  The employee will be required to change this password on their first login.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 flex items-center gap-2"
                >
                  {submittingCreate ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <span>Create & Generate Credentials</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: ONE-TIME CREDENTIAL DISCLOSURE MODAL            */}
      {/* ======================================================== */}
      {credentialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Staff Credentials Generated
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Copy and deliver these credentials securely. For hospital security, the temporary password will never be shown again.
              </p>
            </div>

            <div className="mt-6 space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">Employee Name:</span>
                <span className="font-bold text-slate-900">{credentialModal.fullName}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">Employee ID:</span>
                <span className="font-mono font-bold text-sky-700">{credentialModal.employeeId}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">Official Email:</span>
                <span className="font-mono font-medium text-slate-900">{credentialModal.email}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">Canonical Role:</span>
                <span className="font-bold uppercase text-slate-800">{credentialModal.role}</span>
              </div>

              <div className="py-2">
                <span className="text-slate-500 block mb-1">Temporary Password:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={credentialModal.tempPassword}
                    className="w-full font-mono text-sm bg-white p-2.5 rounded-xl border border-sky-300 text-slate-900 font-bold tracking-wider select-all"
                  />
                  <button
                    onClick={() => handleCopy(credentialModal.tempPassword, "pwd")}
                    className="p-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl transition shrink-0"
                    title="Copy Password"
                  >
                    {copiedKey === "pwd" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    const fullSummary = `Onnesha Hospital Staff Credentials\nName: ${credentialModal.fullName}\nEmployee ID: ${credentialModal.employeeId}\nEmail: ${credentialModal.email}\nRole: ${credentialModal.role}\nTemporary Password: ${credentialModal.tempPassword}\nPortal Login URL: https://onnesha-hospital.pages.dev/login\n(Note: You will be asked to set your own password upon first login)`;
                    handleCopy(fullSummary, "all");
                  }}
                  className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2"
                >
                  {copiedKey === "all" ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied Full Summary!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Complete Login Details</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setCredentialModal(null)}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-sm"
              >
                I have saved these credentials (Done)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: CHANGE STAFF ROLE                              */}
      {/* ======================================================== */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h2 className="text-base font-bold text-slate-900">Change Staff Role</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Update authorization role for {showRoleModal.full_name}
            </p>

            <form onSubmit={handleChangeRole} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Canonical Role *
                </label>
                <select
                  value={selectedNewRole}
                  onChange={(e) => setSelectedNewRole(e.target.value as RoleType)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                >
                  {CANONICAL_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} — {r.desc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRoleChange}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {submittingRoleChange ? "Updating..." : "Update Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: RESET PASSWORD CONFIRMATION                     */}
      {/* ======================================================== */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Reset Staff Password</h2>
                <p className="text-xs text-slate-500">{showResetModal.full_name}</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1 my-3">
              <p className="font-semibold">Attention:</p>
              <p>
                Resetting will immediately revoke all current active sessions for this staff member. A new secure temporary password will be generated for one-time copy, and they will be forced to change it upon login.
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetModal(null)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingReset}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 flex items-center gap-2"
              >
                {submittingReset ? "Resetting..." : "Confirm & Reset Password"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
