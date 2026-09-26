"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { InsuranceClaim, getInsuranceClaimsAction } from "@/lib/insurance/actions";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";

export default function InsuranceManagementPage() {
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const res = await getInsuranceClaimsAction();
      if (!isMounted) return;
      if (res.success && res.data) {
        setClaims(res.data);
      }
      setLoading(false);
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex justify-between items-center">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Third-Party Payer & Corporate Claims
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Insurance Claims & Pre-Authorization
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track payer submissions, pre-authorization codes, disallowed deductions, and settlement disbursements.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800">
            Claims Submissions ({claims.length})
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading insurance claims...</div>
        ) : claims.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <ShieldCheck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            No insurance claims registered yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Claim #</th>
                  <th className="px-4 py-3">Payer</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Claim Amount</th>
                  <th className="px-4 py-3">Approved Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{c.claim_number}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{c.insurance_payers?.payer_name || "Payer"}</td>
                    <td className="px-4 py-3">{c.patients?.full_name || "Patient"}</td>
                    <td className="px-4 py-3 font-mono">{formatCurrencyBDT(c.claim_amount)}</td>
                    <td className="px-4 py-3 font-mono text-emerald-600 font-bold">{formatCurrencyBDT(c.approved_amount)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-bold text-[10px]">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDateBDT(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
