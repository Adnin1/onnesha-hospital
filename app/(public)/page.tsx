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
} from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { LiveQueueWidget } from "@/components/public/LiveQueueWidget";
import { FeaturedDoctorsWidget } from "@/components/public/FeaturedDoctorsWidget";

export const metadata: Metadata = {
  title: "Onnesha Hospital & Diagnostic Complex | Modern Healthcare Dhaka",
  description:
    "Book specialist doctor appointments, track live OPD token queues, 24/7 emergency care, pathology & diagnostic services at Onnesha Hospital, Dhaka, Bangladesh.",
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
                  <span>24/7 Critical Care &amp; Advanced Diagnostics in Dhaka</span>
                </div>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
                Complete Healthcare Excellence for Every Family
              </h1>

              <p className="text-sm sm:text-base text-sky-100 max-w-2xl leading-relaxed">
                Welcome to <strong>Onnesha Hospital</strong> ({HOSPITAL_METADATA.banglaName}). We provide compassionate, patient-first care backed by experienced medical specialists, modern inpatient facilities, surgical care, and accurate digital diagnostics.
              </p>

              <div className="flex flex-wrap gap-4 pt-2">
                <Link
                  href="/appointment"
                  className="inline-flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-6 py-3.5 rounded-xl shadow-lg transition focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <Calendar className="w-4 h-4 mr-2" aria-hidden="true" />
                  Book Doctor Appointment
                </Link>
                <Link
                  href="/check-token"
                  className="inline-flex items-center bg-white/10 hover:bg-white/20 text-white font-medium text-sm px-5 py-3.5 rounded-xl border border-white/20 backdrop-blur-xs transition focus:outline-none focus:ring-2 focus:ring-sky-400"
                >
                  <Clock className="w-4 h-4 mr-2 text-sky-300" aria-hidden="true" />
                  Check Live Token Status
                </Link>
              </div>

              {/* Quick stats strip */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-sky-700/60 max-w-lg">
                <div>
                  <div className="text-2xl font-bold text-white">OPD &amp; IPD</div>
                  <div className="text-xs text-sky-200">Consultant Care</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">Modern</div>
                  <div className="text-xs text-sky-200">Beds &amp; Cabins</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-400">24/7</div>
                  <div className="text-xs text-sky-200">Emergency &amp; Lab</div>
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

      {/* 2. 24/7 EMERGENCY TRIAGE BANNER — static */}
      <section className="bg-red-600 text-white py-4 px-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="flex items-center space-x-3 text-center md:text-left">
            <div className="p-2 bg-white/20 rounded-lg" aria-hidden="true">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base tracking-wide">
                24-Hour Emergency &amp; Casualty Triage Care
              </h2>
              <p className="text-xs text-white/95">
                Duty medical officers, acute patient stabilization, and casualty triage facilities available round the clock.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {HOSPITAL_METADATA.emergencyHotline ? (
              <a
                href={`tel:${HOSPITAL_METADATA.emergencyHotline}`}
                className="inline-flex items-center bg-white text-red-700 hover:bg-red-50 font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Phone className="w-3.5 h-3.5 mr-1.5 text-red-600" aria-hidden="true" />
                Call {HOSPITAL_METADATA.emergencyHotline}
              </a>
            ) : (
              <Link
                href="/contact"
                className="inline-flex items-center bg-white text-red-700 hover:bg-red-50 font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Phone className="w-3.5 h-3.5 mr-1.5 text-red-600" aria-hidden="true" />
                Contact Reception
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 3. KEY CLINICAL SPECIALTIES — static */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
              Clinical Excellence
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
              Our Core Medical Departments
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Equipped with modern medical infrastructure and compassionate healthcare professionals.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { icon: Stethoscope, title: "Medicine", desc: "Diabetes & General", color: "text-blue-600 bg-blue-50" },
              { icon: HeartPulse, title: "Cardiology", desc: "Heart & ECG", color: "text-rose-600 bg-rose-50" },
              { icon: Users, title: "Gynecology", desc: "Maternity & Obs", color: "text-pink-600 bg-pink-50" },
              { icon: Baby, title: "Pediatrics", desc: "Child Healthcare", color: "text-amber-600 bg-amber-50" },
              { icon: Bone, title: "Orthopedic", desc: "Joint & Trauma", color: "text-emerald-600 bg-emerald-50" },
              { icon: Microscope, title: "Diagnostic", desc: "Pathology & USG", color: "text-purple-600 bg-purple-50" },
            ].map((spec, i) => {
              const Icon = spec.icon;
              return (
                <div
                  key={i}
                  className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-md hover:border-sky-200 transition text-center"
                >
                  <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 ${spec.color}`} aria-hidden="true">
                    <Icon className="w-6 h-6" />
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

      {/* 4. FEATURED DOCTORS — Client Island */}
      <FeaturedDoctorsWidget />

      {/* 5. WHY ONNESHA HOSPITAL — static */}
      <section className="py-16 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
                Patient-Centered Care
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2">
                Why Patients Trust Onnesha Hospital
              </h2>
              <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                We combine experienced clinical governance, hygienic inpatient facilities, and clear itemized billing without hidden surcharges.
              </p>

              <div className="space-y-4 mt-6">
                {[
                  { title: "Digital OPD Token Management", desc: "Automated digital tokens, live waiting queue display screens, and electronic serial confirmation." },
                  { title: "Clinical Diagnostic Laboratory", desc: "Biochemistry, hematology, and clinical pathology tests with consultant-verified diagnostic reports." },
                  { title: "Transparent Itemized Billing", desc: "Computer-generated receipts, detailed breakdown for every test and medicine, with zero hidden surcharges." },
                  { title: "Clean & Spacious Inpatient Cabins", desc: "Air-conditioned cabins, general beds, and post-operative wards with 24/7 dedicated nursing staff." },
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
                  Online Services
                </span>
                <h3 className="text-2xl font-bold">
                  Need a Doctor Appointment Today?
                </h3>
                <p className="text-xs text-sky-100 leading-relaxed">
                  Book your serial online in 60 seconds. You will receive an instant Token number and confirmation on screen.
                </p>
                <div className="pt-2">
                  <Link
                    href="/appointment"
                    className="inline-flex items-center bg-white text-sky-900 hover:bg-sky-50 font-bold text-xs px-5 py-3 rounded-xl shadow-md transition focus:outline-none focus:ring-2 focus:ring-sky-300"
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

      {/* 6. FAQ Section for Visitors — static */}
      <section className="py-14 bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs uppercase tracking-wider font-semibold text-sky-700 bg-sky-100 px-3 py-1 rounded-full">
              Hospital Information
            </span>
            <h2 className="text-2xl font-bold text-slate-900 mt-3">
              সচরাচর জিজ্ঞাসিত প্রশ্ন ও ডিজিটাল সেবা তথ্য
            </h2>
            <p className="text-xs text-slate-600 mt-2">
              অন্বেষা হাসপাতালের ডিজিটাল ওপিডি পোর্টাল ও অনলাইন পরিষেবা সম্পর্কিত সাধারণ প্রশ্নাবলী
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-2">
                অনলাইন পোর্টালের ডাটাবেজ ও ক্লাউড অবকাঠামো কেমন?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                অন্বেষা হাসপাতালের ডিজিটাল ওপিডি, আইপিডি ও প্যাথলজি সিস্টেম ক্লাউড ডাটাবেজ আর্কিটেকচারে পরিচালিত। রোল-বেসড অ্যাক্সেস কন্ট্রোল এবং এনক্রিপ্টেড ট্রান্সপোর্টের মাধ্যমে ডেটা সুরক্ষিত থাকে।
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-2">
                রোগীর ব্যক্তিগত ও মেডিকেল তথ্যের নিরাপত্তা কীভাবে নিশ্চিত হয়?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                রোগীদের প্রেসক্রিপশন ও ডায়াগনস্টিক রিপোর্ট Row-Level Security (RLS) অ্যাক্সেস কন্ট্রোল এবং নিরাপদ HTTPS প্রোটোকলের মাধ্যমে পরিচালিত। অনুমোদিত ডাক্তার ও হাসপাতাল স্টাফ ব্যতীত তৃতীয় কোনো পক্ষ এই তথ্যে অ্যাক্সেস করতে পারে না।
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-2">
                অনলাইনে সিরিয়াল নেওয়ার পর কীভাবে কনফার্মেশন পাওয়া যায়?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                অনলাইনে অ্যাপয়েন্টমেন্ট সম্পন্ন হওয়ার সাথে সাথে ডিজিটাল টোকেন নম্বর প্রদান করা হয় এবং কনফার্মেশন স্লিপ প্রিন্ট বা সেভ করে রাখা যায়। নির্ধারিত সময়ে হাসপাতালে পৌঁছালে সরাসরি ওপিডি ডক্টরস চেম্বারে টোকেন সিরিয়াল ট্র্যাক করা যায়।
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-2">
                জরুরি পরিস্থিতিতে সরাসরি যোগাযোগ করার মাধ্যম কী?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                জরুরি প্রয়োজনে আমাদের ২৪/৭ ট্রমা ও ক্যাজুয়ালটি হটলাইন{HOSPITAL_METADATA.phone ? ` ${HOSPITAL_METADATA.phone}` : ""}{HOSPITAL_METADATA.ambulanceHotline ? ` অথবা জরুরি অ্যাম্বুলেন্স সেবা ${HOSPITAL_METADATA.ambulanceHotline}` : ""}-এ যেকোনো সময় সরাসরি কল করা যাবে অথবা <Link href="/contact" className="text-sky-600 underline">যোগাযোগ পাতায়</Link> আসুন।
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
