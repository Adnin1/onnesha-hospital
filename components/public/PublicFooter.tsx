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
              Dedicated to delivering compassionate, patient-first healthcare and state-of-the-art diagnostic testing with Bangladesh’s leading consultants and surgeons.
            </p>
            <div className="flex items-center text-xs text-sky-400 font-medium">
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              {HOSPITAL_METADATA.regNo}
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Quick Portals
            </h3>
            <ul className="space-y-2 text-xs">
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
                <Link href="/login" className="hover:text-sky-400 transition">
                  Hospital Staff Portal Login
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Clinical Services */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Clinical Care
            </h3>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>24/7 Emergency & Trauma Center</li>
              <li>Intensive Care Unit (ICU & CCU)</li>
              <li>Modern Laparoscopic Surgery OT</li>
              <li>Pediatrics & Neonatal Care (NICU)</li>
              <li>Maternity & Normal Delivery Unit</li>
              <li>24 Hours In-house Pharmacy</li>
            </ul>
          </div>

          {/* Col 4: Contact & Hotlines */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              24/7 Contact Lines
            </h3>
            <ul className="space-y-3 text-xs">
              <li className="flex items-start">
                <MapPin className="w-4 h-4 mr-2 text-sky-400 shrink-0 mt-0.5" />
                <span>{HOSPITAL_METADATA.address}</span>
              </li>
              <li className="flex items-center">
                <Phone className="w-4 h-4 mr-2 text-emerald-400 shrink-0" />
                <span>Hotline: {HOSPITAL_METADATA.phone}</span>
              </li>
              <li className="flex items-center">
                <Phone className="w-4 h-4 mr-2 text-red-400 shrink-0" />
                <span>Ambulance: {HOSPITAL_METADATA.ambulanceHotline}</span>
              </li>
              <li className="flex items-center">
                <Mail className="w-4 h-4 mr-2 text-sky-400 shrink-0" />
                <span>{HOSPITAL_METADATA.email}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-2">
          <p>© 2026 Onnesha Hospital. All rights reserved.</p>
          <p className="flex items-center">
            Built with <Heart className="w-3.5 h-3.5 text-rose-500 mx-1 inline" /> for compassionate healthcare
          </p>
        </div>
      </div>
    </footer>
  );
}
