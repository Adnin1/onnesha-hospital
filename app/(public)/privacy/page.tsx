import type { Metadata } from "next";
import { ShieldCheck, Lock, Eye, FileText, CheckCircle2, UserCheck } from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";

export const metadata: Metadata = {
  title: "Privacy Policy | Onnesha Hospital",
  description: "Personal Data Protection and Patient Privacy Policy referencing Bangladesh Personal Data Protection Act 2026 standards.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy | Onnesha Hospital",
    description: "Personal Data Protection and Patient Privacy Policy referencing Bangladesh Personal Data Protection Act 2026 standards.",
    url: "/privacy",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return (
    <div className="py-12 bg-slate-50 min-h-[80vh]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
            Data Protection & Privacy Policy
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Privacy Policy & Data Security
          </h1>
          <p className="text-xs text-slate-600 mt-2">
            Referencing the statutory standards of the Bangladesh Personal Data Protection Act 2026
          </p>
        </div>

        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xs space-y-8">
          {/* Section 1 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">1. Overview & Scope</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Onnesha Hospital & Diagnostic Complex (&quot;Onnesha HMS&quot;) describes through this policy our technical safeguards and procedural controls for handling patient demographic data, outpatient consultation records, diagnostic appointments, and billing transactions. Legal compliance should be assessed against applicable Bangladesh law and current operational healthcare practices.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <Lock className="w-5 h-5 shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">2. Technical & Organizational Safeguards</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              We implement the following technical safeguards across our patient care management platform:
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700 mt-3">
              <li className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Purpose Limitation:</strong> Information collected solely for patient identification, medical appointments, and hospital invoicing.</span>
              </li>
              <li className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Data Minimization:</strong> Anonymous visitors to the public website have zero access to patient personal data. Public queue boards project only token numbers and room identifiers.</span>
              </li>
              <li className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Transport Protection:</strong> Encrypted network transit enforced via HTTPS across all client endpoints.</span>
              </li>
              <li className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Database Authorization:</strong> Granular multi-tenant Row Level Security (RLS) and search-path isolated procedures.</span>
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <Eye className="w-5 h-5 shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">3. Patient Data Rights (Personal Data Protection Act 2026)</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Under the statutory provisions of the Bangladesh Personal Data Protection Act 2026, registered patients have the following defined rights:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100">
                <h3 className="font-semibold text-slate-900 text-xs mb-1">Right to Access (Section 11)</h3>
                <p className="text-[11px] text-slate-600">Request inspection of registered personal identification and historical consultation records held by the hospital.</p>
              </div>
              <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100">
                <h3 className="font-semibold text-slate-900 text-xs mb-1">Right to Rectification (Section 12)</h3>
                <p className="text-[11px] text-slate-600">Request correction or updating of inaccurate demographic details, phone numbers, or guardian particulars.</p>
              </div>
              <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100">
                <h3 className="font-semibold text-slate-900 text-xs mb-1">Consent Withdrawal (Section 13)</h3>
                <p className="text-[11px] text-slate-600">Withdraw consent for optional non-essential communications while ensuring active clinical treatment continuity.</p>
              </div>
              <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100">
                <h3 className="font-semibold text-slate-900 text-xs mb-1">Security Obligations (Section 17)</h3>
                <p className="text-[11px] text-slate-600">Technical and operational measures applied to prevent unauthorized access, tampering, or loss of medical records.</p>
              </div>
              <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100">
                <h3 className="font-semibold text-slate-900 text-xs mb-1">Data Retention (Section 18)</h3>
                <p className="text-[11px] text-slate-600">Medical histories and billing journals retained strictly in accordance with national healthcare statutory retention mandates.</p>
              </div>
              <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100">
                <h3 className="font-semibold text-slate-900 text-xs mb-1">Incident Reporting (Section 20)</h3>
                <p className="text-[11px] text-slate-600">Established internal protocols for investigating, remediating, and reporting potential data security incidents.</p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <UserCheck className="w-5 h-5 shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">4. Role-Based Access Controls & System Auditing</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Clinical and financial data access is restricted to verified hospital personnel based on assigned duties (Doctors, Nurses, Pharmacists, Cashiers, and Reception Staff). Critical administrative operations and record modifications generate audit trail entries with user attribution and timestamps.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <FileText className="w-5 h-5 shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">5. Privacy Inquiries & Patient Relations Contact</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              For any questions regarding personal data records, consent revocation, or privacy choices, please reach out to our hospital administration desk:
            </p>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <p><strong>Hospital Data Protection Officer (DPO) & Patient Relations Desk</strong> — {HOSPITAL_METADATA.name}</p>
              {HOSPITAL_METADATA.email && (
                <p>Email: <a href={`mailto:${HOSPITAL_METADATA.email}`} className="text-sky-600 underline">{HOSPITAL_METADATA.email}</a></p>
              )}
              {HOSPITAL_METADATA.phone && (
                <p>Telephone: {HOSPITAL_METADATA.phone}</p>
              )}
              {HOSPITAL_METADATA.address ? (
                <p>Physical Address: {HOSPITAL_METADATA.address}</p>
              ) : (
                <p>Physical Inquiries: Hospital Main Reception & Information Counter, Dhaka, Bangladesh</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
