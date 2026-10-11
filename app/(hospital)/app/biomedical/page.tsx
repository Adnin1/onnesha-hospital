"use client";

import React, { useState, useEffect } from "react";
import {
  Cpu,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  X,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import {
  BiomedicalDevice,
  getBiomedicalDevicesAction,
  createBiomedicalDeviceAction,
  updateBiomedicalDeviceStatusAction,
} from "@/lib/biomedical/actions";
import { formatDateBDT } from "@/lib/utils";

export default function BiomedicalManagementPage() {
  const [devices, setDevices] = useState<BiomedicalDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Registration Modal
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newDepartment, setNewDepartment] = useState("Pathology & Clinical Lab");
  const [newStatus, setNewStatus] = useState<"OPERATIONAL" | "CALIBRATION_DUE" | "BREAKDOWN" | "UNDER_MAINTENANCE">("OPERATIONAL");
  const [newCalibrationExpiry, setNewCalibrationExpiry] = useState("");

  // Status Update
  const [updatingDeviceId, setUpdatingDeviceId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setErrorMsg(null);
    const res = await getBiomedicalDevicesAction();
    if (res.success && res.data) {
      setDevices(res.data);
    } else {
      setErrorMsg(res.error || "Failed to load biomedical devices.");
    }
    setLoading(false);
  }

  useEffect(() => {
    let isMounted = true;
    async function init() {
      const res = await getBiomedicalDevicesAction();
      if (!isMounted) return;
      if (res.success && res.data) {
        setDevices(res.data);
      }
      setLoading(false);
    }
    void init();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleRegisterDevice(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeviceName.trim()) {
      setErrorMsg("যন্ত্রের নাম প্রদান আবশ্যক (Device name is required).");
      return;
    }
    if (!newSerial.trim()) {
      setErrorMsg("সিরিয়াল নম্বর প্রদান আবশ্যক (Serial number is required).");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const res = await createBiomedicalDeviceAction({
      device_name: newDeviceName,
      model_number: newModel || undefined,
      serial_number: newSerial,
      department: newDepartment,
      status: newStatus,
      calibration_expiry_date: newCalibrationExpiry || undefined,
    });

    setSubmitting(false);

    if (res.success && res.data) {
      setDevices((prev) => [res.data!, ...prev]);
      setIsRegisterModalOpen(false);
      setNewDeviceName("");
      setNewModel("");
      setNewSerial("");
      setNewCalibrationExpiry("");
      setSuccessMsg(`যন্ত্র "${res.data.device_name}" সফলভাবে তালিকাভুক্ত হয়েছে।`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } else {
      setErrorMsg(res.error || "ডিভাইস নিবন্ধন করতে ব্যর্থ হয়েছে।");
    }
  }

  async function handleStatusChange(deviceId: string, status: "OPERATIONAL" | "CALIBRATION_DUE" | "BREAKDOWN" | "UNDER_MAINTENANCE") {
    setUpdatingDeviceId(deviceId);
    const res = await updateBiomedicalDeviceStatusAction({ deviceId, status });
    setUpdatingDeviceId(null);
    if (res.success && res.data) {
      setDevices((prev) => prev.map((d) => (d.id === deviceId ? res.data! : d)));
      setSuccessMsg("যন্ত্রের স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে।");
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setErrorMsg(res.error || "স্ট্যাটাস আপডেট ব্যর্থ হয়েছে।");
    }
  }

  const filteredDevices = devices.filter((d) => {
    const matchesSearch =
      d.device_name.toLowerCase().includes(search.toLowerCase()) ||
      d.serial_number.toLowerCase().includes(search.toLowerCase()) ||
      (d.model_number && d.model_number.toLowerCase().includes(search.toLowerCase())) ||
      d.department.toLowerCase().includes(search.toLowerCase());
    const matchesDept = deptFilter === "ALL" || d.department === deptFilter;
    return matchesSearch && matchesDept;
  });

  const operationalCount = devices.filter((d) => d.status === "OPERATIONAL").length;
  const calibrationDueCount = devices.filter((d) => d.status === "CALIBRATION_DUE").length;
  const maintenanceCount = devices.filter(
    (d) => d.status === "BREAKDOWN" || d.status === "UNDER_MAINTENANCE"
  ).length;

  const departments = Array.from(new Set(devices.map((d) => d.department)));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-4 h-4" /> Clinical Engineering & Device Safety
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Biomedical Equipment & Calibration Registry
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor medical equipment uptime, AERB radiation compliance, preventive maintenance, and calibration dates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadData()}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            title="Reload Devices"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            + Register Medical Device
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Equipment</span>
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
              <Cpu className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">{devices.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">Registered Clinical Assets</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Operational</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-emerald-600 mt-2">{operationalCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Ready for Patient Diagnostics</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Calibration Due</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-amber-600 mt-2">{calibrationDueCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">QC Verification Required</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Maintenance / Down</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <Wrench className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-rose-600 mt-2">{maintenanceCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Service Engineer Assigned</p>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters and Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search device, model, serial #, department..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-hidden bg-white text-slate-700 font-medium"
            >
              <option value="ALL">All Departments ({devices.length})</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center text-xs text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
            Loading biomedical equipment registry...
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-500">
            <Cpu className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            No biomedical devices matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Device Name & Specs</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Serial #</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Current Status</th>
                  <th className="px-4 py-3">Calibration Expiry</th>
                  <th className="px-4 py-3 text-right">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDevices.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-bold text-slate-900">{d.device_name}</td>
                    <td className="px-4 py-3 font-medium text-slate-600">{d.model_number || "Standard"}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{d.serial_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-600">{d.department}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          d.status === "OPERATIONAL"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : d.status === "CALIBRATION_DUE"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">
                      {d.calibration_expiry_date ? formatDateBDT(d.calibration_expiry_date) : "Valid / N/A"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <select
                        disabled={updatingDeviceId === d.id}
                        value={d.status}
                        onChange={(e) =>
                          void handleStatusChange(
                            d.id,
                            e.target.value as "OPERATIONAL" | "CALIBRATION_DUE" | "BREAKDOWN" | "UNDER_MAINTENANCE"
                          )
                        }
                        className="px-2 py-1 text-[11px] font-bold border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-slate-300 focus:ring-1 focus:ring-sky-500 cursor-pointer disabled:opacity-50"
                      >
                        <option value="OPERATIONAL">OPERATIONAL</option>
                        <option value="CALIBRATION_DUE">CALIBRATION_DUE</option>
                        <option value="UNDER_MAINTENANCE">UNDER_MAINTENANCE</option>
                        <option value="BREAKDOWN">BREAKDOWN</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Device Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-sky-700 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-white/10 text-white">
                  <Cpu className="w-5 h-5 text-sky-300" />
                </div>
                <div>
                  <h2 className="text-base font-bold">Register Biomedical Device</h2>
                  <p className="text-xs text-sky-200">Add medical equipment to the hospital safety registry</p>
                </div>
              </div>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterDevice} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Device Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sysmex Automated Hematology Analyzer"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Model Number</label>
                  <input
                    type="text"
                    placeholder="e.g. XN-550"
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Serial Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SYS-2026-XN55"
                    value={newSerial}
                    onChange={(e) => setNewSerial(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Department <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pathology & Clinical Lab"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) =>
                      setNewStatus(e.target.value as "OPERATIONAL" | "CALIBRATION_DUE" | "BREAKDOWN" | "UNDER_MAINTENANCE")
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-hidden bg-white"
                  >
                    <option value="OPERATIONAL">OPERATIONAL</option>
                    <option value="CALIBRATION_DUE">CALIBRATION_DUE</option>
                    <option value="UNDER_MAINTENANCE">UNDER_MAINTENANCE</option>
                    <option value="BREAKDOWN">BREAKDOWN</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Calibration Expiry Date</label>
                  <input
                    type="date"
                    value={newCalibrationExpiry}
                    onChange={(e) => setNewCalibrationExpiry(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Register Device
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
