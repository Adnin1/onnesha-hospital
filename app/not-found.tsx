import React from "react";
import Link from "next/link";
import { Stethoscope, Calendar, ArrowLeft, Phone, Clock } from "lucide-react";

export default function NotFound() {
  return (
    <main id="main-content" className="min-h-[75vh] flex items-center justify-center bg-slate-50 px-4 py-16">
      <div className="max-w-lg w-full text-center bg-white rounded-3xl p-8 sm:p-10 border border-slate-200 shadow-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-50 text-sky-600 mb-6 border border-sky-100">
          <Stethoscope className="w-8 h-8" />
        </div>

        <span className="text-xs font-bold text-sky-600 uppercase tracking-widest bg-sky-50 px-3 py-1 rounded-full">
          Error 404
        </span>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-4 tracking-tight">
          Page Not Found
        </h1>
        <p className="text-sm font-semibold text-slate-700 mt-1">
          পৃষ্ঠাটি খুঁজে পাওয়া যায়নি
        </p>

        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          The page or clinical resource you requested is not available. Please verify the URL or navigate to one of our primary patient care portals below.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 text-left">
          <Link
            href="/"
            className="flex items-center p-3 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 transition group"
          >
            <ArrowLeft className="w-4 h-4 text-sky-600 mr-2.5 shrink-0 group-hover:-translate-x-0.5 transition-transform" />
            <div>
              <div className="text-xs font-bold text-slate-800">Hospital Home</div>
              <div className="text-[10px] text-slate-500">মূল পাতায় ফিরুন</div>
            </div>
          </Link>

          <Link
            href="/appointment"
            className="flex items-center p-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition group"
          >
            <Calendar className="w-4 h-4 text-emerald-600 mr-2.5 shrink-0" />
            <div>
              <div className="text-xs font-bold text-slate-800">Book Serial</div>
              <div className="text-[10px] text-slate-500">অনলাইন সিরিয়াল</div>
            </div>
          </Link>

          <Link
            href="/check-token"
            className="flex items-center p-3 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 transition group"
          >
            <Clock className="w-4 h-4 text-sky-600 mr-2.5 shrink-0" />
            <div>
              <div className="text-xs font-bold text-slate-800">Live Token Queue</div>
              <div className="text-[10px] text-slate-500">লাইভ সিরিয়াল ট্র্যাক</div>
            </div>
          </Link>

          <Link
            href="/contact"
            className="flex items-center p-3 rounded-xl border border-slate-200 hover:border-rose-300 hover:bg-rose-50/50 transition group"
          >
            <Phone className="w-4 h-4 text-rose-600 mr-2.5 shrink-0" />
            <div>
              <div className="text-xs font-bold text-slate-800">Emergency Desk</div>
              <div className="text-[10px] text-slate-500">জরুরি যোগাযোগ</div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
