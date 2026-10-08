/**
 * Public Homepage — Server-Rendered Static Shell
 *
 * Architecture: No "use client" at page level.
 * - All static marketing content is server-rendered (no hydration cost)
 * - Live data islands (FeaturedDoctorsWidget, LiveQueueWidget) are isolated client components
 * - Page Visibility API / polling lives only inside those islands
 */

import type { Metadata } from "next";
import React from "react";

import Link from "next/link";
import {
  Calendar,
  Clock,
  Phone,
  ShieldAlert,
  Activity,
  CheckCircle2,
  Stethoscope,
  HeartPulse,
  Users,
  Baby,
  Bone,
  Microscope,
  LogIn,
  Bed,
  Building2,
  Pill,
  Scissors,
  MapPin,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { LiveQueueWidget } from "@/components/public/LiveQueueWidget";
import { FeaturedDoctorsWidget } from "@/components/public/FeaturedDoctorsWidget";

export const metadata: Metadata = {
  title: "Onnesha Hospital & Diagnostic Complex | Modern Healthcare & Diagnostics",
  description:
    "Book specialist doctor appointments, track live OPD token queues, emergency casualty care, pathology & diagnostic services at Onnesha Hospital, Bangladesh.",
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <div>
      {/* 1. HERO SECTION — static server-rendered */}
      <section className="relative bg-gradient-to-br from-sky-900 via-sky-800 to-slate-900 text-white overflow-hidden py-16 lg:py-24">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" aria-hidden="true"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center space-x-2 bg-sky-500/20 border border-sky-400/30 px-3.5 py-1.5 rounded-full text-xs font-medium text-sky-200 backdrop-blur-xs">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Emergency Casualty Triage &amp; Clinical Diagnostics</span>
                </div>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
                Patient-first care. Trusted doctors. Modern diagnostics.
              </h1>

              <p className="text-sm sm:text-base text-sky-100 max-w-2xl leading-relaxed">
                Welcome to <strong>Onnesha Hospital</strong> ({HOSPITAL_METADATA.banglaName}). We provide compassionate, patient-first care backed by experienced medical specialists, modern inpatient facilities, surgical care, and accurate digital diagnostics.
              </p>

              <div className="flex flex-wrap gap-4 pt-2">
                <Link
                  href="/appointment"
                  className="inline-flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-6 py-3.5 rounded-xl shadow-lg transition focus:outline-none focus:ring-2 focus:ring-emerald-400 min-h-[44px]"
                >
                  <Calendar className="w-4 h-4 mr-2" aria-hidden="true" />
                  Book an Appointment
                </Link>
                {HOSPITAL_METADATA.emergencyHotline ? (
                  <a
                    href={`tel:${HOSPITAL_METADATA.emergencyHotline}`}
                    className="inline-flex items-center bg-red-600 hover:bg-red-500 text-white font-semibold text-sm px-6 py-3.5 rounded-xl shadow-lg transition focus:outline-none focus:ring-2 focus:ring-red-400 min-h-[44px]"
                  >
                    <Phone className="w-4 h-4 mr-2" aria-hidden="true" />
                    Emergency / Call Now
                  </a>
                ) : (
                  <Link
                    href="/contact"
                    className="inline-flex items-center bg-red-600 hover:bg-red-500 text-white font-semibold text-sm px-6 py-3.5 rounded-xl shadow-lg transition focus:outline-none focus:ring-2 focus:ring-red-400 min-h-[44px]"
                  >
                    <Phone className="w-4 h-4 mr-2" aria-hidden="true" />
                    Emergency / Call Now
                  </Link>
                )}
                <Link
                  href="/check-token"
                  className="inline-flex items-center bg-white/10 hover:bg-white/20 text-white font-medium text-sm px-5 py-3.5 rounded-xl border border-white/20 backdrop-blur-xs transition focus:outline-none focus:ring-2 focus:ring-sky-400 min-h-[44px]"
                >
                  <Clock className="w-4 h-4 mr-2 text-sky-300" aria-hidden="true" />
                  Check Live Token
                </Link>
              </div>

              {/* Quick stats strip */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-sky-700/60 max-w-lg">
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-white">OPD &amp; IPD</div>
                  <div className="text-xs text-sky-200">Consultant Care</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-white">Modern</div>
                  <div className="text-xs text-sky-200">Beds &amp; Cabins</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-emerald-400">Emergency</div>
                  <div className="text-xs text-sky-200">Triage &amp; Lab</div>
                </div>
              </div>

              {/* Hospital Staff & ERP Portal Quick Access Banner */}
              <div className="pt-2 max-w-lg">
                <div className="p-3.5 bg-sky-950/60 border border-sky-400/30 rounded-xl backdrop-blur-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-sky-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 shrink-0">
                      <LogIn className="w-4 h-4 text-sky-300" aria-hidden="true" />
                    </div>
                    <div>
                      <span className="font-semibold text-white block">হাসপাতাল স্টাফ ও ডাক্তার পোর্টাল</span>
                      <span className="text-[11px] text-sky-200">OPD, IPD, জরুরি বিভাগ, ল্যাব, ফার্মাসি ও বিলিং ERP</span>
                    </div>
                  </div>
                  <Link
                    href="/login"
                    className="shrink-0 inline-flex items-center px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-lg transition min-h-[36px]"
                  >
                    ERP লগইন &rarr;
                  </Link>
                </div>
              </div>
            </div>

            {/* Right Card: Live Token Queue — Client Island */}
            <div className="lg:col-span-5">
              <LiveQueueWidget />
            </div>
          </div>
        </div>
      </section>

      {/* 2. EMERGENCY TRIAGE BANNER — static */}
      <section className="bg-red-600 text-white py-3.5 px-4 shadow-sm" aria-label="Emergency Care Hotline">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="flex items-center space-x-3 text-center md:text-left">
            <div className="p-2 bg-white/20 rounded-lg shrink-0" aria-hidden="true">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base tracking-wide">
                24/7 Emergency &amp; Casualty Triage Care
              </h2>
              <p className="text-xs text-white/95">
                Medical officers on duty 24 hours for acute stabilization, trauma triage, and urgent hospital admissions.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {HOSPITAL_METADATA.emergencyHotline ? (
              <a
                href={`tel:${HOSPITAL_METADATA.emergencyHotline}`}
                className="inline-flex items-center bg-white text-red-700 hover:bg-red-50 font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition focus:outline-none focus:ring-2 focus:ring-white min-h-[44px]"
              >
                <Phone className="w-3.5 h-3.5 mr-1.5 text-red-600" aria-hidden="true" />
                Call {HOSPITAL_METADATA.emergencyHotline}
              </a>
            ) : (
              <Link
                href="/contact"
                className="inline-flex items-center bg-white text-red-700 hover:bg-red-50 font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition focus:outline-none focus:ring-2 focus:ring-white min-h-[44px]"
              >
                <Phone className="w-3.5 h-3.5 mr-1.5 text-red-600" aria-hidden="true" />
                Contact Reception
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 7. QUICK ACTION CARDS */}
      <section className="py-8 bg-slate-50 border-b border-slate-200" aria-label="Quick Actions">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href="/appointment"
              className="p-4 bg-white rounded-xl border border-slate-200 hover:border-emerald-500 hover:shadow-md transition group text-left flex items-start space-x-3.5 min-h-[72px]"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition" aria-hidden="true">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-800 block group-hover:text-emerald-700 transition">Book Appointment</span>
                <span className="text-xs text-slate-500">Specialist consultations</span>
              </div>
            </Link>

            <Link
              href="/doctors"
              className="p-4 bg-white rounded-xl border border-slate-200 hover:border-sky-500 hover:shadow-md transition group text-left flex items-start space-x-3.5 min-h-[72px]"
            >
              <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 group-hover:bg-sky-600 group-hover:text-white transition" aria-hidden="true">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-800 block group-hover:text-sky-700 transition">Our Doctors</span>
                <span className="text-xs text-slate-500">Find doctors &amp; visiting hours</span>
              </div>
            </Link>

            <Link
              href="/services"
              className="p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition group text-left flex items-start space-x-3.5 min-h-[72px]"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition" aria-hidden="true">
                <Microscope className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-800 block group-hover:text-indigo-700 transition">Services &amp; Tests</span>
                <span className="text-xs text-slate-500">OPD, IPD, OT &amp; Diagnostics</span>
              </div>
            </Link>

            <Link
              href="/check-token"
              className="p-4 bg-white rounded-xl border border-slate-200 hover:border-amber-500 hover:shadow-md transition group text-left flex items-start space-x-3.5 min-h-[72px]"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition" aria-hidden="true">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-800 block group-hover:text-amber-700 transition">Check Live Token</span>
                <span className="text-xs text-slate-500">Live OPD queue status</span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* 8. MEDICAL DEPARTMENTS */}
      <section className="py-14 bg-white" aria-labelledby="departments-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
              Clinical Specializations
            </span>
            <h2 id="departments-heading" className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
              Our Medical Departments
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Compassionate clinical departments providing outpatient consultations and specialized inpatient care.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { icon: Stethoscope, title: "Medicine", desc: "Diabetes & General Medicine", color: "text-blue-600 bg-blue-50" },
              { icon: HeartPulse, title: "Cardiology", desc: "Cardiovascular Care & ECG", color: "text-rose-600 bg-rose-50" },
              { icon: Users, title: "Gynecology", desc: "Maternity & Obstetric Care", color: "text-pink-600 bg-pink-50" },
              { icon: Baby, title: "Pediatrics", desc: "Child Healthcare & Newborns", color: "text-amber-600 bg-amber-50" },
              { icon: Bone, title: "Orthopedics", desc: "Joint, Trauma & Bone Care", color: "text-emerald-600 bg-emerald-50" },
              { icon: Microscope, title: "Diagnostics", desc: "Digital Pathology & Ultrasound", color: "text-purple-600 bg-purple-50" },
            ].map((spec, i) => {
              const Icon = spec.icon;
              return (
                <div
                  key={i}
                  className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-md hover:border-sky-200 transition text-center"
                >
                  <div className={`w-11 h-11 rounded-xl mx-auto flex items-center justify-center mb-2.5 ${spec.color}`} aria-hidden="true">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {spec.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1">{spec.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 9. CORE SERVICES & DIAGNOSTICS */}
      <section className="py-14 bg-slate-50 border-t border-slate-200" aria-labelledby="services-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
              Comprehensive Care
            </span>
            <h2 id="services-heading" className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
              Hospital Services &amp; Diagnostics
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              From emergency triage to advanced digital pathology and surgical suites, all under one roof.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Stethoscope,
                title: "Outdoor Consultation (OPD)",
                desc: "Consultant clinics with morning and evening sessions across all medical disciplines.",
                badge: "OPD Clinics",
              },
              {
                icon: ShieldAlert,
                title: "24/7 Emergency & Casualty",
                desc: "Immediate clinical triage, acute trauma care, oxygenation, and stabilization with resident duty doctors.",
                badge: "24/7 Available",
              },
              {
                icon: Bed,
                title: "Indoor Admission (IPD)",
                desc: "Hygienic general wards and private air-conditioned cabins with around-the-clock attending nursing staff.",
                badge: "IPD Care",
              },
              {
                icon: Microscope,
                title: "Clinical Diagnostics & Lab",
                desc: "Biochemistry, hematology, and clinical pathology with fully automated analyzers and certified reports.",
                badge: "Digital Lab",
              },
              {
                icon: Pill,
                title: "Hospital Pharmacy",
                desc: "Round-the-clock internal pharmacy providing genuine inpatient and outpatient pharmaceuticals.",
                badge: "Pharmacy",
              },
              {
                icon: Scissors,
                title: "Operation Theatre (OT)",
                desc: "Equipped surgical theatres for planned and emergency procedures with strict asepsis protocols.",
                badge: "Surgical OT",
              },
            ].map((srv, idx) => {
              const SrvIcon = srv.icon;
              return (
                <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center" aria-hidden="true">
                      <SrvIcon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-100">
                      {srv.badge}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1.5">{srv.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{srv.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-8">
            <Link
              href="/services"
              className="inline-flex items-center text-xs font-semibold text-sky-700 hover:text-sky-800 bg-sky-100 hover:bg-sky-200 px-4 py-2 rounded-xl transition min-h-[44px]"
            >
              Explore Full Hospital Services &amp; Tariff Catalog
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* 10. FEATURED SPECIALISTS — Client Island */}
      <FeaturedDoctorsWidget />

      {/* 11. WHY CHOOSE ONNESHA HOSPITAL */}
      <section className="py-16 bg-white border-t border-slate-200" aria-labelledby="why-us-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
                Patient-Centered Care
              </span>
              <h2 id="why-us-heading" className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
                Why Patients Trust Onnesha Hospital
              </h2>
              <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                We combine registered medical specialists, hygienic inpatient facilities, and clear itemized billing without hidden surcharges.
              </p>

              <div className="space-y-4 mt-6">
                {[
                  {
                    title: "Experienced Medical Consultants",
                    desc: "Qualified physicians and surgeons holding verified degrees and medical council registrations.",
                  },
                  {
                    title: "Modern Clinical Diagnostics",
                    desc: "Automated laboratory testing and ultrasonography with reliable medical technologist reporting.",
                  },
                  {
                    title: "Attentive Nursing & Inpatient Care",
                    desc: "Trained clinical nurses providing continuous monitoring, medication administration, and compassionate care.",
                  },
                  {
                    title: "Digital Token & Transparent Billing",
                    desc: "Automated electronic queue management, clear printed invoice breakdowns, and strict zero-hidden-fee policy.",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start space-x-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{item.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-sky-900 text-white rounded-3xl p-8 shadow-xl relative overflow-hidden">
              <div className="space-y-4 relative z-10">
                <span className="text-xs uppercase tracking-wider font-semibold text-sky-300">
                  Online Booking
                </span>
                <h3 className="text-2xl font-bold">
                  Book Your Doctor Serial Online
                </h3>
                <p className="text-xs text-sky-100 leading-relaxed">
                  Avoid long clinic waiting lines. Choose your doctor, pick your schedule, and get an immediate electronic token number.
                </p>
                <div className="pt-2">
                  <Link
                    href="/appointment"
                    className="inline-flex items-center bg-white text-sky-900 hover:bg-sky-50 font-bold text-xs px-5 py-3 rounded-xl shadow-md transition focus:outline-none focus:ring-2 focus:ring-sky-300 min-h-[44px]"
                  >
                    <Calendar className="w-4 h-4 mr-2 text-sky-700" aria-hidden="true" />
                    Start Appointment Booking
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 12. FACILITIES OVERVIEW */}
      <section className="py-14 bg-slate-50 border-t border-slate-200" aria-labelledby="facilities-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
              Hospital Infrastructure
            </span>
            <h2 id="facilities-heading" className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
              Our Inpatient &amp; Diagnostic Facilities
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Well-maintained clinical infrastructure designed for patient safety, infection control, and comfort.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { icon: Bed, title: "General Ward", desc: "Hygienic beds with separate male/female spaces" },
              { icon: Building2, title: "Deluxe Cabins", desc: "Private AC rooms with patient attendant bed" },
              { icon: HeartPulse, title: "Critical Care", desc: "Emergency triage, vitals & oxygen support" },
              { icon: Scissors, title: "Operation Theatre", desc: "Sterile surgical suite with autoclave control" },
              { icon: Microscope, title: "Digital Lab", desc: "Automated clinical pathology testing" },
              { icon: Activity, title: "Imaging & USG", desc: "Digital Ultrasound & X-Ray diagnostics" },
            ].map((fac, idx) => {
              const FacIcon = fac.icon;
              return (
                <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs text-center">
                  <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-700 mx-auto flex items-center justify-center mb-2" aria-hidden="true">
                    <FacIcon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-xs text-slate-800">{fac.title}</h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-normal">{fac.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 13. HOW APPOINTMENT WORKS */}
      <section className="py-14 bg-white border-t border-slate-200" aria-labelledby="how-it-works-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
              Simple 4-Step Process
            </span>
            <h2 id="how-it-works-heading" className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
              How Online Appointment Works
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Get your consultation serial in less than two minutes without standing in registration queues.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Select Doctor & Specialty",
                desc: "Choose from our verified specialists by department and clinical field.",
              },
              {
                step: "02",
                title: "Choose Schedule & Date",
                desc: "Pick your preferred available visiting date and chamber timing slot.",
              },
              {
                step: "03",
                title: "Enter Patient Details",
                desc: "Fill in patient name, age, gender, and contact phone number.",
              },
              {
                step: "04",
                title: "Receive Instant Token",
                desc: "Get your digital serial token slip on screen with estimated time.",
              },
            ].map((st, idx) => (
              <div key={idx} className="relative p-5 rounded-2xl border border-slate-200 bg-slate-50/50">
                <span className="text-2xl font-black text-sky-200 block mb-2" aria-hidden="true">{st.step}</span>
                <h3 className="text-sm font-bold text-slate-900 mb-1">{st.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{st.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link
              href="/appointment"
              className="inline-flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-5 py-3 rounded-xl shadow-md transition focus:outline-none focus:ring-2 focus:ring-emerald-400 min-h-[44px]"
            >
              <Calendar className="w-4 h-4 mr-2" aria-hidden="true" />
              Book Your Appointment Now
            </Link>
          </div>
        </div>
      </section>

      {/* 14. SAFE LIVE TOKEN QUEUE INFORMATION */}
      <section className="py-12 bg-slate-50 border-t border-slate-200" aria-labelledby="live-token-info-heading">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 mx-auto flex items-center justify-center mb-3" aria-hidden="true">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 id="live-token-info-heading" className="text-xl sm:text-2xl font-bold text-slate-900">
            Privacy-Protected Live Token Displays
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed max-w-2xl mx-auto">
            Our public queue displays show only anonymized token numbers (e.g. <em>A-102</em>) and chamber status. Patient names, contact details, diagnoses, and medical histories are strictly protected by Row-Level Security and are never exposed on public screens.
          </p>
          <div className="mt-4">
            <Link
              href="/check-token"
              className="inline-flex items-center text-xs font-semibold text-sky-700 hover:text-sky-800 underline min-h-[44px]"
            >
              Track your individual token status &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* 15. LOCATION, HOURS & CONTACT */}
      <section className="py-14 bg-white border-t border-slate-200" aria-labelledby="location-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center mb-3" aria-hidden="true">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 id="location-heading" className="text-base font-bold text-slate-900 mb-2">Hospital Location</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">
                {HOSPITAL_METADATA.address}
              </p>
              <span className="text-[11px] text-slate-500 block">
                DGHS Facility ID: <strong>{HOSPITAL_METADATA.dghsFacilityId}</strong>
              </span>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3" aria-hidden="true">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Visiting &amp; Service Hours</h3>
              <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
                <li><strong>OPD Consultations:</strong> Daily 8:00 AM – 10:00 PM</li>
                <li><strong>Diagnostics &amp; Lab:</strong> 7:30 AM – 10:30 PM</li>
                <li><strong>Emergency &amp; Casualty:</strong> 24 Hours / 7 Days</li>
                <li><strong>Inpatient Visiting:</strong> 4:00 PM – 7:00 PM</li>
              </ul>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center mb-3" aria-hidden="true">
                <Phone className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Direct Contact Numbers</h3>
              <div className="space-y-2 text-xs text-slate-600">
                <div>
                  <span className="text-slate-500 block text-[11px]">Emergency Hotline:</span>
                  <a href={`tel:${HOSPITAL_METADATA.emergencyHotline}`} className="font-bold text-red-600 hover:underline">
                    {HOSPITAL_METADATA.emergencyHotline}
                  </a>
                </div>
                {HOSPITAL_METADATA.ambulanceHotline ? (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Ambulance Service:</span>
                    <a href={`tel:${HOSPITAL_METADATA.ambulanceHotline}`} className="font-bold text-slate-800 hover:underline">
                      {HOSPITAL_METADATA.ambulanceHotline}
                    </a>
                  </div>
                ) : null}
                <div>
                  <span className="text-slate-500 block text-[11px]">Reception / General Inquiry:</span>
                  <a href={`tel:${HOSPITAL_METADATA.phone}`} className="font-bold text-slate-800 hover:underline">
                    {HOSPITAL_METADATA.phone}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 16. EMERGENCY CALL TO ACTION BANNER */}
      <section className="bg-gradient-to-r from-red-700 to-rose-900 text-white py-8 px-4" aria-label="Urgent Emergency Assistance">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              Need Immediate Medical Assistance?
            </h2>
            <p className="text-xs sm:text-sm text-red-100 mt-1 max-w-xl">
              Our 24-hour casualty emergency desk and on-call medical officers are ready to receive acute patients.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 shrink-0">
            {HOSPITAL_METADATA.emergencyHotline ? (
              <a
                href={`tel:${HOSPITAL_METADATA.emergencyHotline}`}
                className="inline-flex items-center bg-white text-red-700 hover:bg-red-50 font-bold text-sm px-5 py-3 rounded-xl shadow-lg transition focus:outline-none focus:ring-2 focus:ring-white min-h-[44px]"
              >
                <Phone className="w-4 h-4 mr-2 text-red-600" aria-hidden="true" />
                Call Emergency: {HOSPITAL_METADATA.emergencyHotline}
              </a>
            ) : null}
            {HOSPITAL_METADATA.ambulanceHotline ? (
              <a
                href={`tel:${HOSPITAL_METADATA.ambulanceHotline}`}
                className="inline-flex items-center bg-red-800/80 hover:bg-red-800 text-white font-semibold text-sm px-4 py-3 rounded-xl border border-red-500/40 transition focus:outline-none focus:ring-2 focus:ring-white min-h-[44px]"
              >
                <ShieldAlert className="w-4 h-4 mr-2 text-amber-300" aria-hidden="true" />
                Ambulance: {HOSPITAL_METADATA.ambulanceHotline}
              </a>
            ) : null}
            <Link
              href="/contact"
              className="inline-flex items-center bg-red-950/60 hover:bg-red-950 text-white font-semibold text-sm px-4 py-3 rounded-xl border border-red-400/30 transition focus:outline-none focus:ring-2 focus:ring-white min-h-[44px]"
            >
              Contact Reception
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
