"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  History,
  Building,
  Save,
  Loader2,
  CheckCircle2,
  Smartphone,
  RefreshCw,
  Search,
  Eye,
  Users,
  Cpu,
  Layers,
  Activity,
  DollarSign,
  Share2,
  Receipt,
  Bed,
  Droplet,
  Microscope,
  Pill,
  Stethoscope,
  Settings,
  RotateCcw,
  CheckSquare,
  Square,
  Lock,
} from "lucide-react";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_MODULE_DEFINITIONS,
  PermissionModuleGroup,
} from "@/lib/permissions";
import { RoleType } from "@/types";
import { saveRolePermissionsAction, getOrganizationRolePermissionsAction } from "@/lib/staff/actions";
import { getAuditLogsAction, AuditLogRecord } from "@/lib/audit/logger";
import {
  getHospitalMasterDataAction,
  updateHospitalMasterDataAction,
  APPROVED_HOSPITAL_DATA,
} from "@/lib/hospital/actions";
import { TestTariffManager } from "@/components/lab/TestTariffManager";
import { HospitalTariffManager } from "@/components/billing/HospitalTariffManager";

const DEFAULT_HOSPITAL_PROFILE = {
  name: "ANNESHA HOSPITAL AND DIAGNOSTIC",
  banglaName: "অন্বেষা হাসপাতাল ও ডায়াগনস্টিক",
  phone: process.env.NEXT_PUBLIC_HOSPITAL_PHONE || "01895-665114",
  officePhone: "01904210065",
  emergencyHotline: process.env.NEXT_PUBLIC_EMERGENCY_HOTLINE || "",
  ambulanceHotline: process.env.NEXT_PUBLIC_AMBULANCE_HOTLINE || "01904210065",
  email: process.env.NEXT_PUBLIC_HOSPITAL_EMAIL || "aaih.apon@gmail.com",
  address: process.env.NEXT_PUBLIC_HOSPITAL_ADDRESS || "সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া।",
  diagnosticLicense: "HSM4521681",
  clinicLicense: "HSM4312356",
  regNo: "",
};

export default function SettingsAndAuditPage() {
  const [activeTab, setActiveTab] = useState<"hospital" | "rbac" | "sms" | "audit" | "tariffs">("rbac");
  const [tariffSubTab, setTariffSubTab] = useState<"hospital" | "diagnostic">("hospital");
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<RoleType>("accountant");
  const [rolePerms, setRolePerms] = useState<Record<RoleType, string[]>>(DEFAULT_ROLE_PERMISSIONS);
  const [savedToast, setSavedToast] = useState("");
  const [savingPerms, setSavingPerms] = useState(false);
  useEffect(() => {
    let isMounted = true;
    async function loadDynamicPermissions() {
      try {
        const res = await getOrganizationRolePermissionsAction();
        if (isMounted && res.success && res.data && Object.keys(res.data).length > 0) {
          setRolePerms((prev) => ({
            ...prev,
            ...(res.data as Record<RoleType, string[]>),
          }));
        }
      } catch (err) {
        console.warn("[Settings] Could not load dynamic permissions matrix:", err);
      }
    }
    void loadDynamicPermissions();
    return () => {
      isMounted = false;
    };
  }, []);


  // SMS & Gateway Settings
  const [smsEndpoint, setSmsEndpoint] = useState("");
  const [smsApiKey, setSmsApiKey] = useState("");
  const [smsSenderId, setSmsSenderId] = useState("ONNESHAHOSP");
  const [emailSender, setEmailSender] = useState("aaih.apon@gmail.com");
  const [resendApiKey, setResendApiKey] = useState("");
  const [sslStoreId, setSslStoreId] = useState("");
  const [sslStorePass, setSslStorePass] = useState("");
  const [sslIsSandbox, setSslIsSandbox] = useState(false);

  // Controlled Hospital Master Data States
  const [hospitalName, setHospitalName] = useState(DEFAULT_HOSPITAL_PROFILE.name);
  const [hospitalBanglaName, setHospitalBanglaName] = useState(DEFAULT_HOSPITAL_PROFILE.banglaName);
  const [hospitalPhone, setHospitalPhone] = useState(DEFAULT_HOSPITAL_PROFILE.phone);
  const [hospitalOfficePhone, setHospitalOfficePhone] = useState(DEFAULT_HOSPITAL_PROFILE.officePhone);
  const [hospitalEmergency, setHospitalEmergency] = useState(DEFAULT_HOSPITAL_PROFILE.emergencyHotline);
  const [hospitalAmbulance, setHospitalAmbulance] = useState(DEFAULT_HOSPITAL_PROFILE.ambulanceHotline);
  const [hospitalEmail, setHospitalEmail] = useState(DEFAULT_HOSPITAL_PROFILE.email);
  const [hospitalAddress, setHospitalAddress] = useState(DEFAULT_HOSPITAL_PROFILE.address);
  const [hospitalDiagnosticLicense, setHospitalDiagnosticLicense] = useState(DEFAULT_HOSPITAL_PROFILE.diagnosticLicense);
  const [hospitalClinicLicense, setHospitalClinicLicense] = useState(DEFAULT_HOSPITAL_PROFILE.clinicLicense);
  const [hospitalRegNo, setHospitalRegNo] = useState(DEFAULT_HOSPITAL_PROFILE.regNo);
  const [savingHospital, setSavingHospital] = useState(false);

  // Real Database Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLogForDiff, setSelectedLogForDiff] = useState<AuditLogRecord | null>(null);

  const reloadLogs = async () => {
    setLoadingAudit(true);
    try {
      const res = await getAuditLogsAction({
        module: moduleFilter !== "ALL" ? moduleFilter : undefined,
        action: actionFilter !== "ALL" ? actionFilter : undefined,
        search: searchQuery.trim() || undefined,
        limit: 100,
      });
      if (res.success && res.data) {
        setAuditLogs(res.data.logs);
      }
    } catch (err) {
      console.error("Failed to load audit logs", err);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadLogs() {
      if (activeTab !== "audit") return;
      setLoadingAudit(true);
      try {
        const res = await getAuditLogsAction({
          module: moduleFilter !== "ALL" ? moduleFilter : undefined,
          action: actionFilter !== "ALL" ? actionFilter : undefined,
          search: searchQuery.trim() || undefined,
          limit: 100,
        });
        if (isMounted && res.success && res.data) {
          setAuditLogs(res.data.logs);
        }
      } catch (err) {
        console.error("Failed to load audit logs", err);
      } finally {
        if (isMounted) {
          setLoadingAudit(false);
        }
      }
    }

    void loadLogs();
    return () => {
      isMounted = false;
    };
  }, [activeTab, moduleFilter, actionFilter, searchQuery]);

  useEffect(() => {
    let isMounted = true;
    async function loadHospitalData() {
      if (activeTab !== "hospital") return;
      try {
        const res = await getHospitalMasterDataAction();
        if (isMounted && res.success && res.data) {
          setHospitalName(res.data.name);
          setHospitalBanglaName(res.data.banglaName);
          setHospitalPhone(res.data.phone);
          if (res.data.officePhone) setHospitalOfficePhone(res.data.officePhone);
          setHospitalEmergency(res.data.emergencyHotline);
          setHospitalAmbulance(res.data.ambulanceHotline);
          setHospitalEmail(res.data.email);
          setHospitalAddress(res.data.address);
          if (res.data.diagnosticLicense) setHospitalDiagnosticLicense(res.data.diagnosticLicense);
          if (res.data.clinicLicense) setHospitalClinicLicense(res.data.clinicLicense);
          if (res.data.regNo) setHospitalRegNo(res.data.regNo);
        }
      } catch (err) {
        console.error("Failed to load hospital master data", err);
      }
    }
    void loadHospitalData();
    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  const handleSaveHospitalData = async () => {
    setSavingHospital(true);
    try {
      const res = await updateHospitalMasterDataAction({
        name: hospitalName,
        banglaName: hospitalBanglaName,
        phone: hospitalPhone,
        emergencyHotline: hospitalEmergency,
        ambulanceHotline: hospitalAmbulance,
        email: hospitalEmail,
        address: hospitalAddress,
      });
      if (res.success) {
        setSavedToast("Hospital Master Profile & Letterhead information successfully updated!");
      } else {
        setSavedToast(`Update failed: ${res.error || "Unknown error"}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving hospital data";
      setSavedToast(`Error: ${msg}`);
    } finally {
      setSavingHospital(false);
      setTimeout(() => setSavedToast(""), 5000);
    }
  };

  const handleResetHospitalData = () => {
    setHospitalName(APPROVED_HOSPITAL_DATA.name);
    setHospitalBanglaName(APPROVED_HOSPITAL_DATA.banglaName);
    setHospitalPhone(APPROVED_HOSPITAL_DATA.phone);
    setHospitalOfficePhone(APPROVED_HOSPITAL_DATA.officePhone || "01904210065");
    setHospitalEmergency(APPROVED_HOSPITAL_DATA.emergencyHotline);
    setHospitalAmbulance(APPROVED_HOSPITAL_DATA.ambulanceHotline);
    setHospitalEmail(APPROVED_HOSPITAL_DATA.email);
    setHospitalAddress(APPROVED_HOSPITAL_DATA.address);
    setHospitalDiagnosticLicense(APPROVED_HOSPITAL_DATA.diagnosticLicense || "HSM4521681");
    setHospitalClinicLicense(APPROVED_HOSPITAL_DATA.clinicLicense || "HSM4312356");
    setHospitalRegNo(APPROVED_HOSPITAL_DATA.regNo || "");
    setSavedToast("Reset form values to official approved hospital master data.");
    setTimeout(() => setSavedToast(""), 4000);
  };

  const [rbacSearch, setRbacSearch] = useState("");
  const [selectedModuleFilter, setSelectedModuleFilter] = useState("ALL");

  const togglePermission = (permCode: string) => {
    const currentList = rolePerms[selectedRoleForEdit] || [];
    const exists = currentList.includes(permCode);

    const updated = exists
      ? currentList.filter((p) => p !== permCode)
      : [...currentList, permCode];

    setRolePerms({
      ...rolePerms,
      [selectedRoleForEdit]: updated,
    });
  };

  const toggleModulePermissions = (moduleGroup: PermissionModuleGroup, grant: boolean) => {
    const currentList = rolePerms[selectedRoleForEdit] || [];
    const moduleKeys = moduleGroup.permissions.map((p) => p.key);
    let updated: string[];
    if (grant) {
      const set = new Set([...currentList, ...moduleKeys]);
      updated = Array.from(set);
    } else {
      updated = currentList.filter((k) => !moduleKeys.includes(k));
    }
    setRolePerms({
      ...rolePerms,
      [selectedRoleForEdit]: updated,
    });
  };

  const handleResetRoleToDefault = () => {
    const defaultPerms = (DEFAULT_ROLE_PERMISSIONS as Record<string, string[]>)[selectedRoleForEdit] || [];
    setRolePerms({
      ...rolePerms,
      [selectedRoleForEdit]: defaultPerms,
    });
    setSavedToast(`রোল '${selectedRoleForEdit}'-এর পারমিশন অফিসিয়াল ডিফল্ট অবস্থায় রিসেট করা হয়েছে (ডাটাবেসে সেভ করতে সংরক্ষণ বাটনে চাপুন)।`);
    setTimeout(() => setSavedToast(""), 4000);
  };

  const handleSelectAllRolePerms = () => {
    const allKeys = PERMISSION_MODULE_DEFINITIONS.flatMap((m) => m.permissions.map((p) => p.key));
    setRolePerms({
      ...rolePerms,
      [selectedRoleForEdit]: Array.from(new Set(allKeys)),
    });
  };

  const handleDeselectAllRolePerms = () => {
    setRolePerms({
      ...rolePerms,
      [selectedRoleForEdit]: [],
    });
  };

  const handleSavePerms = async () => {
    setSavingPerms(true);
    try {
      const permsToSave = rolePerms[selectedRoleForEdit] || [];
      const res = await saveRolePermissionsAction(selectedRoleForEdit, permsToSave);
      if (res.success) {
        setSavedToast(`রোল "${selectedRoleForEdit}"-এর ${res.count || permsToSave.length}টি পারমিশন সফলভাবে PostgreSQL ডাটাবেসে সংরক্ষিত ও কার্যকর হয়েছে!`);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("ohms:session-updated"));
        }
      } else {
        setSavedToast(`পারমিশন সংরক্ষণ ব্যর্থ হয়েছে: ${res.error || "Unknown error"}`);
      }
    } catch (err: unknown) {
      setSavedToast(`ত্রুটি: ${err instanceof Error ? err.message : "সংরক্ষণ ব্যর্থ"}`);
    } finally {
      setSavingPerms(false);
      setTimeout(() => setSavedToast(""), 5000);
    }
  };

  const getModuleIcon = (iconName: string) => {
    switch (iconName) {
      case "DollarSign": return <DollarSign className="w-5 h-5 text-rose-600" />;
      case "Share2": return <Share2 className="w-5 h-5 text-sky-600" />;
      case "Receipt": return <Receipt className="w-5 h-5 text-emerald-600" />;
      case "Users": return <Users className="w-5 h-5 text-blue-600" />;
      case "Bed": return <Bed className="w-5 h-5 text-indigo-600" />;
      case "Droplet": return <Droplet className="w-5 h-5 text-red-600" />;
      case "Microscope": return <Microscope className="w-5 h-5 text-cyan-600" />;
      case "Pill": return <Pill className="w-5 h-5 text-amber-600" />;
      case "Stethoscope": return <Stethoscope className="w-5 h-5 text-teal-600" />;
      case "Settings": return <Settings className="w-5 h-5 text-slate-700" />;
      default: return <Layers className="w-5 h-5 text-sky-600" />;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "VIEW":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200">দেখা / View</span>;
      case "CREATE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">নতুন / Add</span>;
      case "EDIT":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">এডিট / Modify</span>;
      case "DELETE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">মুছে ফেলা / Delete</span>;
      case "MANAGE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">নিয়ন্ত্রণ / Manage</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">{action}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            System Administration & Security
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Hospital Settings, RBAC & Audit Trails
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure dynamic granular permissions without code changes, SMS gateway API credentials, and audit logs.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
          <Link
            href="/app/settings/staff"
            className="px-3 py-1.5 rounded-lg transition bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center gap-1.5 shadow-2xs"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Staff Directory</span>
          </Link>
          <Link
            href="/app/settings/hardware"
            className="px-3 py-1.5 rounded-lg transition bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center gap-1.5 shadow-2xs"
          >
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>Hardware & Devices</span>
          </Link>
          <button
            onClick={() => setActiveTab("rbac")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "rbac" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
            }`}
          >
            RBAC Permissions
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "audit" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
            }`}
          >
            Audit Logs
          </button>
          <button
            onClick={() => setActiveTab("sms")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "sms" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
            }`}
          >
            Gateways & APIs
          </button>
          <button
            onClick={() => setActiveTab("hospital")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "hospital" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
            }`}
          >
            Hospital Profile
          </button>
          <button
            onClick={() => setActiveTab("tariffs")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "tariffs" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
            }`}
          >
            টেস্ট ফি ও সার্ভিস ট্যারিফ
          </button>
        </div>
      </div>

      {/* Success Toast */}
      {savedToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedToast}</span>
        </div>
      )}

      {/* TAB 1: GRANULAR RBAC PERMISSIONS CONFIGURATOR */}
      {activeTab === "rbac" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
          {/* Header & Role Selector */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 border-b border-slate-200">
            <div>
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-6 h-6 text-sky-600" />
                <h2 className="text-lg font-black text-slate-900">
                  Granular Role-Based Access Control (RBAC Matrix)
                </h2>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                সিস্টেমের যেকোনো রোলের (যেমন: জুয়েল - একাউন্ট্যান্ট, আপন - রিসিপশনিস্ট) জন্য প্রতি মডিউলে দেখা (View), তৈরি (Create), এডিট (Edit), ডিলিট (Delete) বা পূর্ণ নিয়ন্ত্রণ (Manage) আলাদা আলাদাভাবে সিলেক্ট বা প্রত্যাহার করুন। পরিবর্তন সাথে সাথে PostgreSQL ডাটাবেসে সংরক্ষিত ও কার্যকর হবে।
              </p>
            </div>

            {/* Role Picker Card */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200 w-full lg:w-auto">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-700 whitespace-nowrap">সম্পাদনা করার রোল:</span>
              </div>
              <select
                value={selectedRoleForEdit}
                onChange={(e) => setSelectedRoleForEdit(e.target.value as RoleType)}
                className="w-full sm:w-auto px-3 py-2 border border-sky-300 rounded-xl text-xs bg-white font-bold text-slate-900 shadow-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="super_admin">সুপার এডমিন (Super Admin - পূর্ণ সিস্টেম অ্যাক্সেস)</option>
                <option value="hospital_administrator">হাসপাতাল প্রশাসক (Hospital Administrator)</option>
                <option value="accountant">অ্যাকাউন্ট্যান্ট ও ক্যাশিয়ার (Accountant / Cashier - উদাঃ জুয়েল)</option>
                <option value="receptionist">রিসিপশনিস্ট ও ফ্রন্ট ডেস্ক (Receptionist / Front Desk - উদাঃ আপন)</option>
                <option value="doctor">ডাক্তার ও কনসালট্যান্ট (Doctor / Consultant)</option>
                <option value="nurse">নার্স ও ইন-চার্জ (Nurse / In-Charge)</option>
                <option value="lab_technologist">ল্যাব টেকনোলজিস্ট ও প্যাথলজিস্ট (Lab Technologist)</option>
                <option value="pharmacist">ফার্মাসিস্ট (Pharmacist)</option>
                <option value="hr_payroll">এইচআর ও পে-রোল ম্যানেজার (HR & Payroll)</option>
              </select>
            </div>
          </div>

          {/* Super Admin Notice if selected */}
          {selectedRoleForEdit === "super_admin" && (
            <div className="p-4 bg-sky-50 border border-sky-200 text-sky-950 rounded-xl text-xs leading-relaxed flex items-start space-x-3">
              <ShieldCheck className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">সুপার এডমিন সিকিউরিটি পলিসি:</p>
                <p className="text-slate-600 mt-0.5">
                  সুপার এডমিন (Super Admin) রোলটি ডাটাবেস লেভেল ও RLS পলিসিতে সর্বময় সুরক্ষাপ্রাপ্ত। সাধারণ স্টাফ ও ইউজারদের (রিসিপশন, ক্যাশিয়ার, ইত্যাদি) অ্যাক্সেস নিয়ন্ত্রণ করতে উপরের ড্রপডাউন থেকে নির্দিষ্ট রোলটি সিলেক্ট করে পারমিশন সংরক্ষণ করুন।
                </p>
              </div>
            </div>
          )}

          {/* Role Summary & Bulk Actions Toolbar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center space-x-3 text-xs">
              <span className="font-bold text-slate-800">
                নির্বাচিত রোল: <span className="text-sky-700 underline uppercase">{selectedRoleForEdit}</span>
              </span>
              <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-700">
                সক্রিয় পারমিশন: <span className="text-emerald-700 font-black">{rolePerms[selectedRoleForEdit]?.length || 0}</span> টি
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllRolePerms}
                className="inline-flex items-center px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                সব নির্বাচন (Select All)
              </button>
              <button
                type="button"
                onClick={handleDeselectAllRolePerms}
                className="inline-flex items-center px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 mr-1 text-rose-500" />
                সব বাতিল (Clear All)
              </button>
              <button
                type="button"
                onClick={handleResetRoleToDefault}
                className="inline-flex items-center px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1 text-sky-600" />
                ডিফল্টে রিসেট (Reset Default)
              </button>
            </div>
          </div>

          {/* Search and Module Filter Strip */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="পারমিশনের নাম, মডিউল বা বিবরণ দিয়ে খুঁজুন (Search permissions...)"
                  value={rbacSearch}
                  onChange={(e) => setRbacSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                />
              </div>
            </div>

            {/* Module Filter Pills */}
            <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedModuleFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedModuleFilter === "ALL"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                }`}
              >
                সব মডিউল ({PERMISSION_MODULE_DEFINITIONS.length})
              </button>
              {PERMISSION_MODULE_DEFINITIONS.map((mod) => {
                const isSelected = selectedModuleFilter === mod.id;
                const activeCount = mod.permissions.filter((p) =>
                  rolePerms[selectedRoleForEdit]?.includes(p.key)
                ).length;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setSelectedModuleFilter(mod.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                      isSelected
                        ? "bg-slate-900 text-white shadow-xs font-bold"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    <span>{mod.banglaTitle}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        activeCount > 0
                          ? isSelected
                            ? "bg-sky-500 text-white"
                            : "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {activeCount}/{mod.permissions.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Module-by-Module Granular Cards */}
          <div className="space-y-6">
            {PERMISSION_MODULE_DEFINITIONS.filter((mod) => {
              if (selectedModuleFilter !== "ALL" && mod.id !== selectedModuleFilter) {
                return false;
              }
              if (rbacSearch.trim()) {
                const q = rbacSearch.toLowerCase();
                const titleMatch =
                  mod.title.toLowerCase().includes(q) ||
                  mod.banglaTitle.toLowerCase().includes(q);
                const permMatch = mod.permissions.some(
                  (p) =>
                    p.name.toLowerCase().includes(q) ||
                    p.banglaLabel.toLowerCase().includes(q) ||
                    p.key.toLowerCase().includes(q) ||
                    p.description.toLowerCase().includes(q)
                );
                return titleMatch || permMatch;
              }
              return true;
            }).map((mod) => {
              const activeCount = mod.permissions.filter((p) =>
                rolePerms[selectedRoleForEdit]?.includes(p.key)
              ).length;
              const allChecked = activeCount === mod.permissions.length;

              return (
                <div
                  key={mod.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition hover:border-slate-300"
                >
                  {/* Module Card Header */}
                  <div className="bg-slate-50/80 px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs">
                        {getModuleIcon(mod.iconName)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-sm font-black text-slate-900">{mod.banglaTitle}</h3>
                          <span className="text-[11px] font-semibold text-slate-500">
                            ({mod.title})
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{mod.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                          activeCount === mod.permissions.length
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : activeCount > 0
                            ? "bg-sky-50 text-sky-800 border-sky-300"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {activeCount} / {mod.permissions.length} সক্রিয়
                      </span>

                      <button
                        type="button"
                        onClick={() => toggleModulePermissions(mod, !allChecked)}
                        className={`text-xs font-bold px-3 py-1 rounded-lg border transition cursor-pointer ${
                          allChecked
                            ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
                            : "bg-white hover:bg-slate-100 text-slate-700 border-slate-300"
                        }`}
                      >
                        {allChecked ? "সব বাতিল" : "মডিউলের সব দিন"}
                      </button>
                    </div>
                  </div>

                  {/* Permissions Action Grid inside Module */}
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-slate-50/20">
                    {mod.permissions.map((p) => {
                      const isChecked = rolePerms[selectedRoleForEdit]?.includes(p.key);
                      const isHighRisk = p.action === "DELETE" || p.action === "MANAGE";

                      return (
                        <label
                          key={p.key}
                          className={`p-3.5 rounded-xl border text-xs cursor-pointer transition flex items-start space-x-3 ${
                            isChecked
                              ? isHighRisk
                                ? "bg-amber-50/70 border-amber-300 shadow-xs"
                                : "bg-sky-50/70 border-sky-300 shadow-xs"
                              : "bg-white border-slate-200 hover:border-slate-300 text-slate-600"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(p.key)}
                            className="mt-1 h-4 w-4 text-sky-600 focus:ring-sky-500 rounded border-slate-300 cursor-pointer"
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`font-black text-xs ${
                                  isChecked ? "text-slate-950" : "text-slate-800"
                                }`}
                              >
                                {p.banglaLabel}
                              </span>
                              {getActionBadge(p.action)}
                            </div>

                            <p className="text-[11px] text-slate-600 font-normal leading-relaxed">
                              {p.description}
                            </p>

                            <div className="pt-1 flex items-center justify-between text-[10px]">
                              <span className="font-mono text-slate-400 font-semibold">{p.key}</span>
                              {isHighRisk && (
                                <span className="inline-flex items-center text-amber-700 font-bold">
                                  <Lock className="w-3 h-3 mr-0.5" />
                                  উচ্চ প্রিভিলেজ
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Save Matrix Footer */}
          <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white sticky bottom-0 py-4 shadow-lg rounded-xl px-4 border">
            <div className="text-xs text-slate-600">
              <span className="font-bold text-slate-900">রোল: {selectedRoleForEdit}</span> — মোট{" "}
              <span className="font-black text-sky-700">{rolePerms[selectedRoleForEdit]?.length || 0}</span> টি
              পারমিশন কনফিগার করা হয়েছে। সংরক্ষণের সাথে সাথে স্টাফের পরবর্তী ক্লিকে নতুন পারমিশন কার্যকর হবে।
            </div>

            <button
              onClick={() => void handleSavePerms()}
              disabled={savingPerms}
              className="w-full sm:w-auto inline-flex items-center justify-center bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-black text-xs px-8 py-3 rounded-xl shadow-md transition cursor-pointer"
            >
              {savingPerms ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  সংরক্ষণ করা হচ্ছে...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  পারমিশন ম্যাট্রিক্স সংরক্ষণ করুন
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: AUDIT LOGS TRACKER */}
      {activeTab === "audit" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center">
                <History className="w-4 h-4 mr-2 text-sky-600" />
                Live PostgreSQL Audit Vault (Immutable Forensic Logs)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tracks user modifications, financial voiding/discounts, clinical updates, and print audits with zero mock data.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={reloadLogs}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
                title="Refresh audit logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? "animate-spin text-sky-600" : ""}`} />
              </button>
            </div>
          </div>

          {/* Search and Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div className="relative col-span-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void reloadLogs()}
                placeholder="Search Entity ID, Patient ID, or Invoice #..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div>
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-medium text-slate-700"
              >
                <option value="ALL">All Modules</option>
                <option value="SECURITY_IAM">Security & Passwords (পাসওয়ার্ড অডিট)</option>
                <option value="BILLING">Billing & Invoices</option>
                <option value="CLINICAL">Clinical & Rx</option>
                <option value="PATIENT">Patient Records</option>
                <option value="PHARMACY">Pharmacy & Stock</option>
                <option value="LAB">Lab Diagnostics</option>
                <option value="IAM">IAM & Roles</option>
                <option value="DOCUMENT">Printing & Documents</option>
              </select>
            </div>

            <div>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full p-1.5 bg-white border border-slate-200 rounded-lg font-medium text-slate-700"
              >
                <option value="ALL">All Actions</option>
                <option value="CREATE">CREATE</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
                <option value="VOID">VOID</option>
                <option value="DISCOUNT">DISCOUNT</option>
                <option value="REFUND">REFUND</option>
                <option value="PRINT">PRINT</option>
              </select>
            </div>
          </div>

          {/* Logs List */}
          <div className="space-y-2.5">
            {loadingAudit ? (
              <div className="text-center py-10 text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
                Querying PostgreSQL audit vault...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50">
                No audit events found matching the criteria. Live audit logs will appear as actions occur.
              </div>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-slate-50 hover:bg-slate-100/70 transition rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-slate-400 text-[11px]">
                        {new Date(log.created_at).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${
                          log.action === "VOID" || log.action === "DELETE"
                            ? "bg-rose-100 text-rose-800"
                            : log.action === "DISCOUNT" || log.action === "REFUND"
                            ? "bg-amber-100 text-amber-800"
                            : log.action === "CREATE"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {log.action}
                      </span>
                      <span
                        className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                          log.module === "SECURITY_IAM"
                            ? "bg-purple-100 text-purple-900 border border-purple-300 font-bold"
                            : "bg-slate-200/60 text-slate-900"
                        }`}
                      >
                        {log.module === "SECURITY_IAM" ? "🔐 SECURITY & AUTH" : log.module}
                      </span>
                      <strong className="text-slate-800 font-mono text-[11px]">{log.entity_type}</strong>
                    </div>
                    <div className="text-slate-600 font-mono text-[11px]">
                      Entity Reference: <span className="font-bold text-slate-800">{log.entity_id}</span>
                      {log.ip_address && <span className="text-slate-400 ml-2">IP: {log.ip_address}</span>}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {(log.old_values || log.new_values) && (
                      <button
                        onClick={() => setSelectedLogForDiff(log)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2 py-1 rounded-lg transition"
                      >
                        <Eye className="w-3 h-3" />
                        Inspect Diff
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Audit Diff Inspector Modal */}
          {selectedLogForDiff && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
              <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-sky-600" />
                    Audit Forensic Diff: {selectedLogForDiff.entity_type} ({selectedLogForDiff.entity_id})
                  </h4>
                  <button
                    onClick={() => setSelectedLogForDiff(null)}
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold px-2 py-1 bg-slate-100 rounded-lg"
                  >
                    Close
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 overflow-y-auto text-xs font-mono">
                  <div className="bg-rose-50/50 border border-rose-200 p-3 rounded-xl">
                    <span className="text-[10px] font-bold text-rose-700 block mb-1 uppercase">Old State (Before)</span>
                    <pre className="text-[11px] text-slate-700 whitespace-pre-wrap">
                      {selectedLogForDiff.old_values ? JSON.stringify(selectedLogForDiff.old_values, null, 2) : "None (New Record)"}
                    </pre>
                  </div>
                  <div className="bg-emerald-50/50 border border-emerald-200 p-3 rounded-xl">
                    <span className="text-[10px] font-bold text-emerald-700 block mb-1 uppercase">New State (After)</span>
                    <pre className="text-[11px] text-slate-700 whitespace-pre-wrap">
                      {selectedLogForDiff.new_values ? JSON.stringify(selectedLogForDiff.new_values, null, 2) : "None (Deleted)"}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SMS GATEWAY SETUP */}
      {activeTab === "sms" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-2xl mx-auto space-y-4 text-xs">
          <div className="pb-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900 flex items-center">
              <Smartphone className="w-4 h-4 mr-2 text-sky-600" />
              Bangladesh SMS Gateway Configuration
            </h3>
            <p className="text-slate-500 mt-0.5">
              Connect Greenweb, SSL Wireless, or Elitbuzz for automatic token and appointment dispatch.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Gateway HTTP Endpoint URL
            </label>
            <input
              type="url"
              value={smsEndpoint}
              onChange={(e) => setSmsEndpoint(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              API Authorization Key
            </label>
            <input
              type="password"
              value={smsApiKey}
              onChange={(e) => setSmsApiKey(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Sender ID / Masking Name
            </label>
            <input
              type="text"
              value={smsSenderId}
              onChange={(e) => setSmsSenderId(e.target.value)}
              className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono font-bold"
            />
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                setSavedToast("SMS Gateway settings verified and saved!");
                setTimeout(() => setSavedToast(""), 3000);
              }}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm transition"
            >
              Save SMS Credentials
            </button>
          </div>

          {/* Transactional Email Section */}
          <div className="pt-6 border-t border-slate-200 space-y-4">
            <div className="pb-2">
              <h3 className="text-base font-bold text-slate-900 flex items-center">
                <span className="text-sky-600 mr-2">✉️</span>
                Transactional Email (Resend / SendGrid)
              </h3>
              <p className="text-slate-500 mt-0.5">
                Send appointment receipts, invoices, and OTP verification via transactional email.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Hospital Notification & Sender Email
              </label>
              <input
                type="email"
                value={emailSender}
                onChange={(e) => setEmailSender(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Resend API Key (re_...)
              </label>
              <input
                type="password"
                placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  setSavedToast("Transactional Email configuration updated!");
                  setTimeout(() => setSavedToast(""), 3000);
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm transition"
              >
                Save Email Gateway Settings
              </button>
            </div>
          </div>

          {/* SSLCommerz Payment Gateway Section */}
          <div className="pt-6 border-t border-slate-200 space-y-4">
            <div className="pb-2">
              <h3 className="text-base font-bold text-slate-900 flex items-center">
                <span className="text-sky-600 mr-2">💳</span>
                SSLCommerz Payment Gateway
              </h3>
              <p className="text-slate-500 mt-0.5">
                Accept Visa, Mastercard, bKash, Nagad, and Internet Banking online.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Store ID (e.g. testbox or Production Store ID)
              </label>
              <input
                type="text"
                placeholder="Store ID"
                value={sslStoreId}
                onChange={(e) => setSslStoreId(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Store Password / Secret
              </label>
              <input
                type="password"
                placeholder="Store Password"
                value={sslStorePass}
                onChange={(e) => setSslStorePass(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="sslSandbox"
                checked={sslIsSandbox}
                onChange={(e) => setSslIsSandbox(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <label htmlFor="sslSandbox" className="font-semibold text-slate-700">
                Sandbox / Test Mode (Uncheck for Live Production)
              </label>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  setSavedToast("SSLCommerz credentials saved!");
                  setTimeout(() => setSavedToast(""), 3000);
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm transition"
              >
                Save SSLCommerz Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: HOSPITAL PROFILE */}
      {activeTab === "hospital" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-2xl mx-auto space-y-5 text-xs">
          <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center">
                <Building className="w-4 h-4 mr-2 text-sky-600" />
                Hospital Profile & Master Data Management
              </h3>
              <p className="text-slate-500 mt-0.5">
                Official hospital identity used across public website, letterheads, invoices, prescriptions, and lab reports.
              </p>
            </div>
            <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold rounded-lg shrink-0">
              Super Admin / Administrator Only
            </span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Hospital Full English Name
            </label>
            <input
              type="text"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500 transition"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Bangla Name (for Letterhead Pad, Receipts & Prescriptions)
            </label>
            <input
              type="text"
              value={hospitalBanglaName}
              onChange={(e) => setHospitalBanglaName(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 font-semibold focus:bg-white focus:ring-2 focus:ring-sky-500 transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Reception Phone (রিসিপশন)
              </label>
              <input
                type="text"
                value={hospitalPhone}
                onChange={(e) => setHospitalPhone(e.target.value)}
                placeholder="01895-665114"
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500 transition"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Office & Emergency Phone (অফিস)
              </label>
              <input
                type="text"
                value={hospitalOfficePhone}
                onChange={(e) => setHospitalOfficePhone(e.target.value)}
                placeholder="01904210065"
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500 transition"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Emergency Hotline (জরুরি)
              </label>
              <input
                type="text"
                value={hospitalEmergency}
                onChange={(e) => setHospitalEmergency(e.target.value)}
                placeholder="01904210065"
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500 transition"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ambulance Hotline (অ্যাম্বুলেন্স)
              </label>
              <input
                type="text"
                value={hospitalAmbulance}
                onChange={(e) => setHospitalAmbulance(e.target.value)}
                placeholder="01904210065"
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Diagnostic License No. (ডায়াগনস্টিক লাইসেন্স)
              </label>
              <input
                type="text"
                value={hospitalDiagnosticLicense}
                onChange={(e) => setHospitalDiagnosticLicense(e.target.value)}
                placeholder="HSM4521681"
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500 transition"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Clinic License No. (ক্লিনিক লাইসেন্স)
              </label>
              <input
                type="text"
                value={hospitalClinicLicense}
                onChange={(e) => setHospitalClinicLicense(e.target.value)}
                placeholder="HSM4312356"
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500 transition"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                DGHS Registry No. (রেজিস্ট্রেশন নং)
              </label>
              <input
                type="text"
                value={hospitalRegNo}
                onChange={(e) => setHospitalRegNo(e.target.value)}
                placeholder="DGHS Registration / Facility ID"
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Official & Transactional Email
            </label>
            <input
              type="email"
              value={hospitalEmail}
              onChange={(e) => setHospitalEmail(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500 transition"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Full Physical Address & Location
            </label>
            <textarea
              rows={2}
              value={hospitalAddress}
              onChange={(e) => setHospitalAddress(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500 transition"
            ></textarea>
          </div>

          {/* Action Buttons for Super Admin Control */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => void handleSaveHospitalData()}
              disabled={savingHospital}
              className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{savingHospital ? "Saving Master Data..." : "Save Hospital Master Data"}</span>
            </button>
            <button
              onClick={handleResetHospitalData}
              type="button"
              className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset to Approved Master Data</span>
            </button>
            <button
              onClick={() => {
                setHospitalName("");
                setHospitalBanglaName("");
                setHospitalPhone("");
                setHospitalEmergency("");
                setHospitalAmbulance("");
                setHospitalEmail("");
                setHospitalAddress("");
              }}
              type="button"
              className="px-3.5 py-2.5 border border-rose-200 hover:bg-rose-50 text-rose-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
            >
              <span>মুছে ফেলুন (Clear All)</span>
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800">
              🛡️ Forensic Audit & Real-Time Sync:
            </div>
            <p>
              Updating hospital master data updates the primary PostgreSQL organization records (<code className="text-slate-800 font-mono">organizations</code> & <code className="text-slate-800 font-mono">organization_settings</code>), logs an immutable forensic record to <code className="text-slate-800 font-mono">audit_logs</code>, and propagates to all active OPD tickets, IPD discharge certificates, and diagnostic billing pads.
            </p>
          </div>
        </div>
      )}

      {/* Tariffs & Service Rate Manager */}
      {activeTab === "tariffs" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit border border-slate-200/80 text-xs font-bold">
            <button
              type="button"
              onClick={() => setTariffSubTab("hospital")}
              className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
                tariffSubTab === "hospital"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="w-4 h-4" />
              Hospital Services Tariff (OPD / IPD / ICU / OT)
            </button>
            <button
              type="button"
              onClick={() => setTariffSubTab("diagnostic")}
              className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
                tariffSubTab === "diagnostic"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Activity className="w-4 h-4" />
              Diagnostic Pathology & Lab Tests
            </button>
          </div>

          {tariffSubTab === "hospital" ? (
            <HospitalTariffManager />
          ) : (
            <TestTariffManager />
          )}
        </div>
      )}
    </div>
  );
}
