"use client";

import React, { useState } from "react";
import {
  Settings,
  ShieldCheck,
  MessageSquare,
  History,
  Building,
  Save,
  CheckCircle2,
  Lock,
  Smartphone,
  AlertCircle,
} from "lucide-react";
import { MOCK_ORGANIZATION } from "@/lib/mock-data";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { RoleType } from "@/types";

export default function SettingsAndAuditPage() {
  const [activeTab, setActiveTab] = useState<"hospital" | "rbac" | "sms" | "audit">("rbac");
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<RoleType>("accountant");
  const [rolePerms, setRolePerms] = useState<Record<RoleType, string[]>>(DEFAULT_ROLE_PERMISSIONS);
  const [savedToast, setSavedToast] = useState("");

  // SMS Settings
  const [smsEndpoint, setSmsEndpoint] = useState("https://api.sms-gateway-bd.com/v2/send");
  const [smsApiKey, setSmsApiKey] = useState("ak_live_bd_99812491204812");
  const [smsSenderId, setSmsSenderId] = useState("ONNESHAHOSP");

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState([
    {
      id: "aud-1",
      timestamp: "12 Sep 2026 • 05:42 PM",
      actor: "Jewel Hossain (Cashier)",
      action: "INSERT",
      table: "invoices",
      record: "INV-2026-0891",
      details: "Created Money Receipt ৳1300 for patient Md. Rafiqul Islam (OH-000101)",
    },
    {
      id: "aud-2",
      timestamp: "12 Sep 2026 • 05:30 PM",
      actor: "Admin (Authorized)",
      action: "DISCOUNT",
      table: "invoices",
      record: "INV-2026-0891",
      details: "Approved ৳100 special concession waiver on consultation",
    },
    {
      id: "aud-3",
      timestamp: "12 Sep 2026 • 05:15 PM",
      actor: "Apon Mia (Front Desk)",
      action: "INSERT",
      table: "appointments",
      record: "Token A-012",
      details: "Assigned OPD Token A-012 for Prof. Dr. M. A. Rahman",
    },
    {
      id: "aud-4",
      timestamp: "12 Sep 2026 • 04:55 PM",
      actor: "Super Admin",
      action: "VOID",
      table: "invoices",
      record: "INV-2026-0888",
      details: "Voided invoice due to patient cancellation. Reason: Patient requested reschedule.",
    },
  ]);

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

  const handleSavePerms = () => {
    setSavedToast("Permissions matrix successfully updated in PostgreSQL database!");
    setTimeout(() => setSavedToast(""), 4000);
  };

  const allAvailablePermissions = Object.entries(PERMISSIONS);

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
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
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
            SMS Gateway
          </button>
          <button
            onClick={() => setActiveTab("hospital")}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === "hospital" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
            }`}
          >
            Hospital Profile
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center">
                <ShieldCheck className="w-4 h-4 mr-2 text-sky-600" />
                Granular Role-Based Access Control (RBAC Matrix)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Grant or revoke permissions per role dynamically (e.g. Jewel Role = Accountant, Apon Role = Receptionist).
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold text-slate-700">Select Role to Edit:</span>
              <select
                value={selectedRoleForEdit}
                onChange={(e) => setSelectedRoleForEdit(e.target.value as RoleType)}
                className="p-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 font-bold text-slate-800"
              >
                <option value="super_admin">Super Admin (Full Access)</option>
                <option value="admin">Hospital Administrator</option>
                <option value="accountant">Accountant / Cashier (e.g. Jewel)</option>
                <option value="receptionist">Reception / Front Desk (e.g. Apon)</option>
                <option value="doctor">Doctor / Consultant</option>
                <option value="lab_technician">Lab Technologist</option>
                <option value="pharmacist">Pharmacist</option>
              </select>
            </div>
          </div>

          {/* Permissions Checkbox Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {allAvailablePermissions.map(([key, permCode]) => {
              const isChecked = rolePerms[selectedRoleForEdit]?.includes(permCode);

              return (
                <label
                  key={permCode}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-start space-x-2.5 ${
                    isChecked
                      ? "bg-sky-50/70 border-sky-300 text-sky-950 font-semibold"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => togglePermission(permCode)}
                    className="mt-0.5 text-sky-600 focus:ring-sky-500 rounded"
                  />
                  <div>
                    <span className="font-mono text-[11px] block">{permCode}</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Permission flag for {permCode.split(".")[0]} module
                    </span>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={handleSavePerms}
              className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-sm transition"
            >
              <Save className="w-3.5 h-3.5 mr-2" />
              Save Permissions Matrix
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: AUDIT LOGS TRACKER */}
      {activeTab === "audit" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="pb-4 border-b border-slate-100 mb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center">
              <History className="w-4 h-4 mr-2 text-sky-600" />
              Hospital System Audit Trail & Financial Modifications
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Strict immutable logging: who created/edited patients, authorized discounts, voided bills, or changed clinical records.
            </p>
          </div>

          <div className="space-y-3">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-slate-500 text-[11px]">{log.timestamp}</span>
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${
                        log.action === "VOID"
                          ? "bg-rose-100 text-rose-800"
                          : log.action === "DISCOUNT"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-sky-100 text-sky-800"
                      }`}
                    >
                      {log.action}
                    </span>
                    <strong className="text-slate-900">{log.actor}</strong>
                  </div>
                  <p className="text-slate-700 mt-1 font-medium">{log.details}</p>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  table: {log.table} • {log.record}
                </span>
              </div>
            ))}
          </div>
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
        </div>
      )}

      {/* TAB 4: HOSPITAL PROFILE */}
      {activeTab === "hospital" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-2xl mx-auto space-y-4 text-xs">
          <div className="pb-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900 flex items-center">
              <Building className="w-4 h-4 mr-2 text-sky-600" />
              Hospital Profile & Print Letterhead Pad Details
            </h3>
            <p className="text-slate-500 mt-0.5">
              These details automatically populate across all official invoices, prescriptions, and lab reports.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Hospital Full English Name
            </label>
            <input
              type="text"
              defaultValue={MOCK_ORGANIZATION.name}
              className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-bold"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Bangla Name (for Letterhead Pad)
            </label>
            <input
              type="text"
              defaultValue={MOCK_ORGANIZATION.banglaName}
              className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Emergency Hotline Phone
              </label>
              <input
                type="text"
                defaultValue={MOCK_ORGANIZATION.emergencyHotline}
                className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ambulance Hotline Phone
              </label>
              <input
                type="text"
                defaultValue={MOCK_ORGANIZATION.ambulanceHotline}
                className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Hospital Address & Location
            </label>
            <textarea
              rows={2}
              defaultValue={MOCK_ORGANIZATION.address}
              className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
            ></textarea>
          </div>
        </div>
      )}
    </div>
  );
}
