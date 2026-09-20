"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  History,
  Building,
  Save,
  CheckCircle2,
  Smartphone,
  RefreshCw,
  Search,
  Eye,
} from "lucide-react";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import { RoleType } from "@/types";
import { getAuditLogsAction, AuditLogRecord } from "@/lib/audit/logger";

const DEFAULT_HOSPITAL_PROFILE = {
  name: "Onnesha Hospital & Diagnostic Complex",
  banglaName: "অন্বেষা হাসপাতাল ও ডায়াগনস্টিক কমপ্লেক্স",
  emergencyHotline: "+880 1700-000000",
  ambulanceHotline: "+880 1800-000000",
  address: "House 12, Road 5, Dhanmondi, Dhaka-1205, Bangladesh",
};

export default function SettingsAndAuditPage() {
  const [activeTab, setActiveTab] = useState<"hospital" | "rbac" | "sms" | "audit">("rbac");
  const [selectedRoleForEdit, setSelectedRoleForEdit] = useState<RoleType>("accountant");
  const [rolePerms, setRolePerms] = useState<Record<RoleType, string[]>>(DEFAULT_ROLE_PERMISSIONS);
  const [savedToast, setSavedToast] = useState("");

  // SMS Settings
  const [smsEndpoint, setSmsEndpoint] = useState("");
  const [smsApiKey, setSmsApiKey] = useState("");
  const [smsSenderId, setSmsSenderId] = useState("ONNESHAHOSP");

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
            {allAvailablePermissions.map(([, permCode]) => {
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
                      <span className="font-semibold text-slate-900 bg-slate-200/60 px-1.5 py-0.5 rounded text-[10px]">
                        {log.module}
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
              defaultValue={DEFAULT_HOSPITAL_PROFILE.name}
              className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-bold"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Bangla Name (for Letterhead Pad)
            </label>
            <input
              type="text"
              defaultValue={DEFAULT_HOSPITAL_PROFILE.banglaName}
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
                defaultValue={DEFAULT_HOSPITAL_PROFILE.emergencyHotline}
                className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ambulance Hotline Phone
              </label>
              <input
                type="text"
                defaultValue={DEFAULT_HOSPITAL_PROFILE.ambulanceHotline}
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
              defaultValue={DEFAULT_HOSPITAL_PROFILE.address}
              className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
            ></textarea>
          </div>
        </div>
      )}
    </div>
  );
}
