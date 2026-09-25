"use client";

import React, { useState, useEffect } from "react";
import { Truck, Plus, Loader2 } from "lucide-react";
import {
  getAmbulanceTripsAction,
  getAmbulanceFleetAction,
  AmbulanceTrip,
  AmbulanceVehicle,
} from "@/lib/ambulance/actions";

export default function AmbulancePage() {
  const [trips, setTrips] = useState<AmbulanceTrip[]>([]);
  const [fleet, setFleet] = useState<AmbulanceVehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setErrorMsg(null);
      const [tripsRes, fleetRes] = await Promise.all([
        getAmbulanceTripsAction(),
        getAmbulanceFleetAction(),
      ]);

      if (!isMounted) return;

      if (tripsRes.success && tripsRes.data) {
        setTrips(tripsRes.data);
      }
      if (fleetRes.success && fleetRes.data) {
        setFleet(fleetRes.data);
      }
      if (!tripsRes.success) {
        setErrorMsg(tripsRes.error || "Failed to load ambulance trips.");
      }
      setLoading(false);
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const availableVehicles = fleet.filter((v) => v.is_available).length;
  const icuVehicles = fleet.filter((v) => v.vehicle_type === "icu_equipped").length;

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
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Dispatch Ambulance Trip
        </button>
      </div>

      {/* Fleet Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fleet Readiness</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {availableVehicles} / {fleet.length} Available
          </p>
          <span className="text-xs text-emerald-600 font-medium">Ready for immediate dispatch</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">ICU-Equipped</span>
          <p className="text-2xl font-bold text-sky-600 mt-1">
            {icuVehicles} Vehicles
          </p>
          <span className="text-xs text-slate-500">Ventilator & Oxygen onboard</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recorded Trips</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {trips.length} Total
          </p>
          <span className="text-xs text-slate-500">Auto-linked to emergency billing</span>
        </div>
      </div>

      {/* Active Trips & Fleet Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-900">
            Dispatched Ambulance Trips
          </h2>
          <span className="text-xs text-slate-500 font-medium">Auto-Linked to Central Billing</span>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-50 border-b border-red-200 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

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
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-sky-500" />
                    <p className="mt-2 text-xs">Loading ambulance trips...</p>
                  </td>
                </tr>
              ) : trips.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    <Truck className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No active or recorded ambulance trips.</p>
                    <p className="text-xs text-slate-400">Dispatch an emergency transport unit from the emergency casualty console to track trips here.</p>
                  </td>
                </tr>
              ) : (
                trips.map((trip) => (
                  <tr key={trip.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">{trip.trip_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {trip.ambulance_vehicles?.vehicle_number || "Ambulance"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {trip.ambulance_vehicles?.driver_name || "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-xs">{trip.pickup_location}</td>
                    <td className="px-4 py-3 text-xs">{trip.drop_location}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">৳ {trip.fare_amount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs bg-sky-100 text-sky-800 rounded font-medium capitalize">
                        {trip.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
