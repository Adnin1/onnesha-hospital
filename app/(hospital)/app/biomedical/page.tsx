"use client";

import React, { useState, useEffect } from "react";
import { Cpu } from "lucide-react";
import { BiomedicalDevice, getBiomedicalDevicesAction } from "@/lib/biomedical/actions";
import { formatDateBDT } from "@/lib/utils";

export default function BiomedicalManagementPage() {
  const [devices, setDevices] = useState<BiomedicalDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const res = await getBiomedicalDevicesAction();
      if (!isMounted) return;
      if (res.success && res.data) {
        setDevices(res.data);
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
            Clinical Engineering & Device Safety
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Biomedical Equipment & Calibration Registry
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor medical equipment uptime, AERB radiation compliance, preventive maintenance, and calibration dates.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800">
            Registered Biomedical Devices ({devices.length})
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading biomedical equipment...</div>
        ) : devices.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <Cpu className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            No biomedical devices registered yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Device Name</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Serial #</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Calibration Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-800">{d.device_name}</td>
                    <td className="px-4 py-3">{d.model_number || "Standard"}</td>
                    <td className="px-4 py-3 font-mono">{d.serial_number}</td>
                    <td className="px-4 py-3">{d.department}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {d.calibration_expiry_date ? formatDateBDT(d.calibration_expiry_date) : "Valid"}
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
