import React from "react";
import Link from "next/link";
import {
  Activity,
  Microscope,
  HeartPulse,
  Syringe,
  Baby,
  Bone,
  CheckCircle,
  Calendar,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { MOCK_LAB_TESTS } from "@/lib/mock-data";
import { formatCurrencyBDT } from "@/lib/utils";

export default function ServicesPage() {
  return (
    <div className="py-12 bg-slate-50 min-h-[80vh]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
            Clinical Facilities & Diagnostics
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Comprehensive Hospital & Laboratory Services
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Modern high-resolution imaging, automated biochemistry testing, fully equipped ICUs, and 24-hour trauma care.
          </p>
        </div>

        {/* 1. Clinical Inpatient & Outpatient Departments */}
        <div className="mb-14">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-sky-600" />
            Specialized Hospital Departments
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "24/7 Emergency & Critical Care",
                desc: "Equipped with defibrillators, crash carts, cardiac monitors, and emergency medical officers on duty round the clock.",
                points: ["Immediate Trauma Care", "Cardiac Emergency Stabilization", "Dedicated Emergency OT & Triage"],
              },
              {
                title: "Intensive Care Unit (ICU & CCU)",
                desc: "Advanced multipara monitors, invasive/non-invasive mechanical ventilators, central oxygen supply, and 1:1 nurse-to-patient ratio.",
                points: ["Centralized Monitoring", "High-flow Nasal Cannula", "Post-Surgical Critical Support"],
              },
              {
                title: "Maternity & Neonatal Care (NICU)",
                desc: "Modern labor delivery recovery suites, painless normal delivery options, phototherapy units, and neonatal incubators.",
                points: ["Experienced Female Obstetricians", "Advanced NICU Incubators", "24/7 Emergency Cesarean Section"],
              },
              {
                title: "Modern Modular Operation Theater (OT)",
                desc: "Laminar airflow, HEPA filtration, modern anesthesia workstations, and high-definition laparoscopy towers.",
                points: ["Laparoscopic Gallbladder & Appendix", "General & Orthopedic Trauma Surgery", "Sterile Post-Operative Recovery Ward"],
              },
              {
                title: "Inpatient Wards & Luxury Cabins",
                desc: "Hygienic general wards for male/female patients, VIP AC cabins, and private Deluxe suites with attendant facilities.",
                points: ["Air-Conditioned VIP Cabins", "Nutritious Inpatient Diet", "Continuous Nursing Care"],
              },
              {
                title: "24-Hour Hospital Pharmacy",
                desc: "Complete stock of life-saving medicines, IV fluids, oncology drugs, and surgical consumables with computerized receipts.",
                points: ["100% Genuine Stored Medicines", "Proper Cold Chain Maintenance", "Direct Inpatient Ward Dispensing"],
              },
            ].map((srv, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <h3 className="font-bold text-base text-slate-900 mb-2">
                    {srv.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">
                    {srv.desc}
                  </p>
                  <ul className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-700">
                    {srv.points.map((pt, i) => (
                      <li key={i} className="flex items-center">
                        <CheckCircle className="w-3.5 h-3.5 mr-2 text-emerald-500 shrink-0" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Diagnostic & Lab Test Catalog */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-100 gap-4">
            <div>
              <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
                Laboratory Catalog & Transparent Tariffs
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-1">
                Popular Pathology & Diagnostic Tests
              </h2>
            </div>
            <div className="text-xs text-slate-500 flex items-center bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <Clock className="w-3.5 h-3.5 mr-1.5 text-sky-600" />
              Sample Collection: 07:00 AM - 10:00 PM Daily
            </div>
          </div>

          <div className="overflow-x-auto mt-6">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider text-[11px] border-y border-slate-200">
                <tr>
                  <th className="py-3 px-4">Test Name</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Sample Type</th>
                  <th className="py-3 px-4">Delivery Time</th>
                  <th className="py-3 px-4 text-right">Hospital Tariff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MOCK_LAB_TESTS.map((test) => (
                  <tr key={test.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {test.name}
                      <span className="block text-[10px] text-slate-400 font-mono">
                        Code: {test.code}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{test.category_name}</td>
                    <td className="py-3.5 px-4">
                      <span className="capitalize px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium text-[10px]">
                        {test.sample_type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      Within {test.delivery_hours} Hours
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700 text-sm">
                      {formatCurrencyBDT(test.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 bg-sky-800 text-white rounded-2xl p-8 flex flex-col sm:flex-row justify-between items-center gap-6 shadow-md">
          <div>
            <h3 className="text-xl font-bold">Have a Doctor Prescription for Diagnostic Tests?</h3>
            <p className="text-xs text-sky-100 mt-1">
              Visit our reception counter directly for fast-track sample collection and same-day reports.
            </p>
          </div>
          <Link
            href="/appointment"
            className="inline-flex items-center bg-white text-sky-900 hover:bg-sky-50 font-bold text-xs px-5 py-3 rounded-xl transition shadow-xs shrink-0"
          >
            <Calendar className="w-4 h-4 mr-2 text-sky-700" />
            Book OPD Consultation
          </Link>
        </div>
      </div>
    </div>
  );
}
