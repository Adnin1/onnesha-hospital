"use client";

import React, { useState, useEffect } from "react";
import { Truck, Plus, Loader2, CheckCircle2, Navigation, CheckCircle } from "lucide-react";
import {
  getAmbulanceTripsAction,
  getAmbulanceFleetAction,
  updateAmbulanceTripStatusAction,
  AmbulanceTrip,
  AmbulanceVehicle,
} from "@/lib/ambulance/actions";
import { DispatchAmbulanceModal } from "@/components/ambulance/DispatchAmbulanceModal";

export default function AmbulancePage() {
  const [trips, setTrips] = useState<AmbulanceTrip[]>([]);
  const [fleet, setFleet] = useState<AmbulanceVehicle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modal
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
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
    void fetchData();
    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  function showSuccess(msg: string) {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  }

  async function handleStatusUpdate(
    tripId: string,
    newStatus: "in_transit" | "completed"
  ) {
    const res = await updateAmbulanceTripStatusAction({ tripId, status: newStatus });
    if (res.success) {
      showSuccess(
        newStatus === "in_transit"
          ? "অ্যাম্বুলেন্সের যাত্রা শুরু মার্ক করা হয়েছে।"
          : "অ্যাম্বুলেন্স ট্রিপ সফলভাবে সম্পন্ন হয়েছে।"
      );
      setRefreshKey((k) => k + 1);
    } else {
      setErrorMsg(res.error || "স্ট্যাটাস আপডেট করতে ব্যর্থ হয়েছে।");
    }
  }

  const availableVehicles = fleet.filter((v) => v.is_available).length;
  const icuVehicles = fleet.filter((v) => v.vehicle_type === "icu_equipped").length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 p-4 bg-emerald-600 text-white text-xs font-bold rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="h-5 w-5" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header */}
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
          onClick={() => setIsDispatchModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Dispatch Ambulance Trip
        </button>
      </div>

      {/* Fleet Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fleet Readiness</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {availableVehicles} / {fleet.length} Available
          </p>
          <span className="text-xs text-emerald-600 font-medium">Ready for immediate dispatch</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">ICU-Equipped</span>
          <p className="text-2xl font-bold text-sky-600 mt-1">
            {icuVehicles} Vehicles
          </p>
          <span className="text-xs text-slate-500">Ventilator & Oxygen onboard</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recorded Trips</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {trips.length} Total
          </p>
          <span className="text-xs text-slate-500">Auto-linked to emergency billing</span>
        </div>
      </div>

      {/* Active Trips & Fleet Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-900">
            Dispatched Ambulance Trips ({trips.length})
          </h2>
          <span className="text-xs text-slate-500 font-medium">Live Emergency Coordination</span>
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
                <th className="px-4 py-3">Trip No</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Pickup Location</th>
                <th className="px-4 py-3">Drop Destination</th>
                <th className="px-4 py-3">Fare (BDT)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-sky-500" />
                    <p className="mt-2 text-xs">Loading emergency transport fleet...</p>
                  </td>
                </tr>
              ) : trips.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    <Truck className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">No active ambulance trips dispatched.</p>
                    <p className="text-xs text-slate-400">Click &ldquo;Dispatch Ambulance Trip&rdquo; above to book emergency transport.</p>
                  </td>
                </tr>
              ) : (
                trips.map((trip) => (
                  <tr key={trip.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">{trip.trip_number}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 text-xs">{trip.ambulance_vehicles?.vehicle_number}</p>
                      <p className="text-[11px] text-slate-500">
                        {trip.ambulance_vehicles?.vehicle_type.toUpperCase()} • Driver: {trip.ambulance_vehicles?.driver_name}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 text-xs">{trip.patients?.full_name || "Emergency Patient"}</p>
                      <p className="font-mono text-[11px] text-slate-500">{trip.patients?.phone || trip.patients?.patient_code || ""}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">{trip.pickup_location}</td>
                    <td className="px-4 py-3 text-xs">{trip.drop_location}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 text-xs">৳{trip.fare_amount}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded font-medium capitalize ${
                        trip.status === "in_transit"
                          ? "bg-amber-100 text-amber-800"
                          : trip.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-sky-100 text-sky-800"
                      }`}>
                        {trip.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {trip.status === "dispatched" && (
                        <button
                          type="button"
                          onClick={() => void handleStatusUpdate(trip.id, "in_transit")}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                          title="যাত্রা শুরু চিহ্নিত করুন"
                        >
                          <Navigation className="h-3 w-3" />
                          যাত্রা শুরু
                        </button>
                      )}
                      {trip.status === "in_transit" && (
                        <button
                          type="button"
                          onClick={() => void handleStatusUpdate(trip.id, "completed")}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                          title="পৌঁছেছে ও ট্রিপ সম্পন্ন"
                        >
                          <CheckCircle className="h-3 w-3" />
                          পৌঁছেছে
                        </button>
                      )}
                      {trip.status === "completed" && (
                        <span className="text-xs text-slate-400">সম্পন্ন</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dispatch Ambulance Modal */}
      <DispatchAmbulanceModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        fleet={fleet}
        onSuccess={(newTrip) => {
          setTrips((prev) => [newTrip, ...prev]);
          showSuccess("অ্যাম্বুলেন্স সফলভাবে প্রেরণ (Dispatch) করা হয়েছে।");
        }}
      />
    </div>
  );
}
