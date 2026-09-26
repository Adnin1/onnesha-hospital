"use client";

import React, { useState, useEffect, useCallback } from "react";
import { UserCheck, Plus } from "lucide-react";
import { ReferralAgent, getReferralAgentsAction, createReferralAgentAction } from "@/lib/referrals/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function ReferralManagementPage() {
  const [agents, setAgents] = useState<ReferralAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [agentCode, setAgentCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [agentType, setAgentType] = useState<"DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF">("COMMUNITY_PC");
  const [rateDiag, setRateDiag] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    const res = await getReferralAgentsAction();
    if (res.success && res.data) {
      setAgents(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const res = await getReferralAgentsAction();
      if (!isMounted) return;
      if (res.success && res.data) {
        setAgents(res.data);
      }
      setLoading(false);
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    const res = await createReferralAgentAction({
      agent_code: agentCode,
      full_name: fullName,
      phone,
      agent_type: agentType,
      commission_rate_diag: rateDiag,
    });
    setSubmitting(false);
    if (res.success) {
      setShowModal(false);
      setAgentCode("");
      setFullName("");
      setPhone("");
      void refreshData();
    } else {
      setErrorMsg(res.error || "Failed to create agent");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex justify-between items-center">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Enterprise Partners & Commissions
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            PC & Referral Agents Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage referring doctors, community agents, commission rules, and settlement ledgers.
          </p>
        </div>
        <button
          onClick={() => {
            setAgentCode(`REF-${Date.now().toString().slice(-4)}`);
            setShowModal(true);
          }}
          className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add Referral Agent
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800">
            Registered Agents ({agents.length})
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading referral directory...</div>
        ) : agents.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <UserCheck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            No referral agents registered yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Agent Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Diag Rate</th>
                  <th className="px-4 py-3">Earned</th>
                  <th className="px-4 py-3">Settled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{a.agent_code}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{a.full_name}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-bold text-[10px]">{a.agent_type}</span></td>
                    <td className="px-4 py-3 font-mono">{a.phone}</td>
                    <td className="px-4 py-3">{a.commission_rate_diag}%</td>
                    <td className="px-4 py-3 font-mono text-emerald-600 font-bold">{formatCurrencyBDT(a.total_commission_earned)}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{formatCurrencyBDT(a.total_commission_settled)}</td>
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
            <h3 className="text-base font-bold text-slate-900">Add Referral Agent</h3>
            {errorMsg && <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded">{errorMsg}</p>}
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700">Agent Code</label>
                <input
                  type="text"
                  value={agentCode}
                  onChange={(e) => setAgentCode(e.target.value)}
                  className="w-full text-xs p-2.5 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full text-xs p-2.5 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full text-xs p-2.5 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Agent Type</label>
                <select
                  value={agentType}
                  onChange={(e) => setAgentType(e.target.value as "DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF")}
                  className="w-full text-xs p-2.5 border rounded-lg"
                >
                  <option value="COMMUNITY_PC">Community PC</option>
                  <option value="DOCTOR">Doctor</option>
                  <option value="ORGANIZATION">Organization</option>
                  <option value="STAFF">Staff</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700">Commission Rate Diagnostic (%)</label>
                <input
                  type="number"
                  value={rateDiag}
                  onChange={(e) => setRateDiag(Number(e.target.value))}
                  className="w-full text-xs p-2.5 border rounded-lg"
                  min={0}
                  max={100}
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
                  className="px-4 py-2 text-xs font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                >
                  {submitting ? "Saving..." : "Save Agent"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
