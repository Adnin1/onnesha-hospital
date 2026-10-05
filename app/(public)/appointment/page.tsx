"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Clock,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Printer,
  MessageSquare,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { formatCurrencyBDT } from "@/lib/utils";
import { HospitalPrintHeader } from "@/components/print/HospitalPrintHeader";
import { getDhakaDateString, getDhakaWeekday } from "@/lib/datetime";
import {
  getPublicDoctorsAction,
  getPublicDoctorSchedulesAction,
  bookOnlineAppointmentAction,
  PublicDoctor,
  PublicDoctorSchedule,
  PublicBookingResult,
} from "@/lib/public/actions";

function AppointmentBookingContent() {
  const searchParams = useSearchParams();
  const doctorQueryParam = searchParams.get("doctor");

  const [step, setStep] = useState(1);
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [doctorError, setDoctorError] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<PublicDoctorSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [appointmentDate, setAppointmentDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return getDhakaDateString(d);
  });
  const [confirmedSlotLabel, setConfirmedSlotLabel] = useState<string>("");

  // Patient Info Form
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "OTHER" | "">("");
  const [guardianName, setGuardianName] = useState("");
  const notes = "";

  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedData, setConfirmedData] = useState<PublicBookingResult["data"] | null>(null);

  // Load public doctors
  useEffect(() => {
    let isMounted = true;
    async function loadDoctors() {
      setLoadingDoctors(true);
      const res = await getPublicDoctorsAction();
      if (isMounted) {
        if (res.success && res.doctors.length > 0) {
          setDoctors(res.doctors);
          if (doctorQueryParam && res.doctors.some((d) => d.id === doctorQueryParam)) {
            setSelectedDoctorId(doctorQueryParam);
          } else {
            setSelectedDoctorId(res.doctors[0].id);
          }
        } else {
          setDoctorError(res.error || "No active specialist schedules open for online booking.");
        }
        setLoadingDoctors(false);
      }
    }
    void loadDoctors();
    return () => {
      isMounted = false;
    };
  }, [doctorQueryParam]);

  // Load schedules for selected doctor
  useEffect(() => {
    if (!selectedDoctorId) return;
    let isMounted = true;
    async function loadSchedules() {
      setLoadingSchedules(true);
      const res = await getPublicDoctorSchedulesAction(selectedDoctorId);
      if (isMounted) {
        if (res.success && res.schedules.length > 0) {
          setSchedules(res.schedules);
        } else {
          setSchedules([]);
        }
        setLoadingSchedules(false);
      }
    }
    void loadSchedules();
    return () => {
      isMounted = false;
    };
  }, [selectedDoctorId]);

  // Compute Asia/Dhaka weekday from appointmentDate
  const currentWeekday = useMemo(() => {
    return getDhakaWeekday(appointmentDate);
  }, [appointmentDate]);

  // Filter schedules strictly for the appointment day of week
  const matchingSchedules = useMemo(() => {
    return schedules.filter(
      (s) => s.day_of_week.trim().toUpperCase() === currentWeekday
    );
  }, [schedules, currentWeekday]);

  // Derive active schedule ID and slot label without cascading effect renders
  const activeScheduleId = useMemo(() => {
    if (matchingSchedules.length === 0) return "";
    const exists = matchingSchedules.find((s) => s.id === selectedScheduleId);
    return exists ? exists.id : matchingSchedules[0].id;
  }, [matchingSchedules, selectedScheduleId]);

  const activeSlotLabel = useMemo(() => {
    const active = matchingSchedules.find((s) => s.id === activeScheduleId);
    return active ? active.slot_label : "";
  }, [matchingSchedules, activeScheduleId]);

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId) || doctors[0];

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !activeScheduleId) {
      setBookingError("Please select a published schedule slot, patient name, and contact phone number.");
      return;
    }

    // Verify schedule matches the consultation weekday
    if (!matchingSchedules.some((s) => s.id === activeScheduleId)) {
      setBookingError(
        `Selected schedule does not match the consultation day of week (${currentWeekday}). Please pick a valid slot.`
      );
      return;
    }

    if (bookingLoading) return;

    setBookingLoading(true);
    setBookingError(null);

    const parsedAge = age.trim() ? parseInt(age, 10) : undefined;
    try {
      const res = await bookOnlineAppointmentAction({
        doctorId: selectedDoctor?.id || selectedDoctorId,
        scheduleId: activeScheduleId,
        appointmentDate,
        patientName: fullName.trim(),
        patientPhone: phone.trim(),
        patientGender: (gender as "MALE" | "FEMALE" | "OTHER") || "OTHER",
        patientAge: isNaN(parsedAge as number) ? undefined : parsedAge,
        notes: notes || (guardianName ? `Guardian: ${guardianName}` : undefined),
      });

      if (res.success && res.data) {
        setConfirmedSlotLabel(activeSlotLabel);
        setConfirmedData(res.data);
        setStep(4);
      } else {
        setBookingError(res.error || "Online booking slot unavailable.");
      }
    } catch (err: unknown) {
      console.error("[appointment-booking] Network or runtime error:", err);
      setBookingError(
        "নেটওয়ার্ক ত্রুটি: বুকিং সম্পন্ন করা যায়নি। দয়া করে ইন্টারনেট সংযোগ পরীক্ষা করে পুনরায় চেষ্টা করুন। (Network connection failed. Please try again.)"
      );
    } finally {
      setBookingLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="py-12 bg-slate-50 min-h-[85vh]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-xl mx-auto mb-8 no-print">
          <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
            Online Serial Booking
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Book Doctor Appointment
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Get your OPD consultation serial token and printable slip instantly on screen.
          </p>

          {/* Stepper indicator */}
          <div className="flex justify-center items-center gap-1 sm:gap-2 mt-6 overflow-x-auto max-w-full py-1 px-1">
            {[
              { num: 1, label: "Doctor" },
              { num: 2, label: "Date & Time" },
              { num: 3, label: "Patient Info" },
              { num: 4, label: "Token Slip" },
            ].map((s) => (
              <React.Fragment key={s.num}>
                <div
                  className={`flex items-center space-x-1 px-2 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold shrink-0 ${
                    step >= s.num
                      ? "bg-sky-600 text-white shadow-2xs"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  <span>{s.num}.</span>
                  <span>{s.label}</span>
                </div>
                {s.num < 4 && <div className="w-2 sm:w-4 h-0.5 bg-slate-300 shrink-0"></div>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* STEP 1: SELECT DOCTOR */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-800 mb-4">
              Step 1: Select Doctor & Specialty
            </h2>

            {loadingDoctors && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Loader2 className="w-8 h-8 text-sky-600 animate-spin mb-2" />
                <p className="text-xs">Loading available specialists...</p>
              </div>
            )}

            {!loadingDoctors && doctorError && (
              <div role="alert" className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center space-x-2 mb-4">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{doctorError}</span>
              </div>
            )}

            {!loadingDoctors && doctors.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {doctors.map((doc: PublicDoctor) => (
                  <div
                    key={doc.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${doc.full_name}, ${doc.department_name}`}
                    aria-pressed={selectedDoctorId === doc.id}
                    onClick={() => setSelectedDoctorId(doc.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedDoctorId(doc.id);
                      }
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition flex items-start space-x-3 focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                      selectedDoctorId === doc.id
                        ? "border-sky-600 bg-sky-50/60 ring-2 ring-sky-500/20"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center font-bold text-sky-800 text-base shrink-0">
                      {doc.full_name
                        .split(" ")
                        .slice(1, 3)
                        .map((n: string) => n[0])
                        .join("")}
                    </div>
                    <div className="grow">
                      <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider">
                        {doc.department_name}
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm">{doc.full_name}</h3>
                      <p className="text-[11px] text-slate-500">{doc.degrees}</p>
                      <div className="flex justify-between items-center mt-2 text-xs">
                        <span className="text-slate-600 font-medium">
                          {doc.room_number}
                        </span>
                        <span className="font-bold text-emerald-700">
                          {formatCurrencyBDT(doc.opd_fee)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                disabled={!selectedDoctor || loadingDoctors}
                onClick={() => setStep(2)}
                className="inline-flex items-center bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold text-xs px-6 py-2.5 min-h-[44px] rounded-lg shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                Continue to Date & Time
                <ArrowRight className="w-3.5 h-3.5 ml-2" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SELECT DATE & SLOT */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-800 mb-4">
              Step 2: Choose Appointment Date & Visiting Slot
            </h2>

            <div className="p-4 bg-sky-50 rounded-xl mb-6 flex items-center space-x-3 border border-sky-100">
              <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-sm">
                Rx
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  Consulting Doctor: {selectedDoctor.full_name}
                </p>
                <p className="text-[11px] text-sky-800">
                  {selectedDoctor.specialization} ({selectedDoctor.room_number}) • Fee: {formatCurrencyBDT(selectedDoctor.opd_fee)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="appointment-date" className="block text-xs font-semibold text-slate-700 mb-2">
                  Select Consultation Date
                </label>
                <input
                  id="appointment-date"
                  type="date"
                  value={appointmentDate}
                  min={getDhakaDateString()}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  className="w-full p-2.5 min-h-[44px] text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-slate-50"
                />
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  Day of week: <span className="text-sky-700 font-bold">{currentWeekday}</span> (Asia/Dhaka)
                </p>
              </div>

              <div>
                <span id="chamber-slot-label" className="block text-xs font-semibold text-slate-700 mb-2">
                  Available Visiting Hours / Chamber Slot ({currentWeekday})
                </span>
                <div role="radiogroup" aria-labelledby="chamber-slot-label" className="space-y-2">
                  {loadingSchedules ? (
                    <div className="p-3 text-xs text-slate-500 flex items-center min-h-[44px]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Loading schedules...
                    </div>
                  ) : matchingSchedules.length > 0 ? (
                    matchingSchedules.map((sched) => (
                      <label
                        key={sched.id}
                        className={`flex items-center p-2.5 min-h-[44px] rounded-lg border text-xs cursor-pointer transition ${
                          activeScheduleId === sched.id
                            ? "border-sky-600 bg-sky-50/50 font-semibold text-sky-900 ring-2 ring-sky-500/20"
                            : "border-slate-200 hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name="slot"
                          checked={activeScheduleId === sched.id}
                          onChange={() => {
                            setSelectedScheduleId(sched.id);
                          }}
                          className="mr-2 text-sky-600 focus:ring-sky-500 w-4 h-4"
                        />
                        <Clock className="w-3.5 h-3.5 mr-1.5 text-slate-400 shrink-0" />
                        {sched.slot_label}
                      </label>
                    ))
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start space-x-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-950">No Visiting Hours on {currentWeekday}</p>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          No active published schedule available for this doctor on the selected date ({appointmentDate}, {currentWeekday}). Please pick another date or select a different doctor.
                        </p>
                        {schedules.length > 0 && (
                          <p className="text-[10px] text-amber-700 font-medium mt-1.5">
                            Regular chamber days: {Array.from(new Set(schedules.map((s) => s.day_of_week))).join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center text-slate-600 hover:text-slate-900 text-xs font-medium px-4 py-2 min-h-[44px] rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Back
              </button>
              <button
                type="button"
                disabled={!activeScheduleId || loadingSchedules || matchingSchedules.length === 0}
                onClick={() => setStep(3)}
                className="inline-flex items-center bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold text-xs px-6 py-2.5 min-h-[44px] rounded-lg shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                Continue to Patient Info
                <ArrowRight className="w-3.5 h-3.5 ml-2" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: PATIENT INFORMATION FORM */}
        {step === 3 && (
          <form
            onSubmit={handleBookAppointment}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs"
          >
            <h2 className="text-base font-bold text-slate-800 mb-4">
              Step 3: Patient Particulars & Contact Details
            </h2>

            {bookingError && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2 mb-4" role="alert">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{bookingError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="patient-fullname" className="block text-xs font-semibold text-slate-700 mb-1">
                  Patient Full Name *
                </label>
                <input
                  id="patient-fullname"
                  type="text"
                  required
                  placeholder="e.g. Md. Tariqul Islam"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-2.5 min-h-[44px] text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-slate-50"
                />
              </div>

              <div>
                <label htmlFor="patient-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Mobile Number (BD) *
                </label>
                <input
                  id="patient-phone"
                  type="tel"
                  required
                  placeholder="017XXXXXXXX or 018XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 min-h-[44px] text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-slate-50"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Used for hospital registration and queue identification.
                </p>
              </div>

              <div>
                <label htmlFor="patient-age" className="block text-xs font-semibold text-slate-700 mb-1">
                  Patient Age (Years) *
                </label>
                <input
                  id="patient-age"
                  type="number"
                  required
                  min="0"
                  max="125"
                  placeholder="e.g. 28"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full p-2.5 min-h-[44px] text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-slate-50"
                />
              </div>

              <div>
                <label htmlFor="patient-gender" className="block text-xs font-semibold text-slate-700 mb-1">
                  Gender *
                </label>
                <select
                  id="patient-gender"
                  required
                  value={gender}
                  onChange={(e) => setGender(e.target.value as "MALE" | "FEMALE" | "OTHER" | "")}
                  className="w-full p-2.5 min-h-[44px] text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-slate-50"
                >
                  <option value="">Select Gender</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other / Prefer not to say</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="patient-guardian" className="block text-xs font-semibold text-slate-700 mb-1">
                  Father / Husband / Guardian Name (Optional)
                </label>
                <input
                  id="patient-guardian"
                  type="text"
                  placeholder="Guardian's Name"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  className="w-full p-2.5 min-h-[44px] text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-slate-50"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center text-slate-600 hover:text-slate-900 text-xs font-medium px-4 py-2 min-h-[44px] rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Back
              </button>
              <button
                type="submit"
                disabled={bookingLoading}
                className="inline-flex items-center bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs px-6 py-2.5 min-h-[44px] rounded-lg shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {bookingLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                    Allocating Token...
                  </>
                ) : (
                  <>
                    Confirm Appointment & Generate Token
                    <CheckCircle2 className="w-3.5 h-3.5 ml-2" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 4: INSTANT CONFIRMATION & PRINTABLE TOKEN SLIP */}
        {step === 4 && confirmedData && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-md">
            {/* Printable Slip Container */}
            <div className="print-pad">
              <HospitalPrintHeader
                documentTitle="OPD CONSULTATION TOKEN SLIP"
                documentNumber={`TKN-${confirmedData.tokenNumber}`}
                dateStr={confirmedData.appointmentDate}
              />

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 my-4 flex items-center justify-between no-print">
                <div className="flex items-center space-x-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  <div>
                    <h3 className="font-bold text-sm text-emerald-950">
                      Appointment Confirmed Successfully!
                    </h3>
                    <p className="text-xs text-emerald-800">
                      Please show this token at the reception or doctor chamber entrance.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs px-3.5 py-2 min-h-[44px] rounded-lg shadow-2xs transition focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5 text-sky-700" />
                  Print Token Slip
                </button>
              </div>

              {/* Big Token Number Display */}
              <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-200 my-4">
                <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                  Your Serial Token Number
                </span>
                <div className="text-4xl sm:text-5xl font-extrabold text-sky-700 font-mono tracking-widest my-1">
                  #{confirmedData.tokenNumber}
                </div>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                  Status: Scheduled in Queue
                </span>
              </div>

              {/* Particulars Table */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs my-4 p-4 border border-slate-200 rounded-xl bg-white">
                <div>
                  <span className="text-slate-500 block text-[11px]">Patient Name</span>
                  <span className="font-bold text-slate-900 text-sm">{fullName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Contact Mobile</span>
                  <span className="font-semibold text-slate-800">{phone}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Patient ID Code</span>
                  <span className="font-medium text-slate-800 font-mono">
                    {confirmedData.patientCode}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Guardian Name</span>
                  <span className="font-medium text-slate-800">{guardianName || "N/A"}</span>
                </div>
                <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                  <span className="text-slate-500 block text-[11px]">Consulting Specialist</span>
                  <span className="font-bold text-sky-900 text-sm">
                    {confirmedData.doctorName}
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Chamber: <strong className="text-slate-900">{confirmedData.roomNumber}</strong> • Slot: <strong className="text-slate-900">{confirmedSlotLabel || activeSlotLabel}</strong>
                  </p>
                </div>
              </div>

              {/* Token Confirmation Notice */}
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg flex items-start space-x-2 text-xs text-sky-900 my-4 no-print">
                <MessageSquare className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Important Patient Notice: </span>
                  <span>
                    Please arrive 15 minutes before your scheduled slot. Present this token number (#{confirmedData.tokenNumber}) at the reception counter or room {confirmedData.roomNumber}.
                  </span>
                </div>
              </div>
            </div>

            {/* Back Actions */}
            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-between items-center no-print">
              <Link
                href="/check-token"
                className="text-xs text-sky-700 font-semibold hover:underline min-h-[44px] inline-flex items-center px-1"
              >
                Track Live Queue Status →
              </Link>
              <button
                onClick={() => {
                  setStep(1);
                  setFullName("");
                  setPhone("");
                  setAge("");
                  setGender("");
                  setGuardianName("");
                  setConfirmedData(null);
                  setBookingError(null);
                }}
                className="text-xs text-slate-600 hover:text-slate-900 font-medium min-h-[44px] inline-flex items-center px-3 py-2 rounded-lg hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                Book Another Appointment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AppointmentLoadingFallback() {
  return (
    <div className="py-12 bg-slate-50 min-h-[85vh] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin mx-auto mb-2" />
        <h1 className="text-2xl font-bold text-slate-800 mb-2">অনলাইন ডক্টর অ্যাপয়েন্টমেন্ট</h1>
        <p className="text-xs text-slate-500">Loading appointment booking portal...</p>
      </div>
    </div>
  );
}

export default function AppointmentBookingPage() {
  return (
    <Suspense fallback={<AppointmentLoadingFallback />}>
      <AppointmentBookingContent />
    </Suspense>
  );
}
