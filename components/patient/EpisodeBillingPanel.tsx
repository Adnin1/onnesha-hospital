"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  BedDouble,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  ReceiptText,
  Stethoscope,
  X,
} from "lucide-react";
import {
  completeEpisodeDischargeAction,
  getEpisodeBillingPreviewAction,
  prepareEpisodeSettlementAction,
} from "@/lib/billing/actions";
import type {
  EpisodeEncounterHistory,
  EpisodeCriticalCareHistory,
  EpisodeInvoiceHistory,
  EpisodeResourceHistory,
} from "@/lib/billing/actions";
import { collectPaymentAction } from "@/lib/billing/actions";
import { formatCurrencyBDT } from "@/lib/utils";
import type { PaymentRecord } from "@/types/billing";

type Props = { patientId: string };

type Preview = {
  episodeId?: string;
  lines: Array<{
    reference_id: string;
    service_category: string;
    item_name: string;
    unit_price: number;
    quantity: number;
    total_price: number;
    started_at?: string;
  }>;
  encounters: EpisodeEncounterHistory[];
  resources: EpisodeResourceHistory[];
  criticalCare: EpisodeCriticalCareHistory[];
  invoiceHistory: EpisodeInvoiceHistory[];
  total: number;
  previousInvoiced: number;
  previousPaid: number;
  previousDue: number;
  episodeInvoiced: number;
  episodePaid: number;
  episodeDue: number;
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

export function EpisodeBillingPanel({ patientId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDue, setInvoiceDue] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentRecord["payment_method"]>("CASH");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [dischargeType, setDischargeType] = useState<"NORMAL" | "DOR" | "LAMA" | "REFERRED" | "DECEASED">("NORMAL");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [hospitalCourse, setHospitalCourse] = useState("");
  const [dischargeAdvice, setDischargeAdvice] = useState("");
  const [followup, setFollowup] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [dischargeLoading, setDischargeLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    void refreshPreview();
  }, [open, patientId]);

  async function refreshPreview() {
    setLoading(true);
    setActionError("");
    const res = await getEpisodeBillingPreviewAction({ patientId });
    if (res.success && res.data) {
      setPreview(res.data as Preview);
    } else {
      setPreview(null);
      setActionError(res.error || "Unable to load current episode billing.");
    }
    setLoading(false);
  }

  async function prepareSettlement() {
    if (!preview?.episodeId) {
      setActionError("No active patient-care episode found.");
      return;
    }
    setLoading(true);
    setActionError("");
    setActionMessage("");

    const res = await prepareEpisodeSettlementAction({
      patientId,
      episodeId: preview.episodeId,
    });

    if (!res.success || !res.data) {
      setActionError(res.error || "Final settlement could not be prepared.");
      setLoading(false);
      return;
    }

    setInvoiceId(res.data.invoiceId || "");
    setInvoiceNumber(res.data.invoiceNumber || "");
    setInvoiceDue(Number(res.data.dueAmount || 0));
    setPaymentAmount(Number(res.data.dueAmount || 0));
    setActionMessage(
      res.data.invoiceId
        ? "Settlement invoice prepared from currently unbilled episode charges."
        : "No unbilled charges remain for this episode."
    );
    await refreshPreview();
  }

  async function collectFinalPayment() {
    if (!invoiceId) {
      setActionError("Prepare the final settlement invoice first.");
      return;
    }
    if (paymentAmount <= 0) {
      setActionError("Enter a payment amount greater than zero.");
      return;
    }
    if (paymentAmount > invoiceDue + 0.005) {
      setActionError("Payment cannot exceed the final settlement due.");
      return;
    }

    setPaymentLoading(true);
    setActionError("");

    const res = await collectPaymentAction({
      invoiceId,
      amount: paymentAmount,
      paymentMethod,
      notes: paymentNotes || undefined,
    });

    setPaymentLoading(false);

    if (!res.success || !res.data) {
      setActionError(res.error || "Payment could not be recorded.");
      return;
    }

    setInvoiceDue(Number(res.data.updatedDue || 0));
    setPaymentAmount(Number(res.data.updatedDue || 0));
    setPaymentNotes("");
    setActionMessage(
      "Payment recorded. Remaining final settlement due: " +
        formatCurrencyBDT(Number(res.data.updatedDue || 0))
    );
    await refreshPreview();
  }

  async function completeDischarge() {
    if (!preview?.episodeId) {
      setActionError("No active episode found.");
      return;
    }

    if (invoiceDue > 0.005 || Number(preview.episodeDue || 0) > 0.005) {
      setActionError("Settle all episode-level outstanding balances before discharge.");
      return;
    }

    if (Number(preview.total || 0) > 0.005) {
      setActionError("New unbilled charges exist. Prepare the final settlement again.");
      return;
    }

    if (!finalDiagnosis.trim()) {
      setActionError("Final diagnosis is required.");
      return;
    }

    setDischargeLoading(true);
    setActionError("");

    const res = await completeEpisodeDischargeAction({
      patientId,
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

    setActionMessage("Episode discharged successfully. Bed/cabin/critical-care resources are now in cleaning workflow.");
    setPreview(null);
    setInvoiceId("");
    setInvoiceNumber("");
    setInvoiceDue(0);
  }

  const canDischarge =
    !!preview &&
    Number(preview.total || 0) <= 0.005 &&
    Number(preview.episodeDue || 0) <= 0.005 &&
    invoiceDue <= 0.005 &&
    !!finalDiagnosis.trim();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black flex items-center gap-1.5"
      >
        <ReceiptText className="w-3.5 h-3.5" />
        Billing & Discharge
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-5xl max-h-[94vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-black text-slate-900">Episode Billing & Discharge</h2>
                <p className="text-xs text-slate-500">
                  Complete admission history → unbilled settlement → payment → discharge → resource release.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-slate-100" aria-label="Close">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loading && !preview ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
                </div>
              ) : preview ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Stat label="Current Unbilled" value={formatCurrencyBDT(preview.total)} danger={preview.total > 0.005} />
                    <Stat label="Episode Invoiced" value={formatCurrencyBDT(preview.episodeInvoiced)} />
                    <Stat label="Episode Paid" value={formatCurrencyBDT(preview.episodePaid)} />
                    <Stat label="Episode Due" value={formatCurrencyBDT(preview.episodeDue)} danger={preview.episodeDue > 0.005} />
                    <Stat label="Patient Lifetime Due" value={formatCurrencyBDT(preview.previousDue)} danger={preview.previousDue > 0.005} />
                  </div>

                  <section className="rounded-2xl border border-sky-200 bg-sky-50/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-sky-100 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-sky-700" />
                      <div>
                        <h3 className="text-sm font-black text-slate-900">Admission / Encounter History</h3>
                        <p className="text-[10px] text-slate-500">
                          Actual care-start time is preserved separately from record creation time.
                        </p>
                      </div>
                    </div>

                    {preview.encounters.length === 0 && preview.resources.length === 0 && preview.criticalCare.length === 0 ? (
                      <div className="p-4 text-xs text-slate-500">No services were found in this episode.</div>
                    ) : (
                      <div className="divide-y divide-sky-100">
                        {preview.encounters.map((item) => (
                          <div key={item.id} className="p-4 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
                            <div><LabelText text="Type" /><strong>{item.visit_type}</strong></div>
                            <div><LabelText text="Visit" /><strong>{item.visit_number || "—"}</strong></div>
                            <div><LabelText text="Doctor" /><strong>{item.doctor_name || "—"}</strong></div>
                            <div><LabelText text="Started" /><strong>{dt(item.admitted_at)}</strong></div>
                            <div><LabelText text="Status" /><strong>{item.status}</strong></div>
                          </div>
                        ))}

                        {preview.resources.map((item) => (
                          <div key={item.id} className="p-4 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
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

                        {preview.criticalCare.map((item) => (
                          <div key={item.id} className="p-4 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
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

                  <section className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b font-black text-sm">Current Unbilled Services</div>
                    {preview.lines.length === 0 ? (
                      <div className="p-5 text-xs text-slate-500">No unbilled current-episode services.</div>
                    ) : (
                      <div className="divide-y">
                        {preview.lines.map((line) => (
                          <div key={line.reference_id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                            <div>
                              <div className="font-bold text-slate-900">{line.item_name}</div>
                              <div className="text-[10px] text-slate-500">
                                {line.service_category} · {line.quantity} unit/day
                                {line.started_at ? " · Started " + dt(line.started_at) : ""}
                              </div>
                            </div>
                            <div className="font-mono font-black text-slate-900">{formatCurrencyBDT(line.total_price)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-black text-slate-900 text-sm">Final Settlement Invoice</div>
                        <div className="text-[11px] text-slate-500">Only not-yet-invoiced episode sources are included. If a new charge appears later, a supplemental invoice is created.</div>
                      </div>
                      <button type="button" onClick={() => void prepareSettlement()} disabled={loading} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black disabled:opacity-50">
                        {loading ? "Preparing..." : "Prepare / Refresh Settlement"}
                      </button>
                    </div>

                    {invoiceNumber && (
                      <div className="mt-3 flex items-center gap-2 text-xs font-bold">
                        <FileText className="w-4 h-4 text-indigo-700" />
                        Invoice {invoiceNumber}
                      </div>
                    )}

                    {invoiceId && (
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Stat label="Invoice Due" value={formatCurrencyBDT(invoiceDue)} danger={invoiceDue > 0.005} />
                        <Stat label="Episode Invoiced" value={formatCurrencyBDT(preview.episodeInvoiced)} />
                        <Stat label="Episode Paid" value={formatCurrencyBDT(preview.episodePaid)} />
                        <Stat label="Episode Due" value={formatCurrencyBDT(preview.episodeDue)} danger={preview.episodeDue > 0.005} />
                      </div>
                    )}
                  </section>

                  {invoiceId && invoiceDue > 0.005 && (
                    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
                      <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-emerald-700" />
                        Collect Final Payment
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <label className="text-xs font-bold text-slate-700">
                          Amount
                          <input type="number" min="0.01" max={invoiceDue} value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value))} className="mt-1 w-full px-3 py-2 border rounded-xl bg-white font-mono" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Method
                          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentRecord["payment_method"])} className="mt-1 w-full px-3 py-2 border rounded-xl bg-white">
                            <option value="CASH">Cash</option>
                            <option value="BKASH">bKash</option>
                            <option value="NAGAD">Nagad</option>
                            <option value="ROCKET">Rocket</option>
                            <option value="UPAY">UPAY</option>
                            <option value="VISA">Visa</option>
                            <option value="MASTERCARD">Mastercard</option>
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                          </select>
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          Note
                          <input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-xl bg-white" />
                        </label>
                      </div>
                      <button type="button" onClick={() => void collectFinalPayment()} disabled={paymentLoading} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black disabled:opacity-50">
                        {paymentLoading ? "Recording..." : "Confirm Payment"}
                      </button>
                    </section>
                  )}

                  <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 space-y-3">
                    <div className="font-black text-slate-900 text-sm">Complete Discharge</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="text-xs font-bold text-slate-700">
                        Discharge Type
                        <select value={dischargeType} onChange={(e) => setDischargeType(e.target.value as typeof dischargeType)} className="mt-1 w-full px-3 py-2 border rounded-xl bg-white">
                          <option>NORMAL</option><option>DOR</option><option>LAMA</option><option>REFERRED</option><option>DECEASED</option>
                        </select>
                      </label>
                      <label className="text-xs font-bold text-slate-700 md:col-span-2">
                        Final Diagnosis
                        <input value={finalDiagnosis} onChange={(e) => setFinalDiagnosis(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-xl bg-white" />
                      </label>
                    </div>
                    <label className="block text-xs font-bold text-slate-700">
                      Hospital Course
                      <textarea value={hospitalCourse} onChange={(e) => setHospitalCourse(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-xl bg-white min-h-20" />
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="text-xs font-bold text-slate-700">
                        Discharge Advice
                        <textarea value={dischargeAdvice} onChange={(e) => setDischargeAdvice(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-xl bg-white min-h-16" />
                      </label>
                      <label className="text-xs font-bold text-slate-700">
                        Follow-up
                        <textarea value={followup} onChange={(e) => setFollowup(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-xl bg-white min-h-16" />
                      </label>
                    </div>
                    <button type="button" onClick={() => void completeDischarge()} disabled={dischargeLoading || !canDischarge} className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black disabled:opacity-50 flex items-center gap-2">
                      {dischargeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {canDischarge ? "Complete Discharge & Release Resources" : "Settle All Charges Before Discharge"}
                    </button>
                  </section>

                  <section className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b font-black text-sm">Invoice & Payment History</div>
                    {preview.invoiceHistory.length === 0 ? (
                      <div className="p-4 text-xs text-slate-500">No invoice history for this patient/episode yet.</div>
                    ) : (
                      <div className="divide-y">
                        {preview.invoiceHistory.map((invoice) => (
                          <div key={invoice.id} className="p-4 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                              <div>
                                <div className="font-black text-slate-900">{invoice.invoice_number}</div>
                                <div className="text-[10px] text-slate-500">
                                  {dt(invoice.created_at)} · {invoice.is_episode_settlement ? "Episode Settlement" : "Patient Invoice"}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-mono font-black">{formatCurrencyBDT(invoice.grand_total)}</div>
                                <div className="text-[10px] text-slate-500">
                                  Paid {formatCurrencyBDT(invoice.paid_amount)} · Due {formatCurrencyBDT(invoice.due_amount)} · {invoice.status}
                                </div>
                              </div>
                            </div>

                            {invoice.items.length > 0 && (
                              <div className="pl-3 border-l-2 border-slate-200 space-y-1">
                                {invoice.items.map((item, idx) => (
                                  <div key={item.reference_id || String(idx)} className="flex justify-between gap-3 text-[10px] text-slate-600">
                                    <span>{item.item_name}</span>
                                    <span className="font-mono">{formatCurrencyBDT(item.total_price)}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {invoice.payments.length > 0 && (
                              <div className="pl-3 border-l-2 border-emerald-200 space-y-1">
                                {invoice.payments.map((payment) => (
                                  <div key={payment.receipt_number} className="flex justify-between gap-3 text-[10px] text-slate-500">
                                    <span>{payment.receipt_number} · {payment.payment_method} · {dt(payment.payment_date)}</span>
                                    <strong className="font-mono">{formatCurrencyBDT(payment.amount)}</strong>
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
              ) : (
                <div className="p-8 text-center text-sm text-slate-500">No active patient-care episode found for this patient.</div>
              )}

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

            <div className="px-5 py-4 border-t border-slate-200 flex justify-between items-center text-[11px] text-slate-500">
              <span>All timestamps and calculations are sourced from the authorized database.</span>
              <button type="button" onClick={() => void refreshPreview()} disabled={loading} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold disabled:opacity-50">
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] text-slate-500 font-bold uppercase">{label}</div>
      <div className={"mt-1 text-sm font-black " + (danger ? "text-rose-700" : "text-slate-900")}>{value}</div>
    </div>
  );
}

function LabelText({ text }: { text: string }) {
  return <span className="block text-[10px] text-slate-500 uppercase font-bold mb-0.5">{text}</span>;
}
