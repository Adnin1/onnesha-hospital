import React from "react";
import { Truck, Plus } from "lucide-react";

export default function AmbulancePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Truck className="h-7 w-7 text-sky-600" />
            Ambulance & Emergency Transport Dispatch
          </h1>
          <p className="text-sm text-slate-500">
            Emergency Fleet Logistics, Trip Booking & Central Billing Linkage
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          Dispatch Ambulance Trip
        </button>
      </div>

      {/* Fleet Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fleet Readiness</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">3 / 4 Available</p>
          <span className="text-xs text-emerald-600 font-medium">1 In Transit</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">ICU-Equipped</span>
          <p className="text-2xl font-bold text-sky-600 mt-1">2 Vehicles</p>
          <span className="text-xs text-slate-500">Ventilator & Oxygen onboard</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today Completed Trips</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">6 Trips</p>
          <span className="text-xs text-slate-500">100% On-time Dispatch</span>
        </div>
      </div>

      {/* Active Trips & Fleet Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-900">
            Current Dispatched Trips
          </h2>
          <span className="text-xs text-slate-500 font-medium">Auto-Linked to Central Billing</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Trip Number</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Pickup Location</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Fare Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">TRIP-2026-0081</td>
                <td className="px-4 py-3 font-medium text-slate-900">DHK-METRO-11-2041 (ICU)</td>
                <td className="px-4 py-3 text-xs text-slate-600">Rafiqul Islam</td>
                <td className="px-4 py-3 text-xs">Uttara Sector 7, Dhaka</td>
                <td className="px-4 py-3 text-xs">Onnesha Emergency Gate</td>
                <td className="px-4 py-3 font-semibold text-slate-900">৳ 2,500.00</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-sky-100 text-sky-800 rounded font-medium">In Transit</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
