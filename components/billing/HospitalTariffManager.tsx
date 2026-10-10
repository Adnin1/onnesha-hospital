"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  Tag,
  Layers,
  Activity,
  X,
  Save,
  RefreshCw,
  AlertCircle,
  Building,
  Bed,
  Stethoscope,
  Scissors,
  HeartPulse,
} from "lucide-react";
import {
  getHospitalServiceTariffsAction,
  saveHospitalServiceTariffAction,
  HospitalServiceTariffRecord,
} from "@/lib/billing/actions";
import { Toast } from "@/components/ui/Toast";

interface Props {
  onTariffChanged?: () => void;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  CONSULTATION: { label: "Doctor Consultation", icon: Stethoscope, color: "text-blue-600 bg-blue-50 border-blue-200" },
  IPD_BED: { label: "IPD Bed & Cabin", icon: Bed, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  ADMISSION: { label: "Admission & Registration", icon: Building, color: "text-amber-600 bg-amber-50 border-amber-200" },
  CRITICAL_CARE: { label: "ICU / CCU Critical Care", icon: HeartPulse, color: "text-rose-600 bg-rose-50 border-rose-200" },
  OT_SURGERY: { label: "Operation Theatre (OT)", icon: Scissors, color: "text-purple-600 bg-purple-50 border-purple-200" },
  PROCEDURE: { label: "Clinical Procedures", icon: Activity, color: "text-teal-600 bg-teal-50 border-teal-200" },
  MISC: { label: "Miscellaneous Services", icon: Tag, color: "text-slate-600 bg-slate-50 border-slate-200" },
};

export function HospitalTariffManager({ onTariffChanged }: Props) {
  const [tariffs, setTariffs] = useState<HospitalServiceTariffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  // Add Tariff Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("CONSULTATION");
  const [newPrice, setNewPrice] = useState("");
  const [newUnit, setNewUnit] = useState("Per Service");
  const [newDescription, setNewDescription] = useState("");

  // Edit Tariff Modal
  const [editingTariff, setEditingTariff] = useState<HospitalServiceTariffRecord | null>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("CONSULTATION");
  const [editPrice, setEditPrice] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  const fetchTariffs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getHospitalServiceTariffsAction();
      if (res.success && res.data) {
        setTariffs(res.data.tariffs);
      } else {
        showToast(res.error || "Failed to load hospital tariffs", "error");
      }
    } catch {
      showToast("Error loading service tariff catalog", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTariffs();
  }, [fetchTariffs]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      showToast("Service name is required.", "error");
      return;
    }
    const priceNum = parseFloat(newPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      showToast("Please enter a valid price (>= 0).", "error");
      return;
    }

    setSubmittingAdd(true);
    try {
      const res = await saveHospitalServiceTariffAction({
        serviceCode: newCode.trim() || `SRV-${newCategory.substring(0, 3)}-${Math.floor(1000 + Math.random() * 9000)}`,
        serviceName: newName.trim(),
        category: newCategory,
        price: priceNum,
        unit: newUnit.trim() || "Per Service",
        description: newDescription.trim() || undefined,
        isActive: true,
      });

      if (res.success) {
        showToast("Hospital service tariff added successfully.");
        setIsAddModalOpen(false);
        setNewCode("");
        setNewName("");
        setNewPrice("");
        setNewDescription("");
        fetchTariffs();
        onTariffChanged?.();
      } else {
        showToast(res.error || "Failed to add service tariff", "error");
      }
    } catch {
      showToast("Error saving tariff", "error");
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleOpenEdit = (t: HospitalServiceTariffRecord) => {
    setEditingTariff(t);
    setEditName(t.service_name);
    setEditCategory(t.category);
    setEditPrice(t.price.toString());
    setEditUnit(t.unit || "Per Service");
    setEditDescription(t.description || "");
    setEditIsActive(t.is_active);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTariff) return;

    if (!editName.trim()) {
      showToast("Service name is required.", "error");
      return;
    }
    const priceNum = parseFloat(editPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      showToast("Please enter a valid price (>= 0).", "error");
      return;
    }

    setSubmittingEdit(true);
    try {
      const res = await saveHospitalServiceTariffAction({
        id: editingTariff.id,
        serviceCode: editingTariff.service_code,
        serviceName: editName.trim(),
        category: editCategory,
        price: priceNum,
        unit: editUnit.trim() || "Per Service",
        description: editDescription.trim() || undefined,
        isActive: editIsActive,
      });

      if (res.success) {
        showToast("Tariff updated successfully.");
        setEditingTariff(null);
        fetchTariffs();
        onTariffChanged?.();
      } else {
        showToast(res.error || "Failed to update tariff", "error");
      }
    } catch {
      showToast("Error updating tariff", "error");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleToggleActive = async (t: HospitalServiceTariffRecord) => {
    try {
      const res = await saveHospitalServiceTariffAction({
        id: t.id,
        serviceCode: t.service_code,
        serviceName: t.service_name,
        category: t.category,
        price: t.price,
        unit: t.unit,
        description: t.description || undefined,
        isActive: !t.is_active,
      });

      if (res.success) {
        showToast(`Tariff marked as ${!t.is_active ? "active" : "inactive"}.`);
        fetchTariffs();
        onTariffChanged?.();
      } else {
        showToast(res.error || "Failed to toggle status", "error");
      }
    } catch {
      showToast("Error toggling tariff status", "error");
    }
  };

  // Filter tariffs
  const filteredTariffs = tariffs.filter((t) => {
    const matchesSearch =
      t.service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.service_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === "ALL" || t.category === selectedCategory;

    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && t.is_active) ||
      (statusFilter === "INACTIVE" && !t.is_active);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-indigo-600" />
            Hospital Services & Tariff Catalog
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage customizable rates for OPD Consultation, IPD Bed & Cabin, Admission, Critical Care, OT & Clinical Procedures.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTariffs}
            disabled={loading}
            className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition"
            title="Refresh Catalog"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`} />
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Add Service Tariff
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search service name, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Categories ({tariffs.length})</option>
            {Object.entries(CATEGORY_META).map(([catKey, meta]) => (
              <option key={catKey} value={catKey}>
                {meta.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
            className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Tariffs Table */}
      <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4">Service Code</th>
                <th className="py-3 px-4">Service Name & Description</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Price (BDT)</th>
                <th className="py-3 px-4">Billing Unit</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mx-auto mb-2" />
                    Loading hospital tariffs...
                  </td>
                </tr>
              ) : filteredTariffs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    No hospital service tariffs found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredTariffs.map((t) => {
                  const meta = CATEGORY_META[t.category] || CATEGORY_META.MISC;
                  const IconComp = meta.icon;

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition group">
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">{t.service_code}</td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-bold text-slate-900">{t.service_name}</div>
                        {t.description && <div className="text-[11px] text-slate-400 truncate">{t.description}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.color}`}>
                          <IconComp className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 text-sm">
                        ৳{t.price.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{t.unit || "Per Service"}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(t)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition ${
                            t.is_active
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                          }`}
                        >
                          {t.is_active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {t.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(t)}
                          className="p-1.5 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-lg transition"
                          title="Edit Tariff"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                Add Hospital Service Tariff
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Service Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ICU Bed Charge (Daily), Major OT Charge"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-white"
                  >
                    {Object.entries(CATEGORY_META).map(([catKey, meta]) => (
                      <option key={catKey} value={catKey}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Price (BDT ৳) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Service Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. SRV-ICU-001"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Billing Unit</label>
                  <input
                    type="text"
                    placeholder="Per Visit / Per Day"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Clinical notes or billing guidance..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {submittingAdd ? "Saving..." : "Save Tariff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTariff && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-600" />
                Edit Service Tariff: {editingTariff.service_code}
              </h3>
              <button onClick={() => setEditingTariff(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Service Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-white"
                  >
                    {Object.entries(CATEGORY_META).map(([catKey, meta]) => (
                      <option key={catKey} value={catKey}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Price (BDT ৳) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Billing Unit</label>
                  <input
                    type="text"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Active Status</label>
                  <select
                    value={editIsActive ? "ACTIVE" : "INACTIVE"}
                    onChange={(e) => setEditIsActive(e.target.value === "ACTIVE")}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive (Archived)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTariff(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {submittingEdit ? "Updating..." : "Update Tariff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
