import React from "react";
import { Award, ShieldCheck, Heart, CheckCircle2 } from "lucide-react";

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
            Established with a vision to provide world-class medical facilities and ethical medical treatment accessible to all citizens.
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
              To become Bangladesh&apos;s leading benchmark in hospital care through technological digitization, automated clinical safety, and empathetic patient engagement.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-slate-900 mb-2">Clinical Governance</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Strict compliance with the Directorate General of Health Services (DGHS) standards, infection control protocols, and continuous medical training.
            </p>
          </div>
        </div>

        {/* Facilities Highlights */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs mb-12">
          <h2 className="text-xl font-bold text-slate-900 mb-6">
            Key Infrastructure Highlights
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {[
              "Central Oxygen Supply System",
              "HEPA-Filtered Laminar OTs",
              "Modern Blood Bank Integration",
              "High-End 4D Color Doppler USG",
              "Digital 500mA X-Ray Unit",
              "Automated Biochemistry Analyzers",
              "Dedicated Dialysis Unit",
              "24/7 Standby Generator Power",
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
                ক্লাউড আর্কিটেকচার ও সিস্টেম পারফরম্যান্স
              </h3>
              <p>
                অন্বেষা হাসপাতালের সম্পূর্ণ ডিজিটাল ওপিডি, আইপিডি ও প্যাথলজি ডেটাবেজ ব্যবস্থা বাণিজ্যিক হাই-অ্যাভেইলেবিলিটি ডেডিকেটেড ক্লাউড আর্কিটেকচারে পরিচালিত। উচ্চগতির ক্যাশিং ও ডেটাবেজ রেপ্লিকেশন নিশ্চিত করে নিরবচ্ছিন্ন স্বাস্থ্যসেবা।
              </p>
            </div>
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm mb-2">
                নিরাপত্তা এনক্রিপশন ও ডেটা সুরক্ষা
              </h3>
              <p>
                হাসপাতালের অফিসিয়াল ডিজিটাল সিস্টেম কঠোর এক্সেস কন্ট্রোল এবং আধুনিক সিকিউরিটি শিল্ডের মাধ্যমে পরিচালিত। রোগীর সমস্ত স্বাস্থ্য তথ্য ও হিস্ট্রি 256-bit TLS এবং RLS এনক্রিপশনে সম্পূর্ণ সুরক্ষিত।
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
