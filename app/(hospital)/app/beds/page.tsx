"use client";

import React, { useState, useEffect } from "react";
import {
  Bed as BedIcon,
  CheckCircle2,
  Sparkles,
  UserCheck,
  Building,
  Filter,
  Wrench,
  DoorOpen,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { BedRecord, CabinRecord, WardRecord } from "@/types/beds-ot";
import {
  getBedsAndCabinsAction,
  updateBedStatusAction,
  vacateBedAction,
} from "@/lib/ipd/bed-actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function BedManagementPage() {
  const [loading, setLoading] = useState(true);
  const [beds, setBeds] = useState<BedRecord[]>([]);
  const [cabins, setCabins] = useState<CabinRecord[]>([]);
  const [wards, setWards] = useState<WardRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"beds" | "cabins">("beds");
  const [selectedWard, setSelectedWard] = useState("all");
  const [activeBedModal, setActiveBedModal] = useState<BedRecord | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getBedsAndCabinsAction();
      if (res.success && res.data) {
        setBeds(res.data.beds);
        setCabins(res.data.cabins);
        setWards(res.data.wards);
      } else {
        setErrorMsg(res.error || "Failed to load beds data");
      }
    } catch {
      setErrorMsg("Network error loading bed inventory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const res = await getBedsAndCabinsAction();
        if (isMounted) {
          if (res.success && res.data) {
            setBeds(res.data.beds);
            setCabins(res.data.cabins);
            setWards(res.data.wards);
          } else {
            setErrorMsg(res.error || "Failed to load beds data");
          }
        }
      } catch {
        if (isMounted) setErrorMsg("Network error loading bed inventory");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  // Status Metrics for Beds
  const totalBeds = beds.length;
  const availableBeds = beds.filter((b) => b.status === "VACANT").length;
  const occupiedBeds = beds.filter((b) => b.status === "OCCUPIED").length;
  const cleaningBeds = beds.filter((b) => b.status === "CLEANING").length;
  const maintenanceBeds = beds.filter((b) => b.status === "MAINTENANCE").length;

  // Cabins metrics
  const totalCabins = cabins.length;
  const availableCabins = cabins.filter((c) => c.status === "VACANT").length;
  const occupiedCabins = cabins.filter((c) => c.status === "OCCUPIED").length;

  const filteredBeds = beds.filter(
    (b) => selectedWard === "all" || b.ward_id === selectedWard
  );

  const handleStatusChange = async (
    bedId: string,
    status: "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE"
  ) => {
    setActionLoading(true);
    try {
      const res = await updateBedStatusAction({ bedId, status });
      if (res.success) {
        await loadData();
        setActiveBedModal(null);
      } else {
        alert(res.error || "Failed to update bed status");
      }
    } catch {
      alert("Error processing bed status change");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVacate = async (bed: BedRecord) => {
    if (!bed.current_assignment?.id) return;
    if (!confirm("Are you sure you want to vacate this bed and send to housekeeping for sanitization?")) return;

    setActionLoading(true);
    try {
      const res = await vacateBedAction({
        assignmentId: bed.current_assignment.id,
        bedId: bed.id,
      });
      if (res.success) {
        await loadData();
        setActiveBedModal(null);
      } else {
        alert(res.error || "Failed to vacate bed");
      }
    } catch {
      alert("Error vacating bed");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Inpatient Capacity & Admission Matrix
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Ward & Cabin Bed Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Realtime occupancy tracking across General Wards, VIP Cabins, ICU, and CCU with auto-charge generation.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh bed live matrix"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("beds")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "beds" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Ward Beds ({totalBeds})
            </button>
            <button
              onClick={() => setActiveTab("cabins")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === "cabins" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Private Cabins ({totalCabins})
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* 1. CAPACITY METRICS STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Total Capacity</span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {activeTab === "beds" ? `${totalBeds} Beds` : `${totalCabins} Cabins`}
          </div>
          <span className="text-[10px] text-slate-400">All registered units</span>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 shadow-2xs">
          <span className="text-[11px] font-bold text-emerald-800 uppercase">Available</span>
          <div className="text-2xl font-black text-emerald-700 mt-1">
            {activeTab === "beds" ? `${availableBeds} Vacant` : `${availableCabins} Vacant`}
          </div>
          <span className="text-[10px] text-emerald-700 font-medium">Ready for admission</span>
        </div>

        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 shadow-2xs">
          <span className="text-[11px] font-bold text-rose-800 uppercase">Occupied</span>
          <div className="text-2xl font-black text-rose-700 mt-1">
            {activeTab === "beds" ? `${occupiedBeds} Inpatients` : `${occupiedCabins} Inpatients`}
          </div>
          <span className="text-[10px] text-rose-700 font-medium">Active admissions</span>
        </div>

        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-2xs">
          <span className="text-[11px] font-bold text-amber-800 uppercase">Cleaning / Sanitize</span>
          <div className="text-2xl font-black text-amber-700 mt-1">{cleaningBeds} Beds</div>
          <span className="text-[10px] text-amber-700 font-medium">Housekeeping active</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-800 uppercase">Maintenance</span>
          <div className="text-2xl font-black text-slate-700 mt-1">{maintenanceBeds} Units</div>
          <span className="text-[10px] text-slate-700 font-medium">Engineering check</span>
        </div>
      </div>

      {activeTab === "beds" ? (
        <>
          {/* 2. WARD FILTER BAR */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold text-slate-500 uppercase mr-2 flex items-center">
              <Filter className="w-3.5 h-3.5 mr-1" />
              Ward Filter:
            </span>
            <button
              onClick={() => setSelectedWard("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedWard === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              All Wards ({totalBeds})
            </button>
            {wards.map((ward) => (
              <button
                key={ward.id}
                onClick={() => setSelectedWard(ward.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedWard === ward.id
                    ? "bg-sky-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {ward.name} (Fl. {ward.floor_number})
              </button>
            ))}
          </div>

          {/* 3. VISUAL BED MATRIX GRID */}
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex justify-center items-center">
              <Loader2 className="w-6 h-6 animate-spin mr-2 text-sky-600" />
              Loading real-time bed inventory...
            </div>
          ) : filteredBeds.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
              No beds found matching selected criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredBeds.map((bed) => {
                const isAvailable = bed.status === "VACANT";
                const isOccupied = bed.status === "OCCUPIED";
                const isCleaning = bed.status === "CLEANING";

                return (
                  <div
                    key={bed.id}
                    onClick={() => setActiveBedModal(bed)}
                    className={`p-5 rounded-2xl border cursor-pointer transition shadow-2xs hover:shadow-md flex flex-col justify-between ${
                      isAvailable
                        ? "bg-white border-emerald-300 ring-2 ring-emerald-500/10 hover:border-emerald-500"
                        : isOccupied
                        ? "bg-rose-50/50 border-rose-300 hover:border-rose-500"
                        : isCleaning
                        ? "bg-amber-50/50 border-amber-300 hover:border-amber-500"
                        : "bg-slate-100 border-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          {bed.ward?.name || "Ward"} (Fl. {bed.ward?.floor_number || 1})
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isAvailable
                              ? "bg-emerald-100 text-emerald-800"
                              : isOccupied
                              ? "bg-rose-100 text-rose-800"
                              : isCleaning
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-200 text-slate-800"
                          }`}
                        >
                          {bed.status}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 my-2">
                        <BedIcon
                          className={`w-6 h-6 ${
                            isAvailable
                              ? "text-emerald-600"
                              : isOccupied
                              ? "text-rose-600"
                              : isCleaning
                              ? "text-amber-600"
                              : "text-slate-600"
                          }`}
                        />
                        <h3 className="font-extrabold text-base text-slate-900 font-mono">
                          {bed.bed_number}
                        </h3>
                      </div>

                      <div className="text-xs space-y-1 mt-2">
                        <p className="text-slate-600">
                          <strong>Type:</strong> {bed.bed_type?.name || "Standard"}
                        </p>
                        <p className="text-slate-600">
                          <strong>Tariff:</strong> {formatCurrencyBDT(bed.bed_type?.daily_rate || 1000)} / day
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/80 mt-3 text-xs">
                      {isOccupied && bed.current_assignment?.patient ? (
                        <div>
                          <span className="font-bold text-slate-900 block truncate">
                            {bed.current_assignment.patient.full_name}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Code: {bed.current_assignment.patient.patient_code} • Ph: {bed.current_assignment.patient.phone}
                          </span>
                        </div>
                      ) : isCleaning ? (
                        <span className="text-[11px] text-amber-700 font-medium">
                          Sanitization in progress
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-semibold">
                          Click to Manage Bed →
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* CABINS VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cabins.map((cabin) => {
            const isAvailable = cabin.status === "VACANT";
            const isOccupied = cabin.status === "OCCUPIED";

            return (
              <div
                key={cabin.id}
                className={`p-5 rounded-2xl border shadow-2xs flex flex-col justify-between ${
                  isAvailable
                    ? "bg-white border-emerald-300"
                    : isOccupied
                    ? "bg-rose-50/50 border-rose-300"
                    : "bg-amber-50/50 border-amber-300"
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      Floor {cabin.floor_number} • {cabin.cabin_type}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        isAvailable
                          ? "bg-emerald-100 text-emerald-800"
                          : isOccupied
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {cabin.status}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 my-2">
                    <Building className="w-6 h-6 text-sky-600" />
                    <h3 className="font-extrabold text-base text-slate-900 font-mono">
                      Cabin {cabin.cabin_number}
                    </h3>
                  </div>

                  <div className="text-xs space-y-1 mt-2">
                    <p className="text-slate-600">
                      <strong>Tariff:</strong> {formatCurrencyBDT(cabin.daily_rate)} / day
                    </p>
                    <p className="text-slate-500 text-[11px]">
                      {cabin.amenities || "AC, Attached Bath, Attendant Couch, Smart TV"}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200/80 mt-3 text-xs">
                  {isOccupied && cabin.current_assignment?.patient ? (
                    <div>
                      <span className="font-bold text-slate-900 block truncate">
                        {cabin.current_assignment.patient.full_name}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Code: {cabin.current_assignment.patient.patient_code}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-emerald-700 font-semibold">
                      Available for Admission
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BED STATUS MODAL / ACTION DIALOG */}
      {activeBedModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-xs">
            <h3 className="text-base font-black text-slate-900 mb-1">
              Bed Controller: {activeBedModal.bed_number} ({activeBedModal.ward?.name})
            </h3>
            <p className="text-slate-500 mb-4">
              Tariff: {formatCurrencyBDT(activeBedModal.bed_type?.daily_rate || 1000)} / day • Current:{" "}
              <strong className="uppercase">{activeBedModal.status}</strong>
            </p>

            {activeBedModal.current_assignment?.patient && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl mb-4">
                <span className="text-[10px] font-bold text-rose-800 uppercase block">Current Inpatient</span>
                <p className="font-bold text-rose-950 text-sm">{activeBedModal.current_assignment.patient.full_name}</p>
                <p className="text-rose-700 text-[11px]">
                  ID: {activeBedModal.current_assignment.patient.patient_code} • Ph: {activeBedModal.current_assignment.patient.phone}
                </p>
              </div>
            )}

            <div className="space-y-2">
              {activeBedModal.status === "OCCUPIED" && activeBedModal.current_assignment && (
                <button
                  disabled={actionLoading}
                  onClick={() => handleVacate(activeBedModal)}
                  className="w-full text-left p-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 font-bold text-rose-900 flex justify-between items-center transition disabled:opacity-50"
                >
                  <span>Vacate Inpatient & Send to Housekeeping</span>
                  <DoorOpen className="w-4 h-4" />
                </button>
              )}

              <button
                disabled={actionLoading}
                onClick={() => handleStatusChange(activeBedModal.id, "VACANT")}
                className="w-full text-left p-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 font-bold text-emerald-900 flex justify-between items-center transition disabled:opacity-50"
              >
                <span>Mark Clean & VACANT (Available for new patient)</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>

              <button
                disabled={actionLoading}
                onClick={() => handleStatusChange(activeBedModal.id, "CLEANING")}
                className="w-full text-left p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 font-bold text-amber-900 flex justify-between items-center transition disabled:opacity-50"
              >
                <span>Mark for CLEANING / Sanitization</span>
                <Sparkles className="w-4 h-4" />
              </button>

              <button
                disabled={actionLoading}
                onClick={() => handleStatusChange(activeBedModal.id, "MAINTENANCE")}
                className="w-full text-left p-3 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 font-bold text-slate-900 flex justify-between items-center transition disabled:opacity-50"
              >
                <span>Mark for MAINTENANCE / Engineering repair</span>
                <Wrench className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 text-right">
              <button
                disabled={actionLoading}
                onClick={() => setActiveBedModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
