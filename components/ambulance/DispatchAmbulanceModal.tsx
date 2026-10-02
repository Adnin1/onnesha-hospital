"use client";

import React, { useState, useEffect } from "react";
import { X, Truck, AlertCircle, Loader2 } from "lucide-react";
import {
  dispatchAmbulanceTripAction,
  AmbulanceVehicle,
  AmbulanceTrip,
} from "@/lib/ambulance/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { PatientMaster } from "@/types/clinical";

interface DispatchAmbulanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  fleet: AmbulanceVehicle[];
  onSuccess: (trip: AmbulanceTrip) => void;
}

export function DispatchAmbulanceModal({
  isOpen,
  onClose,
  fleet,
  onSuccess,
}: DispatchAmbulanceModalProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    fleet.find((v) => v.is_available)?.id || fleet[0]?.id || ""
  );
  const [pickupLocation, setPickupLocation] = useState<string>("");
  const [dropLocation, setDropLocation] = useState<string>(
    "Onnesha Hospital Emergency & Trauma Complex"
  );
  const [fareAmount, setFareAmount] = useState<number>(2500);

  const [patientSearch, setPatientSearch] = useState<string>("");
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);
  const [nonRegisteredPatientName, setNonRegisteredPatientName] = useState<string>("");

  const [loadingPatients, setLoadingPatients] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    async function fetchPatients() {
      setLoadingPatients(true);
      try {
        const res = await searchPatientsAction({ query: patientSearch, pageSize: 20 });
        if (isMounted && res.success && res.data?.patients) {
          setPatients(res.data.patients);
        }
      } catch (err: unknown) {
        console.error("[DispatchAmbulanceModal] fetchPatients error:", err);
      } finally {
        if (isMounted) setLoadingPatients(false);
      }
    }
    const timer = setTimeout(() => {
      void fetchPatients();
    }, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, patientSearch]);

  if (!isOpen) return null;

  const selectedVehicle = fleet.find((v) => v.id === selectedVehicleId) || fleet[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pickupLocation.trim()) {
      setErrorMsg("পিকআপ লোকেশন (Pickup Location) উল্লেখ করুন।");
      return;
    }
    if (!dropLocation.trim()) {
      setErrorMsg("ড্রপ লোকেশন (Drop Location) উল্লেখ করুন।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const tripNum = `TRIP-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;

    const res = await dispatchAmbulanceTripAction({
      trip_number: tripNum,
      vehicle_id: selectedVehicleId || selectedVehicle?.id || "veh-01",
      patient_id: selectedPatient?.id,
      patient_name: selectedPatient?.full_name || nonRegisteredPatientName || "Emergency Patient",
      patient_code: selectedPatient?.patient_code || "OH-EMG-01",
      pickup_location: pickupLocation.trim(),
      drop_location: dropLocation.trim(),
      fare_amount: fareAmount,
      vehicle_number: selectedVehicle?.vehicle_number,
      vehicle_type: selectedVehicle?.vehicle_type,
      driver_name: selectedVehicle?.driver_name,
    });

    setSubmitting(false);

    if (res.success && res.data) {
      onSuccess(res.data);
      onClose();
    } else {
      setErrorMsg(res.error || "অ্যাম্বুলেন্স পাঠাতে ব্যর্থ হয়েছে।");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-sky-600 to-sky-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 text-white">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">জরুরি অ্যাম্বুলেন্স প্রেরণ (Dispatch Ambulance)</h2>
              <p className="text-xs text-sky-200">
                লাইভ ট্র্যাকিং, অক্সিজেন সাপোর্ট ও জরুরি স্থানান্তর লগ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-sky-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Vehicle Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              অ্যাম্বুলেন্স নির্বাচন করুন (Select Ambulance Vehicle) <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              {fleet.map((veh) => (
                <option key={veh.id} value={veh.id}>
                  {veh.vehicle_number} — {veh.vehicle_type.toUpperCase()} ({veh.driver_name})
                  {veh.is_available ? " [Ready]" : " [On Trip]"}
                </option>
              ))}
            </select>
          </div>

          {/* Patient Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              রোগী (Patient Info) — নিবন্ধিত বা অন-স্পট ইমার্জেন্সি
            </label>
            {selectedPatient ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">{selectedPatient.full_name}</p>
                  <p className="text-xs font-mono text-slate-500">
                    ID: {selectedPatient.patient_code} • {selectedPatient.phone}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs text-sky-600 hover:text-sky-800 font-semibold"
                >
                  রিমুভ
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="নিবন্ধিত রোগীর নাম বা মোবাইল সার্চ করুন..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl"
                />
                {patientSearch.trim() && (
                  <div className="max-h-28 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                    {loadingPatients ? (
                      <div className="p-2 text-center text-xs text-slate-400">খোঁজা হচ্ছে...</div>
                    ) : patients.length === 0 ? (
                      <div className="p-2 text-center text-xs text-slate-400">কোন রোগী পাওয়া যায়নি</div>
                    ) : (
                      patients.map((pat) => (
                        <button
                          key={pat.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatient(pat);
                            setPatientSearch("");
                          }}
                          className="w-full p-2 text-left hover:bg-sky-50 flex items-center justify-between text-xs"
                        >
                          <span className="font-semibold text-slate-900">{pat.full_name}</span>
                          <span className="font-mono text-slate-500">{pat.patient_code}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {!selectedPatient && (
                  <input
                    type="text"
                    placeholder="অথবা অনিবন্ধিত রোগীর নাম লিখুন (Emergency Walk-in / Caller Name)"
                    value={nonRegisteredPatientName}
                    onChange={(e) => setNonRegisteredPatientName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-dashed border-slate-300 rounded-xl bg-slate-50"
                  />
                )}
              </div>
            )}
          </div>

          {/* Locations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                পিকআপ লোকেশন (Pickup From) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                placeholder="e.g. Sector 4, Uttara, Dhaka"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ড্রপ লোকেশন (Destination) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={dropLocation}
                onChange={(e) => setDropLocation(e.target.value)}
                placeholder="e.g. Onnesha Hospital Emergency"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Fare Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ভাড়া নির্ধারণ (Fare Amount in BDT)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={fareAmount}
              onChange={(e) => setFareAmount(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              বাতিল (Cancel)
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  প্রেরণ হচ্ছে...
                </>
              ) : (
                <>
                  <Truck className="h-4 w-4" />
                  অ্যাম্বুলেন্স প্রেরণ করুন (Dispatch Trip)
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
