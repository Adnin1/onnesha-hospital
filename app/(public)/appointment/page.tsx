"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Phone,
  User,
  ArrowRight,
  ArrowLeft,
  Printer,
  ShieldCheck,
  MessageSquare,
} from "lucide-react";
import { MOCK_DOCTORS, MOCK_ORGANIZATION } from "@/lib/mock-data";
import { formatCurrencyBDT } from "@/lib/utils";
import { HospitalPrintHeader } from "@/components/print/HospitalPrintHeader";

export default function AppointmentBookingPage() {
  const [step, setStep] = useState(1);
  const [selectedDoctorId, setSelectedDoctorId] = useState(MOCK_DOCTORS[0].id);
  const [appointmentDate, setAppointmentDate] = useState("2026-09-13");
  const [timeSlot, setTimeSlot] = useState("05:30 PM - 07:00 PM");

  // Patient Info Form
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("35");
  const [gender, setGender] = useState("male");
  const [guardianName, setGuardianName] = useState("");
  const [generatedToken, setGeneratedToken] = useState("");
  const [smsSent, setSmsSent] = useState(false);

  const selectedDoctor =
    MOCK_DOCTORS.find((d) => d.id === selectedDoctorId) || MOCK_DOCTORS[0];

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      if (!fullName || !phone) {
        alert("Please provide patient name and contact phone number.");
        return;
      }
      // Generate realistic Token
      const prefix = selectedDoctor.doctor_code.replace("DOC-", "T");
      const randomNum = Math.floor(Math.random() * 80) + 10;
      const token = `${prefix}-${randomNum}`;
      setGeneratedToken(token);
      setSmsSent(true);
      setStep(4);
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
            Get your OPD consultation serial token instantly with SMS confirmation.
          </p>

          {/* Stepper indicator */}
          <div className="flex justify-center items-center space-x-2 mt-6">
            {[
              { num: 1, label: "Doctor" },
              { num: 2, label: "Date & Time" },
              { num: 3, label: "Patient Info" },
              { num: 4, label: "Token Slip" },
            ].map((s) => (
              <React.Fragment key={s.num}>
                <div
                  className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold ${
                    step >= s.num
                      ? "bg-sky-600 text-white shadow-2xs"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  <span>{s.num}.</span>
                  <span>{s.label}</span>
                </div>
                {s.num < 4 && <div className="w-4 h-0.5 bg-slate-300"></div>}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MOCK_DOCTORS.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDoctorId(doc.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition flex items-start space-x-3 ${
                    selectedDoctorId === doc.id
                      ? "border-sky-600 bg-sky-50/60 ring-2 ring-sky-500/20"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center font-bold text-sky-800 text-base shrink-0">
                    {doc.full_name
                      .split(" ")
                      .slice(1, 3)
                      .map((n) => n[0])
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

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-6 py-2.5 rounded-lg shadow-sm transition"
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
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Select Consultation Date
                </label>
                <input
                  type="date"
                  value={appointmentDate}
                  min="2026-09-12"
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Available Visiting Hours / Chamber Slot
                </label>
                <div className="space-y-2">
                  {[
                    "05:00 PM - 06:30 PM (Evening Slot A)",
                    "06:30 PM - 08:00 PM (Evening Slot B)",
                    "08:00 PM - 09:30 PM (Night Slot C)",
                  ].map((slot) => (
                    <label
                      key={slot}
                      className={`flex items-center p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                        timeSlot === slot
                          ? "border-sky-600 bg-sky-50/50 font-semibold text-sky-900"
                          : "border-slate-200 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="slot"
                        checked={timeSlot === slot}
                        onChange={() => setTimeSlot(slot)}
                        className="mr-2 text-sky-600 focus:ring-sky-500"
                      />
                      <Clock className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                      {slot}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center text-slate-600 hover:text-slate-900 text-xs font-medium px-4 py-2"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-6 py-2.5 rounded-lg shadow-sm transition"
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
            onSubmit={handleNextStep}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs"
          >
            <h2 className="text-base font-bold text-slate-800 mb-4">
              Step 3: Patient Particulars & Contact Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Patient Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Md. Tariqul Islam"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Mobile Number (BD) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="017XXXXXXXX or 018XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Your Token and chamber room SMS will be sent to this number.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Patient Age (Years) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gender *
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Father / Husband / Guardian Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Guardian's Name"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-slate-50"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center text-slate-600 hover:text-slate-900 text-xs font-medium px-4 py-2"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Back
              </button>
              <button
                type="submit"
                className="inline-flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-6 py-2.5 rounded-lg shadow-sm transition"
              >
                Confirm Appointment & Generate Token
                <CheckCircle2 className="w-3.5 h-3.5 ml-2" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 4: INSTANT CONFIRMATION & PRINTABLE TOKEN SLIP */}
        {step === 4 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-md">
            {/* Printable Slip Container */}
            <div className="print-pad">
              <HospitalPrintHeader
                documentTitle="OPD CONSULTATION TOKEN SLIP"
                documentNumber={generatedToken}
                dateStr={appointmentDate}
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
                  className="inline-flex items-center bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs px-3.5 py-2 rounded-lg shadow-2xs transition"
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
                  {generatedToken}
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
                  <span className="text-slate-500 block text-[11px]">Age & Gender</span>
                  <span className="font-medium text-slate-800">
                    {age} Years, {gender.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Guardian Name</span>
                  <span className="font-medium text-slate-800">{guardianName || "N/A"}</span>
                </div>
                <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                  <span className="text-slate-500 block text-[11px]">Consulting Specialist</span>
                  <span className="font-bold text-sky-900 text-sm">
                    {selectedDoctor.full_name} ({selectedDoctor.specialization})
                  </span>
                  <p className="text-[11px] text-slate-600">
                    Chamber: <strong className="text-slate-900">{selectedDoctor.room_number}</strong> • Slot: <strong className="text-slate-900">{timeSlot}</strong>
                  </p>
                </div>
              </div>

              {/* SMS Notification Banner */}
              {smsSent && (
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg flex items-start space-x-2 text-xs text-sky-900 my-4 no-print">
                  <MessageSquare className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">SMS Dispatched: </span>
                    <span>
                      &quot;Onnesha Hospital: Your appointment with {selectedDoctor.full_name} is confirmed. Token: {generatedToken}. Time: {timeSlot}. Chamber: {selectedDoctor.room_number}.&quot;
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Back Actions */}
            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-between no-print">
              <Link
                href="/check-token"
                className="text-xs text-sky-700 font-semibold hover:underline"
              >
                Track Live Queue Status →
              </Link>
              <button
                onClick={() => {
                  setStep(1);
                  setFullName("");
                  setPhone("");
                }}
                className="text-xs text-slate-600 hover:text-slate-900 font-medium"
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
