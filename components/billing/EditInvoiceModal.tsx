"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Edit3,
  AlertCircle,
  Loader2,
  Save,
  Calculator,
  Users,
  Percent,
  CheckCircle2,
  UserX,
} from "lucide-react";
import { InvoiceRecord, InvoiceItemRecord } from "@/types/billing";
import { editInvoiceAction } from "@/lib/billing/actions";
import { searchReferralAgentsForBillingAction } from "@/lib/referrals/actions";
import { formatCurrencyBDT } from "@/lib/utils";

interface ReferralAgentOption {
  id: string;
  agent_code: string;
  full_name: string;
  agent_type: string;
  phone?: string;
  commission_rate_percent: number;
  is_commission_eligible: boolean;
}

interface EditInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: InvoiceRecord | null;
  onSuccess: (updatedInvoice: { subtotal: number; grandTotal: number; dueAmount: number }) => void;
}

export function EditInvoiceModal({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}: EditInvoiceModalProps) {
  const [items, setItems] = useState<
    Array<{
      category: InvoiceItemRecord["service_category"];
      itemName: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
      referenceId?: string;
    }>
  >([]);

  // New item draft inputs
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<InvoiceItemRecord["service_category"]>("MISC");
  const [newItemPrice, setNewItemPrice] = useState<number | "">("");
  const [newItemQty, setNewItemQty] = useState<number | "">(1);

  // Discount and Tax
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>("");
  const [taxAmount, setTaxAmount] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>("");

  // Referral Agent Dynamic State
  const [referralAgents, setReferralAgents] = useState<ReferralAgentOption[]>([]);
  const [selectedReferralAgentId, setSelectedReferralAgentId] = useState<string>("00000000-0000-0000-0000-000000000000");
  const [loadingAgents, setLoadingAgents] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice) return;
    const mapped = (invoice.items || []).map((it) => ({
      category: it.service_category,
      itemName: it.item_name,
      unitPrice: Number(it.unit_price || 0),
      quantity: Number(it.quantity || 1),
      totalPrice: Number(it.total_price || (it.unit_price * (it.quantity || 1))),
      referenceId: it.reference_id || undefined,
    }));
    setItems(mapped);
    setDiscountAmount(Number(invoice.discount_amount || 0));
    setDiscountReason(invoice.discount_reason || "");
    setTaxAmount(Number(invoice.tax_amount || 0));
    setEditNotes("");
    setErrorMsg(null);

    // Initialize Referral Agent selection from invoice
    const initialAgentId = invoice.referral_agent_id || "00000000-0000-0000-0000-000000000000";
    setSelectedReferralAgentId(initialAgentId);

    // Fetch active referral agents for dynamic attribution
    let isMounted = true;
    async function loadAgents() {
      setLoadingAgents(true);
      try {
        const res = await searchReferralAgentsForBillingAction();
        if (isMounted && res.success && res.data) {
          setReferralAgents(res.data);
        }
      } catch (err) {
        console.warn("Could not load referral agents for bill editing:", err);
      } finally {
        if (isMounted) {
          setLoadingAgents(false);
        }
      }
    }
    loadAgents();

    return () => {
      isMounted = false;
    };
  }, [invoice]);

  if (!isOpen || !invoice) return null;

  // Real-time calculations
  const subtotal = items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
  const calculatedGrandTotal = Math.max(0, subtotal - discountAmount + taxAmount);
  const paidAmount = Number(invoice.paid_amount || 0);
  const calculatedDue = Math.max(0, calculatedGrandTotal - paidAmount);

  // Referral Agent Commission Calculations
  const isDirectPatient =
    !selectedReferralAgentId ||
    selectedReferralAgentId === "00000000-0000-0000-0000-000000000000" ||
    selectedReferralAgentId.toLowerCase() === "none";

  const selectedAgent = referralAgents.find((a) => a.id === selectedReferralAgentId) || (
    invoice.referral_agent && invoice.referral_agent.id === selectedReferralAgentId ? {
      id: invoice.referral_agent.id,
      agent_code: invoice.referral_agent.agent_code,
      full_name: invoice.referral_agent.full_name,
      agent_type: invoice.referral_agent.agent_type || "OTHER",
      phone: invoice.referral_agent.phone || "",
      commission_rate_percent: Number(invoice.referral_agent.commission_rate_percent || 10),
      is_commission_eligible: invoice.referral_agent.is_commission_eligible ?? true,
    } : null
  );

  const initialAgentId = invoice.referral_agent_id || "00000000-0000-0000-0000-000000000000";
  const agentHasChanged = selectedReferralAgentId !== initialAgentId;
  const commissionRate = selectedAgent ? Number(selectedAgent.commission_rate_percent || 10) : 0;
  const isCommissionEligible = selectedAgent ? (selectedAgent.is_commission_eligible !== false) : false;
  const estimatedCommission = isCommissionEligible
    ? Math.round((calculatedGrandTotal * commissionRate / 100) * 100) / 100
    : 0;

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItemName.trim()) {
      setErrorMsg("অনুগ্রহ করে সেবার নাম লিখুন।");
      return;
    }
    const price = typeof newItemPrice === "number" ? newItemPrice : 0;
    const qty = typeof newItemQty === "number" ? newItemQty : 1;
    if (price <= 0) {
      setErrorMsg("মূল্য অবশ্যই ০ এর বেশি হতে হবে।");
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        category: newItemCategory,
        itemName: newItemName.trim(),
        unitPrice: price,
        quantity: qty,
        totalPrice: price * qty,
      },
    ]);

    setNewItemName("");
    setNewItemPrice("");
    setNewItemQty(1);
    setErrorMsg(null);
  }

  function handleRemoveItem(index: number) {
    if (items.length <= 1) {
      setErrorMsg("ইনভয়েসে কমপক্ষে একটি আইটেম থাকতে হবে।");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
    setErrorMsg(null);
  }

  function handleUpdateItem(index: number, field: "quantity" | "unitPrice", val: number) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const newQty = field === "quantity" ? Math.max(0.01, val) : it.quantity;
        const newPrice = field === "unitPrice" ? Math.max(0, val) : it.unitPrice;
        return {
          ...it,
          quantity: newQty,
          unitPrice: newPrice,
          totalPrice: Math.round(newQty * newPrice * 100) / 100,
        };
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;

    if (items.length === 0) {
      setErrorMsg("ইনভয়েসে কমপক্ষে একটি আইটেম থাকা আবশ্যক।");
      return;
    }

    if (!editNotes.trim()) {
      setErrorMsg("বিল পরিবর্তনের অডিট কারণ/নোট লেখা বাধ্যতামূলক (Audit reason is mandatory for fraud prevention)।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await editInvoiceAction({
        invoiceId: invoice.id,
        items: items.map((it) => ({
          category: it.category,
          itemName: it.itemName,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          referenceId: it.referenceId,
        })),
        discountAmount,
        discountReason: discountReason.trim() || "Bill edited by authorized staff",
        taxAmount,
        referralAgentId: selectedReferralAgentId,
        notes: editNotes.trim(),
      });

      if (res.success && res.data) {
        onSuccess({
          subtotal: res.data.subtotal,
          grandTotal: res.data.grandTotal,
          dueAmount: res.data.dueAmount,
        });
        onClose();
      } else {
        setErrorMsg(res.error || "বিল আপডেট করতে ব্যর্থ হয়েছে।");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error editing invoice");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <Edit3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                বিল সম্পাদনা ও সংশোধন (Edit & Modify Billing Invoice)
              </h2>
              <p className="text-xs text-slate-300 font-mono">
                Invoice No: {invoice.invoice_number} • Patient: {invoice.patient?.full_name} ({invoice.patient?.patient_code})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Line Items List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                ইনভয়েস আইটেম ও সেবাসমূহ ({items.length} Items)
              </span>
              <span className="text-slate-500 font-medium text-[11px]">
                Subtotal: <strong className="text-slate-900 font-mono">{formatCurrencyBDT(subtotal)}</strong>
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">সেবা / আইটেমের নাম</th>
                    <th className="p-2.5">ক্যাটেগরি</th>
                    <th className="p-2.5 text-right w-24">একক মূল্য (BDT)</th>
                    <th className="p-2.5 text-center w-20">পরিমাণ</th>
                    <th className="p-2.5 text-right w-24">মোট (BDT)</th>
                    <th className="p-2.5 text-center w-12">মুছুন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="p-2.5 font-medium text-slate-900">{it.itemName}</td>
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 text-[9px] bg-slate-100 text-slate-700 rounded font-semibold uppercase">
                          {it.category}
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.unitPrice}
                          onChange={(e) => handleUpdateItem(idx, "unitPrice", Number(e.target.value))}
                          className="w-20 px-1.5 py-1 border border-slate-300 rounded text-right font-mono font-semibold"
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={it.quantity}
                          onChange={(e) => handleUpdateItem(idx, "quantity", Number(e.target.value))}
                          className="w-14 px-1.5 py-1 border border-slate-300 rounded text-center font-mono font-semibold"
                        />
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                        {formatCurrencyBDT(it.unitPrice * it.quantity)}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50"
                          title="আইটেম মুছুন"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add New Line Item Box */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="font-bold text-slate-700 block text-[11px]">
              + নতুন আইটেম বা চার্জ যোগ করুন (Add Service Line)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-5">
                <label className="text-[10px] text-slate-500 block mb-0.5">আইটেমের নাম</label>
                <input
                  type="text"
                  placeholder="e.g. CBC Test / Cabin Rent / Doctor Visit"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="text-[10px] text-slate-500 block mb-0.5">ক্যাটেগরি</label>
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value as InvoiceItemRecord["service_category"])}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                >
                  <option value="CONSULTATION">CONSULTATION</option>
                  <option value="LAB">LAB</option>
                  <option value="XRAY">XRAY</option>
                  <option value="USG">USG</option>
                  <option value="ECG">ECG</option>
                  <option value="BED">BED</option>
                  <option value="CABIN">CABIN</option>
                  <option value="OT">OT</option>
                  <option value="PHARMACY">PHARMACY</option>
                  <option value="AMBULANCE">AMBULANCE</option>
                  <option value="MISC">MISC</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-slate-500 block mb-0.5">মূল্য (BDT)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> যোগ করুন
                </button>
              </div>
            </div>
          </div>

          {/* Discount & Adjustments */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-amber-50/50 border border-amber-200 rounded-xl">
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                ছাড় / ডিসকাউন্ট (Discount Amount in BDT)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                ডিসকাউন্টের কারণ (Discount Justification)
              </label>
              <input
                type="text"
                placeholder="e.g. Poor patient waiver / Chairman special concession"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs"
              />
            </div>
          </div>

          {/* Referral Agent & Dynamic Commission Attribution */}
          <div className="p-4 bg-gradient-to-br from-indigo-50/80 via-white to-blue-50/60 border border-indigo-200 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-2xs">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 text-xs block flex items-center gap-1.5">
                    রেফারাল এজেন্ট / দালাল সমন্বয় (Referral Agent Attribution)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    বিল সংশোধনকালে রেফারাল এজেন্ট যুক্ত, পরিবর্তন বা বাদ দিলে কমিশন স্বয়ংক্রিয়ভাবে ডাটাবেজে আপডেট হবে
                  </span>
                </div>
              </div>
              {loadingAgents && (
                <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>এজেন্ট তালিকা লোড হচ্ছে...</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
              <div className="sm:col-span-7 flex flex-col justify-between">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    রেফারাল এজেন্ট নির্বাচন করুন (Select Referral Agent)
                  </label>
                  <select
                    value={selectedReferralAgentId}
                    onChange={(e) => setSelectedReferralAgentId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-hidden transition shadow-2xs"
                  >
                    <option value="00000000-0000-0000-0000-000000000000">
                      -- সরাসরি রোগী / কোনো রেফারাল এজেন্ট নেই (Direct Patient) --
                    </option>
                    {selectedReferralAgentId !== "00000000-0000-0000-0000-000000000000" &&
                      selectedReferralAgentId &&
                      !referralAgents.some((a) => a.id === selectedReferralAgentId) && (
                        <option value={selectedReferralAgentId}>
                          [বর্তমান এজেন্ট] {invoice.referral_agent?.full_name || selectedReferralAgentId}
                        </option>
                      )}
                    {referralAgents.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        [{ag.agent_code}] {ag.full_name} ({ag.agent_type}) — কমিশন {ag.commission_rate_percent}%
                        {!ag.is_commission_eligible ? " (Non-commissionable)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  {!isDirectPatient && (
                    <button
                      type="button"
                      onClick={() => setSelectedReferralAgentId("00000000-0000-0000-0000-000000000000")}
                      className="text-[10px] text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <UserX className="h-3 w-3" /> রেফারাল এজেন্ট মুছে সরাসরি রোগী করুন
                    </button>
                  )}
                </div>
              </div>

              <div className="sm:col-span-5">
                <div className="h-full p-3 bg-white border border-indigo-100 rounded-xl shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] text-slate-500 font-semibold flex items-center justify-between border-b border-slate-100 pb-1">
                      <span>লাইভ কমিশন প্রাক্কলন:</span>
                      <span className="font-mono text-indigo-600 font-bold flex items-center gap-0.5">
                        <Percent className="h-3 w-3 inline" /> {commissionRate}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-sm font-black font-mono text-indigo-700">
                        {formatCurrencyBDT(estimatedCommission)}
                      </span>
                      <span className="text-[9px] font-medium text-slate-400">
                        (বিল: {formatCurrencyBDT(calculatedGrandTotal)})
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 text-[10px]">
                    {isDirectPatient ? (
                      <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-50 px-2 py-0.5 rounded font-medium">
                        <CheckCircle2 className="h-3 w-3 text-slate-400" /> সরাসরি রোগী (কোনো কমিশন নেই)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> {selectedAgent?.full_name || "এজেন্ট"} কমিশন পাবেন
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Status / Transition Warning */}
            {agentHasChanged && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[10px] flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold block">এজেন্ট পরিবর্তনের সতর্কতা (Audit Alert):</span>
                  <span>
                    {isDirectPatient
                      ? "রেফারাল এজেন্ট মুছে ফেলা হচ্ছে। বিল সংরক্ষণ করলে পূর্বের কমিশন ডাটাবেজ থেকে বাদ যাবে এবং মোট অর্জিত ব্যালেন্স হ্রাস পাবে।"
                      : `এজেন্ট পরিবর্তিত হয়েছে। বিল সংরক্ষণ করলে নতুন এজেন্ট (${selectedAgent?.full_name}) এর জন্য ${commissionRate}% হারে ৳${estimatedCommission} কমিশন যুক্ত হবে এবং পূর্বের হিসাব সমন্বয় হবে।`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Financial Recalculation Summary */}
          <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase tracking-wider text-[11px] mb-1">
              <Calculator className="h-4 w-4" />
              <span>সংশোধিত আর্থিক হিসাব (Recalculated Financial Ledger)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 text-[10px] block">Subtotal:</span>
                <span className="font-mono font-bold text-slate-100">{formatCurrencyBDT(subtotal)}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Discount:</span>
                <span className="font-mono font-bold text-amber-400">-{formatCurrencyBDT(discountAmount)}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Grand Total:</span>
                <span className="font-mono font-black text-emerald-400 text-sm">
                  {formatCurrencyBDT(calculatedGrandTotal)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">New Due Balance:</span>
                <span className="font-mono font-black text-rose-400 text-sm">
                  {formatCurrencyBDT(calculatedDue)}
                </span>
                <span className="text-[9px] text-slate-400 block">
                  (Paid: {formatCurrencyBDT(paidAmount)})
                </span>
              </div>
            </div>
          </div>

          {/* Audit Reason */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              বিল পরিবর্তনের কারণ / অডিট নোট (Edit Audit Notes) *
            </label>
            <input
              type="text"
              placeholder="e.g. Item price adjustment / Added missing investigation / Referral agent updated"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
              required
            />
          </div>

          {/* Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              বাতিল (Cancel)
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  সংরক্ষণ করা হচ্ছে...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  বিল সংশোধন নিশ্চিত করুন (Save & Update Bill)
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
