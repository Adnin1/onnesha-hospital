"use client";

import React, { useState } from "react";
import {
  X,
  Save,
  CheckCircle2,
  FileText,
  Activity,
  Microscope,
  Sparkles,
  ClipboardList,
} from "lucide-react";
import { DiagnosticOrderRecord, DiagnosticParameterRecord } from "@/types/clinical-emr";
import { saveDiagnosticResultsAction } from "@/lib/lab/actions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  order: DiagnosticOrderRecord;
  onSaved: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

// Preset clinical normal values for rapid entry
const NORMAL_TEMPLATES: Record<string, Record<string, string>> = {
  CBC: {
    "Hemoglobin (Hb)": "14.2",
    "Erythrocyte Sedimentation Rate (ESR)": "10",
    "Total White Blood Cell Count (WBC)": "7500",
    "Platelet Count": "280",
    "Neutrophils": "62",
    "Lymphocytes": "30",
    "Eosinophils": "04",
    "Monocytes": "04",
  },
  FBS: {
    "Fasting Blood Sugar (FBS)": "95",
  },
  RBS: {
    "Random Blood Sugar (RBS)": "115",
  },
  CREATININE: {
    "Serum Creatinine": "0.95",
  },
  LIPID: {
    "Total Cholesterol": "175",
    "Triglycerides": "135",
    "HDL Cholesterol": "46",
    "LDL Cholesterol": "98",
  },
  URINE_RE: {
    "Colour": "Straw",
    "Appearance": "Clear",
    "Pus Cells": "2-3",
    "RBCs": "Nil",
    "Epithelial Cells": "1-2",
    "Albumin": "Nil",
    "Sugar": "Nil",
  },
};

const DESCRIPTIVE_TEMPLATES: Record<string, string> = {
  XRAY_CHEST:
    "CHEST X-RAY (P/A VIEW):\n• Bilateral lung fields appear normal without any focal consolidation or active infiltration.\n• Both costophrenic and cardiophrenic angles are sharp and clear.\n• Cardiac silhouette and cardiothoracic ratio are within normal limits (CTR < 50%).\n• Thoracic bony cage, ribs, and surrounding soft tissues appear unremarkable.\n\nIMPRESSION: Normal radiological study of chest.",
  USG_WHOLE_ABDOMEN:
    "ULTRASONOGRAPHY OF WHOLE ABDOMEN:\n• Liver: Normal in size, contour, and homogeneous echotexture. No focal lesion or mass.\n• Gallbladder: Well distended, wall thickness normal (< 3mm), lumen acoustic-free, no calculus.\n• Spleen & Pancreas: Normal in size, outline, and parenchyma.\n• Kidneys: Both kidneys are normal in size, shape, and cortical thickness. Corticomedullary differentiation preserved. No hydronephrosis or calculus.\n• Urinary Bladder: Smooth mucosal wall, well distended, lumen free of mass/calculus.\n\nIMPRESSION: Normal whole abdominal ultrasound study.",
  ECG_12_LEAD:
    "12-LEAD RESTING ELECTROCARDIOGRAM:\n• Heart Rate: 74 bpm (Regular sinus rhythm).\n• P-wave, PR interval: 0.16 sec (Normal).\n• QRS Complex: 0.08 sec (Normal axis, no hypertrophy pattern).\n• ST-T Segment: Isoelectric, no significant ST elevation, depression, or T-wave inversion.\n\nIMPRESSION: Normal 12-lead Electrocardiogram (Sinus Rhythm).",
  ECHO_2D:
    "2D ECHOCARDIOGRAPHY WITH COLOR DOPPLER:\n• Normal cardiac chamber dimensions.\n• Left ventricular systolic function preserved (LVEF: 62%).\n• Normal wall motion at rest, no regional wall motion abnormality (RWMA).\n• Normal valve morphology with laminar color Doppler flow patterns.\n• Pericardium is normal, no effusion.\n\nIMPRESSION: Normal 2D Echocardiogram with preserved LV systolic function.",
};

export function LabResultEntryModal({ isOpen, onClose, order, onSaved, onToast }: Props) {
  const [selectedTestIndex, setSelectedTestIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // Parameter values: keyed by `${testId}_${paramName}`
  const [paramValues, setParamValues] = useState<
    Record<
      string,
      {
        parameterId?: string;
        parameterName: string;
        observedValue: string;
        unit?: string;
        referenceRangeMale?: string;
        referenceRangeFemale?: string;
        referenceRangeChild?: string;
        isAbnormal: boolean;
      }
    >
  >(() => {
    const initialParams: Record<string, {
      parameterId?: string;
      parameterName: string;
      observedValue: string;
      unit?: string;
      referenceRangeMale?: string;
      referenceRangeFemale?: string;
      referenceRangeChild?: string;
      isAbnormal: boolean;
    }> = {};

    (order?.tests || []).forEach((t) => {
      (t.parameters || []).forEach((p) => {
        const key = `${t.id || t.test_id}_${p.parameter_name}`;
        initialParams[key] = {
          parameterId: p.id,
          parameterName: p.parameter_name,
          observedValue: p.observed_value || "",
          unit: p.unit,
          referenceRangeMale: p.reference_range_male,
          referenceRangeFemale: p.reference_range_female,
          referenceRangeChild: p.reference_range_child,
          isAbnormal: Boolean(p.is_abnormal),
        };
      });
    });

    return initialParams;
  });

  // Descriptive findings: keyed by testId
  const [descriptiveFindings, setDescriptiveFindings] = useState<Record<string, string>>(() => {
    const initialFindings: Record<string, string> = {};
    (order?.tests || []).forEach((t) => {
      if (t.descriptive_findings) {
        initialFindings[t.id || t.test_id] = t.descriptive_findings;
      }
    });
    return initialFindings;
  });
  const [clinicalRemarks, setClinicalRemarks] = useState("");

  const tests = order?.tests || [];
  const currentTest = tests[selectedTestIndex] || tests[0];

  if (!isOpen) return null;

  const currentTestKey = currentTest ? currentTest.id || currentTest.test_id : "";
  const currentTestParams = (currentTest?.parameters || []).map((p) => {
    const key = `${currentTestKey}_${p.parameter_name}`;
    return (
      paramValues[key] || {
        parameterId: p.id,
        parameterName: p.parameter_name,
        observedValue: p.observed_value || "",
        unit: p.unit,
        referenceRangeMale: p.reference_range_male,
        referenceRangeFemale: p.reference_range_female,
        referenceRangeChild: p.reference_range_child,
        isAbnormal: Boolean(p.is_abnormal),
      }
    );
  });

  const handleParamChange = (
    paramName: string,
    field: "observedValue" | "isAbnormal",
    value: string | boolean
  ) => {
    const key = `${currentTestKey}_${paramName}`;
    setParamValues((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {
          parameterName: paramName,
          observedValue: "",
          isAbnormal: false,
        }),
        [field]: value,
      },
    }));
  };

  const handleApplyNormalTemplate = () => {
    if (!currentTest) return;
    const code = currentTest.test_code?.toUpperCase() || "";

    // Find matching template
    let matchedTemplate: Record<string, string> | null = null;
    if (code.includes("CBC")) matchedTemplate = NORMAL_TEMPLATES.CBC;
    else if (code.includes("FBS") || code.includes("SUGAR")) matchedTemplate = NORMAL_TEMPLATES.FBS;
    else if (code.includes("RBS")) matchedTemplate = NORMAL_TEMPLATES.RBS;
    else if (code.includes("CREAT")) matchedTemplate = NORMAL_TEMPLATES.CREATININE;
    else if (code.includes("LIPID")) matchedTemplate = NORMAL_TEMPLATES.LIPID;
    else if (code.includes("URINE")) matchedTemplate = NORMAL_TEMPLATES.URINE_RE;

    if (matchedTemplate) {
      setParamValues((prev) => {
        const next = { ...prev };
        Object.entries(matchedTemplate!).forEach(([pName, pVal]) => {
          const key = `${currentTestKey}_${pName}`;
          next[key] = {
            ...(prev[key] || { parameterName: pName }),
            observedValue: pVal,
            isAbnormal: false,
          };
        });
        return next;
      });
      onToast("স্ট্যান্ডার্ড স্বাভাবিক ভ্যালুসমূহ সফলভাবে বসানো হয়েছে।", "info");
    } else {
      // Generic fallback
      onToast("এই টেস্টের জন্য স্বয়ংক্রিয় টেমপ্লেট প্রযোজ্য নয়। ম্যানুয়ালি ভ্যালু প্রদান করুন।", "info");
    }
  };

  const handleApplyDescriptiveTemplate = (templateKey: string) => {
    const templateText = DESCRIPTIVE_TEMPLATES[templateKey];
    if (templateText && currentTestKey) {
      setDescriptiveFindings((prev) => ({
        ...prev,
        [currentTestKey]: templateText,
      }));
      onToast("স্ট্যান্ডার্ড ক্লিনিক্যাল ফাইন্ডিংস টেমপ্লেট লোড হয়েছে।", "info");
    }
  };

  const handleSaveAllResults = async () => {
    if (!order) return;
    setSaving(true);

    try {
      // Gather all parameters for this order
      const paramList = Object.values(paramValues).filter((p) => p.observedValue.trim() !== "");
      const findings = currentTestKey ? descriptiveFindings[currentTestKey] : undefined;

      const res = await saveDiagnosticResultsAction({
        orderId: order.id,
        testId: currentTest?.test_id || currentTest?.id,
        orderItemId: currentTest?.id,
        parameters: paramList,
        descriptiveFindings: findings,
        clinicalRemarks: clinicalRemarks.trim() || undefined,
      });

      if (res.success) {
        onToast("ল্যাব ফলাফল ও ফাইন্ডিংস সফলভাবে সংরক্ষিত হয়েছে।", "success");
        onSaved();
        onClose();
      } else {
        onToast(res.error || "ফলাফল সংরক্ষণ করতে ব্যর্থ হয়েছে", "error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "ফলাফল সংরক্ষণ ব্যর্থ হয়েছে";
      onToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  // Determine gender/age reference range to show
  const getDisplayReference = (p: DiagnosticParameterRecord) => {
    const gender = order.patient?.gender?.toLowerCase();
    const age = order.patient?.age;
    if (age !== undefined && age < 12 && p.reference_range_child) {
      return p.reference_range_child;
    }
    if (gender === "female" && p.reference_range_female) {
      return p.reference_range_female;
    }
    return p.reference_range_male || "Normal";
  };

  const isDescriptiveTest =
    currentTest?.specimen_type === "None" ||
    currentTest?.test_code?.includes("XRAY") ||
    currentTest?.test_code?.includes("USG") ||
    currentTest?.test_code?.includes("ECG") ||
    currentTest?.test_code?.includes("ECHO");

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-sky-100 text-sky-700 rounded-lg">
                <Microscope className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  ল্যাব টেস্টের ফলাফল ও ফাইন্ডিংস এন্ট্রি (Enter Test Results)
                </h2>
                <p className="text-xs text-slate-500">
                  অর্ডার #{order.order_number} • রোগী: {order.patient?.full_name} ({order.patient?.patient_code}) • {order.patient?.gender}, {order.patient?.age ? `${order.patient.age} বছর` : ""}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Test Selector Tabs if multiple tests in order */}
        {tests.length > 1 && (
          <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex gap-2 overflow-x-auto">
            {tests.map((t, idx) => (
              <button
                key={t.id || idx}
                onClick={() => setSelectedTestIndex(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  selectedTestIndex === idx
                    ? "bg-sky-600 text-white shadow-2xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span>{t.test_name}</span>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                    selectedTestIndex === idx ? "bg-sky-800 text-sky-100" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {t.specimen_type || "Lab"}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Active Test Header & Quick Template Actions */}
          <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider">
                বর্তমান নির্বাচিত টেস্ট
              </span>
              <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                {currentTest?.test_name || "Diagnostic Investigation"}
              </h3>
              <p className="text-xs text-slate-500">
                কোড: <code className="font-mono text-slate-700 font-bold">{currentTest?.test_code}</code> • নমুনা টাইপ: {currentTest?.specimen_type || "N/A"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isDescriptiveTest ? (
                <button
                  type="button"
                  onClick={handleApplyNormalTemplate}
                  className="px-3 py-1.5 bg-white hover:bg-sky-100 border border-sky-300 text-sky-700 font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                  <span>নরমাল ভ্যালু অটো-ফিল করুন</span>
                </button>
              ) : (
                <div className="flex gap-1.5">
                  {currentTest?.test_code?.includes("XRAY") && (
                    <button
                      type="button"
                      onClick={() => handleApplyDescriptiveTemplate("XRAY_CHEST")}
                      className="px-2.5 py-1 bg-white hover:bg-sky-100 border border-sky-300 text-sky-700 font-bold text-xs rounded-lg transition"
                    >
                      Chest X-Ray টেমপ্লেট
                    </button>
                  )}
                  {currentTest?.test_code?.includes("USG") && (
                    <button
                      type="button"
                      onClick={() => handleApplyDescriptiveTemplate("USG_WHOLE_ABDOMEN")}
                      className="px-2.5 py-1 bg-white hover:bg-sky-100 border border-sky-300 text-sky-700 font-bold text-xs rounded-lg transition"
                    >
                      USG Abdomen টেমপ্লেট
                    </button>
                  )}
                  {currentTest?.test_code?.includes("ECG") && (
                    <button
                      type="button"
                      onClick={() => handleApplyDescriptiveTemplate("ECG_12_LEAD")}
                      className="px-2.5 py-1 bg-white hover:bg-sky-100 border border-sky-300 text-sky-700 font-bold text-xs rounded-lg transition"
                    >
                      ECG টেমপ্লেট
                    </button>
                  )}
                  {currentTest?.test_code?.includes("ECHO") && (
                    <button
                      type="button"
                      onClick={() => handleApplyDescriptiveTemplate("ECHO_2D")}
                      className="px-2.5 py-1 bg-white hover:bg-sky-100 border border-sky-300 text-sky-700 font-bold text-xs rounded-lg transition"
                    >
                      Echo টেমপ্লেট
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Numerical Parameters Table */}
          {currentTestParams.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-sky-600" />
                  <span>প্যারামিটার ও পরীক্ষার ফলাফল মান (Numerical Observed Values)</span>
                </h4>
                <span className="text-[11px] text-slate-500">
                  মোট প্যারামিটার: {currentTestParams.length} টি
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                      <th className="p-3">প্যারামিটারের নাম</th>
                      <th className="p-3 w-48">ফলাফল মান (Observed Value) *</th>
                      <th className="p-3 text-center w-24">একক (Unit)</th>
                      <th className="p-3 w-44">রেফারেন্স রেঞ্জ (স্বাভাবিক মান)</th>
                      <th className="p-3 text-center w-28">অস্বাভাবিক?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentTestParams.map((p) => {
                      const key = `${currentTestKey}_${p.parameterName}`;
                      const currentVal = paramValues[key]?.observedValue || "";
                      const isAbnormal = Boolean(paramValues[key]?.isAbnormal);

                      return (
                        <tr key={key} className={isAbnormal ? "bg-amber-50/50" : "hover:bg-slate-50/70"}>
                          <td className="p-3 font-semibold text-slate-800">
                            {p.parameterName}
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={currentVal}
                              onChange={(e) => handleParamChange(p.parameterName, "observedValue", e.target.value)}
                              placeholder="e.g. 13.5"
                              className={`w-full px-3 py-1.5 font-mono text-xs border rounded-lg transition focus:outline-none focus:ring-2 ${
                                isAbnormal
                                  ? "border-amber-400 bg-amber-50/30 text-amber-900 focus:ring-amber-500 font-bold"
                                  : "border-slate-300 bg-white text-slate-900 focus:ring-sky-500"
                              }`}
                            />
                          </td>
                          <td className="p-3 text-center font-mono text-slate-500 text-[11px]">
                            {p.unit || "-"}
                          </td>
                          <td className="p-3 text-[11px] text-slate-600">
                            {getDisplayReference(p as unknown as DiagnosticParameterRecord)}
                          </td>
                          <td className="p-3 text-center">
                            <label className="inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isAbnormal}
                                onChange={(e) => handleParamChange(p.parameterName, "isAbnormal", e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500 relative"></div>
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Descriptive Findings for Imaging or General Reports */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-purple-600" />
              <span>ডেসক্রিপটিভ পর্যবেক্ষণ ও ক্লিনিক্যাল ফাইন্ডিংস (Clinical Findings / Report Text)</span>
            </h4>
            <p className="text-[11px] text-slate-500">
              এক্স-রে, আল্ট্রাসনোগ্রাম, ইসিজি বা যেকোনো বিস্তারিত মেডিকেল রিপোর্টের বিবরণ এখানে লিখুন।
            </p>
            <textarea
              rows={isDescriptiveTest ? 8 : 4}
              value={currentTestKey ? descriptiveFindings[currentTestKey] || "" : ""}
              onChange={(e) => {
                if (currentTestKey) {
                  const val = e.target.value;
                  setDescriptiveFindings((prev) => ({ ...prev, [currentTestKey]: val }));
                }
              }}
              placeholder="এখানে টেস্টের ফলাফল, পর্যবেক্ষণ এবং প্যাথলজিস্টের চূড়ান্ত মতামত লিখুন..."
              className="w-full p-3 text-xs border border-slate-200 rounded-xl bg-slate-50 font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
            />
          </div>

          {/* General Technologist & Pathologist Notes */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-slate-500" />
              <span>টেকনিশিয়ান / ল্যাবরেটরি স্পেশাল নোট (Lab Remarks)</span>
            </label>
            <input
              type="text"
              value={clinicalRemarks}
              onChange={(e) => setClinicalRemarks(e.target.value)}
              placeholder="যেমন: স্যাম্পল রি-রান করা হয়েছে, অথবা বায়ো-র‍্যাড কিট দ্বারা টেস্ট সম্পন্ন।"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>ফলাফল সেভ করার পর ডাক্তার কর্তৃক ভেরিফিকেশন ও স্বাক্ষর করা যাবে।</span>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-100 transition"
            >
              বাতিল
            </button>
            <button
              type="button"
              onClick={handleSaveAllResults}
              disabled={saving}
              className="flex-1 sm:flex-none px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "সংরক্ষণ হচ্ছে..." : "ফলাফল সংরক্ষণ করুন (Save Results)"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
