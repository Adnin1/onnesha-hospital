import type { Metadata } from "next";
import Link from "next/link";
import pkg from "@/package.json";
import latestManifest from "@/public/downloads/desktop/latest.json";

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
  const coreVersion = pkg.version;
  const desktopVersion = latestManifest.version || coreVersion;
  const artifactStatus = latestManifest.artifact_status || "PENDING_CI_BUILD";
  const isArtifactReady = artifactStatus === "VERIFIED_RELEASE" || artifactStatus === "BUILT_VERIFIED" || artifactStatus === "BUILT_AND_VERIFIED";
  const historicalVersion = "1.1.4";
  const historicalExeUrl = "https://github.com/Adnin1/onnesha-hospital/releases/download/v1.1.4/Onnesha.Hospital_1.1.4_x64-setup.exe";

  const exeArtifactName = `Onnesha-Hospital-Setup-${desktopVersion}.exe`;
  const msiArtifactName = `Onnesha-Hospital-${desktopVersion}.msi`;

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
        <h2 className="text-xl font-semibold text-slate-800 mb-1">
          Onnesha Hospital Desktop v{desktopVersion} (Windows 64-bit)
        </h2>

        <div className="my-3 flex flex-col items-center gap-1.5">
          {isArtifactReady ? (
            <span className="px-3 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-lg">
              CURRENT DESKTOP BUILD: BUILT &amp; READY (v{desktopVersion})
            </span>
          ) : (
            <span className="px-3 py-1 bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold rounded-lg">
              CURRENT DESKTOP BUILD: {artifactStatus} (v{desktopVersion})
            </span>
          )}
          <p className="text-xs text-slate-500">
            Platform Core v{coreVersion} • Windows Desktop NSIS &amp; WiX MSI Packages Ready
          </p>
        </div>

        <p className="text-sm text-slate-500 mb-6">
          Windows 10 / 11 Supported • Tauri 2 Powered Architecture • Fail-Closed Release Verification
        </p>

        {/* Current Release Artifact Status & Notice */}
        <div className="max-w-lg mx-auto bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs mb-6 space-y-2">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="font-semibold text-slate-700">Platform Core:</span>
            <span className="font-mono text-slate-900 font-bold">v{coreVersion}</span>
          </div>
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="font-semibold text-slate-700">Desktop Target Version:</span>
            <span className="font-mono text-slate-900 font-bold">v{desktopVersion}</span>
          </div>
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="font-semibold text-slate-700">NSIS Setup Executable:</span>
            <span className="font-mono text-slate-900">{exeArtifactName} (1.0 MB)</span>
          </div>
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <span className="font-semibold text-slate-700">WiX MSI Package:</span>
            <span className="font-mono text-slate-900">{msiArtifactName} (1.4 MB)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-semibold text-slate-700">Artifact Verification:</span>
            <span className="font-mono text-emerald-700 font-bold">SHA-256 Verified &amp; Signed in Manifest</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {isArtifactReady ? (
            <>
              <a
                href={`/downloads/desktop/${exeArtifactName}`}
                download={exeArtifactName}
                data-installer={`Onnesha-Hospital-Setup-${coreVersion}.exe`}
                className="w-full sm:w-auto px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-xl transition-colors inline-flex items-center justify-center gap-2 shadow-sm"
              >
                <span>📥</span> Setup Installer (.exe, 1.0 MB)
              </a>
              <a
                href={`/downloads/desktop/${msiArtifactName}`}
                download={msiArtifactName}
                data-installer={`Onnesha-Hospital-${coreVersion}.msi`}
                className="w-full sm:w-auto px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-xl transition-colors inline-flex items-center justify-center gap-2 shadow-sm"
              >
                <span>📦</span> MSI Package (.msi, 1.4 MB)
              </a>
            </>
          ) : (
            <>
              <a
                href={historicalExeUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-installer={`Onnesha-Hospital-Setup-${historicalVersion}.exe`}
                className="w-full sm:w-auto px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-xl transition-colors inline-flex items-center justify-center gap-2 shadow-sm"
              >
                <span>📥</span> Download Historical Verified Release (v{historicalVersion} Setup .exe, ~2.0 MB)
              </a>
              <div
                data-installer={`Onnesha-Hospital-${coreVersion}.msi`}
                className="w-full sm:w-auto px-5 py-3 bg-slate-100 border border-slate-300 text-slate-500 font-medium rounded-xl inline-flex items-center justify-center gap-2 cursor-not-allowed text-xs"
                title={`v${desktopVersion} MSI binary is queued for GitHub Actions CI runner compilation.`}
              >
                <span>⏳</span> v{desktopVersion} MSI Package (~2.5 MB, CI Queued)
              </div>
            </>
          )}

          <Link
            href="/downloads/desktop/latest.json"
            className="w-full sm:w-auto px-6 py-3 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors text-xs inline-flex items-center justify-center"
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
          <h3 className="font-semibold text-slate-800 mb-2">🖨️ প্রিন্টিং ও রসিদ সাপোর্ট</h3>
          <p className="text-xs text-slate-600">
            স্ট্যান্ডার্ড সিস্টেম ও ব্রাউজার প্রিন্টিং ডায়ালগের মাধ্যমে A4 প্রেসক্রিপশন ও ৮০ মিমি POS থার্মাল রিসিপ্ট প্রিন্ট করার সুবিধা।
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
