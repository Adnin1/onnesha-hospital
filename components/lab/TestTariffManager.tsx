"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Tag,
  DollarSign,
  Clock,
  Layers,
  Activity,
  X,
  Save,
  RefreshCw,
  AlertCircle,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  getAllDiagnosticTestsAction,
  createDiagnosticTestAction,
  updateDiagnosticTestAction,
  deleteDiagnosticTestAction,
  bulkDeleteDiagnosticTestsAction,
  DiagnosticTestItem,
  DiagnosticCategoryItem,
} from "@/lib/lab/actions";
import { Toast } from "@/components/ui/Toast";

interface Props {
  onCatalogChanged?: () => void;
}

export function TestTariffManager({ onCatalogChanged }: Props) {
  const [tests, setTests] = useState<DiagnosticTestItem[]>([]);
  const [categories, setCategories] = useState<DiagnosticCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Selection & View Mode States
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [submittingBulkDelete, setSubmittingBulkDelete] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "grouped">("table");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  // Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newSpecimen, setNewSpecimen] = useState("Blood");
  const [newPrice, setNewPrice] = useState("");
  const [newTurnaround, setNewTurnaround] = useState("2");

  // Edit Modal State
  const [editingTest, setEditingTest] = useState<DiagnosticTestItem | null>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editTurnaround, setEditTurnaround] = useState("");
  const [editActive, setEditActive] = useState(true);

  // Delete Confirm State
  const [deletingTest, setDeletingTest] = useState<DiagnosticTestItem | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  async function loadCatalog() {
    setLoading(true);
    try {
      const res = await getAllDiagnosticTestsAction();
      if (res.success && res.data) {
        setTests(res.data.tests);
        setCategories(res.data.categories);
        if (res.data.categories.length > 0 && !newCategory) {
          setNewCategory(res.data.categories[0].category_name);
        }
      } else {
        showToast(res.error || "টেস্ট তালিকা লোড করা যায়নি", "error");
      }
    } catch (err: unknown) {
      console.error("[TestTariffManager] reloadCatalog error:", err);
      showToast("ক্যাটালগ লোড করতে সমস্যা হয়েছে", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    async function initCatalog() {
      try {
        const res = await getAllDiagnosticTestsAction();
        if (!mounted) return;
        if (res.success && res.data) {
          setTests(res.data.tests);
          setCategories(res.data.categories);
          if (res.data.categories.length > 0) {
            setNewCategory((prev) => prev || res.data!.categories[0].category_name);
          }
        }
      } catch (err: unknown) {
        console.error("[TestTariffManager] initCatalog error:", err);
        if (mounted) showToast("ক্যাটালগ লোড করতে সমস্যা হয়েছে", "error");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void initCatalog();
    return () => {
      mounted = false;
    };
  }, []);

  // Filtered List
  const filteredTests = tests.filter((t) => {
    const matchesSearch =
      t.test_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.test_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.category_name && t.category_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategory === "ALL" ||
      (t.category_name && t.category_name.toLowerCase() === selectedCategory.toLowerCase());

    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && t.is_active) ||
      (statusFilter === "INACTIVE" && !t.is_active);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Category counts and grouping
  const categoryCountMap = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tests) {
      const cat = t.category_name || "General";
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return map;
  }, [tests]);

  const groupedByCategory = React.useMemo(() => {
    const map = new Map<string, DiagnosticTestItem[]>();
    for (const t of filteredTests) {
      const cat = t.category_name || "General";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return Array.from(map.entries());
  }, [filteredTests]);

  // Selection helpers
  const toggleSelectTest = (id: string) => {
    setSelectedTestIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const isAllVisibleSelected =
    filteredTests.length > 0 && filteredTests.every((t) => selectedTestIds.includes(t.id));

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      const visibleIdSet = new Set(filteredTests.map((t) => t.id));
      setSelectedTestIds((prev) => prev.filter((id) => !visibleIdSet.has(id)));
    } else {
      const newIds = new Set([...selectedTestIds, ...filteredTests.map((t) => t.id)]);
      setSelectedTestIds(Array.from(newIds));
    }
  };

  const selectCategoryTests = (catName: string) => {
    const catTests = tests.filter(
      (t) => (t.category_name || "General").toLowerCase() === catName.toLowerCase()
    );
    const catIds = catTests.map((t) => t.id);
    const allSelected = catIds.length > 0 && catIds.every((id) => selectedTestIds.includes(id));
    if (allSelected) {
      setSelectedTestIds((prev) => prev.filter((id) => !catIds.includes(id)));
    } else {
      setSelectedTestIds((prev) => Array.from(new Set([...prev, ...catIds])));
    }
  };

  const clearSelection = () => {
    setSelectedTestIds([]);
  };

  const toggleCategoryExpand = (catName: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catName]: prev[catName] === false ? true : false,
    }));
  };

  // Handle Add
  async function handleAddTest(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newPrice) {
      showToast("টেস্টের নাম এবং মূল্য দেওয়া আবশ্যক", "error");
      return;
    }

    const priceNum = parseFloat(newPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      showToast("সঠিক মূল্য দিন (Price must be >= 0)", "error");
      return;
    }

    setSubmittingAdd(true);
    try {
      const selectedCatObj = categories.find(
        (c) => c.category_name.toLowerCase() === newCategory.toLowerCase()
      );

      const res = await createDiagnosticTestAction({
        test_name: newName.trim(),
        test_code: newCode.trim() || undefined,
        category_id: selectedCatObj?.id,
        category_name: newCategory,
        specimen_type: newSpecimen,
        price: priceNum,
        delivery_turnaround_hours: parseInt(newTurnaround, 10) || 2,
      });

      if (res.success && res.data?.test) {
        setTests((prev) => [res.data!.test, ...prev]);
        showToast(`"${newName}" টেস্টটি সফলভাবে যোগ করা হয়েছে! (৳ ${priceNum})`, "success");
        setIsAddModalOpen(false);
        setNewName("");
        setNewCode("");
        setNewPrice("");
        if (onCatalogChanged) onCatalogChanged();
      } else {
        showToast(res.error || "টেস্ট যোগ করতে সমস্যা হয়েছে", "error");
      }
    } catch (err: unknown) {
      console.error("[TestTariffManager] handleAddTest error:", err);
      showToast("সার্ভারে সমস্যা হয়েছে", "error");
    } finally {
      setSubmittingAdd(false);
    }
  }

  // Open Edit Modal
  function openEditModal(test: DiagnosticTestItem) {
    setEditingTest(test);
    setEditName(test.test_name);
    setEditPrice(String(test.price));
    setEditTurnaround(String(test.delivery_turnaround_hours));
    setEditActive(test.is_active);
  }

  // Handle Update
  async function handleUpdateTest(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTest) return;

    const priceNum = parseFloat(editPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      showToast("সঠিক মূল্য দিন (Price must be >= 0)", "error");
      return;
    }

    setSubmittingEdit(true);
    try {
      const res = await updateDiagnosticTestAction({
        id: editingTest.id,
        test_name: editName.trim(),
        price: priceNum,
        delivery_turnaround_hours: parseInt(editTurnaround, 10) || 2,
        is_active: editActive,
      });

      if (res.success) {
        setTests((prev) =>
          prev.map((t) =>
            t.id === editingTest.id
              ? {
                  ...t,
                  test_name: editName.trim() || t.test_name,
                  price: priceNum,
                  delivery_turnaround_hours: parseInt(editTurnaround, 10) || t.delivery_turnaround_hours,
                  is_active: editActive,
                }
              : t
          )
        );
        showToast(`ফি আপডেট সম্পন্ন: ৳ ${priceNum}`, "success");
        setEditingTest(null);
        if (onCatalogChanged) onCatalogChanged();
      } else {
        showToast(res.error || "আপডেট ব্যর্থ হয়েছে", "error");
      }
    } catch (err: unknown) {
      console.error("[TestTariffManager] handleUpdateTest error:", err);
      showToast("সার্ভারে সমস্যা হয়েছে", "error");
    } finally {
      setSubmittingEdit(false);
    }
  }

  // Handle Delete / Deactivate
  async function handleDeleteConfirm() {
    if (!deletingTest) return;
    setSubmittingDelete(true);
    try {
      const res = await deleteDiagnosticTestAction(deletingTest.id);
      if (res.success) {
        if (res.data?.hardDeleted) {
          setTests((prev) => prev.filter((t) => t.id !== deletingTest.id));
        } else {
          setTests((prev) =>
            prev.map((t) => (t.id === deletingTest.id ? { ...t, is_active: false } : t))
          );
        }
        showToast(`"${deletingTest.test_name}" সফলভাবে মুছে ফেলা হয়েছে`, "info");
        setSelectedTestIds((prev) => prev.filter((id) => id !== deletingTest.id));
        setDeletingTest(null);
        if (onCatalogChanged) onCatalogChanged();
      } else {
        showToast(res.error || "ডিলিট করতে সমস্যা হয়েছে", "error");
      }
    } catch (err: unknown) {
      console.error("[TestTariffManager] handleDeleteConfirm error:", err);
      showToast("সার্ভারে সমস্যা হয়েছে", "error");
    } finally {
      setSubmittingDelete(false);
    }
  }

  // Handle Bulk Delete
  async function handleBulkDeleteConfirm() {
    if (selectedTestIds.length === 0) return;
    setSubmittingBulkDelete(true);
    try {
      const res = await bulkDeleteDiagnosticTestsAction(selectedTestIds);
      if (res.success) {
        await loadCatalog();
        showToast(
          `সফলভাবে ${res.data?.deletedCount || selectedTestIds.length} টি টেস্ট মুছে ফেলা/নিষ্ক্রিয় করা হয়েছে`,
          "success"
        );
        setSelectedTestIds([]);
        setIsBulkDeleteModalOpen(false);
        if (onCatalogChanged) onCatalogChanged();
      } else {
        showToast(res.error || "বাল্ক ডিলিট ব্যর্থ হয়েছে", "error");
      }
    } catch (err: unknown) {
      console.error("[TestTariffManager] handleBulkDeleteConfirm error:", err);
      showToast("সার্ভারে সমস্যা হয়েছে", "error");
    } finally {
      setSubmittingBulkDelete(false);
    }
  }

  // Quick Toggle Active Status
  async function handleToggleStatus(test: DiagnosticTestItem) {
    const targetStatus = !test.is_active;
    try {
      const res = await updateDiagnosticTestAction({
        id: test.id,
        price: test.price,
        is_active: targetStatus,
      });
      if (res.success) {
        setTests((prev) =>
          prev.map((t) => (t.id === test.id ? { ...t, is_active: targetStatus } : t))
        );
        showToast(
          `টেস্টটি ${targetStatus ? "সক্রিয় (Active)" : "নিষ্ক্রিয় (Inactive)"} করা হয়েছে`,
          "success"
        );
        if (onCatalogChanged) onCatalogChanged();
      }
    } catch (err: unknown) {
      console.error("[TestTariffManager] handleToggleStatus error:", err);
      showToast("স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে", "error");
    }
  }

  const activeCount = tests.filter((t) => t.is_active).length;
  const avgPrice = tests.length > 0
    ? Math.round(tests.reduce((acc, t) => acc + (t.is_active ? t.price : 0), 0) / (activeCount || 1))
    : 0;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">মোট টেস্ট ও সার্ভিস</p>
            <p className="text-xl font-bold text-slate-900">{tests.length} টি</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">সক্রিয় টেস্ট (Active)</p>
            <p className="text-xl font-bold text-emerald-600">{activeCount} টি</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">গড় টেস্ট ফি</p>
            <p className="text-xl font-bold text-slate-900">৳ {avgPrice}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">ডিপার্টমেন্ট / ক্যাটাগরি</p>
            <p className="text-xl font-bold text-purple-600">{categories.length} টি</p>
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Actions */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="টেস্টের নাম, কোড বা ক্যাটাগরি দিয়ে খুঁজুন..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">সকল ক্যাটাগরি</option>
            {categories.map((c) => (
              <option key={c.id} value={c.category_name}>
                {c.category_name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)} // eslint-disable-line @typescript-eslint/no-explicit-any
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="ALL">সকল স্ট্যাটাস</option>
            <option value="ACTIVE">শুধুমাত্র সক্রিয় (Active)</option>
            <option value="INACTIVE">শুধুমাত্র নিষ্ক্রিয় (Inactive)</option>
          </select>

          <button
            onClick={() => void loadCatalog()}
            className="p-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition"
            title="রিফ্রেশ করুন"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs"
        >
          <Plus className="w-4 h-4" />
          নতুন টেস্ট / সার্ভিস যোগ করুন
        </button>
      </div>

      {/* Floating / Sticky Bulk Action Bar */}
      {selectedTestIds.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 border border-sky-500/30 text-white p-3.5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-sky-500 text-white font-mono font-black text-xs shadow-xs">
              {selectedTestIds.length}
            </span>
            <div>
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>{selectedTestIds.length} টি টেস্ট নির্বাচিত হয়েছে</span>
                <span className="text-[10px] text-sky-300 font-normal">
                  (মোট {tests.length} টির মধ্যে)
                </span>
              </p>
              <p className="text-[10px] text-slate-300">
                এক সাথে মুছে ফেলতে লাল বাটনে ক্লিক করুন অথবা সিলেকশন বাতিল করুন
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAllVisible}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/10 transition"
            >
              {isAllVisibleSelected ? "বর্তমান পেজ আনসিলেক্ট" : `বর্তমান পেজ সিলেক্ট (${filteredTests.length})`}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-slate-300 transition"
            >
              বাতিল (Clear)
            </button>
            <button
              type="button"
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1.5 shadow-md shadow-rose-900/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>নির্বাচিত টেস্ট মুছুন ({selectedTestIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Category Navigation Pills & View Toggle */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-bold text-slate-800">ক্যাটাগরি অনুযায়ী সাজানো টেস্ট তালিকা</span>
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
              ({categories.length} টি ক্যাটাগরি)
            </span>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === "table"
                  ? "bg-white text-sky-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>সকল টেস্ট (Table View)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grouped")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === "grouped"
                  ? "bg-white text-sky-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>ক্যাটাগরি ভিত্তিক গ্রুপ ভিউ (Grouped)</span>
            </button>
          </div>
        </div>

        {/* Horizontal Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => setSelectedCategory("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition flex items-center gap-1.5 ${
              selectedCategory === "ALL"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>সব টেস্ট (All Tests)</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              selectedCategory === "ALL" ? "bg-white/20 text-white font-bold" : "bg-slate-200 text-slate-700"
            }`}>
              {tests.length}
            </span>
          </button>

          {categories.map((c) => {
            const count = categoryCountMap.get(c.category_name) || 0;
            const isSelected = selectedCategory.toLowerCase() === c.category_name.toLowerCase();
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.category_name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-sky-600 text-white font-bold shadow-xs"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/80"
                }`}
              >
                <span>{c.category_name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected ? "bg-white/20 text-white font-bold" : "bg-slate-200/80 text-slate-600"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================== VIEW 1: TABLE VIEW ===================== */}
      {viewMode === "table" ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={isAllVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                      title={isAllVisibleSelected ? "সব আনসিলেক্ট করুন" : "সব সিলেক্ট করুন"}
                    />
                  </th>
                  <th className="py-3 px-4">টেস্টের নাম ও কোড</th>
                  <th className="py-3 px-4">ক্যাটাগরি</th>
                  <th className="py-3 px-4">নমুনা (Specimen)</th>
                  <th className="py-3 px-4">ডেলিভারি সময়</th>
                  <th className="py-3 px-4 text-right">নির্ধারিত ফি (BDT)</th>
                  <th className="py-3 px-4 text-center">স্ট্যাটাস</th>
                  <th className="py-3 px-4 text-center">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-600" />
                      টেস্ট ক্যাটালগ লোড হচ্ছে...
                    </td>
                  </tr>
                ) : filteredTests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      কোনো টেস্ট পাওয়া যায়নি
                    </td>
                  </tr>
                ) : (
                  filteredTests.map((test) => {
                    const isSelected = selectedTestIds.includes(test.id);
                    return (
                      <tr
                        key={test.id}
                        className={`hover:bg-slate-50/80 transition ${
                          isSelected ? "bg-sky-50/60" : !test.is_active ? "opacity-60 bg-slate-50/50" : ""
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectTest(test.id)}
                            className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{test.test_name}</div>
                          <div className="text-[11px] font-mono text-slate-500 uppercase">{test.test_code}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                            {test.category_name || "General"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="flex items-center gap-1">
                            <Activity className="w-3.5 h-3.5 text-slate-400" />
                            {test.specimen_type || "None"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {test.delivery_turnaround_hours} ঘণ্টা
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono">
                            ৳ {test.price.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => void handleToggleStatus(test)}
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition ${
                              test.is_active
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-rose-100 text-rose-800 hover:bg-rose-200"
                            }`}
                            title="ক্লিক করে স্ট্যাটাস পরিবর্তন করুন"
                          >
                            {test.is_active ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                সক্রিয়
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3" />
                                নিষ্ক্রিয়
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openEditModal(test)}
                              className="p-1.5 text-slate-600 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"
                              title="মূল্য ও তথ্য পরিবর্তন করুন"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingTest(test)}
                              className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="মুছে ফেলুন"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
      ) : (
        /* ===================== VIEW 2: CATEGORY GROUPED VIEW ===================== */
        <div className="space-y-4">
          {loading ? (
            <div className="py-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-600" />
              ক্যাটাগরি অনুযায়ী সাজানো হচ্ছে...
            </div>
          ) : groupedByCategory.length === 0 ? (
            <div className="py-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-400">
              কোনো টেস্ট পাওয়া যায়নি
            </div>
          ) : (
            groupedByCategory.map(([catName, catTests]) => {
              const isCollapsed = expandedCategories[catName] === false;
              const catIds = catTests.map((t) => t.id);
              const allCatSelected = catIds.length > 0 && catIds.every((id) => selectedTestIds.includes(id));
              const someCatSelected = catIds.some((id) => selectedTestIds.includes(id));
              const catActiveCount = catTests.filter((t) => t.is_active).length;
              const catAvgPrice = Math.round(
                catTests.reduce((sum, t) => sum + (t.is_active ? t.price : 0), 0) / (catActiveCount || 1)
              );

              return (
                <div key={catName} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  {/* Category Header */}
                  <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleCategoryExpand(catName)}
                        className="p-1 text-slate-400 hover:text-slate-700 transition rounded"
                      >
                        {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>

                      <input
                        type="checkbox"
                        checked={allCatSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someCatSelected && !allCatSelected;
                        }}
                        onChange={() => selectCategoryTests(catName)}
                        className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                        title="এই ক্যাটাগরির সব টেস্ট সিলেক্ট করুন"
                      />

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900">{catName}</h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-mono">
                            {catTests.length} টি টেস্ট
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          গড় ফি: ৳ {catAvgPrice} • সক্রিয়: {catActiveCount}/{catTests.length} টি
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => selectCategoryTests(catName)}
                        className={`px-3 py-1 rounded-xl text-xs font-semibold transition ${
                          allCatSelected
                            ? "bg-sky-100 text-sky-800"
                            : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {allCatSelected ? "✓ ক্যাটাগরি নির্বাচিত" : "ক্যাটাগরি সিলেক্ট"}
                      </button>
                    </div>
                  </div>

                  {/* Category Tests List */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <tbody className="divide-y divide-slate-100">
                          {catTests.map((test) => {
                            const isSelected = selectedTestIds.includes(test.id);
                            return (
                              <tr
                                key={test.id}
                                className={`hover:bg-slate-50/80 transition ${
                                  isSelected ? "bg-sky-50/60" : !test.is_active ? "opacity-60 bg-slate-50/50" : ""
                                }`}
                              >
                                <td className="py-2.5 px-4 text-center w-10">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectTest(test.id)}
                                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                                  />
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="font-semibold text-slate-900">{test.test_name}</div>
                                  <div className="text-[10px] font-mono text-slate-500 uppercase">{test.test_code}</div>
                                </td>
                                <td className="py-2.5 px-4 text-slate-600">
                                  <span className="flex items-center gap-1 text-[11px]">
                                    <Activity className="w-3 h-3 text-slate-400" />
                                    {test.specimen_type || "None"}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-slate-600">
                                  <span className="flex items-center gap-1 text-[11px]">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {test.delivery_turnaround_hours} ঘণ্টা
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono">
                                    ৳ {test.price.toLocaleString("en-BD", { minimumFractionDigits: 2 })}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  <button
                                    onClick={() => void handleToggleStatus(test)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition ${
                                      test.is_active
                                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                        : "bg-rose-100 text-rose-800 hover:bg-rose-200"
                                    }`}
                                  >
                                    {test.is_active ? "সক্রিয়" : "নিষ্ক্রিয়"}
                                  </button>
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => openEditModal(test)}
                                      className="p-1 text-slate-600 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"
                                      title="মূল্য ও তথ্য পরিবর্তন করুন"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setDeletingTest(test)}
                                      className="p-1 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                      title="মুছে ফেলুন"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ===================== BULK DELETE CONFIRMATION MODAL ===================== */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 text-center">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
              <Trash2 className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1.5">
              নির্বাচিত {selectedTestIds.length} টি টেস্ট মুছে ফেলতে চান?
            </h3>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              আপনি এক সাথে <strong>{selectedTestIds.length} টি টেস্ট</strong> মুছে ফেলতে যাচ্ছেন। 
              যেসব টেস্টের কোনো পূর্ববর্তী পেশেন্ট অর্ডার নেই সেগুলো স্থায়ীভাবে রিমুভ হবে, এবং পূর্বের অর্ডারযুক্ত টেস্টগুলো ইনঅ্যাক্টিভ (নিষ্ক্রিয়) করা হবে যাতে হিস্ট্রিকাল রেকর্ড অক্ষত থাকে।
            </p>

            <div className="flex justify-center gap-3">
              <button
                type="button"
                disabled={submittingBulkDelete}
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-5 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                না, বাতিল করুন
              </button>
              <button
                type="button"
                disabled={submittingBulkDelete}
                onClick={() => void handleBulkDeleteConfirm()}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 flex items-center gap-2 shadow-md shadow-rose-900/20"
              >
                {submittingBulkDelete ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>মুছে ফেলা হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>হ্যাঁ, {selectedTestIds.length} টি টেস্ট মুছুন</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== ADD NEW TEST MODAL ===================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-600" />
                নতুন টেস্ট / সার্ভিস যুক্ত করুন
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTest} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  টেস্টের নাম (Test Name) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: Complete Blood Count (CBC) with ESR"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    টেস্ট কোড (Test Code) <span className="text-slate-400 font-normal text-[11px]">(ঐচ্ছিক)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="যেমন: CBC_01 (খালি রাখলে স্বয়ংক্রিয় কোড হবে)"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ক্যাটাগরি (Category)
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.category_name}>
                        {c.category_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    নির্ধারিত ফি (৳) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                      ৳
                    </span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="1"
                      placeholder="400"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 text-xs font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    নমুনা (Specimen)
                  </label>
                  <select
                    value={newSpecimen}
                    onChange={(e) => setNewSpecimen(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="Blood">Blood (রক্ত)</option>
                    <option value="Urine">Urine (প্রস্রাব)</option>
                    <option value="Stool">Stool (মল)</option>
                    <option value="Tissue">Tissue (টিস্যু)</option>
                    <option value="None">None (রেডিওলজি/স্ক্যান)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    সময় (ঘণ্টা)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="2"
                    value={newTurnaround}
                    onChange={(e) => setNewTurnaround(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {submittingAdd ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== EDIT TEST MODAL ===================== */}
      {editingTest && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-sky-600" />
                মূল্য ও টেস্টের তথ্য পরিবর্তন করুন
              </h3>
              <button
                onClick={() => setEditingTest(null)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateTest} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  টেস্টের নাম (Test Name)
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  নির্ধারিত ফি (Price in BDT) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                    ৳
                  </span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm font-bold text-emerald-700 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  এই মূল্যটি পরিবর্তন করলে বিলিং কাউন্টারে তাৎক্ষণিক নতুন ফি কার্যকর হবে।
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ডেলিভারি সময় (Turnaround Hours)
                </label>
                <input
                  type="number"
                  min="1"
                  value={editTurnaround}
                  onChange={(e) => setEditTurnaround(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="activeToggle"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded-sm border-slate-300 focus:ring-sky-500"
                />
                <label htmlFor="activeToggle" className="text-xs font-semibold text-slate-800">
                  টেস্টটি সক্রিয় রাখুন (Active for booking and billing)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTest(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {submittingEdit ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  আপডেট সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== DELETE CONFIRMATION MODAL ===================== */}
      {deletingTest && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-5 text-center">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">
              টেস্টটি নিষ্ক্রিয় / মুছে ফেলতে চান?
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              <strong>{deletingTest.test_name}</strong> নিষ্ক্রিয় করলে নতুন কোনো বিলিং বা ওপিডি
              অর্ডারে এই টেস্টটি আর আসবে না। তবে পূর্বের সংরক্ষিত রেকর্ড বহাল থাকবে।
            </p>

            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setDeletingTest(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                না, রাখুন
              </button>
              <button
                type="button"
                disabled={submittingDelete}
                onClick={() => void handleDeleteConfirm()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingDelete && <RefreshCw className="w-3 h-3 animate-spin" />}
                হ্যাঁ, নিশ্চিত করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
