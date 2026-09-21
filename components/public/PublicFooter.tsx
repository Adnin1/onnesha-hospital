import React from "react";
import Link from "next/link";
import { Phone, Mail, MapPin, ShieldCheck, Heart } from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";

export function PublicFooter() {
  return (
    <footer className="bg-slate-900 text-slate-300 pt-14 pb-8 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {/* Col 1: About */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-sky-600 text-white font-bold flex items-center justify-center text-lg">
                OH
              </div>
              <span className="text-lg font-bold text-white tracking-wide">
                ONNESHA HOSPITAL
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-400 mb-4">
              Dedicated to delivering compassionate, patient-first healthcare and reliable diagnostic services with experienced medical consultants and healthcare professionals.
            </p>
            {HOSPITAL_METADATA.regNo ? (
              <div className="flex items-center text-xs text-sky-400 font-medium">
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                {HOSPITAL_METADATA.regNo}
              </div>
            ) : null}
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Quick Portals & Legal
            </h3>
            <ul className="space-y-2 text-xs text-slate-300">
              <li>
                <Link href="/doctors" className="hover:text-sky-400 transition">
                  Specialist Doctor Directory
                </Link>
              </li>
              <li>
                <Link href="/appointment" className="hover:text-sky-400 transition">
                  Book OPD Appointment Online
                </Link>
              </li>
              <li>
                <Link href="/check-token" className="hover:text-sky-400 transition">
                  Check Live Token Status
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-sky-400 transition">
                  Pathology & Digital Radiology
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-sky-400 transition">
                  Privacy Policy (PDPA 2026)
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-sky-400 transition">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/consent" className="hover:text-sky-400 transition">
                  Patient Consent Guide
                </Link>
              </li>
              <li>
                <Link href="/downloads/desktop" className="hover:text-sky-400 transition">
                  Windows Desktop Application
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-sky-400 transition text-sky-400 font-medium">
                  Hospital Staff Portal Login →
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Clinical Services */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Clinical Care
            </h3>
            <ul className="space-y-2 text-xs text-slate-300">
              <li>Emergency Triage & Acute Care</li>
              <li>Inpatient General & Cabin Wards</li>
              <li>Surgical Operation Theatres (OT)</li>
              <li>Pediatric Care & Child Health</li>
              <li>Maternity & Post-Natal Unit</li>
              <li>In-House Hospital Pharmacy</li>
            </ul>
          </div>

          {/* Col 4: Contact & Hotlines */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Hospital Contact Lines
            </h3>
            <ul className="space-y-3 text-xs">
              {HOSPITAL_METADATA.address && (
                <li className="flex items-start">
                  <MapPin className="w-4 h-4 mr-2 text-sky-400 shrink-0 mt-0.5" />
                  <span>{HOSPITAL_METADATA.address}</span>
                </li>
              )}
              {HOSPITAL_METADATA.phone && (
                <li className="flex items-center">
                  <Phone className="w-4 h-4 mr-2 text-emerald-400 shrink-0" />
                  <span>Hotline: {HOSPITAL_METADATA.phone}</span>
                </li>
              )}
              {HOSPITAL_METADATA.ambulanceHotline && (
                <li className="flex items-center">
                  <Phone className="w-4 h-4 mr-2 text-red-400 shrink-0" />
                  <span>Ambulance: {HOSPITAL_METADATA.ambulanceHotline}</span>
                </li>
              )}
              {HOSPITAL_METADATA.email && (
                <li className="flex items-center">
                  <Mail className="w-4 h-4 mr-2 text-sky-400 shrink-0" />
                  <span>{HOSPITAL_METADATA.email}</span>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Hospital Quality & Patient Data Security Statement */}
        <div className="pt-8 pb-6 border-t border-slate-800 text-slate-400 text-xs leading-relaxed">
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
            <div className="max-w-3xl">
              <span className="text-white font-semibold flex items-center gap-1.5 mb-1.5 text-sm">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                রোগীর তথ্যের নিরাপত্তা ও আধুনিক স্বাস্থ্যসেবা
              </span>
              <p className="text-slate-300 text-xs leading-normal">
                অন্বেষা হাসপাতালের ডিজিটাল পোর্টাল ও ইএমআর সিস্টেম রোল-বেসড অ্যাক্সেস কন্ট্রোল (RBAC) এবং রো-লেভেল সিকিউরিটি (RLS) ব্যবহার করে পরিচালিত। 
                শুধুমাত্র অনুমোদিত স্বাস্থ্যকর্মীরা রোগীর তথ্যে প্রবেশ করতে পারেন এবং সমস্ত যোগাযোগ এনক্রিপ্টেড সংযোগের মাধ্যমে পরিচালিত হয়।
              </p>
            </div>
            <div className="shrink-0 flex flex-col justify-center text-left md:text-right text-[11px] text-slate-300 space-y-1 bg-slate-900/60 p-3 rounded-lg border border-slate-750">
              <span className="text-emerald-400 font-semibold flex items-center md:justify-end gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Online Patient Services
              </span>
              <span className="text-slate-400">Role-based Access Control</span>
              <span className="text-slate-400">Encrypted Transport (HTTPS)</span>
            </div>
          </div>
        </div>


        {/* Bottom copyright */}
        <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-300 gap-2">
          <p>© 2026 Onnesha Hospital. All rights reserved.</p>
          <p className="flex items-center">
            Built with <Heart className="w-3.5 h-3.5 text-rose-500 mx-1 inline" /> for compassionate healthcare
          </p>
        </div>
      </div>
    </footer>
  );
}
