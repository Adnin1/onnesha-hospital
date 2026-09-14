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
import { formatCurrencyBDT } from "@/lib/utils";

const PUBLIC_INVESTIGATIONS = [
  { name: "Complete Blood Count (CBC) with ESR", category: "Hematology", fee: 400, turnaround: "2 Hours" },
  { name: "Fasting Blood Sugar (FBS) & HbA1c", category: "Biochemistry", fee: 900, turnaround: "3 Hours" },
  { name: "Lipid Profile (Cholesterol, Triglycerides, HDL/LDL)", category: "Biochemistry", fee: 1200, turnaround: "4 Hours" },
  { name: "Serum Creatinine & Blood Urea Nitrogen", category: "Renal Panel", fee: 600, turnaround: "2 Hours" },
  { name: "Liver Function Test (SGPT, SGOT, Bilirubin, Alk Phos)", category: "Hepatic Panel", fee: 1100, turnaround: "4 Hours" },
  { name: "Digital Chest X-Ray (P/A View High-Res)", category: "Digital Radiology", fee: 650, turnaround: "1 Hour" },
  { name: "Ultrasonography (Whole Abdomen 4D Doppler)", category: "Ultrasonography", fee: 1500, turnaround: "Same Day" },
  { name: "12-Lead Electrocardiogram (ECG with Interpretation)", category: "Cardiology", fee: 450, turnaround: "30 Mins" },
  { name: "2D Color Doppler Echocardiography", category: "Cardiology", fee: 2500, turnaround: "Same Day" },
  { name: "Thyroid Stimulating Hormone (TSH / FT3 / FT4)", category: "Immunology", fee: 1600, turnaround: "Same Day" },
];

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
            Specialized Hospital Departments & Inpatient Units
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
                desc: "Laminar air-flow system with HEPA filtration, state-of-the-art anesthesia workstations, and high-definition laparoscopy towers.",
                points: ["Laparoscopic Cholecystectomy", "General & Orthopedic Trauma Surgery", "Sterile Infection-Controlled Zones"],
              },
              {
                title: "Cardiology & Non-Invasive Cardiac Lab",
                desc: "Comprehensive diagnostic assessment for hypertension, ischemic heart disease, heart failure, and rhythm disorders.",
                points: ["12-Lead Digital ECG", "2D Color Doppler Echo", "24/7 Acute Coronary Syndromes Care"],
              },
              {
                title: "Inpatient Wards, Cabins & Suite Rooms",
                desc: "Hygienic general wards, AC/Non-AC semi-private cabins, and deluxe suites with dedicated nursing call systems.",
                points: ["Central Medical Gas Pipeline", "Nutritious Inpatient Diet Plans", "Round-the-clock Resident Doctors"],
              },
            ].map((srv, idx) => (
              <div key={idx} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-base text-slate-900 mb-2">{srv.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">{srv.desc}</p>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {srv.points.map((pt, pidx) => (
                      <li key={pidx} className="flex items-center">
                        <CheckCircle className="w-3.5 h-3.5 text-sky-600 mr-2 shrink-0" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Diagnostic Investigation & Test Catalog */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center">
                <Microscope className="w-5 h-5 mr-2 text-sky-600" />
                Laboratory & Diagnostic Investigation Rates
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Official DGHS-standard pathology and digital imaging tariff schedule.
              </p>
            </div>
            <Link
              href="/appointment"
              className="inline-flex items-center bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-xs transition"
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              Book Consultation First
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 font-bold">Investigation / Test Name</th>
                  <th className="py-3 px-4 font-bold">Category</th>
                  <th className="py-3 px-4 font-bold">Turnaround Time</th>
                  <th className="py-3 px-4 font-bold text-right">Standard Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {PUBLIC_INVESTIGATIONS.map((t, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900">{t.name}</td>
                    <td className="py-3 px-4 text-slate-500">{t.category}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center text-sky-800 bg-sky-50 px-2 py-0.5 rounded font-medium text-[11px]">
                        <Clock className="w-3 h-3 mr-1 text-sky-600" />
                        {t.turnaround}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-emerald-700 text-sm">
                      {formatCurrencyBDT(t.fee)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
