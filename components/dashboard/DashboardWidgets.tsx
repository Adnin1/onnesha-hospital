import React from "react";
import Link from "next/link";
import {
  Users,
  Activity,
  Bed,
  PlusCircle,
  Stethoscope,
  Receipt,
  Microscope,
  Pill,
  Radio,
  Clock,
  Volume2,
  CheckCircle2,
} from "lucide-react";
import { WaitingQueueItem } from "@/types";

interface QuickAction {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

export const DASHBOARD_QUICK_ACTIONS: QuickAction[] = [
  { title: "New Patient", href: "/app/patients", icon: Users, color: "bg-sky-50 text-sky-700 hover:bg-sky-100" },
  { title: "OPD Token", href: "/app/appointments", icon: Activity, color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  { title: "Consultation", href: "/app/opd", icon: Stethoscope, color: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" },
  { title: "Generate Bill", href: "/app/billing", icon: Receipt, color: "bg-amber-50 text-amber-700 hover:bg-amber-100" },
  { title: "Lab Order", href: "/app/lab", icon: Microscope, color: "bg-purple-50 text-purple-700 hover:bg-purple-100" },
  { title: "Pharmacy POS", href: "/app/pharmacy", icon: Pill, color: "bg-rose-50 text-rose-700 hover:bg-rose-100" },
  { title: "Emergency", href: "/app/emergency", icon: Radio, color: "bg-red-50 text-red-700 hover:bg-red-100" },
  { title: "Bed Matrix", href: "/app/beds", icon: Bed, color: "bg-slate-50 text-slate-700 hover:bg-slate-100" },
];

export function QuickActionsWidget() {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center">
          <PlusCircle className="w-4 h-4 mr-2 text-sky-600" />
          Frontline Quick Actions
        </h3>
        <span className="text-[11px] text-slate-400">Standard Workflows</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {DASHBOARD_QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={`p-3 rounded-xl border border-transparent font-semibold text-xs flex flex-col items-center text-center transition ${action.color}`}
            >
              <Icon className="w-5 h-5 mb-1.5" />
              <span>{action.title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

interface TriageQueueWidgetProps {
  queue: WaitingQueueItem[];
  onCallToken: (id: string) => void;
  onMarkDone: (id: string) => void;
  isLoading?: boolean;
}

export function TriageQueueWidget({
  queue,
  onCallToken,
  onMarkDone,
  isLoading = false,
}: TriageQueueWidgetProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs animate-pulse">
        <div className="h-5 bg-slate-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-2">
          <div className="h-12 bg-slate-100 rounded-xl"></div>
          <div className="h-12 bg-slate-100 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center">
            <Clock className="w-4 h-4 mr-2 text-sky-600" />
            Live Digital Triage & OPD Queue
          </h3>
          <p className="text-[11px] text-slate-500">Realtime consultation calling system</p>
        </div>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700">
          {queue.filter((q) => q.status !== "done").length} In Queue
        </span>
      </div>

      {queue.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">No Active Patients in Queue</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Register patients from OPD or Reception to populate the waiting board.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {queue.map((item) => (
            <div
              key={item.id}
              className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${
                item.status === "calling"
                  ? "bg-amber-50/80 border-amber-300 ring-2 ring-amber-200"
                  : item.status === "serving"
                  ? "bg-emerald-50/80 border-emerald-300"
                  : item.status === "done"
                  ? "bg-slate-50 border-slate-200 opacity-60"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="px-2 py-1 rounded-lg bg-slate-900 text-white font-mono font-bold text-[11px]">
                  {item.token_number}
                </span>
                <div>
                  <h4 className="font-bold text-slate-800">{item.patient_name}</h4>
                  <p className="text-[10px] text-slate-500">
                    Dr: {item.doctor_name} • Room {item.room_number}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {item.status === "waiting" && (
                  <button
                    onClick={() => onCallToken(item.id)}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[10px] flex items-center space-x-1 shadow-xs"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>Call Next</span>
                  </button>
                )}
                {item.status === "calling" && (
                  <button
                    onClick={() => onMarkDone(item.id)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] flex items-center space-x-1 shadow-xs"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Complete</span>
                  </button>
                )}
                {item.status === "done" && (
                  <span className="text-[10px] text-slate-400 font-semibold">Done</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
