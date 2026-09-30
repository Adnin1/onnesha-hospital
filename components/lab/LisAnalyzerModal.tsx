"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Cpu,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Server,
  ArrowRight,
  Terminal,
  Activity,
  ShieldAlert,
  Info,
} from "lucide-react";
import {
  LabAnalyzer,
  ParsedAnalyzerMessage,
  LabAnalyzerTransmission,
} from "@/types/lis-analyzer";
import {
  getLabAnalyzersAction,
  getAnalyzerTransmissionsAction,
  simulateAnalyzerTransmissionAction,
  ingestAnalyzerTransmissionAction,
} from "@/lib/lab/lis/actions";

interface LisAnalyzerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOrderNumber?: string;
  selectedSampleBarcode?: string;
  onResultsApplied?: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function LisAnalyzerModal({
  isOpen,
  onClose,
  selectedOrderNumber,
  selectedSampleBarcode,
  onResultsApplied,
  onToast,
}: LisAnalyzerModalProps) {
  const [analyzers, setAnalyzers] = useState<LabAnalyzer[]>([]);
  const [transmissions, setTransmissions] = useState<LabAnalyzerTransmission[]>([]);
  const [selectedAnalyzerCode, setSelectedAnalyzerCode] = useState<string>("MINDRAY-BC5000");
  const [sampleBarcode, setSampleBarcode] = useState<string>(
    selectedSampleBarcode || selectedOrderNumber || "LAB-SAMP-001"
  );
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [rawPacket, setRawPacket] = useState<string>("");
  const [lastParsed, setLastParsed] = useState<ParsedAnalyzerMessage | null>(null);
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const [lastIsSimulation, setLastIsSimulation] = useState<boolean>(false);
  const [lastUnmapped, setLastUnmapped] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"stream" | "devices" | "history">("stream");

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    async function loadData() {
      setLoading(true);
      const [analyzerRes, transRes] = await Promise.all([
        getLabAnalyzersAction(),
        getAnalyzerTransmissionsAction({ limit: 10 }),
      ]);

      if (mounted) {
        if (analyzerRes.success && analyzerRes.data?.analyzers) {
          setAnalyzers(analyzerRes.data.analyzers);
          if (analyzerRes.data.analyzers.length > 0) {
            setSelectedAnalyzerCode(analyzerRes.data.analyzers[0].code);
          }
        }
        if (transRes.success && transRes.data?.transmissions) {
          setTransmissions(transRes.data.transmissions);
        }
        if (selectedSampleBarcode || selectedOrderNumber) {
          setSampleBarcode(selectedSampleBarcode || selectedOrderNumber || "LAB-SAMP-001");
        }
        setLoading(false);
      }
    }

    void loadData();
    return () => {
      mounted = false;
    };
  }, [isOpen, selectedSampleBarcode, selectedOrderNumber]);

  if (!isOpen) return null;

  async function handleSimulateRun() {
    setSimulating(true);
    const res = await simulateAnalyzerTransmissionAction({
      analyzerCode: selectedAnalyzerCode,
      sampleBarcode: sampleBarcode.trim(),
    });

    setSimulating(false);
    if (res.success && res.data) {
      setRawPacket(res.data.rawPacket);
      setLastParsed(res.data.ingestResult.parsedMessage);
      setLastTxId(res.data.ingestResult.transmissionId);
      setLastIsSimulation(true);
      setLastUnmapped(res.data.ingestResult.unmappedAnalytes || []);

      onToast(
        `সিমুলেশন সম্পন্ন! ${res.data.ingestResult.parsedMessage.results.length}টি অ্যানালাইট পার্স হয়েছে (কোনো লাইভ ক্লিনিক্যাল ডেটা পরিবর্তন হয়নি)।`,
        "info"
      );
      if (res.data.ingestResult.panicValuesDetected > 0) {
        onToast(
          `⚠️ সিমুলেশনে ${res.data.ingestResult.panicValuesDetected}টি Critical Panic Value শনাক্ত হয়েছে।`,
          "error"
        );
      }
    } else {
      onToast(res.error || "অ্যানালাইজার সিমুলেশনে সমস্যা হয়েছে।", "error");
    }
  }

  async function handleManualIngest() {
    if (!rawPacket.trim()) {
      onToast("দয়া করে raw ASTM বা HL7 প্যাকেট ইনপুট দিন।", "error");
      return;
    }

    setIngesting(true);
    const res = await ingestAnalyzerTransmissionAction({
      analyzerCode: selectedAnalyzerCode,
      rawPacket: rawPacket.trim(),
      isSimulation: false,
    });
    setIngesting(false);

    if (res.success && res.data) {
      setLastParsed(res.data.parsedMessage);
      setLastTxId(res.data.transmissionId);
      setLastIsSimulation(false);
      setLastUnmapped(res.data.unmappedAnalytes || []);

      if (res.data.isDuplicate) {
        onToast("ডুপ্লিকেট ট্রান্সমিশন শনাক্ত হয়েছে — পূর্বে প্রসেস করা রেজাল্ট অক্ষুণ্ণ রয়েছে।", "info");
      } else {
        onToast(`প্যাকেট প্রসেস সম্পন্ন: ${res.data.resultsAppliedCount}টি প্যারামিটার যুক্ত হয়েছে।`, "success");
        if (onResultsApplied) onResultsApplied();
      }
    } else {
      onToast(res.error || "প্যাকেট পার্স করতে ব্যর্থ হয়েছে।", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-400/30">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>Direct LIS & Clinical Analyzer Integration</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                  ASTM E1394 / HL7 v2
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                হেমাটোলজি ও বায়োকেমিস্ট্রি অটো-অ্যানালাইজার সরাসরি কানেকশন ও অটো-ফিল কনসোল
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("stream")}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "stream"
                ? "border-sky-600 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Terminal className="w-4 h-4" /> Live Packet Ingest & Test (লাইভ ইনজেস্ট)
          </button>
          <button
            onClick={() => setActiveTab("devices")}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "devices"
                ? "border-sky-600 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Server className="w-4 h-4" /> Connected Analyzers ({analyzers.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "history"
                ? "border-sky-600 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Activity className="w-4 h-4" /> Transmission Log ({transmissions.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "stream" && (
            <div className="space-y-6">
              {/* Simulation Notice Banner */}
              {lastIsSimulation && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-900">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">🧪 SIMULATION MODE ACTIVE:</span> This was an in-memory verification run.
                    Diagnostic tables and patient medical records were NOT mutated.
                  </div>
                </div>
              )}

              {/* Physical Transport Boundary Notice */}
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex items-start gap-2.5 text-xs text-sky-900">
                <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Physical Transport Architecture:</span> Real laboratory instruments communicate via RS-232 serial COM or LAN TCP/IP sockets. Connect through the <strong>Local LIS Bridge Agent</strong> (Tauri 2 desktop daemon) on the hospital network to securely stream packets to OHMS over authenticated HTTPS.
                </div>
              </div>

              {/* Controls bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Clinical Analyzer *
                  </label>
                  <select
                    value={selectedAnalyzerCode}
                    onChange={(e) => setSelectedAnalyzerCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    {analyzers.length === 0 ? (
                      <option value="MINDRAY-BC5000">Mindray BC-5000 (Default Template)</option>
                    ) : (
                      analyzers.map((a) => (
                        <option key={a.id} value={a.code}>
                          {a.name} ({a.protocol}) — {a.status}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sample Barcode / Order Number *
                  </label>
                  <input
                    type="text"
                    value={sampleBarcode}
                    onChange={(e) => setSampleBarcode(e.target.value)}
                    placeholder="e.g. LAB-202609-00001 or Barcode"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <button
                    onClick={handleSimulateRun}
                    disabled={simulating || !sampleBarcode}
                    className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {simulating ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    <span>Simulate Analyzer Run</span>
                  </button>
                  <button
                    onClick={handleManualIngest}
                    disabled={ingesting || !rawPacket}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition disabled:opacity-50"
                  >
                    {ingesting ? "Ingesting..." : "Live Ingest"}
                  </button>
                </div>
              </div>

              {/* Raw Frame Packet Stream */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-sky-600" />
                    Raw Transmission Packet Stream (ASTM E1394 / HL7 v2 ORU^R01)
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Auto-Framed with Checksum Verification
                  </span>
                </div>
                <textarea
                  rows={6}
                  value={rawPacket}
                  onChange={(e) => setRawPacket(e.target.value)}
                  placeholder="H|\^&|||MINDRAY_BC5000|||||||P|1&#10;P|1||P-2026-001||Rahman^Mohammad&#10;O|1|LAB-202609-001||^^^CBC|R||||||A&#10;R|1|^^^WBC|7.4|10^3/uL|4.0-11.0|N&#10;R|2|^^^HGB|13.5|g/dL|12.0-16.0|N&#10;L|1|N"
                  className="w-full p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Unmapped Analytes Warning */}
              {lastUnmapped.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Unmapped Analytes ({lastUnmapped.length}):</strong> The following instrument test codes could not be mapped to the order&apos;s parameters and were safely ignored: {lastUnmapped.join(", ")}
                  </span>
                </div>
              )}

              {/* Parsed Results Live Inspector */}
              {lastParsed && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  <div className="px-4 py-3 bg-slate-100/70 border-b border-slate-200 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-800">
                        Parsed Observation Results ({lastParsed.results.length} Analytes Extracted)
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      {lastTxId && (
                        <span className="text-slate-500">
                          TxID: <strong className="text-slate-800">{lastTxId.slice(0, 8)}...</strong>
                        </span>
                      )}
                      <span className="text-slate-500">
                        Barcode: <strong className="text-slate-800">{lastParsed.sample_barcode}</strong>
                      </span>
                      <span className="text-slate-500">
                        Protocol: <strong className="text-sky-700">{lastParsed.protocol}</strong>
                      </span>
                      <span className="text-slate-500">
                        Checksum:{" "}
                        <strong className={lastParsed.checksum_valid ? "text-emerald-600" : "text-red-600"}>
                          {lastParsed.checksum_valid ? "VALID" : "MISMATCH"}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-56">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2">Analyte Code</th>
                          <th className="px-4 py-2">Observed Value</th>
                          <th className="px-4 py-2">Unit</th>
                          <th className="px-4 py-2">Reference Range</th>
                          <th className="px-4 py-2">Abnormality Flag</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lastParsed.results.map((res, i) => {
                          const isPanic =
                            res.abnormal_flag === "CRITICAL_HIGH" ||
                            res.abnormal_flag === "CRITICAL_LOW";
                          const isAbnormal = res.abnormal_flag !== "NORMAL";
                          return (
                            <tr
                              key={i}
                              className={
                                isPanic
                                  ? "bg-red-50/80 font-bold"
                                  : isAbnormal
                                  ? "bg-amber-50/50"
                                  : "hover:bg-slate-50"
                              }
                            >
                              <td className="px-4 py-2 font-mono font-bold text-slate-800">
                                {res.analyte_code}
                              </td>
                              <td className="px-4 py-2 font-mono text-slate-900 font-bold">
                                {res.observed_value}
                              </td>
                              <td className="px-4 py-2 text-slate-500 font-mono">{res.unit || "—"}</td>
                              <td className="px-4 py-2 text-slate-500 font-mono">
                                {res.reference_range || "—"}
                              </td>
                              <td className="px-4 py-2">
                                {isPanic ? (
                                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] inline-flex items-center gap-1">
                                    <AlertTriangle className="w-2.5 h-2.5" /> CRITICAL PANIC
                                  </span>
                                ) : isAbnormal ? (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px]">
                                    {res.abnormal_flag}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">
                                    NORMAL
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "devices" && (
            <div className="space-y-4">
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading analyzers registry...</div>
              ) : analyzers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                  <Server className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="font-bold text-slate-700">No analyzers configured yet</p>
                  <p className="text-slate-500 text-[11px] mt-1">
                    Laboratory administrator can register physical analyzers and configure local serial/IP ports in organization settings.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analyzers.map((dev) => (
                    <div
                      key={dev.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-sky-300 transition shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            {dev.department}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              dev.status === "ONLINE"
                                ? "text-emerald-700 bg-emerald-50"
                                : dev.status === "UNCONFIGURED"
                                ? "text-amber-700 bg-amber-50"
                                : "text-slate-600 bg-slate-100"
                            }`}
                          >
                            <Activity className="w-3 h-3" /> {dev.status}
                          </span>
                        </div>
                        <h3 className="text-xs font-bold text-slate-900 mb-1">{dev.name}</h3>
                        <p className="text-[11px] text-slate-500 font-mono mb-3">Code: {dev.code}</p>

                        <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono text-slate-600">
                          <div>Protocol: {dev.protocol}</div>
                          <div>Connection: {dev.connection_type}</div>
                          {dev.ip_address && <div>IP: {dev.ip_address}</div>}
                          {dev.port && <div>Port: {dev.port}</div>}
                          {dev.baud_rate && <div>Baud: {dev.baud_rate}</div>}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-[10px]">
                        <span className="text-slate-400">
                          Heartbeat: {dev.last_heartbeat_at ? new Date(dev.last_heartbeat_at).toLocaleTimeString() : "Unverified"}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedAnalyzerCode(dev.code);
                            setActiveTab("stream");
                          }}
                          className="text-sky-600 hover:text-sky-800 font-bold flex items-center gap-1"
                        >
                          Select & Transmit <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-4">
              {transmissions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">No transmission logs recorded yet.</div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2">Timestamp</th>
                        <th className="px-4 py-2">Analyzer</th>
                        <th className="px-4 py-2">Barcode</th>
                        <th className="px-4 py-2">Protocol</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transmissions.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-500 text-[11px]">
                            {new Date(t.created_at).toLocaleTimeString()}
                          </td>
                          <td className="px-4 py-2 font-bold text-slate-800">{t.analyzer_name}</td>
                          <td className="px-4 py-2 font-mono text-slate-900">{t.sample_barcode}</td>
                          <td className="px-4 py-2 font-mono text-sky-700">{t.protocol}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                t.status === "APPLIED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : t.status === "REJECTED"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {t.status}
                              {t.is_simulation && " (SIM)"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-xs">
          <span className="text-slate-500 text-[11px]">
            Laboratory Information System (LIS) Middleware • Standard ASTM E1381/E1394 & HL7 v2
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-semibold transition"
          >
            বন্ধ করুন (Close)
          </button>
        </div>
      </div>
    </div>
  );
}
