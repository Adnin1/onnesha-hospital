"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  DollarSign,
  TrendingUp,
  Stethoscope,
  Microscope,
  Bed,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { InvoiceRecord } from "@/types/billing";
import { DoctorRecord } from "@/types/appointments";
import { getInvoicesAction } from "@/lib/billing/actions";
import { getDoctorsAction } from "@/lib/appointments/actions";
import { formatCurrencyBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";

export default function ReportsManagementPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [reportPeriod, setReportPeriod] = useState("all");

  const loadData = async () => {
    setLoading(true);
    try {
      const [invRes, docRes] = await Promise.all([
        getInvoicesAction({ limit: 100 }),
        getDoctorsAction(),
      ]);

      if (invRes.success && invRes.data) {
        setInvoices(invRes.data.invoices);
      }
      if (docRes.success && docRes.data) {
        setDoctors(docRes.data.doctors);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [invRes, docRes] = await Promise.all([
          getInvoicesAction({ limit: 100 }),
          getDoctorsAction(),
        ]);

        if (isMounted) {
          if (invRes.success && invRes.data) {
            setInvoices(invRes.data.invoices);
          }
          if (docRes.success && docRes.data) {
            setDoctors(docRes.data.doctors);
          }
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalCollection = invoices.reduce((acc, i) => acc + (i.is_voided ? 0 : Number(i.paid_amount || 0)), 0);
  const totalDues = invoices.reduce((acc, i) => acc + (i.is_voided ? 0 : Number(i.due_amount || 0)), 0);
  const totalDiscounts = invoices.reduce((acc, i) => acc + (i.is_voided ? 0 : Number(i.discount_amount || 0)), 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Financial & Clinical Audits
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Revenue Analytics & Executive Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cashier collections, doctor commission payouts, outstanding dues, and departmental billing totals.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh reports"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition"
          >
            <Printer className="w-4 h-4 mr-1.5 text-sky-400" />
            Print Financial Summary
          </button>
        </div>
      </div>

      {/* Main Report Document */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs print-pad">
        <HospitalPrintHeader
          documentTitle="EXECUTIVE FINANCIAL & REVENUE AUDIT REPORT"
          documentNumber={`REP-${new Date().toISOString().slice(0, 10)}`}
          dateStr={new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        />

        {/* Top Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Gross Collection</span>
            <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">
              {loading ? "..." : formatCurrencyBDT(totalCollection)}
            </div>
            <span className="text-[10px] text-slate-400">Total cash + online receipts ({invoices.length} invoices)</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Outstanding Dues</span>
            <div className="text-2xl font-black text-amber-700 mt-1 font-mono">
              {loading ? "..." : formatCurrencyBDT(totalDues)}
            </div>
            <span className="text-[10px] text-slate-400">Collectable patient receivables</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Discounts Approved</span>
            <div className="text-2xl font-black text-slate-800 mt-1 font-mono">
              {loading ? "..." : formatCurrencyBDT(totalDiscounts)}
            </div>
            <span className="text-[10px] text-slate-400">Admin concession waivers</span>
          </div>
        </div>

        {/* Doctor Commission Payout Statement */}
        <div className="my-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">
            Doctor OPD Consultation Roster & Commission Baseline
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Doctor Name & Specialization</th>
                  <th className="p-2.5 text-center">Room</th>
                  <th className="p-2.5 text-right">Consultation Fee</th>
                  <th className="p-2.5 text-center">Comm. %</th>
                  <th className="p-2.5 text-right">Hospital Share</th>
                  <th className="p-2.5 text-right">Doctor Net Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-slate-400">
                      Loading doctor rosters...
                    </td>
                  </tr>
                ) : doctors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-slate-400">
                      No doctors registered.
                    </td>
                  </tr>
                ) : (
                  doctors.map((doc) => {
                    const fee = doc.opd_fee || 800;
                    const commRate = 20; // 20% default hospital facility fee
                    const hospitalShare = (fee * commRate) / 100;
                    const doctorNet = fee - hospitalShare;

                    return (
                      <tr key={doc.id}>
                        <td className="p-2.5 font-semibold text-slate-900">
                          {doc.full_name}
                          <span className="block text-[10px] text-slate-500 font-normal">
                            {doc.specialization} • BMDC: {doc.bmdc_reg_number}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-mono text-slate-700">
                          Room {doc.room_number || "101"}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-800">
                          {formatCurrencyBDT(fee)}
                        </td>
                        <td className="p-2.5 text-center font-mono text-slate-600">
                          {commRate}%
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-700">
                          {formatCurrencyBDT(hospitalShare)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                          {formatCurrencyBDT(doctorNet)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <HospitalPrintFooter />
      </div>
    </div>
  );
}
