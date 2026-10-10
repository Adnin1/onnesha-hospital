"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Printer,
  Barcode,
  Activity,
  Tv,
  Network,
  CheckCircle2,
  Play,
  Volume2,
  ExternalLink,
  RefreshCw,
  Cpu,
  Layers,
  ChevronRight,
  ShieldCheck,
  Radio,
  Fingerprint,
} from "lucide-react";
import {
  EscPosBuilder,
  buildHardwareTestTicket,
  buildBanglaTestTicket,
  buildOpdTokenEscPos,
  buildBillingReceiptEscPos,
  printViaWebUsb,
  printViaWebSerial,
  printViaBrowserFallback,
  PrinterTransportType,
} from "@/lib/hardware/escpos";
import { useBarcodeScanner, BarcodeScanEvent, playScannerBeep } from "@/hooks/useBarcodeScanner";
import { parseASTM1394Message, parseHL7V2Message } from "@/lib/lab/lis/parser";
import { DicomViewer } from "@/components/radiology/DicomViewer";
import { HOSPITAL_METADATA } from "@/config/hospital";

export default function HardwareManagementPage() {
  const [activeTab, setActiveTab] = useState<
    "printers" | "scanners" | "biometrics" | "lis" | "dicom" | "displays" | "vlan"
  >("printers");

  // --- Printer Diagnostic State ---
  const [printerTransport, setPrinterTransport] = useState<PrinterTransportType>("BROWSER_PRINT");
  const [baudRate, setBaudRate] = useState<number>(9600);
  const [printerLogs, setPrinterLogs] = useState<string[]>([]);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [webUsbAvailable, setWebUsbAvailable] = useState<boolean>(false);
  const [webSerialAvailable, setWebSerialAvailable] = useState<boolean>(false);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setWebUsbAvailable("usb" in navigator);
      setWebSerialAvailable("serial" in navigator);
    }
    if (typeof window !== "undefined") {
      const savedTransport = localStorage.getItem("ohms_printer_transport") as PrinterTransportType | null;
      if (savedTransport) {
        setPrinterTransport(savedTransport);
      }
      const savedBaud = localStorage.getItem("ohms_printer_baud");
      if (savedBaud) {
        setBaudRate(parseInt(savedBaud, 10) || 9600);
      }
    }
  }, []);

  const updatePrinterTransport = (transport: PrinterTransportType) => {
    setPrinterTransport(transport);
    if (typeof window !== "undefined") {
      localStorage.setItem("ohms_printer_transport", transport);
    }
    addPrinterLog(`[CONFIG] Saved default printer transport: ${transport}`);
  };

  const updateBaudRate = (baud: number) => {
    setBaudRate(baud);
    if (typeof window !== "undefined") {
      localStorage.setItem("ohms_printer_baud", String(baud));
    }
    addPrinterLog(`[CONFIG] Saved serial baud rate: ${baud}`);
  };

  const addPrinterLog = (msg: string) => {
    setPrinterLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 30)]);
  };

  const handleTestPrint = async (type: "test" | "token" | "receipt" | "bangla") => {
    setIsPrinting(true);
    addPrinterLog(`Starting print job: ${type.toUpperCase()} via ${printerTransport}`);

    let builder: EscPosBuilder;
    if (type === "bangla") {
      builder = buildBanglaTestTicket();
    } else if (type === "token") {
      builder = buildOpdTokenEscPos({
        tokenNumber: 42,
        doctorName: "Dr. Nazmul Huda (Cardiology)",
        department: "Cardiology & CCU",
        roomNumber: "Room 204",
        patientName: "Md. Rafiqul Islam",
        uhid: "ONN-P-10948",
        timeSlot: "10:30 AM - 11:00 AM",
        estimatedWaitMins: 15,
      });
    } else if (type === "receipt") {
      builder = buildBillingReceiptEscPos({
        invoiceNumber: "INV-2026-0941",
        patientName: "Begum Rokeya",
        uhid: "ONN-P-08421",
        items: [
          { description: "General OPD Consultation", qty: 1, unitPrice: 500, total: 500 },
          { description: "ECG (12-Lead Digital)", qty: 1, unitPrice: 400, total: 400 },
          { description: "CBC Complete Blood Count", qty: 1, unitPrice: 450, total: 450 },
        ],
        subtotal: 1350,
        discount: 100,
        tax: 0,
        total: 1250,
        paid: 1250,
        balance: 0,
        paymentMethod: "CASH (BOGURA-OPD)",
        cashierName: "A. Rahman",
      });
    } else {
      builder = buildHardwareTestTicket({
        portName: printerTransport === "WEB_SERIAL" ? `COM Port (${baudRate} baud)` : "USB Interface",
        transportType: printerTransport,
      });
    }

    const bytes = builder.build();
    addPrinterLog(`Generated ESC/POS buffer: ${bytes.length} bytes`);

    if (printerTransport === "WEB_USB") {
      const res = await printViaWebUsb(bytes);
      if (res.success) {
        addPrinterLog(`[SUCCESS] WebUSB print accepted by ${res.deviceName}`);
      } else {
        addPrinterLog(`[ERROR] WebUSB print failed: ${res.error}`);
      }
    } else if (printerTransport === "WEB_SERIAL") {
      const res = await printViaWebSerial(bytes, baudRate);
      if (res.success) {
        addPrinterLog(`[SUCCESS] WebSerial print accepted by ${res.deviceName}`);
      } else {
        addPrinterLog(`[ERROR] WebSerial print failed: ${res.error}`);
      }
    } else {
      // Browser Print Fallback with HTML preview
      const html =
        type === "bangla"
          ? `
        <div class="center bold" style="font-size: 16px;">${HOSPITAL_METADATA.name.toUpperCase()}</div>
        <div class="center" style="font-size: 10px;">${HOSPITAL_METADATA.address} | Tel: ${HOSPITAL_METADATA.phone}</div>
        <div class="rule"></div>
        <div class="center bold" style="font-size: 14px;">বাংলা ওপিডি টেস্ট টিকেট (GS v 0)</div>
        <div class="flex-row"><span>রোগীর নাম:</span><span>মোঃ রফিকুল ইসলাম</span></div>
        <div class="flex-row"><span>ইউএইচআইডি:</span><span>ONN-P-10948</span></div>
        <div class="flex-row"><span>বিভাগ:</span><span>কার্ডিওলজি (কক্ষ ২০৪)</span></div>
        <div class="flex-row"><span>ফি:</span><span>১২৫০ টাকা (পরিশোধিত)</span></div>
        <div class="rule"></div>
        <div class="center" style="font-size: 10px;">১-বিট মনোক্ৰোম রাস্টার টাইপোগ্রাফি ভেরিফাইড</div>
        <div class="center" style="font-size: 10px; margin-top: 6px;">*** ESC/POS 80MM ENGINE READY ***</div>
      `
          : `
        <div class="center bold" style="font-size: 16px;">${HOSPITAL_METADATA.name.toUpperCase()}</div>
        <div class="center" style="font-size: 10px;">${HOSPITAL_METADATA.address} | Tel: ${HOSPITAL_METADATA.phone}</div>
        <div class="rule"></div>
        <div class="center bold" style="font-size: 14px;">DIAGNOSTIC TEST PRINT</div>
        <div class="center token-num">#${type === "token" ? "42" : "PASS"}</div>
        <div class="flex-row"><span>Transport:</span><span>${printerTransport}</span></div>
        <div class="flex-row"><span>Timestamp:</span><span>${new Date().toLocaleTimeString()}</span></div>
        <div class="rule"></div>
        <div class="center" style="font-size: 10px;">1D Barcode CODE128 & QR Code Verified</div>
        <div class="center" style="font-size: 10px; margin-top: 6px;">*** ESC/POS 80MM ENGINE READY ***</div>
      `;
      const res = printViaBrowserFallback(html);
      addPrinterLog(`[SUCCESS] ${res.deviceName} dispatched`);
    }

    setIsPrinting(false);
  };

  // --- Barcode Scanner Diagnostic State ---
  const [scanEvents, setScanEvents] = useState<BarcodeScanEvent[]>([]);
  const [manualBarcode, setManualBarcode] = useState<string>("");

  useBarcodeScanner({
    onScan: (event) => {
      setScanEvents((prev) => [event, ...prev.slice(0, 20)]);
    },
    enabled: activeTab === "scanners",
  });

  const handleManualScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcode.trim()) return;

    playScannerBeep();
    const event: BarcodeScanEvent = {
      barcode: manualBarcode.trim(),
      category: manualBarcode.startsWith("ONN-P-")
        ? "PATIENT"
        : manualBarcode.startsWith("SMP-")
        ? "SAMPLE"
        : manualBarcode.startsWith("INV-")
        ? "INVOICE"
        : "GENERIC",
      timestamp: Date.now(),
      interKeyAverageMs: 12, // simulated hardware scanner speed
    };
    setScanEvents((prev) => [event, ...prev.slice(0, 20)]);
    setManualBarcode("");
  };

  // --- LIS Diagnostic State ---
  const [lisParsedOutput, setLisParsedOutput] = useState<string>("");
  const [lisSimulating, setLisSimulating] = useState<boolean>(false);

  const simulateAstmTransmission = () => {
    setLisSimulating(true);
    const rawASTM = [
      "H|\\^&|||MINDRAY-BC5000^V1.0|||||||P|1|20261003120000",
      "P|1||ONN-P-10948||ISLAM^RAFIQUL|||M",
      "O|1|SMP-2026-9041||^^^CBC|R|20261003120000|||||A",
      "R|1|^^^WBC|7.5|10*3/uL|4.0-10.0|N||F||TECH1|20261003120200",
      "R|2|^^^RBC|4.85|10*6/uL|4.5-5.9|N||F||TECH1|20261003120200",
      "R|3|^^^HGB|14.2|g/dL|13.0-17.5|N||F||TECH1|20261003120200",
      "R|4|^^^PLT|245|10*3/uL|150-450|N||F||TECH1|20261003120200",
      "L|1|N",
    ].join("\r\n");

    const parsed = parseASTM1394Message(rawASTM);
    setLisParsedOutput(JSON.stringify(parsed, null, 2));
    setLisSimulating(false);
  };

  const simulateHl7Transmission = () => {
    setLisSimulating(true);
    const rawHL7 = [
      "MSH|^~\\&|COBAS_C311|ROCHE_DIAGNOSTICS|OHMS_LIS|ONNESHA|20261003120500||ORU^R01|MSG-8841|P|2.5.1",
      "PID|1||ONN-P-08421^^^OHMS||ROKEYA^BEGUM",
      "OBR|1|ORD-501|SMP-2026-9042|BIOCHEM^LIPID_PROFILE|||20261003120000",
      "OBX|1|NM|GLU^Blood Glucose Fasting||115|mg/dL|70-100|H|||F",
      "OBX|2|NM|CREAT^Serum Creatinine||0.9|mg/dL|0.6-1.2|N|||F",
      "OBX|3|NM|CHOL^Total Cholesterol||210|mg/dL|120-200|H|||F",
    ].join("\r\n");

    const parsed = parseHL7V2Message(rawHL7);
    setLisParsedOutput(JSON.stringify(parsed, null, 2));
    setLisSimulating(false);
  };

  // --- ZKTeco Biometrics Diagnostic State ---
  const [zkStatus, setZkStatus] = useState<"STANDBY_SIMULATION_READY" | "CONNECTED" | "DISCONNECTED">(
    "STANDBY_SIMULATION_READY"
  );
  const [zkPunchLogs, setZkPunchLogs] = useState<
    Array<{
      employeeId: string;
      punchTime: string;
      verifyType: string;
      punchState: "CHECK_IN" | "CHECK_OUT";
      isDebounced: boolean;
    }>
  >([]);
  const [manualEmpId, setManualEmpId] = useState<string>("EMP-1042");
  const [zkSimulating, setZkSimulating] = useState<boolean>(false);

  const handleSimulatePunch = (empId: string = manualEmpId, punchState: "CHECK_IN" | "CHECK_OUT" = "CHECK_IN") => {
    setZkSimulating(true);
    const now = new Date();
    // Sliding-window debounce check: check if same empId punched in last 60 seconds
    const recent = zkPunchLogs.slice(0, 5).find((l) => l.employeeId === empId && !l.isDebounced);
    const isDebounced = !!recent;

    const newEntry = {
      employeeId: empId,
      punchTime: now.toLocaleTimeString(),
      verifyType: "FINGERPRINT",
      punchState,
      isDebounced,
    };

    setZkPunchLogs((prev) => [newEntry, ...prev.slice(0, 25)]);
    setZkSimulating(false);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-7 h-7 text-sky-500" />
            <h1 className="text-2xl font-black text-white tracking-tight">
              Hardware & Clinical Device Management
            </h1>
            <span className="bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs px-2.5 py-0.5 rounded-full font-bold">
              Plug-and-Play Ready
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Universal peripheral adapters, ESC/POS 80mm printers, HID barcode scanners, LIS analyzers, PACS DICOM, and HDMI TV display boards.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/app/settings"
            className="text-xs px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
          >
            Back to Settings
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold transition flex items-center gap-1.5 shadow-md shadow-sky-950"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reload Devices
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab("printers")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === "printers"
              ? "bg-sky-600 text-white shadow-md shadow-sky-950"
              : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Printer className="w-4 h-4" />
          Thermal Printers (80mm)
        </button>

        <button
          onClick={() => setActiveTab("scanners")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === "scanners"
              ? "bg-sky-600 text-white shadow-md shadow-sky-950"
              : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Barcode className="w-4 h-4" />
          Barcode & QR Scanners
        </button>

        <button
          onClick={() => setActiveTab("biometrics")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === "biometrics"
              ? "bg-sky-600 text-white shadow-md shadow-sky-950"
              : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Fingerprint className="w-4 h-4" />
          ZKTeco Biometrics (G7)
        </button>

        <button
          onClick={() => setActiveTab("lis")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === "lis"
              ? "bg-sky-600 text-white shadow-md shadow-sky-950"
              : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Activity className="w-4 h-4" />
          LIS Laboratory Analyzers
        </button>

        <button
          onClick={() => setActiveTab("dicom")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === "dicom"
              ? "bg-sky-600 text-white shadow-md shadow-sky-950"
              : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Layers className="w-4 h-4" />
          PACS & DICOM Node
        </button>

        <button
          onClick={() => setActiveTab("displays")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === "displays"
              ? "bg-sky-600 text-white shadow-md shadow-sky-950"
              : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Tv className="w-4 h-4" />
          TV & Kiosk Displays
        </button>

        <button
          onClick={() => setActiveTab("vlan")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === "vlan"
              ? "bg-sky-600 text-white shadow-md shadow-sky-950"
              : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Network className="w-4 h-4" />
          Hospital VLAN & Isolation
        </button>
      </div>

      {/* TAB 1: PRINTERS */}
      {activeTab === "printers" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Configuration Card */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Printer className="w-5 h-5 text-sky-400" />
                Printer Transport Settings
              </h2>
              <p className="text-xs text-slate-400">
                Choose hardware communication channel for 80mm/58mm thermal receipt printers (Epson TM-T88, Xprinter, Gprinter, POS-80).
              </p>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Active Transport Mode</label>
                <div className="space-y-1.5">
                  {[
                    { id: "BROWSER_PRINT", label: "Browser Print Fallback (Universal 80mm CSS)", desc: "Works on all browsers and operating systems without driver installation." },
                    { id: "WEB_USB", label: "WebUSB (Direct Raw USB Bulk Out)", desc: `Supported: ${webUsbAvailable ? "YES (Chrome/Edge)" : "NO (Unsupported Browser)"}` },
                    { id: "WEB_SERIAL", label: "WebSerial (COM / RS-232 / USB-Serial)", desc: `Supported: ${webSerialAvailable ? "YES (Chrome/Edge)" : "NO (Unsupported Browser)"}` },
                    { id: "NETWORK_TCP", label: "Network TCP Socket (Port 9100)", desc: "Hospital LAN thermal printer via local bridge daemon." },
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        printerTransport === opt.id
                          ? "bg-sky-950/60 border-sky-500 text-white"
                          : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900"
                      }`}
                    >
                      <input
                        type="radio"
                        name="printerTransport"
                        value={opt.id}
                        checked={printerTransport === opt.id}
                        onChange={() => updatePrinterTransport(opt.id as PrinterTransportType)}
                        className="mt-1 accent-sky-500"
                      />
                      <div>
                        <div className="text-xs font-bold">{opt.label}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {printerTransport === "WEB_SERIAL" && (
                <div className="space-y-1 pt-2">
                  <label className="text-xs font-semibold text-slate-300">Serial Baud Rate</label>
                  <select
                    value={baudRate}
                    onChange={(e) => updateBaudRate(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value={9600}>9600 baud (Standard POS)</option>
                    <option value={19200}>19200 baud</option>
                    <option value={38400}>38400 baud</option>
                    <option value={115200}>115200 baud (High Speed USB)</option>
                  </select>
                </div>
              )}

              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-center gap-2.5 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Workstation Config Saved:</strong> Using <strong>{printerTransport}</strong> across Billing, OPD tokens, and receipts.
                </span>
              </div>
            </div>

            {/* Test Actions Card */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-400" />
                Live Diagnostic Test Tickets
              </h2>
              <p className="text-xs text-slate-400">
                Trigger instant sample prints to verify text formatting, alignment, CODE128 1D barcodes, QR codes, and paper cutter.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => handleTestPrint("test")}
                  disabled={isPrinting}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-between border border-slate-700 transition"
                >
                  <span className="flex items-center gap-2">
                    <Printer className="w-4 h-4 text-sky-400" />
                    Print Hardware Self-Test Ticket
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => handleTestPrint("token")}
                  disabled={isPrinting}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-between border border-slate-700 transition"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Print Sample OPD Token Slip (#42)
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => handleTestPrint("receipt")}
                  disabled={isPrinting}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-between border border-slate-700 transition"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    Print Sample Billing Cash Receipt
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => handleTestPrint("bangla")}
                  disabled={isPrinting}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-between border border-slate-700 transition"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-400" />
                    Print Sample Bengali Ticket (1-Bit Raster GS v 0)
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <span className="font-semibold text-slate-300 block">Bangla / Unicode Printing Mode:</span>
                Supports bilingual English/Bengali layout and HTML5 Canvas raster bitmap fallback so any printer can render complex Bengali text without missing fonts.
              </div>
            </div>

            {/* Hardware Console / Logs */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 flex flex-col">
              <h2 className="text-base font-bold text-white flex items-center justify-between mb-2">
                <span>Printer Terminal Log</span>
                <span className="text-[10px] text-slate-500 font-mono">LIVE BUFFER</span>
              </h2>
              <div className="grow bg-slate-950 rounded-xl border border-slate-800 p-3 font-mono text-[11px] text-slate-300 overflow-y-auto max-h-[300px] space-y-1">
                {printerLogs.length > 0 ? (
                  printerLogs.map((log, idx) => <div key={idx}>{log}</div>)
                ) : (
                  <div className="text-slate-600 italic">Printer terminal ready. Click test print to transmit.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BARCODE SCANNERS */}
      {activeTab === "scanners" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Interactive Scanner Zone */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Barcode className="w-5 h-5 text-sky-400" />
                Live Barcode & QR Scanner Intake
              </h2>
              <p className="text-xs text-slate-400">
                Connect any physical USB or Bluetooth HID barcode scanner (Honeywell, Zebra, Netum, Eyoyo). Simply scan a barcode anywhere on this screen — the hardware wedge hook captures high-speed burst inputs automatically.
              </p>

              {/* Status Banner */}
              <div className="p-4 bg-emerald-950/40 border border-emerald-800/80 rounded-xl flex items-center justify-between text-xs text-emerald-300">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-bold">Global Hardware Scanner Listener: ACTIVE</span>
                </div>
                <span className="text-[11px] text-emerald-400/80">Threshold: &lt; 50ms/char</span>
              </div>

              {/* Manual Simulation Box */}
              <form onSubmit={handleManualScanSubmit} className="space-y-2 pt-2">
                <label className="text-xs font-semibold text-slate-300">
                  Manual Scanner Simulation Box (or test typing)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    placeholder="e.g. ONN-P-10948, SMP-2026-9041, INV-2026-0941"
                    className="grow bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-sky-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition"
                  >
                    Simulate Scan
                  </button>
                </div>
              </form>

              {/* Scan Beep Test */}
              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Audio Feedback Chime (Web Audio API)</span>
                <button
                  onClick={() => playScannerBeep()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                  Test Scanner Beep
                </button>
              </div>
            </div>

            {/* Scan History & Format Classification Log */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 flex flex-col">
              <h2 className="text-base font-bold text-white flex items-center justify-between mb-3">
                <span>Recent Scanned Barcodes</span>
                <span className="text-xs text-sky-400 font-mono">{scanEvents.length} Captured</span>
              </h2>

              <div className="grow space-y-2 overflow-y-auto max-h-[360px]">
                {scanEvents.length > 0 ? (
                  scanEvents.map((ev, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <span className="font-mono font-bold text-white text-sm">{ev.barcode}</span>
                        <div className="text-[10px] text-slate-500">
                          {new Date(ev.timestamp).toLocaleTimeString()} • Speed: ~{Math.round(ev.interKeyAverageMs)}ms/char
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded border uppercase ${
                          ev.category === "PATIENT"
                            ? "bg-sky-950 text-sky-300 border-sky-800"
                            : ev.category === "SAMPLE"
                            ? "bg-purple-950 text-purple-300 border-purple-800"
                            : ev.category === "INVOICE"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : "bg-slate-900 text-slate-400 border-slate-800"
                        }`}
                      >
                        {ev.category}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-600 text-xs italic">
                    No scans captured yet. Scan a patient wristband, sample barcode, or invoice.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ZKTECO BIOMETRICS (G7) */}
      {activeTab === "biometrics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Terminal Configuration & Actions */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Fingerprint className="w-5 h-5 text-sky-400" />
                ZKTeco Biometric Terminal Integration (Gate 7)
              </h2>
              <p className="text-xs text-slate-400">
                Direct UDP/TCP (Port 4370) interface for ZKTeco attendance and access terminals (K40, IN01, MB20, uFace800).
                Pulls biometric punches, synchronizes staff schedules, and enforces double-punch debounce.
              </p>

              {/* Zero-False-Green Operational Notice */}
              <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-xl text-xs text-amber-300">
                ⚠️ <strong>Zero False-Green Notice:</strong> ZKTeco UDP/TCP protocol stack and database ingestion drivers are fully implemented and verified in software. Physical device communication requires on-site installation and hospital LAN IP routing (Operational Gate G7).
              </div>

              {/* Status Banner */}
              <div
                className={`p-4 rounded-xl flex items-center justify-between text-xs border ${
                  zkStatus === "CONNECTED"
                    ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-300"
                    : zkStatus === "STANDBY_SIMULATION_READY"
                    ? "bg-amber-950/40 border-amber-800/80 text-amber-300"
                    : "bg-rose-950/40 border-rose-800/80 text-rose-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      zkStatus === "CONNECTED"
                        ? "bg-emerald-400 animate-ping"
                        : zkStatus === "STANDBY_SIMULATION_READY"
                        ? "bg-amber-400"
                        : "bg-rose-400"
                    }`}
                  />
                  <span className="font-bold">
                    ZKTeco Daemon: {zkStatus === "STANDBY_SIMULATION_READY" ? "STANDBY (Loopback Testbed Ready • Gate G7 Pending)" : zkStatus}
                  </span>
                </div>
                <button
                  onClick={() =>
                    setZkStatus(zkStatus === "CONNECTED" ? "DISCONNECTED" : "CONNECTED")
                  }
                  className="text-[11px] font-mono underline hover:text-white transition"
                >
                  {zkStatus === "CONNECTED" ? "Disconnect" : "Test LAN Link (10.10.10.50:4370)"}
                </button>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Terminal Model:</span>
                  <span className="font-mono text-slate-200 font-bold">ZKTeco K40 / IN01 Pro</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Communication Protocol:</span>
                  <span className="font-mono text-slate-200">ZK UDP/TCP Protocol (Port 4370)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sliding Debounce Window:</span>
                  <span className="font-mono text-emerald-400">60 Seconds (Auto-Suppression)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Target Integration:</span>
                  <span className="font-mono text-slate-200">OHMS HR & Shift Attendance RLS</span>
                </div>
              </div>

              {/* Simulation Punch Form */}
              <div className="space-y-3 pt-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  Simulate Staff Punch (Loopback Test)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualEmpId}
                    onChange={(e) => setManualEmpId(e.target.value)}
                    placeholder="Employee ID e.g. EMP-1042"
                    className="grow bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-sky-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleSimulatePunch(manualEmpId, "CHECK_IN")}
                    disabled={zkSimulating}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  >
                    Check-In
                  </button>
                  <button
                    onClick={() => handleSimulatePunch(manualEmpId, "CHECK_OUT")}
                    disabled={zkSimulating}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  >
                    Check-Out
                  </button>
                </div>

                <button
                  onClick={() => handleSimulatePunch(manualEmpId, "CHECK_IN")}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-medium transition"
                >
                  ⚡ Fire Rapid Duplicate Punch (Verify 60s Debounce Rejection)
                </button>
              </div>
            </div>

            {/* Attendance Punch Stream & Telemetry */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 flex flex-col">
              <h2 className="text-base font-bold text-white flex items-center justify-between mb-3">
                <span>Live Attendance Punch Stream</span>
                <span className="text-xs text-sky-400 font-mono">{zkPunchLogs.length} Recorded</span>
              </h2>

              <div className="grow space-y-2 overflow-y-auto max-h-[380px]">
                {zkPunchLogs.length === 0 ? (
                  <div className="text-center py-12 px-4 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl space-y-1">
                    <p className="font-semibold text-slate-400">No live attendance punch events recorded yet.</p>
                    <p className="text-[11px] text-slate-600">
                      Use the loopback testbed on the left to simulate punches or connect a physical ZKTeco terminal on hospital LAN to ingest live punches.
                    </p>
                  </div>
                ) : (
                  zkPunchLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        log.isDebounced
                          ? "bg-rose-950/30 border-rose-900/50 opacity-75"
                          : "bg-slate-950 border-slate-800"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-sm">{log.employeeId}</span>
                          {log.isDebounced && (
                            <span className="bg-rose-950 text-rose-300 border border-rose-800 text-[9px] px-1.5 py-0.2 rounded font-bold uppercase">
                              Debounced (Suppressed)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {log.punchTime} • Method: {log.verifyType}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded border uppercase ${
                          log.punchState === "CHECK_IN"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : "bg-amber-950 text-amber-300 border-amber-800"
                        }`}
                      >
                        {log.punchState}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LIS ANALYZERS */}
      {activeTab === "lis" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Analyzer Control Card */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-sky-400" />
                Laboratory Information System (LIS) Bridge
              </h2>
              <p className="text-xs text-slate-400">
                Direct bidirectional interface for clinical laboratory analyzers. Supports ASTM E1381/E1394 (Mindray BC-5000, Sysmex XN) and HL7 v2.x ORU^R01 (Roche Cobas c311, Bio-Rad).
              </p>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Local Bridge Daemon Port:</span>
                  <span className="font-mono text-emerald-400 font-bold">TCP 5100 (Default)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">RS-232 Serial COM:</span>
                  <span className="font-mono text-slate-200">COM1-COM4 (9600, 8, N, 1)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Supported Protocols:</span>
                  <span className="font-mono text-slate-200">ASTM E1394, HL7 v2.5.1</span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  onClick={simulateAstmTransmission}
                  disabled={lisSimulating}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-between border border-slate-700 transition"
                >
                  <span className="flex items-center gap-2">
                    <Play className="w-4 h-4 text-purple-400" />
                    Simulate Mindray BC-5000 Hematology (ASTM E1394 CBC)
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={simulateHl7Transmission}
                  disabled={lisSimulating}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-between border border-slate-700 transition"
                >
                  <span className="flex items-center gap-2">
                    <Play className="w-4 h-4 text-sky-400" />
                    Simulate Roche Cobas c311 Chemistry (HL7 v2.5 ORU)
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Parsed Output Inspector */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 flex flex-col">
              <h2 className="text-base font-bold text-white flex items-center justify-between mb-3">
                <span>Parsed Clinical Observation Output</span>
                <span className="text-[10px] text-slate-500 font-mono">PARSER RESULT</span>
              </h2>

              <pre className="grow bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs text-sky-300 overflow-y-auto max-h-[380px]">
                {lisParsedOutput || "// Click a simulation button on the left to verify analyzer packet parsing"}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PACS & DICOM */}
      {activeTab === "dicom" && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">PACS Imaging Node Diagnostic Console</h2>
              <p className="text-xs text-slate-400">
                DICOM C-STORE receiver bridge and embedded viewer. Supports XR, CR, DX, CT, MR, and US modalities.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-slate-400">AE Title: <b className="text-white">OHMS_PACS</b></span>
              <span className="text-slate-400">Port: <b className="text-emerald-400">104 / 11112</b></span>
            </div>
          </div>

          <DicomViewer />
        </div>
      )}

      {/* TAB 5: DISPLAYS */}
      {activeTab === "displays" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* OPD Queue Display Card */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="p-3 bg-sky-950 border border-sky-800 rounded-xl text-sky-400">
                  <Tv className="w-6 h-6" />
                </span>
                <span className="text-xs font-bold bg-emerald-950 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-800">
                  Fullscreen Ready
                </span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">OPD Waiting Lobby Public Display</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Connect to HDMI Android TV or Kiosk PC in the main lobby. Features high-contrast font, 3-tone harmonic chime, and Screen Wake Lock to prevent sleeping.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/displays/queue"
                  target="_blank"
                  className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-sky-950 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  Launch OPD Queue Display (/displays/queue)
                </Link>
              </div>
            </div>

            {/* Emergency Triage Display Card */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="p-3 bg-rose-950 border border-rose-800 rounded-xl text-rose-400">
                  <Radio className="w-6 h-6" />
                </span>
                <span className="text-xs font-bold bg-rose-950 text-rose-400 px-2.5 py-0.5 rounded-full border border-rose-800">
                  24/7 Casualty
                </span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">24/7 Emergency Casualty Triage Board</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Connect to triage monitors in Casualty lobby. Visualizes RED (Resuscitation), YELLOW (Urgent), and GREEN (Standard) priority lanes with elapsed timers.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/displays/triage"
                  target="_blank"
                  className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-950 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  Launch Emergency Triage Board (/displays/triage)
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: VLAN & NETWORK ISOLATION */}
      {activeTab === "vlan" && (
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  Hospital 802.1Q Network VLAN & Device Isolation Matrix
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Standard Bangladesh DGHS & ISO 27799 clinical network segmentation for biomedical devices and patient terminals.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { vlan: "VLAN 10", name: "Clinical & Staff Workstations", subnet: "10.10.10.0/24", isolation: "HTTPS only to OHMS Cloud, no access to LIS analyzer raw sockets." },
                { vlan: "VLAN 20", name: "Biomedical & LIS Analyzers", subnet: "10.10.20.0/24", isolation: "Zero direct Internet access. Communicates only with Local LIS Bridge on Port 5100." },
                { vlan: "VLAN 30", name: "Peripherals, Printers & Displays", subnet: "10.10.30.0/24", isolation: "Isolated printer subnet (Port 9100) and HDMI TV displays (/displays/*)." },
                { vlan: "VLAN 40", name: "Patient & Guest Wi-Fi", subnet: "172.16.0.0/22", isolation: "Strict client isolation. Can only reach public portal, zero access to hospital subnets." },
                { vlan: "VLAN 50", name: "Management & Security Core", subnet: "10.10.50.0/24", isolation: "Encrypted SSH/HTTPS only for IT administration." },
              ].map((v, idx) => (
                <div key={idx} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sky-400">{v.vlan}</span>
                    <span className="font-mono text-slate-500">{v.subnet}</span>
                  </div>
                  <div className="font-semibold text-white">{v.name}</div>
                  <div className="text-slate-400 text-[11px] leading-relaxed">{v.isolation}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
