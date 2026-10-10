"use client";

import React, { useState, useEffect } from "react";
import {
  Wrench,
  Plus,
  Search,
  Loader2,
  RefreshCw,
  Cpu,
  Calendar,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  HospitalAssetRecord,
  AssetMaintenanceRecord,
  AssetCategory,
  getHospitalAssetsAction,
  createHospitalAssetAction,
  getAssetMaintenanceLogsAction,
  createAssetMaintenanceLogAction,
} from "@/lib/assets/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function AssetsPage() {
  const [activeTab, setActiveTab] = useState<"ASSETS" | "MAINTENANCE">("ASSETS");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data
  const [assets, setAssets] = useState<HospitalAssetRecord[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<AssetMaintenanceRecord[]>([]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Asset Modal
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetCode, setAssetCode] = useState("");
  const [assetName, setAssetName] = useState("");
  const [category, setCategory] = useState<AssetCategory>("MEDICAL_EQUIPMENT");
  const [serialNumber, setSerialNumber] = useState("");
  const [purchaseCost, setPurchaseCost] = useState(0);
  const [location, setLocation] = useState("");

  // Maintenance Modal
  const [isMaintModalOpen, setIsMaintModalOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [maintCost, setMaintCost] = useState(0);
  const [performedBy, setPerformedBy] = useState("");
  const [maintNotes, setMaintNotes] = useState("");
  const [nextServiceDate, setNextServiceDate] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [assetsRes, maintRes] = await Promise.all([
        getHospitalAssetsAction({ limit: 50 }),
        getAssetMaintenanceLogsAction({ limit: 50 }),
      ]);

      if (!assetsRes.success) throw new Error(assetsRes.error || "Failed to load assets");
      setAssets(assetsRes.data?.assets || []);

      if (!maintRes.success) throw new Error(maintRes.error || "Failed to load maintenance logs");
      setMaintenanceLogs(maintRes.data?.logs || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading asset data";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [assetsRes, maintRes] = await Promise.all([
          getHospitalAssetsAction({ limit: 50 }),
          getAssetMaintenanceLogsAction({ limit: 50 }),
        ]);

        if (isMounted) {
          if (assetsRes.success && assetsRes.data) setAssets(assetsRes.data.assets);
          if (maintRes.success && maintRes.data) setMaintenanceLogs(maintRes.data.logs);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Error loading asset data";
          setErrorMsg(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetCode || !assetName) {
      setErrorMsg("Asset code and name are required");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await createHospitalAssetAction({
        asset_code: assetCode,
        asset_name: assetName,
        category,
        serial_number: serialNumber,
        purchase_cost: Number(purchaseCost) || 0,
        location,
      });

      if (!res.success) throw new Error(res.error || "Failed to create asset");

      setSuccessMsg(`Asset ${res.data?.asset.asset_code} successfully registered.`);
      setIsAssetModalOpen(false);
      setAssetCode(`AST-${Date.now().toString().slice(-6)}`);
      setAssetName("");
      setSerialNumber("");
      setPurchaseCost(0);
      setLocation("");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error registering asset";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetId || !maintNotes) {
      setErrorMsg("Please select an asset and provide service notes");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await createAssetMaintenanceLogAction({
        asset_id: selectedAssetId,
        cost: Number(maintCost) || 0,
        performed_by: performedBy,
        notes: maintNotes,
        next_service_date: nextServiceDate || undefined,
      });

      if (!res.success) throw new Error(res.error || "Failed to record service log");

      setSuccessMsg("Maintenance and calibration log successfully recorded.");
      setIsMaintModalOpen(false);
      setSelectedAssetId("");
      setMaintCost(0);
      setPerformedBy("");
      setMaintNotes("");
      setNextServiceDate("");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error recording maintenance";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAssets = assets.filter(
    (a) =>
      a.asset_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.asset_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.serial_number && a.serial_number.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600 border border-sky-100">
              <Wrench className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Fixed Assets & Biomedical Engineering
            </h1>
          </div>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Biomedical machinery register, scheduled calibration, repairs, and lifecycle tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMaintModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs transition min-h-[40px]"
          >
            <Plus className="h-4 w-4 text-slate-500" /> Log Service
          </button>
          <button
            onClick={() => {
              setAssetCode(`AST-${Date.now().toString().slice(-6)}`);
              setIsAssetModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition min-h-[40px]"
          >
            <Plus className="h-4 w-4" /> Register Asset
          </button>
          <button
            onClick={loadData}
            title="Refresh"
            disabled={loading}
            className="p-2.5 border border-slate-300 bg-white rounded-xl hover:bg-slate-50 text-slate-600 transition min-h-[40px] shadow-2xs"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2.5 text-sm font-medium">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-2.5 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-6">
        <button
          onClick={() => setActiveTab("ASSETS")}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "ASSETS"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Cpu className="h-4 w-4" /> Equipment Register ({assets.length})
        </button>
        <button
          onClick={() => setActiveTab("MAINTENANCE")}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === "MAINTENANCE"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Calendar className="h-4 w-4" /> Service & Calibration ({maintenanceLogs.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          <span className="ml-3 text-sm">Loading asset registry...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: ASSET REGISTER */}
          {activeTab === "ASSETS" && (
            <div className="space-y-4">
              <div className="relative w-80">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search assets by name or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                />
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3.5 font-bold tracking-wider">Asset Code</th>
                      <th className="px-6 py-3.5 font-bold tracking-wider">Asset Name</th>
                      <th className="px-6 py-3.5 font-bold tracking-wider">Category</th>
                      <th className="px-6 py-3.5 font-bold tracking-wider">Location</th>
                      <th className="px-6 py-3.5 font-bold tracking-wider text-right">Purchase Cost (BDT)</th>
                      <th className="px-6 py-3.5 font-bold tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAssets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">
                          No hospital assets recorded. Click &quot;Register Asset&quot; to add biomedical machinery.
                        </td>
                      </tr>
                    ) : (
                      filteredAssets.map((asset) => (
                        <tr key={asset.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-sky-700">
                            {asset.asset_code}
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-900">
                            <div>{asset.asset_name}</div>
                            {asset.serial_number && (
                              <div className="text-xs text-slate-500 font-normal mt-0.5">S/N: {asset.serial_number}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200/60">
                              {asset.category}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 text-xs font-medium">{asset.location || "Hospital"}</td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                            {formatCurrencyBDT(asset.purchase_cost)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {asset.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: MAINTENANCE */}
          {activeTab === "MAINTENANCE" && (
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5 font-bold tracking-wider">Service Date</th>
                    <th className="px-6 py-3.5 font-bold tracking-wider">Technician / Vendor</th>
                    <th className="px-6 py-3.5 font-bold tracking-wider">Service Notes</th>
                    <th className="px-6 py-3.5 font-bold tracking-wider text-right">Cost (BDT)</th>
                    <th className="px-6 py-3.5 font-bold tracking-wider">Next Service</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {maintenanceLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium">
                        No maintenance logs recorded.
                      </td>
                    </tr>
                  ) : (
                    maintenanceLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4 text-slate-600 text-xs font-semibold">
                          {new Date(log.maintenance_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-900">
                          {log.performed_by || "Biomedical Team"}
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm font-medium">
                          {log.notes}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                          {formatCurrencyBDT(log.cost)}
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-xs font-mono font-semibold">
                          {log.next_service_date || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* MODAL: REGISTER ASSET */}
      {isAssetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                Register Hospital Asset
              </h3>
              <button
                onClick={() => setIsAssetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 text-lg font-bold transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAsset} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Asset Code
                </label>
                <input
                  type="text"
                  required
                  value={assetCode}
                  onChange={(e) => setAssetCode(e.target.value)}
                  className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Asset / Equipment Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GE Healthcare CT Scanner, Mindray Patient Monitor"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as AssetCategory)}
                    className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  >
                    <option value="MEDICAL_EQUIPMENT">MEDICAL_EQUIPMENT</option>
                    <option value="DIAGNOSTIC_MACHINE">DIAGNOSTIC_MACHINE</option>
                    <option value="IT_HARDWARE">IT_HARDWARE</option>
                    <option value="FURNITURE">FURNITURE</option>
                    <option value="VEHICLE">VEHICLE</option>
                    <option value="FACILITY">FACILITY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Serial #
                  </label>
                  <input
                    type="text"
                    placeholder="OEM Serial"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Purchase Cost (BDT)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchaseCost || ""}
                    onChange={(e) => setPurchaseCost(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Location / Ward
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ICU-2, Radiology"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssetModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-bold bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 shadow-sm transition"
                >
                  {submitting ? "Saving..." : "Save Equipment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LOG MAINTENANCE */}
      {isMaintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                Log Calibration & Service
              </h3>
              <button
                onClick={() => setIsMaintModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 text-lg font-bold transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMaintenance} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Target Asset
                </label>
                <select
                  required
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                >
                  <option value="">Select Equipment...</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.asset_code} - {a.asset_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Service Cost (BDT)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={maintCost || ""}
                    onChange={(e) => setMaintCost(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Performed By
                  </label>
                  <input
                    type="text"
                    placeholder="Vendor / Engineer"
                    value={performedBy}
                    onChange={(e) => setPerformedBy(e.target.value)}
                    className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Service Notes / Calibration Checklist
                </label>
                <textarea
                  required
                  rows={3}
                  value={maintNotes}
                  onChange={(e) => setMaintNotes(e.target.value)}
                  placeholder="Parts replaced, calibration tolerance results..."
                  className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Next Scheduled Service Date
                </label>
                <input
                  type="date"
                  value={nextServiceDate}
                  onChange={(e) => setNextServiceDate(e.target.value)}
                  className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMaintModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-bold bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 shadow-sm transition"
                >
                  {submitting ? "Saving..." : "Record Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
