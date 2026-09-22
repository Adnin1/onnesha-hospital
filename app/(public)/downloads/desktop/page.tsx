import type { Metadata } from "next";
import Link from "next/link";
import pkg from "@/package.json";

export const metadata: Metadata = {
  title: "Windows Desktop App Download | Onnesha Hospital",
  description: "Download Onnesha Hospital & Diagnostic Complex Windows PC Software Client.",
  alternates: { canonical: "/downloads/desktop" },
  openGraph: {
    title: "Windows Desktop App Download | Onnesha Hospital",
    description: "Download Onnesha Hospital & Diagnostic Complex Windows PC Software Client.",
    url: "/downloads/desktop",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function DesktopDownloadPage() {
  const version = pkg.version;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          Onnesha Hospital PC Software Client
        </h1>
        <p className="text-slate-600 max-w-2xl mx-auto">
          হাসপাতাল স্টাফদের জন্য Windows PC Desktop Client। দ্রুত প্রিন্টিং, লেবেল জেনারেটর এবং হাসপাতাল ম্যানেজমেন্ট সিস্টেমে সরাসরি অ্যাক্সেস।
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-100 text-sky-600 rounded-full mb-4 text-3xl">
          💻
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Onnesha Hospital Desktop v{version} (Windows 64-bit)
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Windows 10 / 11 Supported • Verified Installers • Tauri 2 Powered
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={`/downloads/desktop/Onnesha-Hospital-Setup-${version}.exe`}
            download
            className="w-full sm:w-auto px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-xl transition-colors inline-flex items-center justify-center gap-2 shadow-sm"
          >
            <span>📥</span> Setup Installer (.exe, ~2.0 MB)
          </a>
          <a
            href={`/downloads/desktop/Onnesha-Hospital-${version}.msi`}
            download
            className="w-full sm:w-auto px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-xl transition-colors inline-flex items-center justify-center gap-2 shadow-sm"
          >
            <span>📦</span> MSI Package (.msi, ~2.5 MB)
          </a>
          <Link
            href="/downloads/desktop/latest.json"
            className="w-full sm:w-auto px-6 py-3 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors"
          >
            ভার্সন আপডেট রিলিজ নোটস (JSON)
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-4">
          All desktop releases are built via CI and digitally archived on{" "}
          <a
            href="https://github.com/Adnin1/onnesha-hospital/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 hover:underline"
          >
            GitHub Releases
          </a>.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 text-left">
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-2">⚡ সেম ক্লাউড ব্যাকএন্ড</h3>
          <p className="text-xs text-slate-600">
            ওয়েবসাইট, ওয়েব পোর্টাল এবং ডেসক্টপ ক্লায়েন্ট — একই সুনির্দিষ্ট PostgreSQL ডেটাবেস এবং RLS সিকিউরিটির মাধ্যমে যুক্ত।
          </p>
        </div>
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-2">🖨️ লোকাল প্রিন্টার সাপোর্ট</h3>
          <p className="text-xs text-slate-600">
            A4 প্রেসক্রিপশন ও ৮০ মিমি POS থার্মাল রিসিপ্ট লোকাল USB প্রিন্টারে সরাসরি প্রিন্ট করার সুবিধা।
          </p>
        </div>
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-2">🔒 এনক্রিপ্টেড কমিউনিকেশন</h3>
          <p className="text-xs text-slate-600">
            কোনো সার্ভিস রোল সিক্রেট ডেসক্টপ অ্যাপে নেই। সম্পূর্ণ সিকিউর HTTPS/TLS কানেকশন।
          </p>
        </div>
      </div>
    </div>
  );
}
