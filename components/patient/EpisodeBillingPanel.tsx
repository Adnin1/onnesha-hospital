"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  BedDouble,
  CheckCircle2,
  CreditCard,
  Edit2,
  FileText,
  Loader2,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Stethoscope,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  completeEpisodeDischargeAction,
  getEpisodeBillingPreviewAction,
  prepareEpisodeSettlementAction,
  addEpisodeServiceChargeAction,
  editEpisodeServiceChargeAction,
  deleteEpisodeServiceChargeAction,
  collectPaymentAction,
  EpisodeBillingPreviewData,
} from "@/lib/billing/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { searchReferralAgentsAction } from "@/lib/referrals/actions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";
import type { PaymentRecord } from "@/types/billing";
import type { PatientMaster } from "@/types/clinical";

type Props = {
  patientId?: string;
  triggerButton?: React.ReactNode;
  defaultOpen?: boolean;
};

function dt(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-BD", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function LabelText({ text }: { text: string }) {
  return <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-0.5">{text}</span>;
}

export function EpisodeBillingPanel({
  patientId,
  triggerButton,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patientId || "");
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);

  // Patient search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PatientMaster[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Referral agents lookup
  const [referralAgents, setReferralAgents] = useState<Array<{ id: string; name: string }>>([]);

  // Episode billing preview state
  const [preview, setPreview] = useState<EpisodeBillingPreviewData | null>(null);
  const [loading, setLoading] = useState(false);

  // Add extra service charge modal
  const [showAddService, setShowAddService] = useState(false);
  const [addCategory, setAddCategory] = useState("PROCEDURE");
  const [addItemName, setAddItemName] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const [addUnitPrice, setAddUnitPrice] = useState(0);
  const [addNotes, setAddNotes] = useState("");
  const [addingServiceLoading, setAddingServiceLoading] = useState(false);

  // Edit custom service charge modal
  const [editingCharge, setEditingCharge] = useState<{
    id: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    notes: string;
  } | null>(null);
  const [editingLoading, setEditingLoading] = useState(false);
  const [deleteChargeId, setDeleteChargeId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Settlement & Discount
  const [billingDiscount, setBillingDiscount] = useState<number>(0);
  const [billingDiscountReason, setBillingDiscountReason] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDue, setInvoiceDue] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentRecord["payment_method"]>("CASH");
  const [paymentNotes, setPaymentNotes] = useState("");

  // Discharge State
  const [dischargeType, setDischargeType] = useState<"NORMAL" | "DOR" | "LAMA" | "REFERRED" | "DECEASED">("NORMAL");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [hospitalCourse, setHospitalCourse] = useState("");
  const [dischargeAdvice, setDischargeAdvice] = useState("");
  const [followup, setFollowup] = useState("");

  // Status feedback
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [dischargeLoading, setDischargeLoading] = useState(false);
  const [dischargeCompleteAt, setDischargeCompleteAt] = useState<string | null>(null);

  useEffect(() => {
    if (patientId) {
      setSelectedPatientId(patientId);
    }
  }, [patientId]);

  useEffect(() => {
    if (!open) return;
    void loadReferralAgents();
    if (selectedPatientId) {
      void refreshPreview(selectedPatientId);
    }
  }, [open, selectedPatientId]);

  // Search patients as user types
  useEffect(() => {
    if (!open) return;
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await searchPatientsAction({ query: searchQuery.trim() });
        if (res.success && res.data) {
          setSearchResults(res.data.patients);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, open]);

  async function loadReferralAgents() {
    try {
      const res = await searchReferralAgentsAction();
      if (res.success && res.data) {
        setReferralAgents(res.data.map((a) => ({ id: a.id, name: a.full_name })));
      }
    } catch {
      // ignore non-critical
    }
  }

  async function handleSelectPatient(p: PatientMaster) {
    setSelectedPatient(p);
    setSelectedPatientId(p.id);
    setSearchQuery("");
    setSearchResults([]);
    await refreshPreview(p.id);
  }

  async function refreshPreview(targetPatientId?: string) {
    const pId = targetPatientId || selectedPatientId;
    if (!pId) return;

    setLoading(true);
    setActionError("");
    const res = await getEpisodeBillingPreviewAction({ patientId: pId });
    setLoading(false);

    if (!res.success || !res.data) {
      setPreview(null);
      setActionError(res.error || "Failed to load episode billing preview.");
      return;
    }

    setPreview(res.data);
    if (res.data.admissionDiscountAmount) {
      setBillingDiscount(0);
    }
  }

  // Add Extra Service
  async function handleAddExtraService(e: React.FormEvent) {
    e.preventDefault();
    if (!preview?.episodeId || !selectedPatientId) {
      setActionError("No active episode found to add service charge.");
      return;
    }
    if (!addItemName.trim()) {
      setActionError("Item / Service name is required.");
      return;
    }
    if (addQuantity <= 0 || addUnitPrice < 0) {
      setActionError("Valid quantity and non-negative unit price required.");
      return;
    }

    setAddingServiceLoading(true);
    setActionError("");
    const res = await addEpisodeServiceChargeAction({
      episodeId: preview.episodeId,
      patientId: selectedPatientId,
      category: addCategory,
      itemName: addItemName.trim(),
      quantity: Number(addQuantity),
      unitPrice: Number(addUnitPrice),
      notes: addNotes.trim() || undefined,
    });
    setAddingServiceLoading(false);

    if (!res.success) {
      setActionError(res.error || "Failed to add service charge.");
      return;
    }

    setShowAddService(false);
    setAddItemName("");
    setAddQuantity(1);
    setAddUnitPrice(0);
    setAddNotes("");
    setActionMessage("Custom service charge recorded.");
    await refreshPreview(selectedPatientId);
  }

  // Edit Service
  async function handleSaveEditService(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCharge) return;
    if (!editingCharge.itemName.trim()) {
      setActionError("Item name is required.");
      return;
    }
    if (editingCharge.quantity <= 0 || editingCharge.unitPrice < 0) {
      setActionError("Valid quantity and non-negative unit price required.");
      return;
    }

    setEditingLoading(true);
    setActionError("");
    const res = await editEpisodeServiceChargeAction({
      chargeId: editingCharge.id,
      itemName: editingCharge.itemName.trim(),
      quantity: Number(editingCharge.quantity),
      unitPrice: Number(editingCharge.unitPrice),
      notes: editingCharge.notes.trim() || undefined,
    });
    setEditingLoading(false);

    if (!res.success) {
      setActionError(res.error || "Failed to update service charge.");
      return;
    }

    setEditingCharge(null);
    setActionMessage("Service charge updated.");
    await refreshPreview(selectedPatientId);
  }

  // Delete Service
  async function confirmDeleteService() {
    if (!deleteChargeId) return;
    setDeleteLoading(true);
    setActionError("");
    const res = await deleteEpisodeServiceChargeAction({ chargeId: deleteChargeId });
    setDeleteLoading(false);
    setDeleteChargeId(null);
    if (!res.success) {
      setActionError(res.error || "Failed to delete service charge.");
      return;
    }
    setActionMessage("Unbilled service charge removed.");
    await refreshPreview(selectedPatientId);
  }

  // Settlement Calculations
  const admissionDisc = preview ? preview.admissionDiscountAmount : 0;
  const totalDiscount = Math.max(0, admissionDisc + billingDiscount);
  const netPayable = preview ? Math.max(0, preview.total - totalDiscount) : 0;

  async function prepareSettlement() {
    if (!preview?.episodeId || !selectedPatientId) {
      setActionError("No active patient-care episode found.");
      return;
    }
    setLoading(true);
    setActionError("");
    const res = await prepareEpisodeSettlementAction({
      patientId: selectedPatientId,
      episodeId: preview.episodeId,
      discountAmount: totalDiscount,
      discountReason: billingDiscountReason || preview.admissionDiscountReason || undefined,
      referralAgentId: preview.referralAgentId || undefined,
    });
    setLoading(false);

    if (!res.success || !res.data) {
      setActionError(res.error || "Failed to generate settlement invoice.");
      return;
    }

    setInvoiceId(res.data.invoiceId || "");
    setInvoiceNumber(res.data.invoiceNumber || "");
    setInvoiceDue(res.data.dueAmount || 0);
    setPaymentAmount(res.data.dueAmount || 0);
    setActionMessage("Final settlement invoice generated: " + (res.data.invoiceNumber || ""));
    await refreshPreview(selectedPatientId);
  }

  async function collectFinalPayment() {
    if (!invoiceId) return;
    if (paymentAmount <= 0) {
      setActionError("Payment amount must be greater than zero.");
      return;
    }
    setPaymentLoading(true);
    setActionError("");
    const res = await collectPaymentAction({
      invoiceId,
      amount: paymentAmount,
      paymentMethod,
      notes: paymentNotes || "Episode final settlement payment",
    });
    setPaymentLoading(false);

    if (!res.success || !res.data) {
      setActionError(res.error || "Payment recording failed.");
      return;
    }

    setInvoiceDue(res.data.updatedDue);
    setPaymentAmount(res.data.updatedDue);
    setActionMessage("Payment of " + formatCurrencyBDT(paymentAmount) + " recorded successfully. Receipt #" + (res.data.payment.receipt_number || ""));
    await refreshPreview(selectedPatientId);
  }

  async function completeDischarge() {
    if (!preview?.episodeId || !selectedPatientId) return;
    if (invoiceDue > 0.005) {
      setActionError("Complete payment of the final settlement before discharge.");
      return;
    }
    if (!finalDiagnosis.trim()) {
      setActionError("Final diagnosis is required.");
      return;
    }
    setDischargeLoading(true);
    setActionError("");
    const res = await completeEpisodeDischargeAction({
      patientId: selectedPatientId,
      episodeId: preview.episodeId,
      dischargeType,
      finalDiagnosis,
      hospitalCourse,
      dischargeAdvice,
      followupInstructions: followup,
    });
    setDischargeLoading(false);
    if (!res.success) {
      setActionError(res.error || "Discharge could not be completed.");
      return;
    }
    setDischargeCompleteAt(res.data?.dischargedAt || new Date().toISOString());
    setActionMessage("Episode discharged and bed/cabin released at " + formatDateBDT(res.data?.dischargedAt || new Date().toISOString()) + ".");
  }

  return (
    <>
      {triggerButton ? (
        <span onClick={() => setOpen(true)}>{triggerButton}</span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black flex items-center gap-1.5 shadow-sm"
        >
          <ReceiptText className="w-3.5 h-3.5" />
          Episode Billing & Discharge
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-5xl max-h-[94vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <ReceiptText className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-lg font-black text-slate-900">
                    Patient Episode Billing, Service Ledger & Discharge
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Full stay history, error correction, extra service charges, unbilled settlement & atomic bed release.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {preview?.episodeId && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 transition"
                    title="Print Statement / Invoice"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Patient Selector / Switcher */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                  <div className="flex-1 w-full relative">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Search Patient (by Serial / UHID, Code, Name, Phone, or NID)
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Type REG-..., OH-..., Name, Phone, or NID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs border rounded-xl bg-white"
                      />
                    </div>
                    {searchLoading && (
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center">
                        <Loader2 className="w-3 h-3 animate-spin mr-1" /> Searching directory...
                      </div>
                    )}
                    {searchResults.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto divide-y">
                        {searchResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => void handleSelectPatient(p)}
                            className="w-full p-2.5 text-left text-xs hover:bg-sky-50 flex justify-between items-center"
                          >
                            <div>
                              <span className="font-bold text-slate-900">{p.full_name}</span>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {p.registration_serial || p.patient_code} • {p.phone}
                              </div>
                            </div>
                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-mono">
                              {p.patient_code}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedPatient && (
                    <div className="bg-white border border-emerald-200 rounded-xl p-3 text-xs min-w-[240px]">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                        <User className="w-3.5 h-3.5" />
                        <span>{selectedPatient.full_name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                        Serial: <strong className="text-slate-700">{selectedPatient.registration_serial || selectedPatient.patient_code}</strong>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {selectedPatient.gender} • {selectedPatient.phone}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {loading && !preview ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                </div>
              ) : preview ? (
                <>
                  {/* Financial Stats Bar */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Stat label="Current Unbilled" value={formatCurrencyBDT(preview.total)} danger={preview.total > 0.005} />
                    <Stat label="Episode Invoiced" value={formatCurrencyBDT(preview.episodeInvoiced || 0)} />
                    <Stat label="Episode Paid" value={formatCurrencyBDT(preview.episodePaid || 0)} />
                    <Stat label="Episode Due" value={formatCurrencyBDT(preview.episodeDue || 0)} danger={(preview.episodeDue || 0) > 0.005} />
                    <Stat label="Patient Lifetime Due" value={formatCurrencyBDT(preview.previousDue)} danger={preview.previousDue > 0.005} />
                  </div>

                  {/* Complete Admission / Encounter History (OPD, Bed/Cabin, ICU) */}
                  <section className="rounded-2xl border border-sky-200 bg-sky-50/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-sky-100 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-sky-700" />
                      <div>
                        <h3 className="text-sm font-black text-slate-900">Admission / Encounter History</h3>
                        <p className="text-[10px] text-slate-500">
                          Complete hospitalization history · OPD consultations, Bed/Cabin stays, and Critical Care admissions.
                        </p>
                      </div>
                    </div>

                    {(preview.encounters || []).length === 0 && (preview.resources || []).length === 0 && (preview.criticalCare || []).length === 0 ? (
                      <div className="p-4 text-xs text-slate-500">No active clinical encounters recorded for this episode.</div>
                    ) : (
                      <div className="divide-y divide-sky-100">
                        {(preview.encounters || []).map((item) => (
                          <div key={item.id} className="p-3 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
                            <div><LabelText text="Type" /><strong>{item.visit_type}</strong></div>
                            <div><LabelText text="Visit #" /><strong>{item.visit_number || "—"}</strong></div>
                            <div><LabelText text="Doctor" /><strong>{item.doctor_name || "—"}</strong></div>
                            <div><LabelText text="Started" /><strong>{dt(item.admitted_at)}</strong></div>
                            <div><LabelText text="Status" /><strong>{item.status}</strong></div>
                          </div>
                        ))}

                        {(preview.resources || []).map((item) => (
                          <div key={item.id} className="p-3 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
                            <div className="flex items-center gap-1.5">
                              <BedDouble className="w-3.5 h-3.5 text-sky-700" />
                              <strong>{item.resource_type}</strong>
                            </div>
                            <div><LabelText text="Resource" /><strong>{item.resource_number || "—"}{item.ward_name ? " · " + item.ward_name : ""}</strong></div>
                            <div><LabelText text="Admission" /><strong>{dt(item.assigned_at)}</strong></div>
                            <div><LabelText text="Released" /><strong>{dt(item.vacated_at)}</strong></div>
                            <div><LabelText text="Rate / Status" /><strong>{formatCurrencyBDT(item.daily_charge)}/day · {item.status}</strong></div>
                          </div>
                        ))}

                        {(preview.criticalCare || []).map((item) => (
                          <div key={item.id} className="p-3 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
                            <div><LabelText text="Critical Care" /><strong>{item.unit_name || item.unit_type || "Unit"}</strong></div>
                            <div><LabelText text="Bed" /><strong>{item.bed_number}</strong></div>
                            <div><LabelText text="Admission" /><strong>{dt(item.admission_time)}</strong></div>
                            <div><LabelText text="Release" /><strong>{dt(item.discharge_time)}</strong></div>
                            <div><LabelText text="Rate / Status" /><strong>{formatCurrencyBDT(item.daily_charge)}/day · {item.status}</strong></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Unbilled Itemized Services Breakdown */}
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                      <div>
                        <h3 className="font-black text-sm text-slate-900">Current Unbilled Services & Daily Charges</h3>
                        <p className="text-[11px] text-slate-500">
                          These charges have accrued during the episode and will be settled into the final invoice.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddService(!showAddService)}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Extra Service
                      </button>
                    </div>

                    {preview.lines.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No unbilled services or charges pending. Everything has been settled or no billable items exist.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold">
                            <tr>
                              <th className="p-3">Category</th>
                              <th className="p-3">Description</th>
                              <th className="p-3 text-right">Unit Rate</th>
                              <th className="p-3 text-right">Qty / Days</th>
                              <th className="p-3 text-right">Total</th>
                              <th className="p-3 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {preview.lines.map((line) => (
                              <tr key={line.reference_id} className="hover:bg-slate-50/70">
                                <td className="p-3">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                    {line.service_category}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <div className="font-bold text-slate-900">{line.item_name}</div>
                                  {line.started_at && (
                                    <div className="text-[10px] text-slate-400">
                                      Accruing from {formatDateBDT(line.started_at)}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-right font-mono">{formatCurrencyBDT(line.unit_price)}</td>
                                <td className="p-3 text-right font-mono font-bold">{line.quantity}</td>
                                <td className="p-3 text-right font-mono font-black text-slate-900">
                                  {formatCurrencyBDT(line.total_price)}
                                </td>
                                <td className="p-3 text-center">
                                  {line.is_custom_charge && line.charge_id ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingCharge({
                                            id: line.charge_id!,
                                            itemName: line.item_name,
                                            quantity: line.quantity,
                                            unitPrice: line.unit_price,
                                            notes: "",
                                          })
                                        }
                                        className="p-1 rounded-lg hover:bg-slate-200 text-slate-600"
                                        title="Edit this service"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteChargeId(line.charge_id!)}
                                        className="p-1 rounded-lg hover:bg-rose-100 text-rose-600"
                                        title="Remove service"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">Fixed</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Add Extra Service Form */}
                  {showAddService && (
                    <div className="rounded-2xl border border-sky-300 bg-sky-50/70 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-sky-900">Add Extra Service or Investigation</span>
                        <button
                          type="button"
                          onClick={() => setShowAddService(false)}
                          className="p-1 text-slate-500 hover:bg-slate-200 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <form onSubmit={handleAddExtraService} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Category</label>
                          <select
                            value={addCategory}
                            onChange={(e) => setAddCategory(e.target.value)}
                            className="w-full px-3 py-2 border rounded-xl bg-white"
                          >
                            <option value="PROCEDURE">Procedure / Surgery</option>
                            <option value="INVESTIGATION">Diagnostic / Lab</option>
                            <option value="PHARMACY">Pharmacy / Medicine</option>
                            <option value="NURSING">Nursing / Care</option>
                            <option value="OXYGEN">Oxygen / Gas</option>
                            <option value="AMBULANCE">Ambulance</option>
                            <option value="EQUIPMENT">Equipment Usage</option>
                            <option value="MISC">Miscellaneous</option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Item / Service Name</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. CBC Test, Oxygen Cylinder..."
                            value={addItemName}
                            onChange={(e) => setAddItemName(e.target.value)}
                            className="w-full px-3 py-2 border rounded-xl bg-white"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Quantity</label>
                          <input
                            type="number"
                            min="1"
                            value={addQuantity}
                            onChange={(e) => setAddQuantity(Number(e.target.value))}
                            className="w-full px-3 py-2 border rounded-xl bg-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Unit Price (BDT)</label>
                          <input
                            type="number"
                            min="0"
                            value={addUnitPrice}
                            onChange={(e) => setAddUnitPrice(Number(e.target.value))}
                            className="w-full px-3 py-2 border rounded-xl bg-white font-mono"
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className="block font-bold text-slate-700 mb-1">Notes / Clinical Rationale</label>
                          <input
                            type="text"
                            placeholder="Optional explanation or reference number"
                            value={addNotes}
                            onChange={(e) => setAddNotes(e.target.value)}
                            className="w-full px-3 py-2 border rounded-xl bg-white"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            type="submit"
                            disabled={addingServiceLoading}
                            className="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
                          >
                            {addingServiceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            {addingServiceLoading ? "Adding..." : "Confirm Item"}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Edit Custom Service Modal */}
                  {editingCharge && (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-amber-900">Edit Custom Service Charge</span>
                        <button
                          type="button"
                          onClick={() => setEditingCharge(null)}
                          className="p-1 text-slate-500 hover:bg-slate-200 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <form onSubmit={handleSaveEditService} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div className="md:col-span-2">
                          <label className="block font-bold text-slate-700 mb-1">Item Name</label>
                          <input
                            type="text"
                            required
                            value={editingCharge.itemName}
                            onChange={(e) => setEditingCharge({ ...editingCharge, itemName: e.target.value })}
                            className="w-full px-3 py-2 border rounded-xl bg-white"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Quantity</label>
                          <input
                            type="number"
                            min="1"
                            value={editingCharge.quantity}
                            onChange={(e) => setEditingCharge({ ...editingCharge, quantity: Number(e.target.value) })}
                            className="w-full px-3 py-2 border rounded-xl bg-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Unit Price (BDT)</label>
                          <input
                            type="number"
                            min="0"
                            value={editingCharge.unitPrice}
                            onChange={(e) => setEditingCharge({ ...editingCharge, unitPrice: Number(e.target.value) })}
                            className="w-full px-3 py-2 border rounded-xl bg-white font-mono"
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className="block font-bold text-slate-700 mb-1">Notes</label>
                          <input
                            type="text"
                            value={editingCharge.notes}
                            onChange={(e) => setEditingCharge({ ...editingCharge, notes: e.target.value })}
                            className="w-full px-3 py-2 border rounded-xl bg-white"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            type="submit"
                            disabled={editingLoading}
                            className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
                          >
                            {editingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Update Item
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Admission Discount & Final Billing Settlement Preparation */}
                  <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <div>
                        <h4 className="font-black text-sm text-slate-900">Episode Final Settlement & Discounts</h4>
                        <p className="text-[11px] text-slate-500">
                          Verify admission-time discount and apply optional discharge concession before generating final invoice.
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-slate-500">Net Payable Amount</div>
                        <div className="text-xl font-black text-emerald-700 font-mono">
                          {formatCurrencyBDT(netPayable)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <div className="text-slate-500 font-bold text-[10px] uppercase">Admission Discount</div>
                        <div className="text-sm font-mono font-bold text-slate-800 mt-1">
                          {formatCurrencyBDT(admissionDisc)}
                        </div>
                        {preview.admissionDiscountReason && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Reason: {preview.admissionDiscountReason}
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-slate-200">
                        <label className="block text-slate-700 font-bold text-[10px] uppercase mb-1">
                          Billing Concession / Discount
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={preview.total - admissionDisc}
                          value={billingDiscount}
                          onChange={(e) => setBillingDiscount(Number(e.target.value))}
                          placeholder="BDT"
                          className="w-full px-2.5 py-1.5 border rounded-lg font-mono text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Concession reason (e.g. Director waiver)"
                          value={billingDiscountReason}
                          onChange={(e) => setBillingDiscountReason(e.target.value)}
                          className="w-full px-2.5 py-1 border rounded-lg text-[11px] mt-1.5"
                        />
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col justify-between">
                        <div>
                          <div className="text-slate-500 font-bold text-[10px] uppercase">Referral Attribution</div>
                          <div className="text-xs font-bold text-slate-800 mt-1">
                            {referralAgents.find((a) => a.id === preview.referralAgentId)?.name || "Direct / No Agent"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={prepareSettlement}
                          disabled={loading || netPayable <= 0}
                          className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                          Generate Final Invoice
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Payment Collection Section */}
                  {invoiceId && invoiceDue > 0.005 && (
                    <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-emerald-700" />
                          <h4 className="font-black text-sm text-emerald-950">
                            Collect Settlement Payment ({invoiceNumber})
                          </h4>
                        </div>
                        <div className="font-mono font-bold text-emerald-900 text-sm">
                          Due: {formatCurrencyBDT(invoiceDue)}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Payment Amount (BDT)</label>
                          <input
                            type="number"
                            min="0.01"
                            max={invoiceDue}
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(Number(e.target.value))}
                            className="w-full px-3 py-2 border rounded-xl bg-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Method</label>
                          <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value as PaymentRecord["payment_method"])}
                            className="w-full px-3 py-2 border rounded-xl bg-white"
                          >
                            <option value="CASH">Cash</option>
                            <option value="BKASH">bKash</option>
                            <option value="NAGAD">Nagad</option>
                            <option value="ROCKET">Rocket</option>
                            <option value="UPAY">UPAY</option>
                            <option value="VISA">Visa Card</option>
                            <option value="MASTERCARD">Mastercard</option>
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block font-bold text-slate-700 mb-1">Notes / Transaction Reference</label>
                          <input
                            type="text"
                            placeholder="e.g. bKash TrxID or Cash Memo #"
                            value={paymentNotes}
                            onChange={(e) => setPaymentNotes(e.target.value)}
                            className="w-full px-3 py-2 border rounded-xl bg-white"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={collectFinalPayment}
                          disabled={paymentLoading || paymentAmount <= 0}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        >
                          {paymentLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                          {paymentLoading ? "Recording Payment..." : "Confirm & Record Payment"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Clinical Discharge & Bed Release */}
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-rose-600" />
                        <h4 className="font-black text-sm text-slate-900">
                          Complete Clinical Discharge & Vacate Bed/Cabin
                        </h4>
                      </div>
                      {invoiceDue > 0.005 && (
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg">
                          Settlement Payment Outstanding
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Discharge Type</label>
                        <select
                          value={dischargeType}
                          onChange={(e) => setDischargeType(e.target.value as typeof dischargeType)}
                          className="w-full px-3 py-2 border rounded-xl bg-white"
                        >
                          <option value="NORMAL">Normal Discharge</option>
                          <option value="DOR">Discharge on Request (DOR)</option>
                          <option value="LAMA">Left Against Medical Advice (LAMA)</option>
                          <option value="REFERRED">Referred to Higher Center</option>
                          <option value="DECEASED">Deceased</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block font-bold text-slate-700 mb-1">Final Clinical Diagnosis</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Acute Appendicitis - Post Appendectomy"
                          value={finalDiagnosis}
                          onChange={(e) => setFinalDiagnosis(e.target.value)}
                          className="w-full px-3 py-2 border rounded-xl bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Hospital Course Summary</label>
                        <textarea
                          rows={2}
                          placeholder="Brief summary of clinical stay..."
                          value={hospitalCourse}
                          onChange={(e) => setHospitalCourse(e.target.value)}
                          className="w-full px-3 py-2 border rounded-xl bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Discharge Advice</label>
                        <textarea
                          rows={2}
                          placeholder="Medications, diet, rest instructions..."
                          value={dischargeAdvice}
                          onChange={(e) => setDischargeAdvice(e.target.value)}
                          className="w-full px-3 py-2 border rounded-xl bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Follow-up Instructions</label>
                        <textarea
                          rows={2}
                          placeholder="Follow-up date, clinic, SOS emergency signs..."
                          value={followup}
                          onChange={(e) => setFollowup(e.target.value)}
                          className="w-full px-3 py-2 border rounded-xl bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <div className="text-[11px] text-slate-500">
                        {dischargeCompleteAt ? (
                          <span className="text-emerald-700 font-bold">
                            Discharged at {formatDateBDT(dischargeCompleteAt)}. Bed released.
                          </span>
                        ) : (
                          <span>Discharging marks episode CLOSED and immediately releases bed/cabin allocation to VACANT.</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={completeDischarge}
                        disabled={dischargeLoading || invoiceDue > 0.005 || !!dischargeCompleteAt}
                        className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                      >
                        {dischargeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        {dischargeLoading ? "Discharging & Releasing..." : "Authorize Discharge & Release Bed"}
                      </button>
                    </div>
                  </div>

                  {/* Invoice & Payment History */}
                  <section className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b font-black text-sm">
                      Invoice & Payment History
                    </div>
                    {(preview.invoiceHistory || []).length === 0 ? (
                      <div className="p-4 text-xs text-slate-500">No prior invoices for this episode yet.</div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {(preview.invoiceHistory || []).map((inv) => (
                          <div key={inv.id} className="p-4 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                              <div>
                                <div className="font-black text-slate-900">{inv.invoice_number}</div>
                                <div className="text-[10px] text-slate-500">
                                  {dt(inv.created_at)} · {inv.is_episode_settlement ? "Episode Settlement" : "Patient Invoice"}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-mono font-black">{formatCurrencyBDT(inv.grand_total)}</div>
                                <div className="text-[10px] text-slate-500">
                                  Paid {formatCurrencyBDT(inv.paid_amount)} · Due {formatCurrencyBDT(inv.due_amount)} · {inv.status}
                                </div>
                              </div>
                            </div>

                            {inv.items && inv.items.length > 0 && (
                              <div className="pl-3 border-l-2 border-slate-200 space-y-1">
                                {inv.items.map((item, idx) => (
                                  <div key={item.reference_id || String(idx)} className="flex justify-between gap-3 text-[10px] text-slate-600">
                                    <span>{item.item_name}</span>
                                    <span className="font-mono">{formatCurrencyBDT(item.total_price)}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {inv.payments && inv.payments.length > 0 && (
                              <div className="pl-3 border-l-2 border-emerald-200 space-y-1">
                                {inv.payments.map((p) => (
                                  <div key={p.receipt_number} className="flex justify-between gap-3 text-[10px] text-slate-500">
                                    <span>{p.receipt_number} · {p.payment_method} · {dt(p.payment_date)}</span>
                                    <strong className="font-mono">{formatCurrencyBDT(p.amount)}</strong>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              ) : selectedPatientId ? (
                <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 rounded-2xl border">
                  No active hospitalization or care episode found for this patient.
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 rounded-2xl border">
                  Search and select a patient above to view their active care episode and billing ledger.
                </div>
              )}

              {/* Status alerts */}
              {actionError && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}
              {actionMessage && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{actionMessage}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-500">
              <span>All invoices, stays, and GL movements are strictly verified and immutable.</span>
              <button
                type="button"
                onClick={() => selectedPatientId && void refreshPreview(selectedPatientId)}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold"
              >
                Refresh Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteChargeId && (
        <ConfirmDialog
          isOpen={!!deleteChargeId}
          title="Remove Service Charge"
          description="Are you sure you want to remove this unbilled service charge from the active episode?"
          confirmLabel="Remove Item"
          cancelLabel="Cancel"
          isDestructive
          isLoading={deleteLoading}
          onConfirm={confirmDeleteService}
          onCancel={() => setDeleteChargeId(null)}
        />
      )}
    </>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
      <div className="text-[10px] text-slate-500 font-bold uppercase">{label}</div>
      <div className={"mt-1 text-sm font-black " + (danger ? "text-rose-700" : "text-slate-900")}>{value}</div>
    </div>
  );
}
