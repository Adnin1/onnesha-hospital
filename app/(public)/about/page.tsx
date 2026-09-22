import type { Metadata } from "next";
import React from "react";
import { Award, ShieldCheck, Heart, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "About Us | Onnesha Hospital & Diagnostic Complex",
  description:
    "Learn about Onnesha Hospital's mission, vision, clinical governance, and hospital infrastructure. Modern patient-centered healthcare in Dhaka, Bangladesh.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Us | Onnesha Hospital & Diagnostic Complex",
    description:
      "Learn about Onnesha Hospital's mission, vision, clinical governance, and hospital infrastructure in Dhaka, Bangladesh.",
    url: "/about",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function AboutPage() {
  return (
    <div className="py-12 bg-slate-50 min-h-[80vh]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
            About Onnesha Hospital
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Compassionate Care, Clinical Excellence
          </h1>
          <p className="text-xs text-slate-600 mt-2">
            Established with a vision to provide accessible, high-quality medical care and ethical treatment to patients and families across Dhaka.
          </p>
        </div>

        {/* Mission & Vision Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center mb-4">
              <Heart className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-slate-900 mb-2">Our Mission</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              To deliver patient-centered healthcare services with unwavering integrity, clinical excellence, modern diagnostic accuracy, and affordable cost structures.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
              <Award className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-slate-900 mb-2">Our Vision</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              To build a trusted, patient-first hospital through technological digitization, systematic clinical safety, and compassionate healthcare engagement.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-slate-900 mb-2">Clinical Governance</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Operating with adherence to infection control protocols, structured clinical documentation, and ongoing professional development for healthcare staff.
            </p>
          </div>
        </div>

        {/* Facilities Highlights */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs mb-12">
          <h2 className="text-xl font-bold text-slate-900 mb-6">
            Hospital Infrastructure
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {[
              "Central Oxygen Supply System",
              "Sterile Operating Theatre Environment",
              "Automated Biochemistry Analyzers",
              "Digital Radiography Equipment",
              "Hematology Laboratory",
              "Ultrasonography Services",
              "Standby Generator Power Backup",
              "Dedicated Inpatient Nursing Care",
            ].map((fac, idx) => (
              <div key={idx} className="flex items-center space-x-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
                <span className="font-medium text-slate-700">{fac}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Digital Health & Cloud Infrastructure Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs mb-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-sky-600 bg-sky-50 px-2.5 py-1 rounded-md">
                Infrastructure & System Specs
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-2">
                ডিজিটাল স্বাস্থ্যসেবা, ক্লাউড হোস্টিং ও ডেটাবেজ অবকাঠামো
              </h2>
            </div>
            <div className="text-xs bg-slate-100 text-slate-700 font-medium px-3 py-1.5 rounded-lg border border-slate-200">
              Enterprise HIS / EMR Cloud Tier
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600 leading-relaxed">
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm mb-2">
                আধুনিক ক্লাউড অবকাঠামো
              </h3>
              <p>
                অন্বেষা হাসপাতালের ডিজিটাল ওপিডি ও ক্লিনিক্যাল তথ্য ব্যবস্থাপনা নির্ভরযোগ্য ক্লাউড অবকাঠামোর মাধ্যমে পরিচালিত। সুশৃঙ্খল ক্যাশিং ও সুরক্ষিত ডেটা স্টোরেজ নিশ্চিত করে আধুনিক স্বাস্থ্যসেবা ব্যবস্থাপনা।
              </p>
            </div>
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm mb-2">
                অ্যাক্সেস কন্ট্রোল ও ডেটা সুরক্ষা
              </h3>
              <p>
                হাসপাতালের অফিসিয়াল ডিজিটাল সিস্টেম প্রাতিষ্ঠানিক রোল-বেসড অ্যাক্সেস কন্ট্রোল (RBAC) এবং পোস্টগ্রেসকিউএল রো-লেভেল সিকিউরিটির (RLS) মাধ্যমে পরিচালিত। রোগীর সমস্ত স্বাস্থ্য তথ্য অনুমোদিত ব্যবহারকারী ব্যতীত কঠোরভাবে সংরক্ষিত।
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
