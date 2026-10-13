"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import {
  Plus,
  Search,
  DollarSign,
  Stethoscope,
  Printer,
  XCircle,
  RefreshCw,
  Wallet,
  ArrowUpRight,
  ShieldAlert,
  X,
  Edit,
  Calendar,
  Archive,
  Check,
} from "lucide-react";
import {
  getExpensesAction,
  getExpenseCategoriesAction,
  getExpenseAnalyticsAction,
  createExpenseAction,
  updateExpenseAction,
  voidExpenseAction,
  saveExpenseCategoryAction,
  archiveExpenseCategoryAction,
  generateMonthlyRecurringExpensesAction,
  ExpenseRecord,
  ExpenseCategoryRecord,
  ExpenseAnalyticsSummary,
} from "@/lib/expenses/actions";
import { getDoctorsAction } from "@/lib/appointments/actions";
import { DoctorRecord } from "@/types/appointments";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";
import { Toast } from "@/components/ui/Toast";

function ExpensesManagementContent() {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryRecord[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [analytics, setAnalytics] = useState<ExpenseAnalyticsSummary | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedDoctor, setSelectedDoctor] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ACTIVE");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [printVoucher, setPrintVoucher] = useState<ExpenseRecord | null>(null);
  const [voidModalExpense, setVoidModalExpense] = useState<ExpenseRecord | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidFundsRecoveredConfirmed, setVoidFundsRecoveredConfirmed] = useState(false);

  // Edit Modal State
  const [editModalExpense, setEditModalExpense] = useState<ExpenseRecord | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState<number | "">("");
  const [editPaidTo, setEditPaidTo] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("CASH");
  const [editNotes, setEditNotes] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Monthly Recurring State
  const [recurringLoading, setRecurringLoading] = useState(false);

  // Form State
  const [formCategory, setFormCategory] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formAmount, setFormAmount] = useState<number | "">("");
  const [formPaymentMethod, setFormPaymentMethod] = useState("CASH");
  const [formPaymentRef, setFormPaymentRef] = useState("");
  const [formPaidTo, setFormPaidTo] = useState("");
  const [formExpenseDate, setFormExpenseDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formExpenseType, setFormExpenseType] = useState("GENERAL");
  const [formDoctorId, setFormDoctorId] = useState("");
  const [formDutyShift, setFormDutyShift] = useState("");
  const [formDepartment, setFormDepartment] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Category Form State
  const [newCatName, setNewCatName] = useState("");
  const [newCatCode, setNewCatCode] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [catLoading, setCatLoading] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [expRes, catRes, docRes, analRes] = await Promise.all([
        getExpensesAction({
          categoryId: selectedCategory,
          doctorId: selectedDoctor,
          status: selectedStatus,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
        getExpenseCategoriesAction(),
        getDoctorsAction(),
        getExpenseAnalyticsAction({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      ]);

      if (expRes.success && expRes.data) {
        setExpenses(expRes.data.expenses);
      }
      if (catRes.success && catRes.data) {
        setCategories(catRes.data.categories);
        if (!formCategory && catRes.data.categories.length > 0) {
          setFormCategory(catRes.data.categories[0].id);
        }
      }
      if (docRes.success && docRes.data) {
        setDoctors(docRes.data.doctors);
      }
      if (analRes.success && analRes.data) {
        setAnalytics(analRes.data.summary);
      }
    } catch {
      setToast({ message: "Network error loading expenses", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCategory, selectedDoctor, selectedStatus, startDate, endDate]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        (e.voucher_number && e.voucher_number.toLowerCase().includes(q)) ||
        e.paid_to.toLowerCase().includes(q) ||
        (e.doctor && e.doctor.full_name.toLowerCase().includes(q)) ||
        (e.category && e.category.name.toLowerCase().includes(q))
      );
    });
  }, [expenses, searchQuery]);

  const dynamicExpenseStats = useMemo(() => {
    const active = expenses.filter((e) => e.status !== "VOIDED" && e.status !== "VOID");
    const total = (analytics?.total_expense_amount && analytics.total_expense_amount > 0)
      ? analytics.total_expense_amount
      : active.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const count = (analytics?.expense_count && analytics.expense_count > 0)
      ? analytics.expense_count
      : active.length;
    const cash = (analytics?.cash_paid_total && analytics.cash_paid_total > 0)
      ? analytics.cash_paid_total
      : active.filter((e) => (e.payment_method || "").toUpperCase() === "CASH").reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const bank = (analytics?.bank_paid_total && analytics.bank_paid_total > 0)
      ? analytics.bank_paid_total
      : active.filter((e) => (e.payment_method || "").toUpperCase() !== "CASH").reduce((sum, e) => sum + Number(e.amount || 0), 0);
    return { total, count, cash, bank };
  }, [expenses, analytics]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCategory) {
      setToast({ message: "Please select an expense category", type: "error" });
      return;
    }
    if (!formTitle.trim()) {
      setToast({ message: "Please enter an expense title", type: "error" });
      return;
    }
    if (!formAmount || Number(formAmount) <= 0) {
      setToast({ message: "Please enter a valid amount", type: "error" });
      return;
    }

    setFormLoading(true);
    try {
      const res = await createExpenseAction({
        categoryId: formCategory,
        title: formTitle,
        amount: Number(formAmount),
        paymentMethod: formPaymentMethod,
        paymentReference: formPaymentRef,
        paidTo: formPaidTo,
        expenseDate: formExpenseDate,
        expenseType: formExpenseType,
        doctorId: formDoctorId || undefined,
        dutyShift: formDutyShift || undefined,
        department: formDepartment || undefined,
        notes: formNotes,
      });

      if (res.success && res.data) {
        setToast({ message: `Voucher ${res.data.voucherNumber} created and posted to GL`, type: "success" });
        setIsCreateModalOpen(false);
        // Reset form
        setFormTitle("");
        setFormAmount("");
        setFormPaymentRef("");
        setFormPaidTo("");
        setFormDoctorId("");
        setFormDutyShift("");
        setFormNotes("");
        loadData();
      } else {
        setToast({ message: res.error || "Failed to create expense", type: "error" });
      }
    } catch {
      setToast({ message: "Network error creating expense", type: "error" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      setToast({ message: "Please enter a category name", type: "error" });
      return;
    }

    setCatLoading(true);
    try {
      const res = await saveExpenseCategoryAction({
        name: newCatName,
        categoryCode: newCatCode || undefined,
        description: newCatDesc || undefined,
      });

      if (res.success && res.data) {
        setToast({ message: `Category "${res.data.category.name}" saved`, type: "success" });
        setIsCategoryModalOpen(false);
        setNewCatName("");
        setNewCatCode("");
        setNewCatDesc("");
        const catRes = await getExpenseCategoriesAction();
        if (catRes.success && catRes.data) {
          setCategories(catRes.data.categories);
        }
      } else {
        setToast({ message: res.error || "Failed to save category", type: "error" });
      }
    } catch {
      setToast({ message: "Error saving category", type: "error" });
    } finally {
      setCatLoading(false);
    }
  };

  const handleVoidExpense = async () => {
    if (!voidModalExpense) return;
    if (!voidReason.trim() || voidReason.trim().length < 4) {
      setToast({ message: "Please provide a valid void reason (min 4 characters)", type: "error" });
      return;
    }

    const unpostedStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED"];
    const requiresFundsConfirmation = !unpostedStatuses.includes(
      String(voidModalExpense.status || "").toUpperCase()
    );
    if (requiresFundsConfirmation && !voidFundsRecoveredConfirmed) {
      setToast({
        message: "This voucher was posted as a cash/bank disbursement. Confirm that the money was not paid or was returned to the hospital before voiding.",
        type: "error",
      });
      return;
    }

    try {
      const res = await voidExpenseAction(voidModalExpense.id, voidReason, voidFundsRecoveredConfirmed);
      if (res.success) {
        setToast({
          message: res.error
            ? `Voucher ${voidModalExpense.voucher_number || voidModalExpense.id} was voided and verified, but follow-up needs attention: ${res.error}`
            : `Voucher ${voidModalExpense.voucher_number || voidModalExpense.id} voided successfully. Its accounting audit trail has been preserved.`,
          type: res.error ? "info" : "success",
        });
        setVoidModalExpense(null);
        setVoidReason("");
        setVoidFundsRecoveredConfirmed(false);
        await loadData();
      } else {
        setToast({ message: res.error || "Failed to void voucher", type: "error" });
      }
    } catch {
      setToast({ message: "Error voiding voucher", type: "error" });
    }
  };

  const handleRunMonthlyRecurring = async () => {
    setRecurringLoading(true);
    try {
      const res = await generateMonthlyRecurringExpensesAction();
      if (res.success && res.data) {
        setToast({
          message: `Monthly Retainers Processed: ${res.data.generatedCount} generated, ${res.data.skippedCount} skipped (already active).`,
          type: "success",
        });
        loadData();
      } else {
        setToast({ message: res.error || "Failed to process monthly retainers", type: "error" });
      }
    } catch {
      setToast({ message: "Network error processing monthly retainers", type: "error" });
    } finally {
      setRecurringLoading(false);
    }
  };

  const openEditModal = (exp: ExpenseRecord) => {
    setEditModalExpense(exp);
    setEditTitle(exp.title || "");
    setEditAmount(exp.amount || 0);
    setEditPaidTo(exp.paid_to || "");
    setEditCategory(exp.category_id || "");
    setEditPaymentMethod(exp.payment_method || "CASH");
    setEditNotes(exp.notes || "");
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalExpense) return;
    if (!editTitle.trim()) {
      setToast({ message: "Please enter an expense title", type: "error" });
      return;
    }
    if (!editAmount || Number(editAmount) <= 0) {
      setToast({ message: "Please enter a valid amount", type: "error" });
      return;
    }

    setEditLoading(true);
    try {
      const res = await updateExpenseAction({
        expenseId: editModalExpense.id,
        title: editTitle.trim(),
        amount: Number(editAmount),
        paidTo: editPaidTo.trim() || undefined,
        categoryId: editCategory || undefined,
        paymentMethod: editPaymentMethod,
        notes: editNotes.trim() || undefined,
      });

      if (res.success) {
        setToast({
          message: `Voucher ${editModalExpense.voucher_number || editModalExpense.id} updated successfully`,
          type: "success",
        });
        setEditModalExpense(null);
        loadData();
      } else {
        setToast({ message: res.error || "Failed to update expense", type: "error" });
      }
    } catch {
      setToast({ message: "Network error updating expense", type: "error" });
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleCategoryActive = async (catId: string, currentActive: boolean) => {
    try {
      const res = await archiveExpenseCategoryAction(catId, !currentActive);
      if (res.success) {
        setToast({
          message: `Category ${!currentActive ? "activated" : "archived"} successfully`,
          type: "success",
        });
        const catRes = await getExpenseCategoriesAction();
        if (catRes.success && catRes.data) {
          setCategories(catRes.data.categories);
        }
      } else {
        setToast({ message: res.error || "Failed to update category status", type: "error" });
      }
    } catch {
      setToast({ message: "Network error updating category status", type: "error" });
    }
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800">
              Finance & Accounts
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-semibold text-slate-600">Disbursement & GL Ledger</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Hospital Expenses & Operational Vouchers
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Doctor per-duty/monthly fees, OT consumables, nursing staff, administrative and utility costs.
          </p>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition flex items-center"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Categories
          </button>
          <button
            onClick={handleRunMonthlyRecurring}
            disabled={recurringLoading}
            className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition flex items-center border border-indigo-200 disabled:opacity-50"
            title="Auto-generate monthly retainer vouchers for active doctors"
          >
            <Calendar className="w-3.5 h-3.5 mr-1" />
            {recurringLoading ? "Generating..." : "Monthly Retainers"}
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition flex items-center shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Expense Voucher
          </button>
        </div>
      </div>

      {/* Executive KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Expenses
            </span>
            <h3 className="text-xl font-black text-slate-900 font-mono mt-1">
              {formatCurrencyBDT(dynamicExpenseStats.total)}
            </h3>
            <span className="text-[10px] text-slate-500">
              {dynamicExpenseStats.count} active vouchers posted
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Doctor Honorarium & Duty
            </span>
            <h3 className="text-xl font-black text-indigo-900 font-mono mt-1">
              {formatCurrencyBDT(analytics?.doctor_expense_total || 0)}
            </h3>
            <span className="text-[10px] text-slate-500">
              Per-duty, service & monthly fees
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Stethoscope className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              OT & Clinical Expenses
            </span>
            <h3 className="text-xl font-black text-teal-900 font-mono mt-1">
              {formatCurrencyBDT(analytics?.ot_expense_total || 0)}
            </h3>
            <span className="text-[10px] text-slate-500">
              Medicines, gases & consumables
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Cash vs Bank Outflow
            </span>
            <div className="text-xs font-mono font-bold text-slate-800 mt-1 space-y-0.5">
              <div>Cash: <span className="text-emerald-700">{formatCurrencyBDT(dynamicExpenseStats.cash)}</span></div>
              <div>Bank: <span className="text-sky-700">{formatCurrencyBDT(dynamicExpenseStats.bank)}</span></div>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Wallet className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3 print:hidden">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by Voucher #, Payee, Title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
          />
        </div>

        <select
          aria-label="Voucher status"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:ring-2 focus:ring-rose-500"
        >
          <option value="ACTIVE">Active vouchers</option>
          <option value="VOIDED">Voided history</option>
          <option value="ALL">All vouchers</option>
        </select>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:ring-2 focus:ring-rose-500"
        >
          <option value="ALL">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={selectedDoctor}
          onChange={(e) => setSelectedDoctor(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:ring-2 focus:ring-rose-500"
        >
          <option value="ALL">All Doctors</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name} ({d.designation})
            </option>
          ))}
        </select>

        <div className="flex items-center space-x-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-slate-200 rounded-xl px-2 py-1 text-xs"
            title="Start Date"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-slate-200 rounded-xl px-2 py-1 text-xs"
            title="End Date"
          />
        </div>

        <button
          onClick={loadData}
          className="p-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition"
          title="Refresh Data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-900">
            Hospital Expense Vouchers ({filteredExpenses.length})
          </h2>
          <span className="text-[11px] text-slate-500">
            Real-time multi-tenant double-entry GL ledger integration
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-rose-600" />
            Loading hospital expenses...
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No expense vouchers found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Voucher #</th>
                  <th className="py-2.5 px-3">Expense Title / Description</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Doctor / Dept</th>
                  <th className="py-2.5 px-3">Paid To</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3 text-right">Amount (BDT)</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {formatDateBDT(exp.expense_date)}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      {exp.voucher_number || "—"}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      <div>{exp.title}</div>
                      {exp.notes && (
                        <div className="text-[10px] text-slate-400 truncate max-w-xs">{exp.notes}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-[10px] font-semibold">
                        {exp.category?.name || "General"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {exp.doctor ? (
                        <div className="flex items-center space-x-1">
                          <Stethoscope className="w-3 h-3 text-indigo-600" />
                          <span className="font-medium text-indigo-950">{exp.doctor.full_name}</span>
                        </div>
                      ) : exp.department ? (
                        <span className="text-slate-500">{exp.department}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800 font-medium">
                      {exp.paid_to}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      <span className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50">
                        {exp.payment_method}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatCurrencyBDT(exp.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          exp.status === "VOID" || exp.status === "VOIDED"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {exp.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => setPrintVoucher(exp)}
                        className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 transition"
                        title="Print Expense Voucher"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      {exp.status !== "VOID" && exp.status !== "VOIDED" && (
                        <>
                          <button
                            onClick={() => openEditModal(exp)}
                            className="p-1.5 border border-amber-200 rounded-lg hover:bg-amber-50 text-amber-700 transition"
                            title="Edit Expense Voucher"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setVoidModalExpense(exp)}
                            className="p-1.5 border border-rose-200 rounded-lg hover:bg-rose-50 text-rose-600 transition"
                            title="Void Voucher"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE NEW EXPENSE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-black text-slate-900">New Hospital Expense Voucher</h3>
                <p className="text-xs text-slate-500">Atomic journal entry & voucher generation</p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expense Category *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="">Select Category...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expense Date *</label>
                  <input
                    type="date"
                    value={formExpenseDate}
                    onChange={(e) => setFormExpenseDate(e.target.value)}
                    required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  >
                  </input>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Expense Title / Description *</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Aminul Islam - Night Shift Duty Fee"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (BDT) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Paid To / Payee Name</label>
                  <input
                    type="text"
                    placeholder="Recipient name or vendor"
                    value={formPaidTo}
                    onChange={(e) => setFormPaidTo(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Doctor Linking (Optional) */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                <span className="font-bold text-slate-700 block text-[11px]">Doctor / Duty Assignment (If Applicable)</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-0.5 text-[11px]">Attending Doctor</label>
                    <select
                      value={formDoctorId}
                      onChange={(e) => setFormDoctorId(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white"
                    >
                      <option value="">None / Not Doctor Expense</option>
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.full_name} ({d.designation})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 mb-0.5 text-[11px]">Duty Shift</label>
                    <select
                      value={formDutyShift}
                      onChange={(e) => setFormDutyShift(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs bg-white"
                    >
                      <option value="">N/A</option>
                      <option value="MORNING">Morning Shift</option>
                      <option value="EVENING">Evening Shift</option>
                      <option value="NIGHT">Night Shift</option>
                      <option value="ON_CALL">On-Call Emergency</option>
                      <option value="MONTHLY_RETAINER">Monthly Retainer</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Payment Method Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Disbursement Mode</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="CASH">Cash in Hand</option>
                    <option value="BANK">Bank Transfer / Cheque</option>
                    <option value="BKASH">bKash Merchant/Disbursement</option>
                    <option value="NAGAD">Nagad</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cheque / Trx / Ref #</label>
                  <input
                    type="text"
                    placeholder="Optional reference"
                    value={formPaymentRef}
                    onChange={(e) => setFormPaymentRef(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expense Nature</label>
                  <select
                    value={formExpenseType}
                    onChange={(e) => setFormExpenseType(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="GENERAL">General Operational Expense</option>
                    <option value="DOCTOR_HONORARIUM">Doctor Honorarium / Visit Fee</option>
                    <option value="OT_SHARE">OT Surgical / Anaesthetist Share</option>
                    <option value="DUTY_FEE">Per-Duty / Shift Allowance</option>
                    <option value="MONTHLY_RETAINER">Monthly Retainer</option>
                    <option value="UTILITY">Utility / Facility Bill</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Department</label>
                  <select
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="">-- All / Hospital Administration --</option>
                    <option value="OPD">OPD</option>
                    <option value="IPD">IPD</option>
                    <option value="OT">Operation Theatre (OT)</option>
                    <option value="ICU">ICU / Critical Care</option>
                    <option value="DIAGNOSTICS">Pathology & Imaging</option>
                    <option value="PHARMACY">Hospital Pharmacy</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Internal Notes / Narration</label>
                <textarea
                  rows={2}
                  placeholder="Additional notes for auditing and ledger reconciliation..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition flex items-center shadow-xs disabled:opacity-50"
                >
                  {formLoading ? "Recording..." : "Post & Generate Voucher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE NEW CATEGORY & ARCHIVE MODAL */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="text-base font-black text-slate-900">Manage Expense Categories</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Existing Categories List */}
            <div className="mt-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Active & Archived Categories
              </h4>
              <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                {categories.map((c) => (
                  <div key={c.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50 transition">
                    <div>
                      <div className="font-bold text-slate-800 flex items-center space-x-1.5">
                        <span>{c.name}</span>
                        {c.category_code && (
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1 py-0.2 rounded">
                            {c.category_code}
                          </span>
                        )}
                      </div>
                      {c.description && <p className="text-[11px] text-slate-500 mt-0.5">{c.description}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleCategoryActive(c.id, c.is_active)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center ${
                        c.is_active
                          ? "bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200"
                          : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                      }`}
                      title={c.is_active ? "Archive Category" : "Activate Category"}
                    >
                      {c.is_active ? (
                        <>
                          <Archive className="w-3 h-3 mr-1" />
                          Archive
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3 mr-1" />
                          Activate
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* New Category Form */}
            <form onSubmit={handleCreateCategory} className="mt-5 pt-4 border-t border-slate-200 space-y-3 text-xs">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Add New Category</h4>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Category Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Doctor Night Duty Fees"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Category Code (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. EXP_DOC_NIGHT"
                  value={newCatCode}
                  onChange={(e) => setNewCatCode(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500 uppercase"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Category explanation and GL matching"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={catLoading}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition disabled:opacity-50"
                >
                  {catLoading ? "Saving..." : "Save Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT EXPENSE MODAL */}
      {editModalExpense && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-black text-slate-900">Edit Expense Voucher</h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Voucher: {editModalExpense.voucher_number || editModalExpense.id}
                </p>
              </div>
              <button
                onClick={() => setEditModalExpense(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateExpense} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Expense Title *</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (BDT) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="CASH">Cash Drawer</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="MFS_BKASH">bKash Corporate</option>
                    <option value="MFS_NAGAD">Nagad Corporate</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Paid To / Payee</label>
                  <input
                    type="text"
                    value={editPaidTo}
                    onChange={(e) => setEditPaidTo(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Justification</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditModalExpense(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition flex items-center shadow-xs disabled:opacity-50"
                >
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID VOUCHER MODAL */}
      {voidModalExpense && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center space-x-3 text-rose-600 mb-3">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="text-base font-black text-slate-900">Void Expense Voucher</h3>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Are you sure you want to void voucher{" "}
              <strong className="font-mono text-slate-900">{voidModalExpense.voucher_number}</strong> for{" "}
              <strong>{formatCurrencyBDT(voidModalExpense.amount)}</strong>?
            </p>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Voiding *</label>
              <textarea
                rows={2}
                placeholder="Reason (min 4 characters)..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-rose-500"
              />
            </div>
            {!["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(
              String(voidModalExpense.status || "").toUpperCase()
            ) && (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                <p className="font-bold mb-2">Financial confirmation required</p>
                <p className="mb-3">
                  This voucher is posted as a cash/bank disbursement. Voiding it reverses that ledger entry, so continue only if
                  the money was never paid or has actually been returned to the hospital.
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={voidFundsRecoveredConfirmed}
                    onChange={(event) => setVoidFundsRecoveredConfirmed(event.target.checked)}
                    className="mt-0.5 accent-rose-600"
                  />
                  <span>
                    I confirm that the amount was not disbursed or was returned to the hospital, and the reason above is accurate.
                  </span>
                </label>
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setVoidModalExpense(null);
                  setVoidReason("");
                  setVoidFundsRecoveredConfirmed(false);
                }}
                className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidExpense}
                disabled={
                  !voidReason.trim() ||
                  voidReason.trim().length < 4 ||
                  (
                    !["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(
                      String(voidModalExpense.status || "").toUpperCase()
                    ) &&
                    !voidFundsRecoveredConfirmed
                  )
                }
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE EXPENSE VOUCHER SLIP MODAL */}
      {printVoucher && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200 print:hidden">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Official Expense Voucher
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition flex items-center"
                >
                  <Printer className="w-3.5 h-3.5 mr-1" />
                  Print
                </button>
                <button
                  onClick={() => setPrintVoucher(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Area */}
            <div className="pt-4 space-y-4 text-xs font-sans">
              <HospitalPrintHeader
                documentTitle="PAYMENT DISBURSEMENT VOUCHER"
                documentNumber={printVoucher.voucher_number}
                dateStr={formatDateBDT(printVoucher.expense_date)}
              />

              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500">Paid To: </span>
                  <strong className="text-slate-900 uppercase">{printVoucher.paid_to}</strong>
                </div>
                <div className="text-right">
                  <span className="text-slate-500">Disbursement Mode: </span>
                  <strong className="font-mono text-slate-900">{printVoucher.payment_method}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Category: </span>
                  <span className="font-semibold text-slate-800">{printVoucher.category?.name || "General"}</span>
                </div>
                <div className="text-right">
                  {printVoucher.payment_reference && (
                    <div>
                      <span className="text-slate-500">Ref #: </span>
                      <span className="font-mono text-slate-800">{printVoucher.payment_reference}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">Description / Particulars:</span>
                  <span className="font-bold text-slate-900">{printVoucher.title}</span>
                </div>
                {printVoucher.doctor && (
                  <div className="flex justify-between items-center text-indigo-900">
                    <span className="text-slate-600">Doctor / Consultant:</span>
                    <span className="font-semibold">{printVoucher.doctor.full_name} ({printVoucher.doctor.designation})</span>
                  </div>
                )}
                {printVoucher.duty_shift && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Duty Shift:</span>
                    <span className="font-mono">{printVoucher.duty_shift}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-sm font-black text-slate-900">
                  <span>Net Disbursed Amount:</span>
                  <span className="font-mono text-rose-700">{formatCurrencyBDT(printVoucher.amount)}</span>
                </div>
              </div>

              {printVoucher.notes && (
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] text-slate-600">
                  <strong>Notes:</strong> {printVoucher.notes}
                </div>
              )}

              {/* Signature Lines */}
              <div className="grid grid-cols-3 gap-4 pt-12 text-center text-[10px]">
                <div className="border-t border-dashed border-slate-400 pt-1">
                  Prepared By
                </div>
                <div className="border-t border-dashed border-slate-400 pt-1 font-bold">
                  Accounts / Cashier
                </div>
                <div className="border-t border-dashed border-slate-400 pt-1 font-bold">
                  Recipient Signature
                </div>
              </div>

              <HospitalPrintFooter />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading...</div>}>
      <ExpensesManagementContent />
    </Suspense>
  );
}
