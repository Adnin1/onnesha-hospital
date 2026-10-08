"use client";

import React, { useState, useEffect } from "react";
import { X, HeartPulse, Plus, Edit2, Trash2, Save, Loader2, Bed } from "lucide-react";
import {
  CriticalCareUnit,
  getCriticalCareUnitsAction,
  createCriticalCareUnitAction,
  updateCriticalCareUnitAction,
  deleteCriticalCareUnitAction,
  addCriticalCareBedAction,
} from "@/lib/critical-care/actions";
import { formatCurrencyBDT } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
  onUpdated: () => void;
}

export function CriticalCareUnitModal({ isOpen, onClose, onToast, onUpdated }: Props) {
  const [units, setUnits] = useState<CriticalCareUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingUnit, setEditingUnit] = useState<CriticalCareUnit | null>(null);

  // New Unit Form
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitType, setNewUnitType] = useState<"ICU" | "ICCU" | "CCU" | "SICU" | "MICU" | "PICU">("ICU");
  const [newFloor, setNewFloor] = useState("3rd Floor");
  const [newTotalBeds, setNewTotalBeds] = useState("4");
  const [newDailyCharge, setNewDailyCharge] = useState("8000");

  // Edit Unit Form
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"ICU" | "ICCU" | "CCU" | "SICU" | "MICU" | "PICU">("ICU");
  const [editFloor, setEditFloor] = useState("");
  const [editTotalBeds, setEditTotalBeds] = useState("");
  const [editDailyCharge, setEditDailyCharge] = useState("");

  // Add Bed to Unit Form
  const [bedAddUnitId, setBedAddUnitId] = useState<string | null>(null);
  const [newBedNumber, setNewBedNumber] = useState("");
  const [newBedRate, setNewBedRate] = useState("8000");

  const [submitting, setSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const loadUnits = async () => {
    setLoading(true);
    try {
      const res = await getCriticalCareUnitsAction();
      if (res.success && res.data) {
        setUnits(res.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUnits();
      setIsAddingNew(false);
      setEditingUnit(null);
      setBedAddUnitId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitName.trim()) {
      onToast("ইউনিটের নাম লিখুন");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createCriticalCareUnitAction({
        unit_name: newUnitName.trim(),
        unit_type: newUnitType,
        floor: newFloor.trim(),
        total_beds: Number(newTotalBeds) || 1,
        daily_charge: Number(newDailyCharge) || 8000,
      });

      if (res.success) {
        onToast(`নতুন ইউনিট "${newUnitName}" যুক্ত হয়েছে।`);
        setIsAddingNew(false);
        setNewUnitName("");
        await loadUnits();
        onUpdated();
      } else {
        onToast(res.error || "ইউনিট তৈরি ব্যর্থ হয়েছে");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (u: CriticalCareUnit) => {
    setEditingUnit(u);
    setEditName(u.unit_name);
    setEditType(u.unit_type);
    setEditFloor(u.floor || "3rd Floor");
    setEditTotalBeds(String(u.total_beds || 1));
    setEditDailyCharge(String(u.daily_charge || 8000));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit) return;
    setSubmitting(true);
    try {
      const res = await updateCriticalCareUnitAction({
        unitId: editingUnit.id,
        unit_name: editName.trim(),
        unit_type: editType,
        floor: editFloor.trim(),
        total_beds: Number(editTotalBeds) || 1,
        daily_charge: Number(editDailyCharge) || 8000,
      });

      if (res.success) {
        onToast(`ইউনিট "${editName}" সফলভাবে আপডেট হয়েছে।`);
        setEditingUnit(null);
        await loadUnits();
        onUpdated();
      } else {
        onToast(res.error || "আপডেট ব্যর্থ হয়েছে");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUnit = async () => {
    if (!deleteTargetId) return;
    const target = deleteTargetId;
    setDeleteTargetId(null);
    setSubmitting(true);
    try {
      const res = await deleteCriticalCareUnitAction(target);
      if (res.success) {
        onToast("ইউনিট অপসারণ সম্পন্ন হয়েছে।");
        await loadUnits();
        onUpdated();
      } else {
        onToast(res.error || "অপসারণ ব্যর্থ হয়েছে");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddBed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bedAddUnitId || !newBedNumber.trim()) return;
    setSubmitting(true);
    try {
      const res = await addCriticalCareBedAction({
        unitId: bedAddUnitId,
        bed_number: newBedNumber.trim(),
        daily_rate: Number(newBedRate) || 8000,
      });

      if (res.success) {
        onToast(`বেড ${newBedNumber} ইউনিটে যুক্ত হয়েছে।`);
        setBedAddUnitId(null);
        setNewBedNumber("");
        await loadUnits();
        onUpdated();
      } else {
        onToast(res.error || "বেড যোগ করা যায়নি");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-rose-100 text-rose-700 rounded-2xl">
                <HeartPulse className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  ক্রিটিক্যাল কেয়ার ইউনিট ও ট্যারিফ ব্যবস্থাপনা (Critical Care Units)
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  ICU / CCU / HDU ইউনিট তৈরি, দৈনিক সার্ভিস চার্জ ও রিসোর্স কন্ট্রোল
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto space-y-5">
            {/* Action Bar */}
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-700">
                নিবন্ধিত ক্রিটিক্যাল কেয়ার ইউনিট তালিকা ({units.length} টি)
              </span>
              {!isAddingNew && !editingUnit && (
                <button
                  type="button"
                  onClick={() => setIsAddingNew(true)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ নতুন ইউনিট যোগ করুন</span>
                </button>
              )}
            </div>

            {/* New Unit Form */}
            {isAddingNew && (
              <form onSubmit={handleCreateUnit} className="p-4 bg-rose-50/60 border border-rose-200 rounded-2xl space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-rose-200/60">
                  <h4 className="text-xs font-black text-rose-900">+ নতুন ক্রিটিক্যাল কেয়ার ইউনিট</h4>
                  <button
                    type="button"
                    onClick={() => setIsAddingNew(false)}
                    className="text-[11px] text-slate-500 hover:text-slate-700 font-bold"
                  >
                    বাতিল
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">ইউনিটের নাম</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Main Medical ICU"
                      value={newUnitName}
                      onChange={(e) => setNewUnitName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">ইউনিট টাইপ</label>
                    <select
                      value={newUnitType}
                      onChange={(e) => setNewUnitType(e.target.value as typeof newUnitType)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                    >
                      <option value="ICU">ICU (Intensive Care)</option>
                      <option value="CCU">CCU (Coronary Care)</option>
                      <option value="ICCU">ICCU (Intensive Coronary)</option>
                      <option value="SICU">SICU (Surgical ICU)</option>
                      <option value="MICU">MICU (Medical ICU)</option>
                      <option value="PICU">PICU (Pediatric ICU)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">ফ্লোর</label>
                    <input
                      type="text"
                      value={newFloor}
                      onChange={(e) => setNewFloor(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">মোট বেড সংখ্যা</label>
                    <input
                      type="number"
                      min="1"
                      value={newTotalBeds}
                      onChange={(e) => setNewTotalBeds(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">দৈনিক সার্ভিস চার্জ (BDT/day)</label>
                    <input
                      type="number"
                      min="0"
                      value={newDailyCharge}
                      onChange={(e) => setNewDailyCharge(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-mono font-bold"
                    />
                  </div>
                </div>
                <div className="pt-2 text-right">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer ml-auto"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <Save className="w-3.5 h-3.5" />
                    <span>ইউনিট সংরক্ষণ করুন</span>
                  </button>
                </div>
              </form>
            )}

            {/* Edit Unit Form */}
            {editingUnit && (
              <form onSubmit={handleSaveEdit} className="p-4 bg-sky-50/60 border border-sky-200 rounded-2xl space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-sky-200/60">
                  <h4 className="text-xs font-black text-sky-900">ইউনিট এডিট: {editingUnit.unit_name}</h4>
                  <button
                    type="button"
                    onClick={() => setEditingUnit(null)}
                    className="text-[11px] text-slate-500 hover:text-slate-700 font-bold"
                  >
                    বাতিল
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">ইউনিটের নাম</label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">ইউনিট টাইপ</label>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as typeof editType)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-medium"
                    >
                      <option value="ICU">ICU (Intensive Care)</option>
                      <option value="CCU">CCU (Coronary Care)</option>
                      <option value="ICCU">ICCU (Intensive Coronary)</option>
                      <option value="SICU">SICU (Surgical ICU)</option>
                      <option value="MICU">MICU (Medical ICU)</option>
                      <option value="PICU">PICU (Pediatric ICU)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">ফ্লোর</label>
                    <input
                      type="text"
                      value={editFloor}
                      onChange={(e) => setEditFloor(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">মোট বেড সংখ্যা</label>
                    <input
                      type="number"
                      min="1"
                      value={editTotalBeds}
                      onChange={(e) => setEditTotalBeds(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">দৈনিক সার্ভিস চার্জ (BDT/day)</label>
                    <input
                      type="number"
                      min="0"
                      value={editDailyCharge}
                      onChange={(e) => setEditDailyCharge(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-mono font-bold"
                    />
                  </div>
                </div>
                <div className="pt-2 text-right">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer ml-auto"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <Save className="w-3.5 h-3.5" />
                    <span>পরিবর্তন সংরক্ষণ করুন</span>
                  </button>
                </div>
              </form>
            )}

            {/* Add Bed Form */}
            {bedAddUnitId && (
              <form onSubmit={handleAddBed} className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-emerald-200/60">
                  <h4 className="text-xs font-black text-emerald-900">+ ইউনিটে নতুন বেড সংযুক্ত করুন</h4>
                  <button
                    type="button"
                    onClick={() => setBedAddUnitId(null)}
                    className="text-[11px] text-slate-500 hover:text-slate-700 font-bold"
                  >
                    বাতিল
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">বেড কোড / নম্বর</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ICU-07"
                      value={newBedNumber}
                      onChange={(e) => setNewBedNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">দৈনিক চার্জ (BDT/day)</label>
                    <input
                      type="number"
                      min="0"
                      value={newBedRate}
                      onChange={(e) => setNewBedRate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-xs font-mono font-bold"
                    />
                  </div>
                </div>
                <div className="pt-2 text-right">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer ml-auto"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <Bed className="w-3.5 h-3.5" />
                    <span>বেড যোগ করুন</span>
                  </button>
                </div>
              </form>
            )}

            {/* Units List */}
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                <span>লোড হচ্ছে...</span>
              </div>
            ) : units.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">কোনো ক্রিটিক্যাল কেয়ার ইউনিট পাওয়া যায়নি।</div>
            ) : (
              <div className="space-y-3">
                {units.map((u) => (
                  <div
                    key={u.id}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-slate-100/60 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 uppercase">
                          {u.unit_type}
                        </span>
                        <h4 className="font-black text-slate-900 text-sm">{u.unit_name}</h4>
                        <span className="text-[10px] text-slate-400 font-medium">({u.floor || "3rd Floor"})</span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-3">
                        <span>
                          মোট বেড: <strong>{u.total_beds}</strong> টি
                        </span>
                        <span>•</span>
                        <span>
                          দৈনিক সার্ভিস চার্জ:{" "}
                          <strong className="font-mono text-emerald-700 font-bold">
                            {formatCurrencyBDT(u.daily_charge)}/দিন
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBedAddUnitId(u.id);
                          setNewBedRate(String(u.daily_charge));
                        }}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                        title="নতুন বেড যোগ করুন"
                      >
                        <Bed className="w-3.5 h-3.5" />
                        <span>+ বেড</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartEdit(u)}
                        className="p-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl transition cursor-pointer"
                        title="এডিট করুন"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(u.id)}
                        className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition cursor-pointer"
                        title="ডিলিট করুন"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {deleteTargetId && (
        <ConfirmDialog
          isOpen={!!deleteTargetId}
          title="ইউনিট মুছে ফেলতে চান?"
          description="আপনি কি নিশ্চিত যে এই ক্রিটিক্যাল কেয়ার ইউনিটটি অপসারণ করতে চান? কোনো সক্রিয় রোগী ভর্তি না থাকলে এটি মুছে ফেলা হবে।"
          confirmLabel="হ্যাঁ, মুছে ফেলুন"
          isDestructive={true}
          onConfirm={handleDeleteUnit}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
    </>
  );
}
