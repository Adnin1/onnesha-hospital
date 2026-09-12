"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { MOCK_DOCTORS, MOCK_INVOICES } from "@/lib/mock-data";
import { formatCurrencyBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";

export default function ReportsManagementPage() {
  const [reportPeriod, setReportPeriod] = useState("today");

  const totalCollection = MOCK_INVOICES.reduce((acc, i) => acc + i.paid_amount, 0);
  const totalDues = MOCK_INVOICES.reduce((acc, i) => acc + i.due_amount, 0);
  const totalDiscounts = MOCK_INVOICES.reduce((acc, i) => acc + i.discount_amount, 0);

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
          documentTitle="DAILY EXECUTIVE FINANCIAL & REVENUE REPORT"
          documentNumber="REP-2026-0912"
          dateStr="12 Sep 2026"
        />

        {/* Top Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Gross Collection</span>
            <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">
              {formatCurrencyBDT(totalCollection)}
            </div>
            <span className="text-[10px] text-slate-400">Total cash + online receipts</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Outstanding Dues</span>
            <div className="text-2xl font-black text-amber-700 mt-1 font-mono">
              {formatCurrencyBDT(totalDues)}
            </div>
            <span className="text-[10px] text-slate-400">Collectable patient receivables</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Discounts Approved</span>
            <div className="text-2xl font-black text-slate-800 mt-1 font-mono">
              {formatCurrencyBDT(totalDiscounts)}
            </div>
            <span className="text-[10px] text-slate-400">Admin concession waivers</span>
          </div>
        </div>

        {/* Doctor Commission Payout Statement */}
        <div className="my-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">
            Doctor OPD Consultation & Commission Payouts
          </h3>
          <table className="w-full text-left text-xs border border-slate-200">
            <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
              <tr>
                <th className="p-2.5">Doctor Name & Department</th>
                <th className="p-2.5 text-center">Patients Served</th>
                <th className="p-2.5 text-right">Consultation Total</th>
                <th className="p-2.5 text-center">Comm. %</th>
                <th className="p-2.5 text-right">Hospital Share</th>
                <th className="p-2.5 text-right">Doctor Net Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {MOCK_DOCTORS.map((doc, idx) => {
                const patientsServed = 10 + idx * 2;
                const totalGross = patientsServed * doc.opd_fee;
                const commRate = doc.commission_rate || 20;
                const hospitalShare = (totalGross * commRate) / 100;
                const doctorPayable = totalGross - hospitalShare;

                return (
                  <tr key={doc.id}>
                    <td className="p-2.5 font-semibold text-slate-900">
                      {doc.full_name}
                      <span className="block text-[10px] text-slate-500 font-normal">
                        {doc.department_name}
                      </span>
                    </td>
                    <td className="p-2.5 text-center font-mono text-slate-700">
                      {patientsServed}
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-800">
                      {formatCurrencyBDT(totalGross)}
                    </td>
                    <td className="p-2.5 text-center font-mono text-slate-600">
                      {commRate}%
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-700">
                      {formatCurrencyBDT(hospitalShare)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                      {formatCurrencyBDT(doctorPayable)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <HospitalPrintFooter />
      </div>
    </div>
  );
}
