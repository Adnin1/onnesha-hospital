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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-7 w-7 text-sky-600 dark:text-sky-400" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Fixed Assets & Biomedical Engineering
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Biomedical machinery register, scheduled calibration, repairs, and lifecycle tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMaintModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition"
          >
            <Plus className="h-4 w-4" /> Log Service
          </button>
          <button
            onClick={() => {
              setAssetCode(`AST-${Date.now().toString().slice(-6)}`);
              setIsAssetModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition"
          >
            <Plus className="h-4 w-4" /> Register Asset
          </button>
          <button
            onClick={loadData}
            title="Refresh"
            disabled={loading}
            className="p-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
        <button
          onClick={() => setActiveTab("ASSETS")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition ${
            activeTab === "ASSETS"
              ? "border-sky-600 text-sky-600 dark:text-sky-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          <Cpu className="h-4 w-4" /> Equipment Register ({assets.length})
        </button>
        <button
          onClick={() => setActiveTab("MAINTENANCE")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition ${
            activeTab === "MAINTENANCE"
              ? "border-sky-600 text-sky-600 dark:text-sky-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
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
              <div className="relative w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-xs">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Asset Code</th>
                      <th className="px-6 py-3 font-semibold">Asset Name</th>
                      <th className="px-6 py-3 font-semibold">Category</th>
                      <th className="px-6 py-3 font-semibold">Location</th>
                      <th className="px-6 py-3 font-semibold text-right">Purchase Cost (BDT)</th>
                      <th className="px-6 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredAssets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                          No hospital assets recorded. Click &quot;Register Asset&quot; to add biomedical machinery.
                        </td>
                      </tr>
                    ) : (
                      filteredAssets.map((asset) => (
                        <tr key={asset.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-6 py-4 font-mono font-medium text-sky-700 dark:text-sky-400">
                            {asset.asset_code}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                            <div>{asset.asset_name}</div>
                            {asset.serial_number && (
                              <div className="text-xs text-slate-400">S/N: {asset.serial_number}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                            {asset.category}
                          </td>
                          <td className="px-6 py-4 text-slate-500 text-xs">{asset.location || "Hospital"}</td>
                          <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                            {formatCurrencyBDT(asset.purchase_cost)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
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
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Service Date</th>
                    <th className="px-6 py-3 font-semibold">Technician / Vendor</th>
                    <th className="px-6 py-3 font-semibold">Service Notes</th>
                    <th className="px-6 py-3 font-semibold text-right">Cost (BDT)</th>
                    <th className="px-6 py-3 font-semibold">Next Service</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {maintenanceLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                        No maintenance logs recorded.
                      </td>
                    </tr>
                  ) : (
                    maintenanceLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="px-6 py-4 text-slate-500 text-xs">
                          {new Date(log.maintenance_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                          {log.performed_by || "Biomedical Team"}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-sm">
                          {log.notes}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          {formatCurrencyBDT(log.cost)}
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-xs font-mono">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Register Hospital Asset
              </h3>
              <button
                onClick={() => setIsAssetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAsset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Asset Code
                </label>
                <input
                  type="text"
                  required
                  value={assetCode}
                  onChange={(e) => setAssetCode(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Asset / Equipment Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GE Healthcare CT Scanner, Mindray Patient Monitor"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as AssetCategory)}
                    className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
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
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                    Serial #
                  </label>
                  <input
                    type="text"
                    placeholder="OEM Serial"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                    Purchase Cost (BDT)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchaseCost || ""}
                    onChange={(e) => setPurchaseCost(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                    Location / Ward
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ICU-2, Radiology"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAssetModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Log Calibration & Service
              </h3>
              <button
                onClick={() => setIsMaintModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMaintenance} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Target Asset
                </label>
                <select
                  required
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
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
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                    Service Cost (BDT)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={maintCost || ""}
                    onChange={(e) => setMaintCost(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                    Performed By
                  </label>
                  <input
                    type="text"
                    placeholder="Vendor / Engineer"
                    value={performedBy}
                    onChange={(e) => setPerformedBy(e.target.value)}
                    className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Service Notes / Calibration Checklist
                </label>
                <textarea
                  required
                  rows={3}
                  value={maintNotes}
                  onChange={(e) => setMaintNotes(e.target.value)}
                  placeholder="Parts replaced, calibration tolerance results..."
                  className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Next Scheduled Service Date
                </label>
                <input
                  type="date"
                  value={nextServiceDate}
                  onChange={(e) => setNextServiceDate(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsMaintModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
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
