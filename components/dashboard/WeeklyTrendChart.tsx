"use client";

import React, { useState } from "react";
import { TrendingUp, Users } from "lucide-react";

export interface WeeklyDataPoint {
  day: string;
  bnDay: string;
  count: number;
}

const DEFAULT_WEEKLY_DATA: WeeklyDataPoint[] = [
  { day: "Mon", bnDay: "সোম", count: 78 },
  { day: "Tue", bnDay: "মঙ্গল", count: 92 },
  { day: "Wed", bnDay: "বুধ", count: 88 },
  { day: "Thu", bnDay: "বৃহঃ", count: 82 },
  { day: "Fri", bnDay: "শুক্র", count: 95 },
  { day: "Sat", bnDay: "শনি", count: 110 },
  { day: "Sun", bnDay: "রবি", count: 124 },
];

export function WeeklyTrendChart({
  data = DEFAULT_WEEKLY_DATA,
  todayCount = 124,
}: {
  data?: WeeklyDataPoint[];
  todayCount?: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // SVG Chart Dimensions
  const width = 500;
  const height = 180;
  const paddingX = 35;
  const paddingY = 30;

  const minCount = Math.min(...data.map((d) => d.count), 50);
  const maxCount = Math.max(...data.map((d) => d.count), todayCount, 130);

  // Map data to coordinate points
  const points = data.map((d, index) => {
    const x = paddingX + (index * (width - 2 * paddingX)) / (data.length - 1);
    const y = height - paddingY - ((d.count - minCount) / (maxCount - minCount || 1)) * (height - 2 * paddingY);
    return { x, y, ...d };
  });

  // Generate smooth SVG Catmull-Rom or cubic Bezier path
  const generateSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return "";
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const linePath = generateSmoothPath(points);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath = `${linePath} L ${lastPoint.x},${height - paddingY} L ${firstPoint.x},${height - paddingY} Z`;

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition duration-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">Weekly Patient Trend</h3>
            <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <TrendingUp className="w-3 h-3 mr-0.5" />
              +14.8%
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">গত ৭ দিনের রোগীর প্রবণতা ও আগমনের পরিসংখ্যান</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400 font-medium">আজকের পিক</span>
          <p className="text-base font-black text-sky-700">{todayCount} জন</p>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="patientTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.32" />
              <stop offset="60%" stopColor="#0284c7" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.00" />
            </linearGradient>
            <filter id="shadowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0284c7" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Horizontal Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            stroke="#f1f5f9"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <line
            x1={paddingX}
            y1={height / 2}
            x2={width - paddingX}
            y2={height / 2}
            stroke="#f1f5f9"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            stroke="#e2e8f0"
            strokeWidth="1"
          />

          {/* Area fill */}
          <path d={areaPath} fill="url(#patientTrendGrad)" />

          {/* Stroke Line */}
          <path
            d={linePath}
            fill="none"
            stroke="#0284c7"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points */}
          {points.map((pt, i) => {
            const isHovered = hoveredIndex === i;
            const isLast = i === points.length - 1;

            return (
              <g
                key={i}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Active pulse on peak (last point) */}
                {isLast && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="9"
                    fill="#0284c7"
                    opacity="0.25"
                    className="animate-ping"
                  />
                )}

                {/* Point circle */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : isLast ? 5 : 4}
                  fill={isLast || isHovered ? "#0284c7" : "#ffffff"}
                  stroke="#0284c7"
                  strokeWidth="2"
                  filter={isHovered ? "url(#shadowFilter)" : undefined}
                />

                {/* Value text above active point */}
                {(isHovered || isLast) && (
                  <g>
                    <rect
                      x={pt.x - 18}
                      y={pt.y - 24}
                      width="36"
                      height="18"
                      rx="4"
                      fill="#0f172a"
                    />
                    <text
                      x={pt.x}
                      y={pt.y - 12}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="10"
                      fontWeight="bold"
                    >
                      {pt.count}
                    </text>
                  </g>
                )}

                {/* X Axis Labels */}
                <text
                  x={pt.x}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={isLast ? "bold" : "500"}
                  fill={isLast ? "#0284c7" : "#64748b"}
                >
                  {pt.day}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
        <span className="flex items-center">
          <Users className="w-3.5 h-3.5 mr-1 text-sky-600" />
          গড় দৈনিক রোগী: <strong>৯৬ জন</strong>
        </span>
        <span className="text-slate-400">সাপ্তাহিক ট্র্যাকার • রিয়েল-টাইম ডেটাবেস সিঙ্ক</span>
      </div>
    </div>
  );
}
