import React from "react";
import Link from "next/link";
import {
  Activity,
  Microscope,
  CheckCircle,
  Calendar,
  Clock,
  Info,
} from "lucide-react";
import { formatCurrencyBDT } from "@/lib/utils";
import { DIAGNOSTIC_TARIFF_CONFIG } from "@/config/tariffs";


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
            Modern diagnostic imaging, automated pathology investigations, inpatient wards, and round-the-clock emergency casualty triage.
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
                title: "24/7 Emergency & Casualty Triage",
                desc: "Equipped with cardiac monitors, emergency resuscitation equipment, and duty medical officers available for acute care.",
                points: ["Immediate Trauma Triage", "Emergency Patient Stabilization", "24/7 Casualty Reception"],
              },
              {
                title: "Inpatient Observation & Step-Down Care",
                desc: "Multipara patient monitors, oxygen support facilities, and close nursing supervision for post-procedure recovery.",
                points: ["Continuous Vitals Monitoring", "Oxygen Delivery Support", "Post-Procedure Recovery Care"],
              },
              {
                title: "Maternity & Neonatal Health",
                desc: "Dedicated labor and delivery suites, newborn phototherapy equipment, and post-natal maternal consultation.",
                points: ["Obstetric Specialist Consultations", "Newborn Care Support", "Post-Delivery Patient Care"],
              },
              {
                title: "Surgical Operation Theatres (OT)",
                desc: "Equipped operating rooms with sterile infection control protocols and standard surgical monitoring systems.",
                points: ["General Surgery Procedures", "Orthopedic Trauma Support", "Sterile Surgical Environment"],
              },
              {
                title: "Cardiology & Non-Invasive Investigations",
                desc: "Diagnostic assessment for hypertension, cardiac rhythm evaluation, and outpatient heart health consultation.",
                points: ["12-Lead Digital ECG", "Echocardiography Services", "Hypertension Clinical Review"],
              },
              {
                title: "Inpatient Wards & Cabins",
                desc: "Hygienic general inpatient wards, AC and non-AC patient cabins with dedicated nursing attention.",
                points: ["Piped Medical Gas Supply", "Dietary Planning Support", "Daily Inpatient Ward Rounds"],
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
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                  {DIAGNOSTIC_TARIFF_CONFIG.tariffStatus.replace("_", " ")}
                </span>
                <span className="text-[11px] text-slate-400">
                  Last reviewed: {DIAGNOSTIC_TARIFF_CONFIG.lastAuditedDate}
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center">
                <Microscope className="w-5 h-5 mr-2 text-sky-600" />
                Indicative Diagnostic & Laboratory Tariffs
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Reference pricing schedule for patient orientation. Confirm current fees and schedule with the cash counter.
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

          {/* Bilingual Disclaimer */}
          <div className="mb-6 p-4 bg-amber-50/80 border border-amber-200/80 rounded-xl space-y-2 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p><strong>Notice:</strong> {DIAGNOSTIC_TARIFF_CONFIG.disclaimerEn}</p>
                <p className="text-[11px] text-amber-800">{DIAGNOSTIC_TARIFF_CONFIG.disclaimerBn}</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 font-bold">Investigation / Test Name</th>
                  <th className="py-3 px-4 font-bold">Category</th>
                  <th className="py-3 px-4 font-bold">Turnaround Window*</th>
                  <th className="py-3 px-4 font-bold text-right">Indicative Fee*</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {DIAGNOSTIC_TARIFF_CONFIG.investigations.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900">{t.name}</td>
                    <td className="py-3 px-4 text-slate-500">{t.category}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center text-sky-800 bg-sky-50 px-2 py-0.5 rounded font-medium text-[11px]">
                        <Clock className="w-3 h-3 mr-1 text-sky-600" />
                        {t.standardTurnaround}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-emerald-700 text-sm">
                      {formatCurrencyBDT(t.indicativeFeeBDT)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 mt-4 italic">
            * All fees and turnaround windows are reference indicators subject to clinician instructions and urgent processing options.
          </p>
        </div>
      </div>
    </div>
  );
}
