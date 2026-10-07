"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Trash2,
  Printer,
  Ban,
  Search,
  Loader2,
  RefreshCw,
  Wallet,
  X,
  AlertTriangle,
  UserCheck,
  Check,
} from "lucide-react";
import {
  InvoiceRecord,
  InvoiceItemRecord,
  PaymentRecord,
  CashRegisterSummary,
} from "@/types/billing";
import {
  getInvoicesAction,
  createInvoiceAction,
  collectPaymentAction,
  voidInvoiceAction,
  getCashRegisterSummaryAction,
} from "@/lib/billing/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import {
  getPatientReferralAttributionAction,
  searchReferralAgentsForBillingAction,
} from "@/lib/referrals/actions";
import { PatientMaster } from "@/types/clinical";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";
import { Toast } from "@/components/ui/Toast";
import { EpisodeBillingPanel } from "@/components/patient/EpisodeBillingPanel";
import {
  getAllHospitalServices,
  MASTER_HOSPITAL_SERVICES,
  HospitalServiceItem,
} from "@/lib/billing/serviceCatalog";
import { getDiagnosticTestsCatalogAction } from "@/lib/lab/actions";

export default function BillingManagementPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [registerSummary, setRegisterSummary] = useState<CashRegisterSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Void Modal State
  const [voidModalInv, setVoidModalInv] = useState<InvoiceRecord | null>(null);
  const [voidReasonInput, setVoidReasonInput] = useState("");
  const [voidLoading, setVoidLoading] = useState(false);

  // New Invoice Modal
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [patientIdInput, setPatientIdInput] = useState("");
  const [items, setItems] = useState<Array<{
    category: InvoiceItemRecord["service_category"];
    itemName: string;
    unitPrice: number;
    quantity: number;
  }>>([
    {
      category: "CONSULTATION",
      itemName: "General OPD Consultation",
      unitPrice: 500,
      quantity: 1,
    },
  ]);
  const [discountPercent, setDiscountPercent] = useState<number | "">("");
  const [discountReason, setDiscountReason] = useState("");
  const [initialPaymentAmount, setInitialPaymentAmount] = useState(500);
  const [paymentMethod, setPaymentMethod] = useState<PaymentRecord["payment_method"]>("CASH");
  const [formLoading, setFormLoading] = useState(false);

  // Quick Service Adder & Dynamic Tests State
  const [allServices, setAllServices] = useState<HospitalServiceItem[]>(MASTER_HOSPITAL_SERVICES);
  const [serviceFilterGroup, setServiceFilterGroup] = useState<string>("ALL");
  const [serviceSearchTerm, setServiceSearchTerm] = useState<string>("");

  // New Invoice Patient Search & Referral State
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [searchedPatients, setSearchedPatients] = useState<PatientMaster[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);
  const [billingReferralAgents, setBillingReferralAgents] = useState<
    Array<{
      id: string;
      agent_code: string;
      full_name: string;
      agent_type: string;
      phone: string;
      commission_rate_percent: number;
      is_commission_eligible: boolean;
    }>
  >([]);
  const [selectedReferralAgentId, setSelectedReferralAgentId] = useState("");
  const [referralCommissionRate, setReferralCommissionRate] = useState<number>(10);
  const [isAttributionSuggested, setIsAttributionSuggested] = useState(false);
  const [attributionSource, setAttributionSource] = useState<string>("");
  const [attributionAgentName, setAttributionAgentName] = useState<string>("");
  const [attributionAgentCode, setAttributionAgentCode] = useState<string>("");
  const [checkingAttribution, setCheckingAttribution] = useState(false);
  const [noReferral, setNoReferral] = useState(false);

  // Collect Payment Modal
  const [paymentModalInv, setPaymentModalInv] = useState<InvoiceRecord | null>(null);
  const [collectAmount, setCollectAmount] = useState(0);
  const [collectMethod, setCollectMethod] = useState<PaymentRecord["payment_method"]>("CASH");
  const [collectNotes, setCollectNotes] = useState("");
  const [collectLoading, setCollectLoading] = useState(false);

  const loadBillingData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [invRes, regRes] = await Promise.all([
        getInvoicesAction({ status: statusFilter }),
        getCashRegisterSummaryAction(),
      ]);

      if (invRes.success && invRes.data) {
        setInvoices(invRes.data.invoices);
        if (invRes.data.invoices.length > 0 && !selectedInvoice) {
          setSelectedInvoice(invRes.data.invoices[0]);
        }
      } else {
        setErrorMsg(invRes.error || "Failed to load invoices");
      }

      if (regRes.success && regRes.data) {
        setRegisterSummary(regRes.data.summary);
      }
    } catch (err: unknown) {
      console.error("[loadBillingData] error:", err);
      setErrorMsg("Network error loading billing ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [invRes, regRes] = await Promise.all([
          getInvoicesAction({ status: statusFilter === "ALL" ? undefined : statusFilter }),
          getCashRegisterSummaryAction(),
        ]);

        if (isMounted) {
          if (invRes.success && invRes.data) {
            setInvoices(invRes.data.invoices);
          } else {
            setErrorMsg(invRes.error || "Failed to load invoices");
          }

          if (regRes.success && regRes.data) {
            setRegisterSummary(regRes.data.summary);
          }
        }
      } catch (err: unknown) {
        console.error("[init billing] error:", err);
        if (isMounted) setErrorMsg("Network error loading billing ledger");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [statusFilter]);

  // Fetch referral agents and lab tests catalog when invoice modal opens
  useEffect(() => {
    let active = true;
    if (isCreatingNew) {
      async function loadAgentsAndCatalog() {
        try {
          const [agentRes, diagRes] = await Promise.allSettled([
            searchReferralAgentsForBillingAction(),
            getDiagnosticTestsCatalogAction(),
          ]);
          if (active && agentRes.status === "fulfilled" && agentRes.value.success && agentRes.value.data) {
            setBillingReferralAgents(agentRes.value.data);
          }
          if (active && diagRes.status === "fulfilled" && diagRes.value.success && diagRes.value.data?.tests) {
            setAllServices(getAllHospitalServices(diagRes.value.data.tests));
          }
        } catch (err) {
          console.error("Failed loading billing catalog/agents:", err);
        }
      }
      loadAgentsAndCatalog();
    }
    return () => {
      active = false;
    };
  }, [isCreatingNew]);

  // Debounced search for patients in invoice modal
  useEffect(() => {
    let active = true;
    if (!isCreatingNew || !patientSearchQuery.trim()) {
      setSearchedPatients([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoadingPatients(true);
      const res = await searchPatientsAction({ query: patientSearchQuery.trim(), pageSize: 8 });
      if (active && res.success && res.data?.patients) {
        setSearchedPatients(res.data.patients);
      }
      if (active) setLoadingPatients(false);
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [patientSearchQuery, isCreatingNew]);

  // Check referral attribution whenever patient ID changes
  const checkAttributionForPatient = async (patientId: string) => {
    if (!patientId || !patientId.trim()) {
      setIsAttributionSuggested(false);
      setSelectedReferralAgentId("");
      setAttributionSource("");
      setAttributionAgentName("");
      setAttributionAgentCode("");
      return;
    }
    setCheckingAttribution(true);
    try {
      const res = await getPatientReferralAttributionAction(patientId.trim());
      if (res.success && res.data) {
        setSelectedReferralAgentId(res.data.referralAgentId);
        setReferralCommissionRate(res.data.commissionRatePercent || 10);
        setIsAttributionSuggested(true);
        setAttributionSource(res.data.source);
        setAttributionAgentName(res.data.fullName);
        setAttributionAgentCode(res.data.agentCode);
        setNoReferral(false);
      } else {
        setIsAttributionSuggested(false);
        setAttributionSource("");
        setAttributionAgentName("");
        setAttributionAgentCode("");
      }
    } catch (err) {
      console.error("[checkAttributionForPatient] err:", err);
    } finally {
      setCheckingAttribution(false);
    }
  };

  const handleSelectPatient = (p: PatientMaster) => {
    setSelectedPatient(p);
    setPatientIdInput(p.id);
    setPatientSearchQuery("");
    setSearchedPatients([]);
    checkAttributionForPatient(p.id);
  };

  const handleReferralAgentChange = (agentId: string) => {
    if (!agentId) {
      setSelectedReferralAgentId("");
      setNoReferral(true);
      setIsAttributionSuggested(false);
      return;
    }
    setSelectedReferralAgentId(agentId);
    setNoReferral(false);
    const found = billingReferralAgents.find((a) => a.id === agentId);
    if (found) {
      setReferralCommissionRate(found.commission_rate_percent || 10);
    }
  };

  // Calculations for new invoice
  const subtotal = items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
  const calculatedDiscountAmount = discountPercent !== "" && Number(discountPercent) > 0
    ? Math.round((subtotal * Number(discountPercent)) / 100)
    : 0;
  const netTotal = Math.max(0, subtotal - calculatedDiscountAmount);
  const dueAmount = Math.max(0, netTotal - initialPaymentAmount);
  const estimatedCommission = selectedReferralAgentId && !noReferral
    ? Math.round(((netTotal * (referralCommissionRate || 0)) / 100) * 100) / 100
    : 0;

  const addItemRow = (category: InvoiceItemRecord["service_category"], name: string, price: number) => {
    const existingIndex = items.findIndex((it) => it.itemName.toLowerCase() === name.toLowerCase());
    let next: typeof items;
    if (existingIndex >= 0) {
      next = [...items];
      next[existingIndex] = {
        ...next[existingIndex],
        quantity: next[existingIndex].quantity + 1,
      };
    } else {
      next = [...items, { category, itemName: name, unitPrice: price, quantity: 1 }];
    }
    setItems(next);
    const newSub = next.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
    const newDisc = discountPercent !== "" && Number(discountPercent) > 0
      ? Math.round((newSub * Number(discountPercent)) / 100)
      : 0;
    setInitialPaymentAmount(Math.max(0, newSub - newDisc));
  };

  const removeItemRow = (idx: number) => {
    if (items.length <= 1) return;
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    const newSub = next.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
    const newDisc = discountPercent !== "" && Number(discountPercent) > 0
      ? Math.round((newSub * Number(discountPercent)) / 100)
      : 0;
    setInitialPaymentAmount(Math.max(0, newSub - newDisc));
  };

  const filteredServices = useMemo(() => {
    return allServices.filter((s) => {
      const matchesGroup = serviceFilterGroup === "ALL" || s.group === serviceFilterGroup;
      const term = serviceSearchTerm.trim().toLowerCase();
      if (!term) return matchesGroup;
      return (
        s.name.toLowerCase().includes(term) ||
        s.category.toLowerCase().includes(term) ||
        (s.description ? s.description.toLowerCase().includes(term) : false)
      );
    });
  }, [allServices, serviceFilterGroup, serviceSearchTerm]);

  const resetInvoiceModal = () => {
    setIsCreatingNew(false);
    setPatientIdInput("");
    setPatientSearchQuery("");
    setSearchedPatients([]);
    setSelectedPatient(null);
    setSelectedReferralAgentId("");
    setReferralCommissionRate(10);
    setIsAttributionSuggested(false);
    setAttributionSource("");
    setAttributionAgentName("");
    setAttributionAgentCode("");
    setNoReferral(false);
    setServiceFilterGroup("ALL");
    setServiceSearchTerm("");
    setItems([
      {
        category: "CONSULTATION",
        itemName: "General OPD Consultation",
        unitPrice: 500,
        quantity: 1,
      },
    ]);
    setDiscountPercent("");
    setDiscountReason("");
    setInitialPaymentAmount(500);
    setPaymentMethod("CASH");
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientIdInput.trim()) {
      setToast({ message: "Please enter a valid Patient ID or Code.", type: "error" });
      return;
    }

    if (discountPercent !== "" && Number(discountPercent) > 0) {
      const p = Number(discountPercent);
      if (p < 5 || p > 60) {
        setToast({
          message: "ডিসকাউন্ট ৫% থেকে ৬০% এর মধ্যে হতে হবে (বা ০% কোন ছাড় না থাকলে)।",
          type: "error",
        });
        return;
      }
    }

    setFormLoading(true);
    try {
      const res = await createInvoiceAction({
        patientId: patientIdInput.trim(),
        items,
        discountAmount: calculatedDiscountAmount,
        discountReason: discountPercent !== "" && Number(discountPercent) > 0
          ? `[Discount: ${discountPercent}%] ${discountReason.trim()}`.trim()
          : discountReason.trim() || undefined,
        initialPaymentAmount: Number(initialPaymentAmount),
        paymentMethod,
        referralAgentId: !noReferral && selectedReferralAgentId ? selectedReferralAgentId : undefined,
        referralCommissionRate: !noReferral && selectedReferralAgentId ? Number(referralCommissionRate) : undefined,
        noReferral: noReferral || !selectedReferralAgentId,
      });

      if (res.success && res.data) {
        resetInvoiceModal();
        await loadBillingData();
        setSelectedInvoice(res.data.invoice);
        setToast({ message: `Invoice ${res.data.invoice.invoice_number} created successfully!`, type: "success" });
        // Automatically trigger print dialog for official invoice paper
        setTimeout(() => {
          window.print();
        }, 350);
      } else {
        setToast({ message: res.error || "Failed to generate invoice", type: "error" });
      }
    } catch (err: unknown) {
      console.error("[handleCreateInvoice] error:", err);
      setToast({ message: "Error generating invoice", type: "error" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInv) return;

    setCollectLoading(true);
    try {
      const res = await collectPaymentAction({
        invoiceId: paymentModalInv.id,
        amount: Number(collectAmount),
        paymentMethod: collectMethod,
        notes: collectNotes.trim() || undefined,
      });

      if (res.success) {
        setPaymentModalInv(null);
        await loadBillingData();
        setToast({ message: "Payment collected and recorded in cash register.", type: "success" });
      } else {
        setToast({ message: res.error || "Failed to collect payment", type: "error" });
      }
    } catch (err: unknown) {
      console.error("[handleCollectPayment] error:", err);
      setToast({ message: "Error processing payment", type: "error" });
    } finally {
      setCollectLoading(false);
    }
  };

  const handleVoidInvoice = (invoice: InvoiceRecord) => {
    setVoidModalInv(invoice);
    setVoidReasonInput("");
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalInv) return;
    if (voidReasonInput.trim().length < 5) {
      setToast({ message: "Mandatory justification must be at least 5 characters.", type: "error" });
      return;
    }

    setVoidLoading(true);
    try {
      const res = await voidInvoiceAction({ invoiceId: voidModalInv.id, reason: voidReasonInput.trim() });
      if (res.success) {
        const invNum = voidModalInv.invoice_number;
        setVoidModalInv(null);
        setVoidReasonInput("");
        await loadBillingData();
        setToast({ message: `Invoice ${invNum} voided and recorded in audit vault.`, type: "success" });
      } else {
        setToast({ message: res.error || "Failed to void invoice", type: "error" });
      }
    } catch (err: unknown) {
      console.error("[handleConfirmVoid] error:", err);
      setToast({ message: "Error voiding invoice", type: "error" });
    } finally {
      setVoidLoading(false);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const q = searchQuery.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.patient?.full_name && inv.patient.full_name.toLowerCase().includes(q)) ||
      (inv.patient?.patient_code && inv.patient.patient_code.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Revenue Cycle & Cash Counter
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Billing & Invoicing Engine
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Non-destructive ledger, multi-service invoices, partial payment tracking, and digital cashier receipts.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadBillingData}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh billing data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <EpisodeBillingPanel />
          <button
            onClick={() => setIsCreatingNew(true)}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Generate New Invoice
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold print:hidden">
          {errorMsg}
        </div>
      )}

      {/* CASH COUNTER SUMMARY STRIP */}
      {registerSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Today&apos;s Invoiced</span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {formatCurrencyBDT(registerSummary.todayTotalInvoiced)}
            </div>
            <span className="text-[10px] text-slate-400">{registerSummary.activeInvoiceCount} Active Bills</span>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 shadow-2xs">
            <span className="text-[11px] font-bold text-emerald-800 uppercase">Cash Collected</span>
            <div className="text-2xl font-black text-emerald-700 mt-1">
              {formatCurrencyBDT(registerSummary.todayCashCollected)}
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">Physical cash register</span>
          </div>

          <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 shadow-2xs">
            <span className="text-[11px] font-bold text-sky-800 uppercase">MFS (bKash/Nagad)</span>
            <div className="text-2xl font-black text-sky-700 mt-1">
              {formatCurrencyBDT(registerSummary.todayMfsCollected)}
            </div>
            <span className="text-[10px] text-sky-700 font-medium">Digital gateway receipts</span>
          </div>

          <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 shadow-2xs">
            <span className="text-[11px] font-bold text-indigo-800 uppercase">Total Collected</span>
            <div className="text-2xl font-black text-indigo-700 mt-1">
              {formatCurrencyBDT(registerSummary.todayTotalCollected)}
            </div>
            <span className="text-[10px] text-indigo-700 font-medium">Settled today</span>
          </div>
        </div>
      )}

      {/* FILTER & SEARCH */}
      <div className="flex flex-col sm:flex-row justify-between gap-3 items-center print:hidden">
        <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
          {["ALL", "UNPAID", "PARTIAL", "PAID", "VOID"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === status ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search invoice number, patient..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-sky-500/20"
          />
        </div>
      </div>

      {/* MAIN LAYOUT: INVOICES LIST & DETAILS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print:block print:w-full">
        {/* LEFT COLUMN: INVOICE TABLE */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs print:hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Due</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-500">
                      Loading invoices...
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-500">
                      No invoices found.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className={`cursor-pointer transition hover:bg-slate-50/80 ${
                        selectedInvoice?.id === inv.id ? "bg-sky-50/50 font-semibold" : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{inv.patient?.full_name || "Patient"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{inv.patient?.patient_code}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrencyBDT(inv.grand_total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-600 font-bold">
                        {formatCurrencyBDT(inv.paid_amount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-rose-600 font-bold">
                        {formatCurrencyBDT(inv.due_amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.status === "PAID"
                              ? "bg-emerald-100 text-emerald-800"
                              : inv.status === "PARTIAL"
                              ? "bg-amber-100 text-amber-800"
                              : inv.status === "VOID"
                              ? "bg-slate-200 text-slate-700 line-through"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: INVOICE PREVIEW / PRINT SLIP */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 print:col-span-12 print:border-none print:p-0 print:shadow-none print:w-full print:block">
          {selectedInvoice ? (
            <div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-200 print:hidden">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Official Invoice</span>
                  <h3 className="text-base font-black text-slate-900 font-mono">{selectedInvoice.invoice_number}</h3>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => window.print()}
                    className="p-2 border rounded-xl hover:bg-slate-50 text-slate-700 transition"
                    title="Print Invoice"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  {selectedInvoice.due_amount > 0 && !selectedInvoice.is_voided && (
                    <button
                      onClick={() => {
                        setPaymentModalInv(selectedInvoice);
                        setCollectAmount(selectedInvoice.due_amount);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center shadow-2xs"
                    >
                      <Wallet className="w-3.5 h-3.5 mr-1" />
                      Collect Due
                    </button>
                  )}
                  {!selectedInvoice.is_voided && (
                    <button
                      onClick={() => handleVoidInvoice(selectedInvoice)}
                      className="p-2 border border-rose-200 rounded-xl hover:bg-rose-50 text-rose-600 transition"
                      title="Void Invoice"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* PRINTABLE SLIP CONTAINER */}
              <div className="pt-4 space-y-3 text-xs">
                <HospitalPrintHeader documentTitle="BILLING INVOICE & CASH RECEIPT" />

                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-500 font-medium">Patient:</span>
                    <p className="font-bold text-slate-900">{selectedInvoice.patient?.full_name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      ID: {selectedInvoice.patient?.patient_code} • Ph: {selectedInvoice.patient?.phone}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 font-medium">Issue Date:</span>
                    <p className="font-mono text-slate-900">{formatDateBDT(selectedInvoice.created_at)}</p>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 ${
                        selectedInvoice.status === "PAID"
                          ? "bg-emerald-100 text-emerald-800"
                          : selectedInvoice.status === "PARTIAL"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {selectedInvoice.status}
                    </span>
                  </div>
                </div>

                {/* LINE ITEMS */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Service Line Items</span>
                  <table className="w-full text-left text-xs border border-slate-100 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[9px]">
                      <tr>
                        <th className="py-1.5 px-2">Item</th>
                        <th className="py-1.5 px-2 text-center">Qty</th>
                        <th className="py-1.5 px-2 text-right">Price</th>
                        <th className="py-1.5 px-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedInvoice.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 px-2 font-medium">{it.item_name}</td>
                          <td className="py-1.5 px-2 text-center font-mono">{it.quantity}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{formatCurrencyBDT(it.unit_price)}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold">
                            {formatCurrencyBDT(it.total_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* TOTAL SUMMARY */}
                <div className="p-3 bg-slate-50 rounded-xl space-y-1 font-mono text-xs border border-slate-100">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span>{formatCurrencyBDT(selectedInvoice.subtotal)}</span>
                  </div>
                  {selectedInvoice.discount_amount > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>Discount:</span>
                      <span>-{formatCurrencyBDT(selectedInvoice.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-1">
                    <span>Grand Total:</span>
                    <span>{formatCurrencyBDT(selectedInvoice.grand_total)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Paid Amount:</span>
                    <span>{formatCurrencyBDT(selectedInvoice.paid_amount)}</span>
                  </div>
                  <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1">
                    <span>Remaining Due:</span>
                    <span>{formatCurrencyBDT(selectedInvoice.due_amount)}</span>
                  </div>
                </div>

                {/* PAYMENTS HISTORY */}
                {selectedInvoice.payments.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Payment Receipts</span>
                    {selectedInvoice.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex justify-between items-center p-2 rounded-lg bg-emerald-50/50 border border-emerald-100 text-[11px]"
                      >
                        <span className="font-mono text-emerald-950 font-bold">
                          {p.receipt_number} ({p.payment_method})
                        </span>
                        <span className="font-mono font-black text-emerald-700">{formatCurrencyBDT(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <HospitalPrintFooter />
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs">
              Select an invoice from the ledger to view detailed receipts.
            </div>
          )}
        </div>
      </div>

      {/* GENERATE INVOICE MODAL */}
      {isCreatingNew && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 text-xs max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-black text-slate-900 mb-1">Generate Patient Invoice</h3>
            <p className="text-slate-500 mb-4">Add consultation, diagnostic, bed, or surgery charges.</p>

            <form onSubmit={handleCreateInvoice} className="space-y-4">
              {/* Patient Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>রোগী নির্বাচন (Select Patient) *</span>
                  {selectedPatient && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatient(null);
                        setPatientIdInput("");
                        checkAttributionForPatient("");
                      }}
                      className="text-[10px] text-rose-500 hover:underline font-semibold"
                    >
                      পরিবর্তন করুন (Change)
                    </button>
                  )}
                </label>

                {selectedPatient ? (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-emerald-950">{selectedPatient.full_name}</p>
                      <p className="text-[10px] text-emerald-700 font-mono">
                        {selectedPatient.patient_code} • {selectedPatient.gender} • {selectedPatient.phone}
                      </p>
                    </div>
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="রোগীর নাম বা মোবাইল বা OH-ID দিয়ে খুঁজুন..."
                        value={patientSearchQuery}
                        onChange={(e) => setPatientSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border rounded-xl bg-slate-50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    {/* Patient search results dropdown */}
                    {loadingPatients ? (
                      <div className="p-3 text-center text-xs text-slate-400 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-1.5 shadow-lg">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        <span>রোগী খোঁজা হচ্ছে...</span>
                      </div>
                    ) : searchedPatients.length > 0 ? (
                      <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-lg">
                        {searchedPatients.map((pat) => (
                          <div
                            key={pat.id}
                            onClick={() => handleSelectPatient(pat)}
                            className="p-2.5 hover:bg-emerald-50 cursor-pointer flex items-center justify-between transition text-xs"
                          >
                            <div>
                              <p className="font-bold text-slate-800">{pat.full_name}</p>
                              <p className="text-[10px] text-slate-500 font-mono">
                                {pat.patient_code} • {pat.phone}
                              </p>
                            </div>
                            <span className="text-[10px] text-emerald-600 font-semibold">নির্বাচন করুন</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <input
                      type="text"
                      required
                      placeholder="বা সরাসরি Patient UUID বসান"
                      value={patientIdInput}
                      onChange={(e) => {
                        setPatientIdInput(e.target.value);
                        if (e.target.value.length >= 30) {
                          checkAttributionForPatient(e.target.value);
                        }
                      }}
                      onBlur={() => {
                        if (patientIdInput.trim()) {
                          checkAttributionForPatient(patientIdInput.trim());
                        }
                      }}
                      className="w-full px-3 py-1.5 border rounded-xl bg-slate-50 text-[11px] font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Preset quick buttons & Comprehensive Hospital Service Catalog */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-extrabold text-slate-800 uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      হাসপাতাল সেবা ও প্যাথলজি টেস্ট ক্যাটালগ (Hospital Service & Diagnostic Catalog)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      যেকোনো টেস্ট বা সার্ভিসে ক্লিক করলেই স্বয়ংক্রিয়ভাবে ইনভয়েসে যুক্ত হবে ({allServices.length}টি মোট সার্ভিস)
                    </span>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="সার্ভিস বা টেস্ট খুঁজুন (CBC, USG, Cabin, OT)..."
                      value={serviceSearchTerm}
                      onChange={(e) => setServiceSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1 text-[11px] border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Category Filter Pills */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 text-[10px] font-bold scrollbar-none">
                  {[
                    { id: "ALL", label: `সকল সেবা (${allServices.length})` },
                    { id: "LAB", label: "ল্যাব ও প্যাথলজি টেস্ট" },
                    { id: "IMAGING", label: "এক্স-রে / USG / ECG" },
                    { id: "CONSULTATION", label: "ডাক্তার কনসাল্টেশন" },
                    { id: "BED_CABIN", label: "বেড ও কেবিন (IPD)" },
                    { id: "CRITICAL_CARE", label: "ICU / CCU / HDU" },
                    { id: "OT_SURGERY", label: "অপারেশন ও OT" },
                    { id: "EMERGENCY_NURSING", label: "ইমার্জেন্সি ও নার্সিং" },
                  ].map((grp) => (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => setServiceFilterGroup(grp.id)}
                      className={`px-2.5 py-1 rounded-lg shrink-0 transition ${
                        serviceFilterGroup === grp.id
                          ? "bg-emerald-700 text-white shadow-xs font-black"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      }`}
                    >
                      {grp.label}
                    </button>
                  ))}
                </div>

                {/* Service Cards Grid (Scrollable Quick Adder) */}
                <div className="max-h-48 overflow-y-auto pr-1 border border-slate-200 rounded-xl p-2 bg-slate-50/60 divide-y divide-slate-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
                    {filteredServices.map((srv) => (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => addItemRow(srv.category, srv.name, srv.price)}
                        className="text-left p-2 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 hover:shadow-2xs transition group flex items-start justify-between gap-1.5"
                        title={srv.description || srv.name}
                      >
                        <div className="min-w-0 flex-1">
                          <span
                            className={`text-[9px] font-bold px-1 py-0.2 rounded inline-block mb-0.5 ${
                              srv.group === "LAB"
                                ? "bg-emerald-100 text-emerald-800"
                                : srv.group === "IMAGING"
                                ? "bg-indigo-100 text-indigo-800"
                                : srv.group === "CONSULTATION"
                                ? "bg-sky-100 text-sky-800"
                                : srv.group === "BED_CABIN"
                                ? "bg-amber-100 text-amber-800"
                                : srv.group === "CRITICAL_CARE"
                                ? "bg-rose-100 text-rose-800"
                                : srv.group === "OT_SURGERY"
                                ? "bg-red-100 text-red-800"
                                : "bg-teal-100 text-teal-800"
                            }`}
                          >
                            {srv.category}
                          </span>
                          <p className="text-[11px] font-bold text-slate-800 truncate group-hover:text-emerald-950">
                            {srv.name}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-mono font-black text-emerald-700 block">
                            {formatCurrencyBDT(srv.price)}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 group-hover:text-emerald-700">
                            + যোগ করুন
                          </span>
                        </div>
                      </button>
                    ))}
                    {filteredServices.length === 0 && (
                      <div className="col-span-full py-4 text-center text-slate-400 text-xs">
                        কোনো সার্ভিস বা টেস্ট পাওয়া যায়নি। অনুগ্রহ করে সার্চ ফিল্টার পরিবর্তন করুন।
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    ইনভয়েস আইটেম তালিকা (Invoice Line Items - {items.length}টি):
                  </span>
                  <button
                    type="button"
                    onClick={() => addItemRow("MISC", "Custom Medical Service", 100)}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    + নতুন কাস্টম আইটেম যোগ করুন
                  </button>
                </div>

                {/* Autocomplete Datalist */}
                <datalist id="all-hospital-services-datalist">
                  {allServices.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.category} • {formatCurrencyBDT(s.price)}
                    </option>
                  ))}
                </datalist>

                {items.map((it, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      value={it.category}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].category = e.target.value as InvoiceItemRecord["service_category"];
                        setItems(next);
                      }}
                      className="w-28 px-2 py-1.5 border rounded-lg bg-slate-50 font-semibold text-[11px]"
                    >
                      <option value="CONSULTATION">Consultation</option>
                      <option value="LAB">Lab</option>
                      <option value="XRAY">X-Ray</option>
                      <option value="USG">USG</option>
                      <option value="BED">Bed</option>
                      <option value="OT">OT</option>
                      <option value="PHARMACY">Pharmacy</option>
                      <option value="AMBULANCE">Ambulance</option>
                      <option value="MISC">Misc</option>
                    </select>

                    <input
                      type="text"
                      list="all-hospital-services-datalist"
                      required
                      placeholder="সার্ভিস বা টেস্টের নাম"
                      value={it.itemName}
                      onChange={(e) => {
                        const val = e.target.value;
                        const next = [...items];
                        const matched = allServices.find((s) => s.name.toLowerCase() === val.toLowerCase());
                        if (matched) {
                          next[idx] = {
                            ...next[idx],
                            itemName: matched.name,
                            category: matched.category,
                            unitPrice: matched.price,
                          };
                        } else {
                          next[idx].itemName = val;
                        }
                        setItems(next);
                        const newSub = next.reduce((acc, x) => acc + x.unitPrice * x.quantity, 0);
                        const newDisc = discountPercent !== "" && Number(discountPercent) > 0
                          ? Math.round((newSub * Number(discountPercent)) / 100)
                          : 0;
                        setInitialPaymentAmount(Math.max(0, newSub - newDisc));
                      }}
                      className="flex-1 px-2.5 py-1.5 border rounded-lg bg-slate-50 font-semibold text-[11px]"
                    />

                    <input
                      type="number"
                      min="1"
                      value={it.quantity}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].quantity = Number(e.target.value);
                        setItems(next);
                        const newSub = next.reduce((acc, x) => acc + x.unitPrice * x.quantity, 0);
                        const newDisc = discountPercent !== "" && Number(discountPercent) > 0
                          ? Math.round((newSub * Number(discountPercent)) / 100)
                          : 0;
                        setInitialPaymentAmount(Math.max(0, newSub - newDisc));
                      }}
                      className="w-16 px-2 py-1.5 border rounded-lg bg-slate-50 font-mono text-center text-[11px]"
                    />

                    <input
                      type="number"
                      min="0"
                      value={it.unitPrice}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].unitPrice = Number(e.target.value);
                        setItems(next);
                        const newSub = next.reduce((acc, x) => acc + x.unitPrice * x.quantity, 0);
                        const newDisc = discountPercent !== "" && Number(discountPercent) > 0
                          ? Math.round((newSub * Number(discountPercent)) / 100)
                          : 0;
                        setInitialPaymentAmount(Math.max(0, newSub - newDisc));
                      }}
                      className="w-24 px-2 py-1.5 border rounded-lg bg-slate-50 font-mono text-right text-[11px]"
                    />

                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      className="p-1.5 text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Totals & Initial Settlement */}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                <div className="space-y-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                      <span>ডিসকাউন্ট (Discount %) *</span>
                      <span className="text-[10px] text-slate-400">অনুমোদিত সীমা: ৫% - ৬০%</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="60"
                        step="0.5"
                        placeholder="5% - 60%"
                        value={discountPercent}
                        onChange={(e) => {
                          const val = e.target.value === "" ? "" : Number(e.target.value);
                          setDiscountPercent(val);
                          const disc = val !== "" && Number(val) > 0
                            ? Math.round((subtotal * Number(val)) / 100)
                            : 0;
                          setInitialPaymentAmount(Math.max(0, subtotal - disc));
                        }}
                        className="w-full px-3 py-1.5 border rounded-xl bg-slate-50 font-mono font-bold pr-8 text-xs"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs pointer-events-none">
                        %
                      </span>
                    </div>
                    {discountPercent !== "" && Number(discountPercent) > 0 && (
                      <div className="mt-1 text-[11px]">
                        {Number(discountPercent) < 5 || Number(discountPercent) > 60 ? (
                          <span className="text-amber-600 font-bold">
                            ⚠️ অনুমোদিত ডিসকাউন্ট শতকরা সীমা ৫% থেকে ৬০%
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-bold">
                            ছাড়: {formatCurrencyBDT(calculatedDiscountAmount)} BDT ({discountPercent}% of Subtotal {formatCurrencyBDT(subtotal)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ডিসকাউন্ট এর কারণ (Discount Reason)</label>
                    <input
                      type="text"
                      placeholder="e.g. Director waiver / Poor patient subsidy"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-xl bg-slate-50 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Initial Payment (BDT)</label>
                    <input
                      type="number"
                      min="0"
                      value={initialPaymentAmount}
                      onChange={(e) => setInitialPaymentAmount(Number(e.target.value))}
                      className="w-full px-3 py-1.5 border rounded-xl bg-slate-50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentRecord["payment_method"])}
                      className="w-full px-3 py-1.5 border rounded-xl bg-slate-50 font-semibold"
                    >
                      <option value="CASH">Cash Counter</option>
                      <option value="BKASH">bKash Merchant</option>
                      <option value="NAGAD">Nagad</option>
                      <option value="ROCKET">Rocket</option>
                      <option value="VISA">Visa / Mastercard</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* REFERRAL ATTRIBUTION & COMMISSION CONFIGURATION */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    রেফারেন্স ও কমিশন ব্যবস্থাপনা (Referral & Commission)
                  </span>
                  {checkingAttribution ? (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                      রেফারেন্স যাচাই হচ্ছে...
                    </span>
                  ) : isAttributionSuggested ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      ✓ {attributionSource === "ADMISSION" ? "ভর্তি থেকে স্বয়ংক্রিয় প্রাপ্ত" : "রেজিস্ট্রেশন থেকে প্রাপ্ত"}
                      {attributionAgentName ? `: ${attributionAgentName}` : ""}
                      {attributionAgentCode ? ` (${attributionAgentCode})` : ""}
                    </span>
                  ) : null}
                </div>

                {/* Reference Partner Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      রেফারেন্স পার্টনার (Reference Partner)
                    </label>
                    <select
                      value={selectedReferralAgentId}
                      onChange={(e) => handleReferralAgentChange(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">কোনো রেফারেন্স নেই (No Referral / Direct)</option>
                      {billingReferralAgents.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.full_name} ({ag.agent_code}) — {ag.commission_rate_percent}%
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Commission Rate (%) Input */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                      <span>কমিশন শতকরা হার (Commission Rate %) *</span>
                      <span className="text-[9px] text-slate-400">সীমা: ১% - ৪০%</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="40"
                        step="0.5"
                        disabled={!selectedReferralAgentId || noReferral}
                        value={referralCommissionRate}
                        onChange={(e) => setReferralCommissionRate(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-mono font-bold text-emerald-700 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <span className="font-bold text-slate-500 text-xs">%</span>
                    </div>
                  </div>
                </div>

                {/* Live Commission Estimate Preview */}
                {selectedReferralAgentId && !noReferral && (
                  <div className="p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="text-emerald-950 font-bold block">
                        প্রাক্কলিত কমিশন (Estimated Commission):
                      </span>
                      <span className="text-[10px] text-emerald-700">
                        {referralCommissionRate}% on Net {formatCurrencyBDT(netTotal)} (Subtotal - Discount)
                      </span>
                    </div>
                    <span className="font-mono font-black text-emerald-800 text-base">
                      {formatCurrencyBDT(estimatedCommission)}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl font-mono text-xs flex justify-between font-bold">
                <span>Grand Total: {formatCurrencyBDT(netTotal)}</span>
                <span className="text-rose-600">Remaining Due: {formatCurrencyBDT(dueAmount)}</span>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl disabled:opacity-50 flex items-center"
                >
                  {formLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Confirm & Issue Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COLLECT PAYMENT MODAL */}
      {paymentModalInv && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-xs">
            <h3 className="text-base font-black text-slate-900 mb-1">Collect Due Payment</h3>
            <p className="text-slate-500 mb-4">
              Invoice: <strong>{paymentModalInv.invoice_number}</strong> • Total Due:{" "}
              <strong className="text-rose-600">{formatCurrencyBDT(paymentModalInv.due_amount)}</strong>
            </p>

            <form onSubmit={handleCollectPayment} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Collect Amount (BDT) *</label>
                <input
                  type="number"
                  min="1"
                  max={paymentModalInv.due_amount}
                  required
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value as PaymentRecord["payment_method"])}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                >
                  <option value="CASH">Cash Counter</option>
                  <option value="BKASH">bKash Merchant</option>
                  <option value="NAGAD">Nagad</option>
                  <option value="ROCKET">Rocket</option>
                  <option value="VISA">Visa / Mastercard</option>
                  <option value="SSLCOMMERZ">SSLCommerz (Cards & Net Banking)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Transaction ID</label>
                <input
                  type="text"
                  placeholder="e.g. TrxID / Counter note"
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPaymentModalInv(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collectLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-50 flex items-center"
                >
                  {collectLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Confirm Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID INVOICE MODAL */}
      {voidModalInv && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-black text-slate-900">Void Invoice (Audit Vault)</h3>
              </div>
              <button
                onClick={() => setVoidModalInv(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmVoid} className="space-y-4 pt-4 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
                <p className="font-bold">Warning: Irreversible Financial Action</p>
                <p className="mt-1 text-[11px] leading-relaxed">
                  Voiding invoice <span className="font-mono font-bold">{voidModalInv.invoice_number}</span> will cancel all remaining due balance and record a forensic audit trail with your supervisor ID and timestamp.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mandatory Clinical / Administrative Justification <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Enter detailed reason for voiding (e.g. Duplicate entry by counter staff, patient transferred to tertiary facility)..."
                  value={voidReasonInput}
                  onChange={(e) => setVoidReasonInput(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setVoidModalInv(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voidLoading || voidReasonInput.trim().length < 5}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center shadow-xs"
                >
                  {voidLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Confirm Void & Record Audit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
