import React from "react";
import { LucideIcon } from "lucide-react";

export interface StatCardProps {
  title: string;
  bengaliTitle?: string;
  value: string | number;
  subtitle?: string;
  bengaliSubtitle?: string;
  badge?: string;
  icon: LucideIcon;
  iconColor?: string;
  bgColor?: string;
  cardTheme?: "sky" | "teal" | "blue" | "indigo" | "default";
  progress?: {
    current: number;
    total: number;
  };
  trend?: {
    value: string;
    isPositive: boolean;
  };
  isLoading?: boolean;
}

export function StatCard({
  title,
  bengaliTitle,
  value,
  subtitle,
  bengaliSubtitle,
  badge,
  icon: Icon,
  iconColor = "text-sky-600",
  bgColor = "bg-sky-50",
  cardTheme = "default",
  progress,
  trend,
  isLoading = false,
}: StatCardProps) {
  if (isLoading) {
    return (
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/2 mb-3"></div>
        <div className="h-8 bg-slate-200 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-slate-100 rounded w-1/3"></div>
      </div>
    );
  }

  const themeStyles = {
    sky: "bg-gradient-to-br from-sky-50/80 via-white to-white border-sky-200/80 shadow-sky-500/5",
    teal: "bg-gradient-to-br from-emerald-50/80 via-white to-white border-emerald-200/80 shadow-emerald-500/5",
    blue: "bg-gradient-to-br from-blue-50/80 via-white to-white border-blue-200/80 shadow-blue-500/5",
    indigo: "bg-gradient-to-br from-indigo-50/80 via-white to-white border-indigo-200/80 shadow-indigo-500/5",
    default: "bg-gradient-to-br from-slate-50/60 via-white to-white border-slate-200/90 shadow-slate-900/5",
  }[cardTheme];

  return (
    <div
      className={`stat-card-3d p-5 rounded-2xl flex flex-col justify-between ${themeStyles}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center space-x-1.5">
            <p className="text-xs font-bold text-slate-700 tracking-tight">{title}</p>
            {bengaliTitle && (
              <span className="text-[11px] text-slate-500 font-medium">/ {bengaliTitle}</span>
            )}
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1.5 tracking-tight font-mono">
            {value}
          </h3>
          {(bengaliSubtitle || subtitle) && (
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              {bengaliSubtitle || subtitle}
            </p>
          )}
        </div>
        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-white/60 shadow-md ${bgColor}`}
        >
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>

      {/* Progress Bar (if provided, e.g. for bed occupancy) */}
      {progress && progress.total > 0 && (
        <div className="mt-3">
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-sky-600 h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, (progress.current / progress.total) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Badges or Trend footer */}
      <div className="mt-3 pt-2.5 border-t border-slate-100/80 flex items-center justify-between text-[11px]">
        {trend ? (
          <span
            className={`font-semibold inline-flex items-center ${
              trend.isPositive ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            <span className="mr-1">{trend.isPositive ? "↑" : "↓"}</span>
            <span>{trend.value}</span>
            <span className="text-slate-400 font-normal ml-1">vs yesterday</span>
          </span>
        ) : badge ? (
          <span className="font-medium text-slate-600 inline-flex items-center">
            {badge}
          </span>
        ) : (
          <span className="text-slate-400 font-normal">রিয়েল-টাইম পরিসংখ্যান</span>
        )}
      </div>
    </div>
  );
}
