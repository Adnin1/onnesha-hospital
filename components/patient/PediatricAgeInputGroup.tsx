"use client";

import React, { useMemo } from "react";
import { Calendar, Baby, UserCheck } from "lucide-react";
import {
  calculateDetailedAgeFromDOB,
  calculateDOBFromYMD,
} from "@/lib/utils";

export interface PediatricAgeInputGroupProps {
  dob: string;
  onDobChange: (dob: string) => void;
  ageYears: number | "";
  onAgeYearsChange: (years: number | "") => void;
  ageMonths: number | "";
  onAgeMonthsChange: (months: number | "") => void;
  ageDays: number | "";
  onAgeDaysChange: (days: number | "") => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  className?: string;
  variant?: "standard" | "compact" | "bordered";
}

export function PediatricAgeInputGroup({
  dob,
  onDobChange,
  ageYears,
  onAgeYearsChange,
  ageMonths,
  onAgeMonthsChange,
  ageDays,
  onAgeDaysChange,
  disabled = false,
  label = "Patient Age (সরাসরি বয়স) ও জন্ম তারিখ (Age & Date of Birth)",
  className = "",
  variant = "standard",
}: PediatricAgeInputGroupProps) {
  // Compute badge summary
  const summary = useMemo(() => {
    if (dob) {
      return calculateDetailedAgeFromDOB(dob);
    }
    const y = typeof ageYears === "number" ? ageYears : 0;
    const m = typeof ageMonths === "number" ? ageMonths : 0;
    const d = typeof ageDays === "number" ? ageDays : 0;
    if (ageYears === "" && ageMonths === "" && ageDays === "") {
      return null;
    }
    const computedDob = calculateDOBFromYMD(y, m, d);
    return calculateDetailedAgeFromDOB(computedDob);
  }, [dob, ageYears, ageMonths, ageDays]);

  const handleDobInput = (newDob: string) => {
    onDobChange(newDob);
    if (newDob) {
      const detailed = calculateDetailedAgeFromDOB(newDob);
      onAgeYearsChange(detailed.years);
      onAgeMonthsChange(detailed.months);
      onAgeDaysChange(detailed.days);
    } else {
      onAgeYearsChange("");
      onAgeMonthsChange("");
      onAgeDaysChange("");
    }
  };

  const handleYmdChange = (
    yVal: number | "",
    mVal: number | "",
    dVal: number | ""
  ) => {
    onAgeYearsChange(yVal);
    onAgeMonthsChange(mVal);
    onAgeDaysChange(dVal);

    if (yVal === "" && mVal === "" && dVal === "") {
      onDobChange("");
      return;
    }

    const y = typeof yVal === "number" ? Math.max(0, yVal) : 0;
    const m = typeof mVal === "number" ? Math.max(0, Math.min(11, mVal)) : 0;
    const d = typeof dVal === "number" ? Math.max(0, Math.min(30, dVal)) : 0;

    const computed = calculateDOBFromYMD(y, m, d);
    onDobChange(computed);
  };

  const isBaby =
    (typeof ageYears === "number" && ageYears === 0) ||
    (summary && summary.years === 0 && (summary.months > 0 || summary.days > 0));

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Top Label & Dynamic Summary Badge */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
          {isBaby ? (
            <Baby className="w-3.5 h-3.5 text-sky-600 animate-pulse" />
          ) : (
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
          )}
          <span>{label}</span>
        </label>

        {summary && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border flex items-center gap-1 ${
              isBaby
                ? "bg-sky-50 text-sky-800 border-sky-300"
                : "bg-emerald-50 text-emerald-800 border-emerald-300"
            }`}
          >
            {isBaby ? <Baby className="w-3 h-3 text-sky-600" /> : <UserCheck className="w-3 h-3 text-emerald-600" />}
            <span>{summary.formatted}</span>
          </span>
        )}
      </div>

      {/* 4 Synchronized Input Boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Box 1: Date of Birth */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
            জন্ম তারিখ (DOB)
          </label>
          <input
            type="date"
            disabled={disabled}
            value={dob}
            onChange={(e) => handleDobInput(e.target.value)}
            className={`w-full px-2.5 py-1.5 text-xs rounded-xl border font-semibold focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition bg-white ${
              variant === "bordered" ? "border-slate-300" : "border-slate-200"
            }`}
          />
        </div>

        {/* Box 2: Years */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
            বছর (Years)
          </label>
          <input
            type="number"
            min={0}
            max={125}
            disabled={disabled}
            placeholder="0"
            value={ageYears}
            onChange={(e) => {
              const v = e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0);
              handleYmdChange(v, ageMonths, ageDays);
            }}
            className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 font-mono font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition bg-white"
          />
        </div>

        {/* Box 3: Months */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
            মাস (Months: 0-11)
          </label>
          <input
            type="number"
            min={0}
            max={11}
            disabled={disabled}
            placeholder="0"
            value={ageMonths}
            onChange={(e) => {
              const v = e.target.value === "" ? "" : Math.max(0, Math.min(11, parseInt(e.target.value, 10) || 0));
              handleYmdChange(ageYears, v, ageDays);
            }}
            className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 font-mono font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition bg-white"
          />
        </div>

        {/* Box 4: Days */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
            দিন (Days: 0-30)
          </label>
          <input
            type="number"
            min={0}
            max={30}
            disabled={disabled}
            placeholder="0"
            value={ageDays}
            onChange={(e) => {
              const v = e.target.value === "" ? "" : Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0));
              handleYmdChange(ageYears, ageMonths, v);
            }}
            className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 font-mono font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition bg-white"
          />
        </div>
      </div>
      <p className="text-[10px] text-slate-400">
        * যেকোনো একটি ঘর পরিবর্তন করলেই জন্ম তারিখ ও বয়স স্বয়ংক্রিয়ভাবে হিসাব হবে (নবজাতক/শিশুর ক্ষেত্রে ০ বছর এবং নির্দিষ্ট মাস/দিন লিখুন)।
      </p>
    </div>
  );
}
