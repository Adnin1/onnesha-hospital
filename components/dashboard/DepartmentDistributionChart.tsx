"use client";

import React, { useState } from "react";
import { PieChart } from "lucide-react";

export interface DepartmentShare {
  name: string;
  bnName: string;
  percentage: number;
  color: string;
  count?: number;
}

export function DepartmentDistributionChart({
  departments = [],
  totalCount = 0,
}: {
  departments?: DepartmentShare[];
  totalCount?: number;
}) {
  const [hoveredDept, setHoveredDept] = useState<DepartmentShare | null>(null);

  // SVG Donut Calculations
  const radius = 64;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;

  // Precompute immutable segments
  const segments = departments.map((dept, index) => {
    const previousSum = departments.slice(0, index).reduce((acc, d) => acc + d.percentage, 0);
    const strokeDasharray = `${(dept.percentage / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((previousSum / 100) * circumference);
    return { ...dept, strokeDasharray, strokeDashoffset };
  });

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition duration-200 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center">
              <PieChart className="w-4 h-4 mr-1.5 text-sky-600" />
              Department Distribution
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">বিভাগ অনুযায়ী রোগীর অনুপাত</p>
          </div>
          {departments.length > 0 && (
            <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
              {departments.length}টি বিভাগ
            </span>
          )}
        </div>

        {/* Donut and Legend Layout or Empty State */}
        {departments.length === 0 || totalCount === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 font-medium border border-dashed border-slate-200 rounded-xl my-2">
            কোনো বিভাগীয় ডেটা নেই (No department distribution data available)
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 my-2">
            {/* SVG Donut */}
          <div className="relative w-40 h-40 flex items-center justify-center shrink-0">
            <svg
              className="w-full h-full transform -rotate-90 select-none overflow-visible"
              viewBox="0 0 160 160"
            >
              {/* Background ring */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke="#f1f5f9"
                strokeWidth={strokeWidth}
                fill="none"
              />

              {/* Segments */}
              {segments.map((dept, index) => {
                const isHovered = hoveredDept?.name === dept.name;

                return (
                  <circle
                    key={index}
                    cx="80"
                    cy="80"
                    r={radius}
                    stroke={dept.color}
                    strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={dept.strokeDasharray}
                    strokeDashoffset={dept.strokeDashoffset}
                    fill="none"
                    strokeLinecap="round"
                    className="transition-all duration-300 cursor-pointer"
                    onMouseEnter={() => setHoveredDept(dept)}
                    onMouseLeave={() => setHoveredDept(null)}
                  />
                );
              })}
            </svg>

            {/* Inner Center Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              {hoveredDept ? (
                <>
                  <span className="text-xs font-bold text-slate-900 leading-tight">
                    {hoveredDept.percentage}%
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium truncate max-w-[70px]">
                    {hoveredDept.name}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-lg font-black text-slate-900 leading-none">
                    {totalCount}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                    রোগী
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Interactive Legend List */}
          <div className="space-y-2 w-full max-w-[200px]">
            {departments.map((dept, index) => {
              const isHovered = hoveredDept?.name === dept.name;
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-1.5 rounded-lg transition-colors cursor-pointer text-xs ${
                    isHovered ? "bg-slate-100 font-semibold" : "hover:bg-slate-50 text-slate-700"
                  }`}
                  onMouseEnter={() => setHoveredDept(dept)}
                  onMouseLeave={() => setHoveredDept(null)}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: dept.color }}
                    />
                    <span className="truncate">{dept.name}</span>
                  </div>
                  <span className="font-bold text-slate-900 shrink-0 ml-2">
                    {dept.percentage}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 text-center sm:text-left">
        ক্লিনিক্যাল সার্ভিস কনসালটেন্সি বিশ্লেষণ
      </div>
    </div>
  );
}
