"use client";

import React, { useState, useEffect } from "react";
import { HeartHandshake } from "lucide-react";
import { ScholarshipApplication, getScholarshipApplicationsAction } from "@/lib/scholarship/actions";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";

export default function ScholarshipWelfarePage() {
  const [applications, setApplications] = useState<ScholarshipApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const res = await getScholarshipApplicationsAction();
      if (!isMounted) return;
      if (res.success && res.data) {
        setApplications(res.data);
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
            Patient Welfare & Financial Aid
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Scholarship & Zakat Welfare Funds
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review subsidy applications, hardship waivers, and charitable healthcare endowments.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800">
            Welfare Applications ({applications.length})
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading welfare applications...</div>
        ) : applications.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <HeartHandshake className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            No active scholarship or welfare requests.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Fund</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3">Approved</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{app.application_number}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{app.patients?.full_name || "Patient"}</td>
                    <td className="px-4 py-3">{app.welfare_funds?.fund_name || "General Fund"}</td>
                    <td className="px-4 py-3 font-mono">{formatCurrencyBDT(app.requested_amount)}</td>
                    <td className="px-4 py-3 font-mono text-emerald-600 font-bold">{formatCurrencyBDT(app.approved_amount)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-bold text-[10px]">
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDateBDT(app.created_at)}</td>
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
