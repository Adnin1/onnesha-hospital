"use client";

import React, { useState, useEffect } from "react";
import {
  HeartHandshake,
  Plus,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Wallet,
} from "lucide-react";
import {
  ScholarshipApplication,
  WelfareFund,
  getScholarshipApplicationsAction,
  getWelfareFundsAction,
  createScholarshipApplicationAction,
  createWelfareFundAction,
  updateScholarshipStatusAction,
} from "@/lib/scholarship/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { PatientMaster } from "@/types/clinical";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";

export default function ScholarshipWelfarePage() {
  const [applications, setApplications] = useState<ScholarshipApplication[]>([]);
  const [funds, setFunds] = useState<WelfareFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [selectedFundId, setSelectedFundId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);
  const [requestedAmount, setRequestedAmount] = useState<number | "">("");
  const [reason, setReason] = useState("");

  // Fund Form State
  const [fundName, setFundName] = useState("");
  const [donorSponsor, setDonorSponsor] = useState("");
  const [totalAllocated, setTotalAllocated] = useState<number | "">("");

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [appRes, fundRes] = await Promise.all([
        getScholarshipApplicationsAction(),
        getWelfareFundsAction(),
      ]);

      if (appRes.success && appRes.data) {
        setApplications(appRes.data);
      } else if (appRes.error) {
        setErrorMsg(appRes.error);
      }

      if (fundRes.success && fundRes.data) {
        setFunds(fundRes.data);
        if (fundRes.data.length > 0 && !selectedFundId) {
          setSelectedFundId(fundRes.data[0].id);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error loading welfare data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Search patients
  useEffect(() => {
    if (!isAppModalOpen) return;
    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const res = await searchPatientsAction({ query: patientSearch, pageSize: 15 });
        if (isMounted && res.success && res.data?.patients) {
          setPatients(res.data.patients);
        }
      } catch {
        // ignore
      }
    }, 250);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isAppModalOpen, patientSearch]);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      setErrorMsg("অনুগ্রহ করে রোগী নির্বাচন করুন।");
      return;
    }
    if (!selectedFundId) {
      setErrorMsg("অনুগ্রহ করে ফান্ড নির্বাচন করুন।");
      return;
    }
    const amt = Number(requestedAmount);
    if (!amt || amt <= 0) {
      setErrorMsg("দয়া করে সঠিক প্রার্থিত টাকার পরিমাণ দিন।");
      return;
    }
    if (!reason.trim()) {
      setErrorMsg("দয়া করে সহায়তার কারণ উল্লেখ করুন।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const res = await createScholarshipApplicationAction({
      patient_id: selectedPatient.id,
      fund_id: selectedFundId,
      requested_amount: amt,
      reason: reason.trim(),
    });

    setSubmitting(false);

    if (res.success && res.data) {
      showToast(`আবেদন #${res.data.application_number} সফলভাবে দাখিল হয়েছে।`);
      setIsAppModalOpen(false);
      setSelectedPatient(null);
      setRequestedAmount("");
      setReason("");
      await loadData();
    } else {
      setErrorMsg(res.error || "আবেদন দাখিল করতে ব্যর্থ হয়েছে।");
    }
  };

  const handleCreateFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundName.trim()) {
      setErrorMsg("ফান্ডের নাম আবশ্যক।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const res = await createWelfareFundAction({
      fund_name: fundName,
      donor_sponsor: donorSponsor,
      total_allocated: Number(totalAllocated) || 0,
    });

    setSubmitting(false);

    if (res.success && res.data) {
      showToast(`কল্যাণ তহবিল ${res.data.fund_name} যুক্ত হয়েছে।`);
      setIsFundModalOpen(false);
      setFundName("");
      setDonorSponsor("");
      setTotalAllocated("");
      await loadData();
    } else {
      setErrorMsg(res.error || "ফান্ড তৈরি করতে সমস্যা হয়েছে।");
    }
  };

  const handleUpdateStatus = async (
    appId: string,
    newStatus: "PENDING" | "APPROVED" | "REJECTED" | "DISBURSED"
  ) => {
    const res = await updateScholarshipStatusAction({
      application_id: appId,
      status: newStatus,
    });

    if (res.success) {
      showToast(`আবেদন স্ট্যাটাস পরিবর্তন: ${newStatus}`);
      await loadData();
    } else {
      setErrorMsg(res.error || "স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।");
    }
  };

  // KPIs
  const totalApps = applications.length;
  const totalRequested = applications.reduce((sum, a) => sum + Number(a.requested_amount || 0), 0);
  const totalApproved = applications.reduce((sum, a) => sum + Number(a.approved_amount || 0), 0);
  const pendingCount = applications.filter((a) => a.status === "PENDING").length;

  const filteredApps = applications.filter((a) => {
    if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const numMatch = a.application_number.toLowerCase().includes(q);
      const patMatch = a.patients?.full_name.toLowerCase().includes(q);
      const fundMatch = a.welfare_funds?.fund_name.toLowerCase().includes(q);
      return numMatch || patMatch || fundMatch;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 p-4 bg-emerald-600 text-white text-xs font-bold rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="h-5 w-5" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
            Patient Welfare & Financial Aid
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
            <HeartHandshake className="h-7 w-7 text-emerald-600" />
            Scholarship & Zakat Welfare Funds
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review subsidy applications, hardship waivers, zakat medical assistance, and charitable endowments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFundModalOpen(true)}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer border border-slate-200"
          >
            <Wallet className="w-4 h-4 text-slate-500" />
            + Welfare Funds ({funds.length})
          </button>
          <button
            type="button"
            onClick={() => setIsAppModalOpen(true)}
            className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            + Submit Welfare Request
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Total Requests</span>
            <FileText className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-slate-900 mt-2 font-mono">
            {totalApps} <span className="text-xs font-normal text-slate-400">Applications</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">{formatCurrencyBDT(totalRequested)}</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Approved Relief</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-700 mt-2 font-mono">
            {formatCurrencyBDT(totalApproved)}
          </div>
          <p className="text-[11px] text-emerald-600 mt-1 font-medium">Disbursed Aid to Patients</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Pending Review</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-amber-600 mt-2 font-mono">
            {pendingCount} <span className="text-xs font-normal text-slate-400">Pending</span>
          </div>
          <p className="text-[11px] text-amber-700 mt-1 font-medium">Under Superintendent Review</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Welfare Endowments</span>
            <Wallet className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black text-indigo-700 mt-2 font-mono">
            {funds.length} <span className="text-xs font-normal text-slate-400">Active Funds</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Zakat & Charity Pools</p>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800">
              Welfare Applications ({filteredApps.length})
            </h2>
            <div className="flex gap-1 ml-2">
              {["ALL", "PENDING", "APPROVED", "DISBURSED", "REJECTED"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    statusFilter === st
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {st === "ALL" ? "All" : st}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search application, patient, fund..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading welfare applications...</div>
        ) : filteredApps.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <HeartHandshake className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            No active scholarship or welfare requests. Click &ldquo;+ Submit Welfare Request&rdquo; above to record financial assistance.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Patient (রোগী)</th>
                  <th className="px-4 py-3">Fund (তহবিল)</th>
                  <th className="px-4 py-3">Reason / Diagnosis</th>
                  <th className="px-4 py-3 font-mono">Requested</th>
                  <th className="px-4 py-3 font-mono">Approved</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApps.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{app.application_number}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-800">{app.patients?.full_name || "Patient"}</span>
                      <span className="block text-[10px] text-slate-400 font-mono">{app.patients?.patient_code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">{app.welfare_funds?.fund_name || "General Fund"}</span>
                      <span className="block text-[10px] text-slate-400">{app.welfare_funds?.donor_sponsor || "Trust"}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate" title={app.reason}>
                      {app.reason}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">
                      {formatCurrencyBDT(app.requested_amount)}
                    </td>
                    <td className="px-4 py-3 font-mono text-emerald-600 font-bold">
                      {formatCurrencyBDT(app.approved_amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                          app.status === "APPROVED" || app.status === "DISBURSED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : app.status === "REJECTED"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDateBDT(app.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {app.status === "PENDING" && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(app.id, "APPROVED")}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded text-[10px] font-bold cursor-pointer"
                              title="Approve Aid"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(app.id, "REJECTED")}
                              className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded text-[10px] font-bold cursor-pointer"
                              title="Reject Request"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {app.status === "APPROVED" && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(app.id, "DISBURSED")}
                            className="px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded text-[10px] font-bold cursor-pointer"
                            title="Disburse Relief"
                          >
                            Disburse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: SUBMIT WELFARE REQUEST */}
      {isAppModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <HeartHandshake className="w-5 h-5 text-emerald-600" />
                Submit Patient Welfare Application
              </h3>
              <button
                onClick={() => setIsAppModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateApplication} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Welfare / Zakat Fund *
                </label>
                <select
                  value={selectedFundId}
                  onChange={(e) => setSelectedFundId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white font-medium focus:ring-2 focus:ring-emerald-500/20"
                >
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.fund_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Patient (রোগী খুঁজুন) *
                </label>
                {selectedPatient ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{selectedPatient.full_name}</p>
                      <p className="font-mono text-[10px] text-slate-500">ID: {selectedPatient.patient_code} • Phone: {selectedPatient.phone}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPatient(null)}
                      className="text-xs text-red-600 font-bold hover:underline"
                    >
                      পরিবর্তন
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      placeholder="রোগীর নাম বা মোবাইল নম্বর টাইপ করুন..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20"
                    />
                    {patients.length > 0 && (
                      <div className="mt-1 max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-xs">
                        {patients.map((pat) => (
                          <button
                            key={pat.id}
                            type="button"
                            onClick={() => setSelectedPatient(pat)}
                            className="w-full text-left p-2 hover:bg-slate-50 text-xs flex justify-between cursor-pointer"
                          >
                            <span className="font-bold text-slate-800">{pat.full_name}</span>
                            <span className="font-mono text-slate-500 text-[10px]">{pat.patient_code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Requested Relief Amount (প্রার্থিত অনুদান BDT) *
                </label>
                <input
                  type="number"
                  placeholder="e.g. 5000"
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value ? parseFloat(e.target.value) : "")}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason & Clinical Hardship Background *
                </label>
                <textarea
                  rows={2}
                  placeholder="রোগীর আর্থিক অসচ্ছলতা, চিকিৎসা খরচে ছাড়ের আবশ্যকতা ও ডায়াগনস্টিক বিবরণ..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAppModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD WELFARE FUND */}
      {isFundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-indigo-600" />
                Register Welfare / Zakat Fund
              </h3>
              <button
                onClick={() => setIsFundModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateFund} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fund Name (তহবিলের নাম) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Onnesha Dialysis Charity Fund"
                  value={fundName}
                  onChange={(e) => setFundName(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Donor / Sponsor Entity
                </label>
                <input
                  type="text"
                  placeholder="e.g. Annesha Hospital Welfare Trust"
                  value={donorSponsor}
                  onChange={(e) => setDonorSponsor(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Total Allocated Pool (BDT)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 250000"
                  value={totalAllocated}
                  onChange={(e) => setTotalAllocated(e.target.value ? parseFloat(e.target.value) : "")}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFundModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Add Fund"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
