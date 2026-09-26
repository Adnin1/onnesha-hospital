"use client";

import React, { useState, useEffect } from "react";
import { Bed } from "lucide-react";
import { DaycareAdmission, getDaycareAdmissionsAction } from "@/lib/daycare/actions";
import { formatDateBDT } from "@/lib/utils";

export default function DaycareManagementPage() {
  const [admissions, setAdmissions] = useState<DaycareAdmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const res = await getDaycareAdmissionsAction();
      if (!isMounted) return;
      if (res.success && res.data) {
        setAdmissions(res.data);
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
            Short-Stay & Ambulatory Surgery
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Day Care & Ambulatory Observation
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Same-day minor procedures, post-chemotherapy, dialysis observation, and rapid discharge care.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800">
            Daycare Patients ({admissions.length})
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading daycare records...</div>
        ) : admissions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <Bed className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            No active daycare admissions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Admission #</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Procedure</th>
                  <th className="px-4 py-3">Admitted At</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admissions.map((adm) => (
                  <tr key={adm.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{adm.admission_number}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{adm.patients?.full_name || "Patient"}</td>
                    <td className="px-4 py-3">{adm.procedure_name}</td>
                    <td className="px-4 py-3 text-slate-400">{formatDateBDT(adm.admitted_at)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-bold text-[10px]">
                        {adm.status}
                      </span>
                    </td>
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
