import type { Metadata } from "next";
import { ShieldCheck, Lock, Eye, FileText, CheckCircle2, UserCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | Onnesha Hospital",
  description: "Personal Data Protection Policy and Patient Data Privacy Guidelines under Bangladesh Personal Data Protection Act 2026.",
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
            Compliant with Bangladesh Personal Data Protection Act 2026 & Cyber Security Act 2026
          </p>
        </div>

        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xs space-y-8">
          {/* Section 1 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <ShieldCheck className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">1. Overview & Commitment</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Onnesha Hospital & Diagnostic Complex (&quot;Onnesha HMS&quot;) is committed to preserving the privacy, confidentiality, and integrity of all patient electronic health records (EHR), personal identification data (NID/Passport), clinical history, diagnostic reports, and financial transactions.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <Lock className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">2. Legal Compliance Framework (BD 2026)</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Our data collection, processing, storage, and cross-border restriction procedures strictly align with the technical specifications of the <strong>Bangladesh Personal Data Protection Act, 2026</strong> and the <strong>Cyber Security Act, 2026</strong>.
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700 mt-3">
              <li className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span><strong>Purpose Limitation:</strong> Data collected solely for medical diagnosis, treatment, and hospital billing.</span>
              </li>
              <li className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span><strong>Data Minimization:</strong> Only clinically necessary attributes requested during registration.</span>
              </li>
              <li className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span><strong>Strict Encryption:</strong> AES-256 at rest and TLS 1.3 in transit across all endpoints.</span>
              </li>
              <li className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span><strong>Tenant & RLS Isolation:</strong> Multi-tenant database enforcement via PostgreSQL Row Level Security.</span>
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <Eye className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">3. Patient Data Rights</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Under Section 18 of the BD Data Protection Act 2026, patients registered with Onnesha Hospital hold explicit statutory rights:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100">
                <h3 className="font-semibold text-slate-900 text-xs mb-1">Right to Access</h3>
                <p className="text-[11px] text-slate-600">Inspect digital health records, prescription history, and diagnostic lab reports at any time via the patient portal.</p>
              </div>
              <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100">
                <h3 className="font-semibold text-slate-900 text-xs mb-1">Right to Rectification</h3>
                <p className="text-[11px] text-slate-600">Request correction of erroneous demographic, contact, or insurance details through hospital reception or self-service.</p>
              </div>
              <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100">
                <h3 className="font-semibold text-slate-900 text-xs mb-1">Consent Withdrawal</h3>
                <p className="text-[11px] text-slate-600">Withdraw consent for non-essential communications while maintaining active medical treatment safety access.</p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <UserCheck className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">4. Role-Based Access Controls (RBAC) & Audit</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Access to medical records is restricted strictly based on clinical role assignment. Doctors, nurses, lab technicians, and pharmacists possess scoped permissions enforced by cryptographic authorization tokens. Every record view, modification, diagnostic verification, and billing transaction generates an immutable audit log timestamped in the security ledger.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <FileText className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">5. Data Protection Officer Contact</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              For any inquiries regarding data protection, consent revocation, or privacy audit reports, please contact our Data Protection Officer:
            </p>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <p><strong>Data Protection Officer (DPO)</strong> — Onnesha Hospital & Diagnostic Complex</p>
              <p>Email: <a href="mailto:dpo@onneshahospital.com" className="text-sky-600 underline">dpo@onneshahospital.com</a> | Legal & Compliance Desk</p>
              <p>Address: Operational Control Center, Onnesha Hospital, Dhaka, Bangladesh</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
