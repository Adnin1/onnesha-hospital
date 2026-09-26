"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, MessageSquare } from "lucide-react";
import { PatientComplaint, getComplaintsAction, registerComplaintAction } from "@/lib/feedback/actions";
import { formatDateBDT } from "@/lib/utils";

export default function FeedbackComplaintsPage() {
  const [complaints, setComplaints] = useState<PatientComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [severity, setSeverity] = useState<"LOW" | "NORMAL" | "URGENT" | "CRITICAL">("NORMAL");
  const [submitting, setSubmitting] = useState(false);

  const refreshData = useCallback(async () => {
    const res = await getComplaintsAction();
    if (res.success && res.data) {
      setComplaints(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const res = await getComplaintsAction();
      if (!isMounted) return;
      if (res.success && res.data) {
        setComplaints(res.data);
      }
      setLoading(false);
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await registerComplaintAction({ subject, details, severity });
    setSubmitting(false);
    if (res.success) {
      setShowModal(false);
      setSubject("");
      setDetails("");
      void refreshData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex justify-between items-center">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Patient Experience & Quality Assurance
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Feedback & Grievance Redressal
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Log, track, investigate, and resolve patient complaints and department service feedback.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Log Complaint
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800">
            Complaints & SLA Tracking ({complaints.length})
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading complaints...</div>
        ) : complaints.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            No patient complaints on file.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Logged At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {complaints.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{c.complaint_number}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{c.subject}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.severity === "CRITICAL" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {c.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px] font-bold">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDateBDT(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Log Patient Grievance</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full text-xs p-2.5 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as "LOW" | "NORMAL" | "URGENT" | "CRITICAL")}
                  className="w-full text-xs p-2.5 border rounded-lg"
                >
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="URGENT">Urgent</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Detailed Grievance</label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  className="w-full text-xs p-2.5 border rounded-lg"
                  rows={3}
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700"
                >
                  {submitting ? "Saving..." : "Submit Grievance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
