import React from "react";
import { HOSPITAL_METADATA } from "@/config/hospital";

interface HospitalPrintHeaderProps {
  documentTitle: string;
  documentSubtitle?: string;
  documentNumber?: string;
  dateStr?: string;
}

export function HospitalPrintHeader({
  documentTitle,
  documentSubtitle,
  documentNumber,
  dateStr,
}: HospitalPrintHeaderProps) {
  return (
    <div className="border-b-2 border-sky-800 pb-3 mb-4">
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-sky-700 text-white rounded-lg flex items-center justify-center font-bold text-xl tracking-wider">
            OH
          </div>
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wide text-sky-950">
              {HOSPITAL_METADATA.name}
            </h1>
            <p className="text-xs text-sky-800 font-medium">
              {HOSPITAL_METADATA.banglaName}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              {HOSPITAL_METADATA.address} | Hotline: {HOSPITAL_METADATA.phone} | Emergency: {HOSPITAL_METADATA.emergencyHotline}
            </p>
            <p className="text-[10px] text-slate-500">
              Govt. Reg No: {HOSPITAL_METADATA.regNo}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="inline-block px-3 py-1 bg-sky-100 text-sky-900 border border-sky-300 font-bold text-xs uppercase tracking-wider rounded">
            {documentTitle}
          </span>
          {documentNumber && (
            <p className="text-xs font-mono font-semibold text-slate-800 mt-1">
              Doc #: {documentNumber}
            </p>
          )}
          {dateStr && (
            <p className="text-xs text-slate-600">
              Date: {dateStr}
            </p>
          )}
        </div>
      </div>
      {documentSubtitle && (
        <p className="text-xs italic text-slate-500 mt-1">{documentSubtitle}</p>
      )}
    </div>
  );
}

export function HospitalPrintFooter() {
  return (
    <div className="mt-8 pt-4 border-t border-slate-300 text-[11px] text-slate-500 flex justify-between items-center">
      <div>
        <p>This is a computer-generated official medical document.</p>
        <p>For report verification or emergency, call: {HOSPITAL_METADATA.emergencyHotline}</p>
      </div>
      <div className="text-right">
        <div className="w-32 border-b border-slate-400 mb-1"></div>
        <p className="font-semibold text-slate-700">Authorized Signature</p>
      </div>
    </div>
  );
}
