"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Plus,
  Building2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
} from "lucide-react";
import {
  InsuranceClaim,
  InsurancePayer,
  getInsuranceClaimsAction,
  getInsurancePayersAction,
  createInsuranceClaimAction,
  createInsurancePayerAction,
  updateInsuranceClaimStatusAction,
} from "@/lib/insurance/actions";
import { searchPatientsAction } from "@/lib/patient/actions";
import { PatientMaster } from "@/types/clinical";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";

export default function InsuranceManagementPage() {
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [payers, setPayers] = useState<InsurancePayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [isPayerModalOpen, setIsPayerModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Claim Form State
  const [selectedPayerId, setSelectedPayerId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [patients, setPatients] = useState<PatientMaster[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);
  const [claimAmount, setClaimAmount] = useState<number | "">("");
  const [claimNotes, setClaimNotes] = useState("");

  // Payer Form State
  const [payerName, setPayerName] = useState("");
  const [payerCode, setPayerCode] = useState("");

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [claimsRes, payersRes] = await Promise.all([
        getInsuranceClaimsAction(),
        getInsurancePayersAction(),
      ]);

      if (claimsRes.success && claimsRes.data) {
        setClaims(claimsRes.data);
      } else if (claimsRes.error) {
        setErrorMsg(claimsRes.error);
      }

      if (payersRes.success && payersRes.data) {
        setPayers(payersRes.data);
        if (payersRes.data.length > 0 && !selectedPayerId) {
          setSelectedPayerId(payersRes.data[0].id);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error loading insurance data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Search patients for claim submission
  useEffect(() => {
    if (!isClaimModalOpen) return;
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
  }, [isClaimModalOpen, patientSearch]);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      setErrorMsg("অনুগ্রহ করে রোগী নির্বাচন করুন।");
      return;
    }
    if (!selectedPayerId) {
      setErrorMsg("অনুগ্রহ করে বীমা কোম্পানি নির্বাচন করুন।");
      return;
    }
    const amt = Number(claimAmount);
    if (!amt || amt <= 0) {
      setErrorMsg("দয়া করে সঠিক ক্লেইম টাকার পরিমাণ দিন।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const res = await createInsuranceClaimAction({
      payer_id: selectedPayerId,
      patient_id: selectedPatient.id,
      claim_amount: amt,
      notes: claimNotes,
    });

    setSubmitting(false);

    if (res.success && res.data) {
      showToast(`বীমা ক্লেইম #${res.data.claim_number} সফলভাবে দাখিল হয়েছে।`);
      setIsClaimModalOpen(false);
      setSelectedPatient(null);
      setClaimAmount("");
      setClaimNotes("");
      await loadData();
    } else {
      setErrorMsg(res.error || "ক্লেইম দাখিল করতে ব্যর্থ হয়েছে।");
    }
  };

  const handleCreatePayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payerName.trim() || !payerCode.trim()) {
      setErrorMsg("Payer Name এবং Code আবশ্যক।");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const res = await createInsurancePayerAction({
      payer_name: payerName,
      payer_code: payerCode,
    });

    setSubmitting(false);

    if (res.success && res.data) {
      showToast(`বীমা কোম্পানি ${res.data.payer_name} সফলভাবে রেজিস্টার হয়েছে।`);
      setIsPayerModalOpen(false);
      setPayerName("");
      setPayerCode("");
      await loadData();
    } else {
      setErrorMsg(res.error || "Payer তৈরি করতে সমস্যা হয়েছে।");
    }
  };

  const handleUpdateStatus = async (
    claimId: string,
    newStatus: "SUBMITTED" | "PRE_AUTHORIZED" | "APPROVED" | "DISBURSED" | "REJECTED"
  ) => {
    const res = await updateInsuranceClaimStatusAction({
      claim_id: claimId,
      status: newStatus,
    });

    if (res.success) {
      showToast(`ক্লেইম স্ট্যাটাস আপডেট: ${newStatus}`);
      await loadData();
    } else {
      setErrorMsg(res.error || "স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।");
    }
  };

  // KPIs
  const totalClaims = claims.length;
  const totalClaimAmount = claims.reduce((sum, c) => sum + Number(c.claim_amount || 0), 0);
  const totalApprovedAmount = claims.reduce((sum, c) => sum + Number(c.approved_amount || 0), 0);
  const pendingCount = claims.filter((c) => c.status === "SUBMITTED" || c.status === "PRE_AUTHORIZED").length;

  const filteredClaims = claims.filter((c) => {
    if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const numMatch = c.claim_number.toLowerCase().includes(q);
      const patMatch = c.patients?.full_name.toLowerCase().includes(q);
      const payerMatch = c.insurance_payers?.payer_name.toLowerCase().includes(q);
      return numMatch || patMatch || payerMatch;
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
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Third-Party Payer & Corporate Claims
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-sky-600" />
            Insurance Claims & Pre-Authorization
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track payer submissions, pre-authorization codes, corporate insurance cashless coverage, and settlements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPayerModalOpen(true)}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer border border-slate-200"
          >
            <Building2 className="w-4 h-4 text-slate-500" />
            + Corporate Payers ({payers.length})
          </button>
          <button
            type="button"
            onClick={() => setIsClaimModalOpen(true)}
            className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            + Submit Insurance Claim
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Total Submitted</span>
            <FileText className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-xl font-black text-slate-900 mt-2 font-mono">
            {totalClaims} <span className="text-xs font-normal text-slate-400">Claims</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">{formatCurrencyBDT(totalClaimAmount)}</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Approved & Settled</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-700 mt-2 font-mono">
            {formatCurrencyBDT(totalApprovedAmount)}
          </div>
          <p className="text-[11px] text-emerald-600 mt-1 font-medium">Verified Payer Approvals</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Pending Review</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-amber-600 mt-2 font-mono">
            {pendingCount} <span className="text-xs font-normal text-slate-400">Pending</span>
          </div>
          <p className="text-[11px] text-amber-700 mt-1 font-medium">Awaiting TPA Adjudication</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>Active Payers</span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black text-indigo-700 mt-2 font-mono">
            {payers.length} <span className="text-xs font-normal text-slate-400">Companies</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Corporate TPA Empaneled</p>
        </div>
      </div>

      {/* Claims List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800">
              Claims Submissions ({filteredClaims.length})
            </h2>
            {/* Status Pills */}
            <div className="flex gap-1 ml-2">
              {["ALL", "SUBMITTED", "PRE_AUTHORIZED", "APPROVED", "DISBURSED", "REJECTED"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    statusFilter === st
                      ? "bg-sky-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {st === "ALL" ? "All" : st.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search claim, patient or payer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500"
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
          <div className="p-8 text-center text-xs text-slate-400">Loading insurance claims...</div>
        ) : filteredClaims.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <ShieldCheck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            No insurance claims registered yet. Click &ldquo;+ Submit Insurance Claim&rdquo; above to register a corporate patient claim.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Claim #</th>
                  <th className="px-4 py-3">Payer (বীমা কোম্পানি)</th>
                  <th className="px-4 py-3">Patient (রোগী)</th>
                  <th className="px-4 py-3 font-mono">Claim Amount</th>
                  <th className="px-4 py-3 font-mono">Approved Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClaims.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{c.claim_number}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-800">{c.insurance_payers?.payer_name || "Payer"}</span>
                      <span className="block text-[10px] text-slate-400 font-mono">{c.insurance_payers?.payer_code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-900">{c.patients?.full_name || "Patient"}</span>
                      <span className="block text-[10px] text-slate-400 font-mono">{c.patients?.patient_code}</span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">
                      {formatCurrencyBDT(c.claim_amount)}
                    </td>
                    <td className="px-4 py-3 font-mono text-emerald-600 font-bold">
                      {formatCurrencyBDT(c.approved_amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                          c.status === "APPROVED" || c.status === "DISBURSED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : c.status === "PRE_AUTHORIZED"
                            ? "bg-sky-50 text-sky-700 border-sky-200"
                            : c.status === "REJECTED"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {c.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDateBDT(c.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {c.status === "SUBMITTED" && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(c.id, "PRE_AUTHORIZED")}
                            className="px-2 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded text-[10px] font-bold cursor-pointer"
                            title="Pre-Authorize Claim"
                          >
                            Pre-Auth
                          </button>
                        )}
                        {(c.status === "SUBMITTED" || c.status === "PRE_AUTHORIZED") && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(c.id, "APPROVED")}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded text-[10px] font-bold cursor-pointer"
                              title="Approve Claim"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(c.id, "REJECTED")}
                              className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded text-[10px] font-bold cursor-pointer"
                              title="Reject Claim"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {c.status === "APPROVED" && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(c.id, "DISBURSED")}
                            className="px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded text-[10px] font-bold cursor-pointer"
                            title="Disburse Settlement"
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

      {/* MODAL: SUBMIT INSURANCE CLAIM */}
      {isClaimModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-sky-600" />
                Submit New Insurance Claim
              </h3>
              <button
                onClick={() => setIsClaimModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateClaim} className="space-y-4">
              {/* Select Payer */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Corporate Insurance Company (Payer) *
                </label>
                <select
                  value={selectedPayerId}
                  onChange={(e) => setSelectedPayerId(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white font-medium focus:ring-2 focus:ring-sky-500/20"
                >
                  {payers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.payer_name} ({p.payer_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Patient */}
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
                      className="w-full p-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-sky-500/20"
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

              {/* Claim Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Claimed Amount (ক্লেইম টাকার পরিমাণ BDT) *
                </label>
                <input
                  type="number"
                  placeholder="e.g. 15000"
                  value={claimAmount}
                  onChange={(e) => setClaimAmount(e.target.value ? parseFloat(e.target.value) : "")}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Policy / Authorization Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Pre-auth approval code, policy number, or coverage details..."
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsClaimModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Claim"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CORPORATE PAYER */}
      {isPayerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                Register Corporate Insurance Payer
              </h3>
              <button
                onClick={() => setIsPayerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePayer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Company / Payer Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sonali Life Insurance Ltd"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Payer Code (Unique identifier) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. SONALI_LIFE"
                  value={payerCode}
                  onChange={(e) => setPayerCode(e.target.value.toUpperCase())}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPayerModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Add Payer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
