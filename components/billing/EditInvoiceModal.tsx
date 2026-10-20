"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, Edit3, AlertCircle, Loader2, Save, Calculator } from "lucide-react";
import { InvoiceRecord, InvoiceItemRecord } from "@/types/billing";
import { editInvoiceAction } from "@/lib/billing/actions";
import { formatCurrencyBDT } from "@/lib/utils";

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
  }, [invoice]);

  if (!isOpen || !invoice) return null;

  // Real-time calculations
  const subtotal = items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
  const calculatedGrandTotal = Math.max(0, subtotal - discountAmount + taxAmount);
  const paidAmount = Number(invoice.paid_amount || 0);
  const calculatedDue = Math.max(0, calculatedGrandTotal - paidAmount);

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
              placeholder="e.g. Item price adjustment / Added missing investigation"
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
