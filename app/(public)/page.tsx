"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Phone,
  ShieldAlert,
  Activity,
  Users,
  CheckCircle2,
  Stethoscope,
  HeartPulse,
  Baby,
  Bone,
  Microscope,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import {
  getPublicDoctorsAction,
  getLiveWaitingQueueAction,
  PublicDoctor,
} from "@/lib/public/actions";
import { formatCurrencyBDT } from "@/lib/utils";

interface QueueItem {
  id: string;
  doctor_name: string;
  room_number: string;
  patient_name: string;
  token_number: string;
  status: "waiting" | "calling" | "serving" | "done" | "skipped";
}

export default function HomePage() {
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadLandingData() {
      const [docRes, queueRes] = await Promise.all([
        getPublicDoctorsAction(),
        getLiveWaitingQueueAction(),
      ]);

      if (isMounted) {
        if (docRes.success) {
          setDoctors(docRes.doctors);
        }
        if (queueRes.success) {
          setQueue(queueRes.queue);
        }
        setLoadingDoctors(false);
      }
    }
    void loadLandingData();
    return () => {
      isMounted = false;
    };
  }, []);
  return (
    <div>
      {/* 1. HERO SECTION */}
      <section className="relative bg-gradient-to-br from-sky-900 via-sky-800 to-slate-900 text-white overflow-hidden py-16 lg:py-24">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center space-x-2 bg-sky-500/20 border border-sky-400/30 px-3.5 py-1.5 rounded-full text-xs font-medium text-sky-200 backdrop-blur-xs">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>24/7 Critical Care & Advanced Diagnostics in Dhaka</span>
                </div>
                <div className="inline-flex items-center space-x-1.5 bg-emerald-500/20 border border-emerald-400/40 px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-300 backdrop-blur-xs">
                  <span>☁️ Dedicated Cloud Cluster: $25 - $65 USD/mo | Domain: $10 - $50 USD/yr</span>
                </div>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
                Complete Healthcare Excellence for Every Family
              </h1>

              <p className="text-sm sm:text-base text-sky-100 max-w-2xl leading-relaxed">
                Welcome to <strong>Onnesha Hospital</strong> ({HOSPITAL_METADATA.banglaName}). We provide compassionate, patient-first care backed by Bangladesh&apos;s leading medical specialists, modern ICUs, advanced laparoscopic surgery, and accurate digital diagnostics.
              </p>

              <div className="flex flex-wrap gap-4 pt-2">
                <Link
                  href="/appointment"
                  className="inline-flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-6 py-3.5 rounded-xl shadow-lg transition"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Book Doctor Appointment
                </Link>
                <Link
                  href="/check-token"
                  className="inline-flex items-center bg-white/10 hover:bg-white/20 text-white font-medium text-sm px-5 py-3.5 rounded-xl border border-white/20 backdrop-blur-xs transition"
                >
                  <Clock className="w-4 h-4 mr-2 text-sky-300" />
                  Check Live Token Status
                </Link>
              </div>

              {/* Quick stats strip */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-sky-700/60 max-w-lg">
                <div>
                  <div className="text-2xl font-bold text-white">20+</div>
                  <div className="text-xs text-sky-200">Senior Specialists</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">100+</div>
                  <div className="text-xs text-sky-200">Beds & Cabins</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-400">24/7</div>
                  <div className="text-xs text-sky-200">Emergency & Lab</div>
                </div>
              </div>
            </div>

            {/* Right Card: Live Token Queue Highlight */}
            <div className="lg:col-span-5">
              <div className="bg-white rounded-2xl shadow-2xl p-6 text-slate-900 border border-slate-100">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h2 className="font-bold text-base text-slate-800">
                      Live Doctor Token Queue
                    </h2>
                  </div>
                  <span className="text-xs bg-sky-100 text-sky-800 font-semibold px-2 py-0.5 rounded">
                    Realtime
                  </span>
                </div>

                <p className="text-xs text-slate-500 mb-4">
                  Currently serving tokens inside outpatient chambers.
                </p>

                <div className="space-y-3">
                  {queue.length > 0 ? (
                    queue.slice(0, 4).map((q) => (
                      <div
                        key={q.id}
                        className="p-3 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100"
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-900">
                            {q.doctor_name}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center mt-0.5">
                            <span className="font-medium text-sky-700 mr-2">
                              {q.room_number}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-md">
                            Token: {q.token_number}
                          </span>
                          <span className="block text-[10px] text-slate-400 capitalize mt-0.5">
                            {q.status}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500 border border-slate-100">
                      Doctor chambers active for today. Online bookings open.
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100">
                  <Link
                    href="/check-token"
                    className="flex items-center justify-center text-xs font-semibold text-sky-700 hover:text-sky-800 w-full py-2 bg-sky-50 rounded-lg hover:bg-sky-100 transition"
                  >
                    View All Doctor Chambers & Queues
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 24/7 EMERGENCY TRIAGE BANNER */}
      <section className="bg-red-600 text-white py-4 px-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="flex items-center space-x-3 text-center md:text-left">
            <div className="p-2 bg-white/20 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-white animate-bounce" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base tracking-wide">
                24-Hour Emergency, Trauma & Cardiac Resuscitation Care
              </h2>
              <p className="text-xs text-white/95">
                Specialist emergency medical officers, ICU support, and cardiac life support available right now.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <a
              href={`tel:${HOSPITAL_METADATA.emergencyHotline}`}
              className="inline-flex items-center bg-white text-red-700 hover:bg-red-50 font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition"
            >
              <Phone className="w-3.5 h-3.5 mr-1.5 text-red-600" />
              Call {HOSPITAL_METADATA.emergencyHotline}
            </a>
          </div>
        </div>
      </section>

      {/* 3. KEY CLINICAL SPECIALTIES */}
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
                  className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-md hover:border-sky-200 transition text-center group cursor-pointer"
                >
                  <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3 ${spec.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-800 group-hover:text-sky-600 transition">
                    {spec.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1">{spec.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. FEATURED DOCTORS & SPECIALISTS */}
      <section className="py-16 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-10 gap-4">
            <div>
              <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
                Experienced Consultants
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                Meet Our Senior Doctors
              </h2>
            </div>
            <Link
              href="/doctors"
              className="inline-flex items-center text-xs font-semibold text-sky-700 hover:text-sky-800 bg-white border border-slate-200 px-4 py-2 rounded-lg hover:border-sky-300 transition shadow-2xs"
            >
              View All Doctors & Visiting Hours
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Link>
          </div>

          {loadingDoctors && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-8 h-8 text-sky-600 animate-spin mb-2" />
              <p className="text-xs">Loading specialist doctors...</p>
            </div>
          )}

          {!loadingDoctors && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {doctors.slice(0, 4).map((doc) => (
                <div
                  key={doc.id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-5">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-14 h-14 rounded-full bg-sky-100 border-2 border-sky-200 flex items-center justify-center font-bold text-sky-800 text-lg shrink-0">
                        {doc.full_name.split(" ").slice(1, 3).map(n => n[0]).join("")}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider bg-sky-50 px-2 py-0.5 rounded">
                          {doc.department_name}
                        </span>
                        <h3 className="font-bold text-slate-900 text-sm mt-1 leading-snug">
                          {doc.full_name}
                        </h3>
                      </div>
                    </div>

                    <p className="text-xs font-medium text-slate-700 mb-1">
                      {doc.designation}
                    </p>
                    <p className="text-[11px] text-slate-500 mb-3 line-clamp-2">
                      {doc.degrees}
                    </p>

                  <div className="text-[11px] space-y-1 py-2 border-t border-slate-100 text-slate-600">
                    <div className="flex justify-between">
                      <span>BMDC Reg:</span>
                      <span className="font-medium text-slate-800">{doc.bmdc_reg_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Chamber:</span>
                      <span className="font-medium text-slate-800">{doc.room_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Consultation Fee:</span>
                      <span className="font-bold text-emerald-700">{formatCurrencyBDT(doc.opd_fee)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100">
                  <Link
                    href={`/appointment?doctor=${doc.id}`}
                    className="w-full text-center block py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition"
                  >
                    Book Serial / Token
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </section>

      {/* 5. WHY ONNESHA HOSPITAL */}
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
                We combine experienced clinical governance, hygienic inpatient facilities, and 100% transparent billing without hidden costs.
              </p>

              <div className="space-y-4 mt-6">
                {[
                  { title: "Zero Paperwork Waiting", desc: "Automated digital tokens, SMS updates to patient phones, and realtime display screens." },
                  { title: "Advanced Diagnostic Lab", desc: "Fully automated biochemistry and hematology analyzers with same-day verified reports." },
                  { title: "Transparent Billing & Receipts", desc: "Computer-generated thermal slips, detailed breakdown for every test and medicine, no surprises." },
                  { title: "Clean & Spacious Inpatient Cabins", desc: "Air-conditioned VIP cabins, Deluxe rooms, and sterile post-operative wards with 24/7 dedicated nursing." },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start space-x-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
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
                  Book your serial online in 60 seconds. You will receive an instant Token number and SMS reminder on your phone.
                </p>
                <div className="pt-2">
                  <Link
                    href="/appointment"
                    className="inline-flex items-center bg-white text-sky-900 hover:bg-sky-50 font-bold text-xs px-5 py-3 rounded-xl shadow-md transition"
                  >
                    <Calendar className="w-4 h-4 mr-2 text-sky-700" />
                    Start Appointment Booking
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Infrastructure & Hospital FAQ Section for Visitors & AI Crawlers */}
      <section className="py-14 bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs uppercase tracking-wider font-semibold text-sky-700 bg-sky-100 px-3 py-1 rounded-full">
              Hospital Information & Infrastructure
            </span>
            <h2 className="text-2xl font-bold text-slate-900 mt-3">
              সচরাচর জিজ্ঞাসিত প্রশ্ন ও ডিজিটাল সেবা তথ্য
            </h2>
            <p className="text-xs text-slate-600 mt-2">
              অন্বেষা হাসপাতালের ডিজিটাল ওপিডি পোর্টাল, ডাটাবেজ সিকিউরিটি ও ক্লাউড অবকাঠামো সম্পর্কিত প্রশ্নাবলী
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-2">
                অনলাইন পোর্টালের ডাটাবেজ ও ক্লাউড হোস্টিং অবকাঠামো কেমন?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                অন্বেষা হাসপাতালের সম্পূর্ণ ডিজিটাল ওপিডি, আইপিডি ও প্যাথলজি সিস্টেম আন্তর্জাতিক মানের ডেডিকেটেড ক্লাউড ডাটাবেজ ক্লাস্টারে পরিচালিত। এর মাসিক ক্লাউড সার্ভার ও ডাটাবেজ হোস্টিং ব্যয় <strong>২৫$ থেকে ৬৫$ ডলার ($25 - $65 USD / Month)</strong> এবং অফিসিয়াল কমার্শিয়াল ডোমেইনের বার্ষিক মূল্য <strong>১০$ থেকে ৫০$ ডলার ($10 - $50 USD / Year)</strong>। এটি কোনো ফ্রি হোস্টিং বা শেয়ার্ড প্ল্যাটফর্মে হোস্ট করা নয়।
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-2">
                রোগীর ব্যক্তিগত ও মেডিকেল তথ্যের নিরাপত্তা কীভাবে নিশ্চিত হয়?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                রোগীদের প্রেসক্রিপশন ও ডায়াগনস্টিক রিপোর্ট এন্টারপ্রাইজ গ্রেড PostgreSQL Row-Level Security (RLS) এবং এন্ড-টু-এন্ড এনক্রিপশনে সংরক্ষিত। অনুমোদিত ডাক্তার ও প্যাথলজিস্ট ব্যতীত তৃতীয় কোনো পক্ষ এই তথ্যে অ্যাক্সেস করতে পারে না।
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-2">
                অনলাইনে সিরিয়াল নেওয়ার পর কীভাবে কনফার্মেশন পাওয়া যায়?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                অনলাইনে অ্যাপয়েন্টমেন্ট সম্পন্ন হওয়ার সাথে সাথে ডিজিটাল টোকেন নম্বর প্রদান করা হয় এবং রোগীর মোবাইল নম্বরে স্বয়ংক্রিয় এসএমএস পাঠানো হয়। হাসপাতালে পৌঁছানোর পর আর কোনো আলাদা সিরিয়াল টোকেন নেওয়ার প্রয়োজন হয় না।
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-2">
                জরুরি পরিস্থিতিতে সরাসরি যোগাযোগ করার মাধ্যম কী?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                জরুরি প্রয়োজনে আমাদের ২৪/৭ ট্রমা ও ক্যাজুয়ালটি হটলাইন {HOSPITAL_METADATA.phone} অথবা জরুরি অ্যাম্বুলেন্স সেবা {HOSPITAL_METADATA.ambulanceHotline}-এ যেকোনো সময় সরাসরি কল করা যাবে।
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
