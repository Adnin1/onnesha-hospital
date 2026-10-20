"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserCheck,
  Plus,
  Search,
  TrendingUp,
  Receipt,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  Building,
  Stethoscope,
  Briefcase,
  History,
  BarChart3,
  ShieldCheck,
  Award,
  Calendar,
  RefreshCw,
  Edit2,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { getCurrentUserSession } from "@/lib/auth/session";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";
import {
  ReferralAgent,
  ReferralCommission,
  ReferralSettlement,
  ReferralRateHistory,
  ReferralAttribution,
  ReferralSummaryMetrics,
  ReferralPerformanceAnalyticsData,
  PatientReferralServiceSummary,
  PeriodicBillingStats,
  getReferralAgentsAction,
  getReferralAgentByIdAction,
  createReferralAgentAction,
  updateReferralAgentAction,
  updateReferralAgentRateAction,
  deleteReferralAgentAction,
  getReferralCommissionsAction,
  settleReferralCommissionsAction,
  getReferralSettlementsAction,
  getReferralSummaryMetricsAction,
  getReferralPerformanceAnalyticsAction,
  approveCommissionAction,
  rejectCommissionAction,
  recordReferralCommissionPayoutAction,
} from "@/lib/referrals/actions";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type ActiveTab = "AGENTS" | "COMMISSIONS" | "SETTLEMENTS" | "PERFORMANCE";

interface AgentDetailData {
  agent: ReferralAgent;
  commissions: ReferralCommission[];
  settlements: ReferralSettlement[];
  rateHistory: ReferralRateHistory[];
  attributions: ReferralAttribution[];
  patientServicesSummary?: PatientReferralServiceSummary[];
  periodicBilling?: PeriodicBillingStats;
}

export default function ReferralManagementPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("AGENTS");
  const [agents, setAgents] = useState<ReferralAgent[]>([]);
  const [commissions, setCommissions] = useState<ReferralCommission[]>([]);
  const [settlements, setSettlements] = useState<ReferralSettlement[]>([]);
  const [metrics, setMetrics] = useState<ReferralSummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  // RBAC Permission State
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  // Modals & Drawers
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [agentDetailData, setAgentDetailData] = useState<AgentDetailData | null>(null);
  const [agentToArchive, setAgentToArchive] = useState<ReferralAgent | null>(null);
  const [partnerToEdit, setPartnerToEdit] = useState<ReferralAgent | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: "",
    agentType: "COMMUNITY_PC" as "DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF",
    phone: "",
    email: "",
    address: "",
    licenseNo: "",
    commissionRate: 10,
    isEligible: true,
    notes: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [agentPeriodFilter, setAgentPeriodFilter] = useState<"ALL" | "TODAY" | "WEEK" | "MONTH" | "YEAR">("ALL");
  const [showDiscretionaryPayoutModal, setShowDiscretionaryPayoutModal] = useState(false);
  const [payoutSelectedPatientId, setPayoutSelectedPatientId] = useState<string>("");
  const [discretionaryPayoutAmount, setDiscretionaryPayoutAmount] = useState<number | "">("");
  const [discretionaryPaymentMethod, setDiscretionaryPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "BKASH" | "NAGAD">("CASH");
  const [discretionaryPaymentRef, setDiscretionaryPaymentRef] = useState("");
  const [discretionaryPaymentNotes, setDiscretionaryPaymentNotes] = useState("");
  const [discretionaryPayoutLoading, setDiscretionaryPayoutLoading] = useState(false);
  const [payoutToast, setPayoutToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Performance Analytics State
  const [performanceData, setPerformanceData] = useState<ReferralPerformanceAnalyticsData | null>(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  const [perfDateRange, setPerfDateRange] = useState<"THIS_MONTH" | "LAST_MONTH" | "THIS_YEAR" | "LAST_YEAR" | "ALL" | "CUSTOM">("THIS_MONTH");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [selectedPerfAgentId, setSelectedPerfAgentId] = useState<string>("ALL");

  // Form States for Add Agent
  const [addForm, setAddForm] = useState({
    fullName: "",
    agentType: "COMMUNITY_PC" as "DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF",
    phone: "",
    email: "",
    address: "",
    licenseNo: "",
    commissionRate: 10,
    isEligible: true,
    bmdcEthicsAcknowledged: false,
    complianceNotes: "",
    notes: "",
  });

  // Form States for Adjust Rate
  const [rateForm, setRateForm] = useState({
    agentId: "",
    currentRate: 10,
    newRate: 10,
    reason: "",
  });

  // Form States for Settlement Payout
  const [settleForm, setSettleForm] = useState({
    agentId: "",
    selectedCommissionIds: [] as string[],
    paymentMethod: "BANK_TRANSFER" as "CASH" | "BANK_TRANSFER" | "BKASH" | "NAGAD" | "ROCKET" | "UPAY",
    transactionRef: "",
    notes: "",
  });

  const [pendingCommissionsForAgent, setPendingCommissionsForAgent] = useState<ReferralCommission[]>([]);
  const [loadingPendingComms, setLoadingPendingComms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [commToApprove, setCommToApprove] = useState<ReferralCommission | null>(null);
  const [commToReject, setCommToReject] = useState<ReferralCommission | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [alertError, setAlertError] = useState<string | null>(null);
  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);

  const loadPerformanceData = useCallback(async () => {
    setLoadingPerformance(true);
    try {
      let startDate: string | undefined;
      let endDate: string | undefined;
      const now = new Date();

      if (perfDateRange === "THIS_MONTH") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      } else if (perfDateRange === "LAST_MONTH") {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        endDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      } else if (perfDateRange === "THIS_YEAR") {
        startDate = new Date(now.getFullYear(), 0, 1).toISOString();
        endDate = new Date(now.getFullYear() + 1, 0, 1).toISOString();
      } else if (perfDateRange === "LAST_YEAR") {
        startDate = new Date(now.getFullYear() - 1, 0, 1).toISOString();
        endDate = new Date(now.getFullYear(), 0, 1).toISOString();
      } else if (perfDateRange === "CUSTOM" && customStartDate && customEndDate) {
        startDate = new Date(`${customStartDate}T00:00:00.000Z`).toISOString();
        const nextDay = new Date(`${customEndDate}T00:00:00.000Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        endDate = nextDay.toISOString();
      } else if (perfDateRange === "ALL") {
        startDate = undefined;
        endDate = undefined;
      }

      const res = await getReferralPerformanceAnalyticsAction({
        agentId: selectedPerfAgentId === "ALL" ? undefined : selectedPerfAgentId,
        startDate,
        endDate,
      });

      if (res.success && res.data) {
        setPerformanceData(res.data);
      }
    } catch (err) {
      console.error("[Referral Performance] Load error:", err);
    } finally {
      setLoadingPerformance(false);
    }
  }, [perfDateRange, selectedPerfAgentId, customStartDate, customEndDate]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const session = await getCurrentUserSession();
      const superAdmin = session.roles.includes("super_admin");
      const perms = session.permissions.length > 0
        ? session.permissions
        : (session.roles[0] ? (DEFAULT_ROLE_PERMISSIONS[session.roles[0]] || []) : []);
      setIsSuperAdmin(superAdmin);
      setUserPermissions(perms);

      const canView = superAdmin || perms.includes("referral.view") || perms.includes("referral.manage");
      if (!canView) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      const [agentsRes, commsRes, settleRes, metricsRes] = await Promise.all([
        getReferralAgentsAction(),
        getReferralCommissionsAction(),
        getReferralSettlementsAction(),
        getReferralSummaryMetricsAction(),
      ]);

      if (agentsRes.success && agentsRes.data) setAgents(agentsRes.data);
      if (commsRes.success && commsRes.data) setCommissions(commsRes.data);
      if (settleRes.success && settleRes.data) setSettlements(settleRes.data);
      if (metricsRes.success && metricsRes.data) setMetrics(metricsRes.data);
    } catch (err: unknown) {
      console.error("[Referral Management] Load error:", err);
      setAlertError("Failed to synchronize referral data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (activeTab === "PERFORMANCE") {
      loadPerformanceData();
    }
  }, [activeTab, loadPerformanceData]);

  // Load single agent details for drawer
  const handleOpenAgentDetail = async (agentId: string) => {
    setSelectedAgentId(agentId);
    setLoadingDetail(true);
    setAlertError(null);
    try {
      const res = await getReferralAgentByIdAction(agentId);
      if (res.success && res.data) {
        setAgentDetailData(res.data);
      } else {
        setAlertError(res.error || "Failed to load agent profile details");
      }
    } catch {
      setAlertError("Network error loading agent details");
    } finally {
      setLoadingDetail(false);
    }
  };

  // Submit commission payout (per-patient or general) directly posting to hospital expenses & General Ledger
  const handleDiscretionaryPayoutSubmit = async () => {
    if (!agentDetailData?.agent.id || !discretionaryPayoutAmount || Number(discretionaryPayoutAmount) <= 0) {
      setPayoutToast({ message: "অনুগ্রহ করে বৈধ কমিশন টাকার পরিমাণ লিখুন", type: "error" });
      return;
    }
    setDiscretionaryPayoutLoading(true);
    setPayoutToast(null);
    try {
      const selectedPatient = agentDetailData.patientServicesSummary?.find(
        (p) => p.patientId === payoutSelectedPatientId
      );
      const res = await recordReferralCommissionPayoutAction({
        agentId: agentDetailData.agent.id,
        amount: Number(discretionaryPayoutAmount),
        paymentMethod: discretionaryPaymentMethod,
        patientId: payoutSelectedPatientId || undefined,
        patientTotalBill: selectedPatient?.totalBilled,
        commissionRatePercent: selectedPatient?.commissionRatePercent,
        transactionReference: discretionaryPaymentRef.trim() || undefined,
        notes: discretionaryPaymentNotes.trim() || undefined,
      });
      if (res.success) {
        setPayoutToast({ message: "কমিশন সফলভাবে পরিশোধ, হাসপাতাল খরচে বুকিং ও লেজারে লিপিবদ্ধ হয়েছে!", type: "success" });
        setShowDiscretionaryPayoutModal(false);
        setPayoutSelectedPatientId("");
        setDiscretionaryPayoutAmount("");
        setDiscretionaryPaymentRef("");
        setDiscretionaryPaymentNotes("");
        await handleOpenAgentDetail(agentDetailData.agent.id);
        await refreshAll();
      } else {
        setPayoutToast({ message: res.error || "কমিশন প্রদান ব্যর্থ হয়েছে", type: "error" });
      }
    } catch {
      setPayoutToast({ message: "নেটওয়ার্ক ত্রুটি ঘটেছে", type: "error" });
    } finally {
      setDiscretionaryPayoutLoading(false);
    }
  };

  // Open Settle Modal for an agent
  const _handleOpenSettleModal = async (agent: ReferralAgent) => {
    setSettleForm({
      agentId: agent.id,
      selectedCommissionIds: [],
      paymentMethod: "BANK_TRANSFER",
      transactionRef: "",
      notes: "",
    });
    setLoadingPendingComms(true);
    setShowSettleModal(true);

    try {
      const res = await getReferralCommissionsAction({
        agentId: agent.id,
        settlementStatus: "PENDING",
        limit: 100,
      });
      if (res.success && res.data) {
        // Enforce Authoritative Rule: Only APPROVED commissions can be settled
        const approvedPending = res.data.filter(
          (c) => c.approval_status === "APPROVED" && c.settlement_status === "PENDING"
        );
        setPendingCommissionsForAgent(approvedPending);
        // Pre-select all approved
        setSettleForm((prev) => ({
          ...prev,
          selectedCommissionIds: approvedPending.map((c) => c.id),
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPendingComms(false);
    }
  };

  // Open Adjust Rate Modal
  const _handleOpenRateModal = (agent: ReferralAgent) => {
    setRateForm({
      agentId: agent.id,
      currentRate: Number(agent.commission_rate_percent || 10),
      newRate: Number(agent.commission_rate_percent || 10),
      reason: "",
    });
    setShowRateModal(true);
  };

  // Submit Add Agent
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAlertError(null);

    const res = await createReferralAgentAction({
      full_name: addForm.fullName,
      agent_type: addForm.agentType,
      phone: addForm.phone,
      email: addForm.email || undefined,
      address: addForm.address || undefined,
      professional_registration_no: addForm.licenseNo || undefined,
      commission_rate_percent: Number(addForm.commissionRate),
      is_commission_eligible: addForm.isEligible,
      bmdc_ethics_acknowledged: addForm.bmdcEthicsAcknowledged,
      compliance_notes: addForm.complianceNotes || undefined,
      notes: addForm.notes || undefined,
    });

    setSubmitting(false);
    if (res.success) {
      setAlertSuccess(`Referral Agent ${res.data?.agent_code || ""} registered successfully.`);
      setShowAddModal(false);
      setAddForm({
        fullName: "",
        agentType: "COMMUNITY_PC",
        phone: "",
        email: "",
        address: "",
        licenseNo: "",
        commissionRate: 10,
        isEligible: true,
        bmdcEthicsAcknowledged: false,
        complianceNotes: "",
        notes: "",
      });
      await refreshAll();
    } else {
      setAlertError(res.error || "Failed to create referral agent.");
    }
  };

  // Submit Rate Adjustment
  const handleUpdateRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAlertError(null);

    const res = await updateReferralAgentRateAction({
      agentId: rateForm.agentId,
      newRatePercent: Number(rateForm.newRate),
      reason: rateForm.reason || "Management rate review",
    });

    setSubmitting(false);
    if (res.success) {
      setAlertSuccess("Commission rate updated successfully. Future invoices will reflect this new rate.");
      setShowRateModal(false);
      await refreshAll();
    } else {
      setAlertError(res.error || "Failed to update commission rate.");
    }
  };

  // Submit Settlement Payout
  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (settleForm.selectedCommissionIds.length === 0) {
      setAlertError("Please select at least one commission row to settle.");
      return;
    }
    setSubmitting(true);
    setAlertError(null);

    const res = await settleReferralCommissionsAction({
      agentId: settleForm.agentId,
      commissionIds: settleForm.selectedCommissionIds,
      paymentMethod: settleForm.paymentMethod,
      transactionReference: settleForm.transactionRef,
      notes: settleForm.notes,
    });

    setSubmitting(false);
    if (res.success) {
      setAlertSuccess(
        `Settlement ${res.settlementNumber || ""} executed successfully. Total ${formatCurrencyBDT(res.netPaidAmount || 0)} disbursed.`
      );
      setShowSettleModal(false);
      await refreshAll();
    } else {
      setAlertError(res.error || "Failed to disburse settlement.");
    }
  };

  // Deactivate / Archive Agent
  const handleDeactivate = (agent: ReferralAgent) => {
    setAgentToArchive(agent);
  };

  // Open Edit Partner Modal
  const handleOpenEditPartner = (agent: ReferralAgent) => {
    setPartnerToEdit(agent);
    setEditForm({
      fullName: agent.full_name,
      agentType: agent.agent_type,
      phone: agent.phone,
      email: agent.email || "",
      address: agent.address || "",
      licenseNo: agent.professional_registration_no || "",
      commissionRate: agent.commission_rate_percent || 10,
      isEligible: agent.is_commission_eligible !== false,
      notes: agent.notes || "",
    });
  };

  // Save Edit Partner Form
  const handleSaveEditPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerToEdit) return;
    if (!editForm.fullName.trim() || !editForm.phone.trim()) {
      setAlertError("Full Name and Phone Number are required.");
      return;
    }
    setSavingEdit(true);
    setAlertError(null);
    try {
      const res = await updateReferralAgentAction({
        agentId: partnerToEdit.id,
        fullName: editForm.fullName.trim(),
        agentType: editForm.agentType,
        phone: editForm.phone.trim(),
        email: editForm.email.trim() || undefined,
        address: editForm.address.trim() || undefined,
        professionalRegistrationNo: editForm.licenseNo.trim() || undefined,
        commissionRatePercent: Number(editForm.commissionRate),
        isCommissionEligible: editForm.isEligible,
        notes: editForm.notes.trim() || undefined,
      });

      if (res.success) {
        setAlertSuccess(`পার্টনার ${partnerToEdit.agent_code} এর তথ্য সফলভাবে আপডেট করা হয়েছে।`);
        setPartnerToEdit(null);
        await refreshAll();
        if (selectedAgentId === partnerToEdit.id) {
          await handleOpenAgentDetail(partnerToEdit.id);
        }
      } else {
        setAlertError(res.error || "Failed to update partner profile.");
      }
    } catch {
      setAlertError("Network error updating partner profile.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Filtered Agents
  const filteredAgents = agents.filter((a) => {
    const matchesSearch =
      a.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.agent_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.phone.includes(searchQuery);
    const matchesStatus = statusFilter === "ALL" ? true : statusFilter === "ACTIVE" ? a.is_active : !a.is_active;
    const matchesType = typeFilter === "ALL" ? true : a.agent_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const dynamicSettledTotal = (metrics?.totalCommissionSettled && metrics.totalCommissionSettled > 0)
    ? metrics.totalCommissionSettled
    : Math.max(
        settlements.reduce((sum, s) => sum + Number(s.net_paid_amount || 0), 0),
        agents.reduce((sum, a) => sum + Number(a.total_commission_settled || 0), 0)
      );

  const canCreate = isSuperAdmin || userPermissions.includes("referral.create") || userPermissions.includes("referral.manage");
  const canEdit = isSuperAdmin || userPermissions.includes("referral.edit") || userPermissions.includes("referral.manage");
  const canDelete = isSuperAdmin || userPermissions.includes("referral.delete") || userPermissions.includes("referral.manage");
  const canSettle = isSuperAdmin || userPermissions.includes("referral.commission.pay") || userPermissions.includes("referral.manage");

  if (accessDenied) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-8 sm:p-12 text-center max-w-xl mx-auto my-12 shadow-sm space-y-4">
        <div className="w-16 h-16 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">সংরক্ষিত মডিউল (Access Restricted)</h2>
        <p className="text-sm text-slate-600">
          আপনার ব্যবহারকারী অ্যাকাউন্টে <strong>রেফারেল পার্টনার ও কমিশন (Referral & Commission)</strong> দেখার অনুমতি নেই।
        </p>
        <div className="text-xs text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-left space-y-1">
          <p className="font-semibold text-slate-700">🔒 নিরাপত্তা নীতি:</p>
          <p>
            কেবল <strong>Super Admin</strong> সেটিংস (Settings &rarr; RBAC Matrix) থেকে আপনার রোলকে <code>referral.view</code> অথবা <code>referral.manage</code> অনুমতি দিলে এই মডিউলটি ব্যবহারের এক্সেস পাওয়া যাবে।
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/app/dashboard"
            className="inline-flex items-center text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 px-5 py-2.5 rounded-xl transition cursor-pointer"
          >
            ড্যাশবোর্ডে ফিরে যান
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Alert Banners */}
      {alertError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex justify-between items-center shadow-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{alertError}</span>
          </div>
          <button onClick={() => setAlertError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {alertSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex justify-between items-center shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{alertSuccess}</span>
          </div>
          <button onClick={() => setAlertSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-sky-600 uppercase tracking-wider bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-100">
              Enterprise Referral & Affiliate Engine
            </span>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              Double-Entry GL Enforced
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1.5 flex items-center gap-2">
            <Users className="w-6 h-6 text-sky-600" />
            Referral & Affiliate Commission Management
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Authoritative tracking of referring doctors, community agents, discount-aware net invoice commissions (1%–40%), immutable financial snapshots, and balanced treasury payouts.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Register Referral Partner
          </button>
        )}
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active Partners</span>
            <UserCheck className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-xl font-black text-slate-900">
            {metrics?.activeAgents ?? agents.filter((a) => a.is_active).length}
          </div>
          <span className="text-[10px] text-slate-400">Total: {agents.length} registered</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Referred Cases</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl font-black text-slate-900">
            {metrics?.totalReferredPatients ?? 0}
          </div>
          <span className="text-[10px] text-slate-400">Admissions & encounters</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Patient Bill</span>
            <Receipt className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black text-emerald-600">
            {formatCurrencyBDT(metrics?.totalBilledBase ?? 0)}
          </div>
          <span className="text-[10px] text-slate-400">রেফারেল রোগীদের মোট সেবা বিল</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Settled Commission Paid</span>
            <CheckCircle2 className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-xl font-black text-teal-600">
            {formatCurrencyBDT(dynamicSettledTotal)}
          </div>
          <span className="text-[10px] text-slate-400">কর্তৃপক্ষ কর্তৃক পরিশোধিত</span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 space-x-2">
        <button
          onClick={() => setActiveTab("AGENTS")}
          className={`py-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === "AGENTS"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="w-4 h-4" />
          Referral Partners Directory ({agents.length})
        </button>
        <button
          onClick={() => setActiveTab("COMMISSIONS")}
          className={`py-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === "COMMISSIONS"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Receipt className="w-4 h-4" />
          রেফারেল রোগীদের সেবা ও বিল হিস্ট্রি ({commissions.length})
        </button>
        <button
          onClick={() => setActiveTab("SETTLEMENTS")}
          className={`py-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === "SETTLEMENTS"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Settlements & Payouts ({settlements.length})
        </button>
        <button
          onClick={() => setActiveTab("PERFORMANCE")}
          className={`py-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === "PERFORMANCE"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Performance & Analytics
        </button>
      </div>

      {/* TAB 1: AGENTS DIRECTORY */}
      {activeTab === "AGENTS" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 justify-between items-center bg-slate-50/50">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by code, name, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 outline-hidden"
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-hidden"
              >
                <option value="ALL">All Types</option>
                <option value="DOCTOR">Doctor</option>
                <option value="COMMUNITY_PC">Community PC</option>
                <option value="ORGANIZATION">Organization</option>
                <option value="STAFF">Staff</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-hidden"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Archived</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3.5">Referral ID</th>
                  <th className="p-3.5">Partner Profile</th>
                  <th className="p-3.5">Type & Contact</th>
                  <th className="p-3.5 text-center">Referred Cases</th>
                  <th className="p-3.5 text-right">Total Patient Bills (৳)</th>
                  <th className="p-3.5 text-right">Settled Payout (৳)</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400">
                      Loading referral partner directory...
                    </td>
                  </tr>
                ) : filteredAgents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400">
                      No referral partners match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredAgents.map((agent) => {
                    const agentComms = commissions.filter((c) => c.referral_agent_id === agent.id);
                    const totalAgentBill = agentComms.reduce(
                      (acc, c) => acc + Number(c.billing_subtotal || c.commission_base_amount || 0),
                      0
                    );
                    const agentPatients = new Set(agentComms.map((c) => c.patient_id)).size;

                    return (
                      <tr key={agent.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3.5 font-mono font-bold text-sky-700">
                          {agent.agent_code}
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-slate-900">{agent.full_name}</div>
                          {agent.professional_registration_no && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              Reg: {agent.professional_registration_no}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            {agent.agent_type === "DOCTOR" ? (
                              <Stethoscope className="w-3.5 h-3.5 text-blue-500" />
                            ) : agent.agent_type === "ORGANIZATION" ? (
                              <Building className="w-3.5 h-3.5 text-purple-500" />
                            ) : (
                              <Briefcase className="w-3.5 h-3.5 text-amber-500" />
                            )}
                            <span className="font-medium text-slate-700">{agent.agent_type}</span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">{agent.phone}</span>
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-800">
                          {agentPatients} জন
                        </td>
                        <td className="p-3.5 text-right font-black text-slate-900">
                          {formatCurrencyBDT(totalAgentBill)}
                        </td>
                        <td className="p-3.5 text-right font-black text-teal-700">
                          {formatCurrencyBDT(
                            Math.max(
                              Number(agent.total_commission_settled || 0),
                              settlements
                                .filter((s) => s.referral_agent_id === agent.id)
                                .reduce((sum, s) => sum + Number(s.net_paid_amount || 0), 0)
                            )
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          {agent.is_active ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              Archived
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => handleOpenAgentDetail(agent.id)}
                            className="px-2.5 py-1 text-[11px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition border border-sky-200"
                            title="রোগীর সেবা হিস্ট্রি ও প্রোফাইল"
                          >
                            প্রোফাইল
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEditPartner(agent)}
                              className="px-2.5 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition border border-amber-200 cursor-pointer"
                              title="পার্টনার প্রোফাইল সংশোধন করুন"
                            >
                              এডিট
                            </button>
                          )}
                          {canSettle && (
                            <button
                              onClick={() => {
                                handleOpenAgentDetail(agent.id);
                                setShowDiscretionaryPayoutModal(true);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition border border-emerald-200 cursor-pointer"
                              title="কর্তৃপক্ষ কমিশন প্রদান"
                            >
                              কমিশন প্রদান
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDeactivate(agent)}
                              className="px-2 py-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md transition border border-rose-200 cursor-pointer"
                              title="পার্টনার মুছে ফেলুন বা নিষ্ক্রিয় করুন"
                            >
                              মুছে ফেলুন
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PATIENT SERVICE & BILL HISTORY */}
      {activeTab === "COMMISSIONS" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="font-bold text-slate-800 text-xs">রেফারেল রোগীদের সেবা ও বিল হিস্ট্রি</h3>
              <p className="text-[11px] text-slate-500">
                কোন রেফারেল পার্টনারের মাধ্যমে কোন রোগী কত টাকার সেবা নিয়েছেন তার সম্পূর্ণ তালিকা।
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-600">
              {commissions.length} টি রেকর্ড
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3">তারিখ</th>
                  <th className="p-3">পার্টনার কোড ও নাম</th>
                  <th className="p-3">রোগীর নাম ও বিবরণ</th>
                  <th className="p-3">ইনভয়েস #</th>
                  <th className="p-3 text-right">মোট সেবা মূল্য (৳)</th>
                  <th className="p-3 text-right">প্রদেয় কমিশন (৳)</th>
                  <th className="p-3 text-right">পরিশোধিত (৳)</th>
                  <th className="p-3 text-center">কমিশন স্ট্যাটাস</th>
                  <th className="p-3 text-center">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {commissions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400">
                      কোনো রেফারেল রোগীর বিলিং রেকর্ড এখনো তৈরি হয়নি।
                    </td>
                  </tr>
                ) : (
                  commissions.map((comm) => (
                    <tr key={comm.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono text-[11px] text-slate-500">
                        {formatDateBDT(comm.created_at)}
                      </td>
                      <td className="p-3">
                        <span className="font-mono font-bold text-sky-700 mr-1.5">
                          {comm.referral_code_snapshot}
                        </span>
                        <span className="text-slate-800 font-medium">{comm.referral_name_snapshot}</span>
                      </td>
                      <td className="p-3 text-slate-700">
                        <div className="font-bold text-slate-900">
                          {comm.patients?.full_name || "Encounter Patient"}
                        </div>
                        {comm.patients?.patient_code && (
                          <div className="text-[10px] font-mono text-slate-400">
                            {comm.patients.patient_code}
                          </div>
                        )}
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-900">
                        {comm.invoices?.invoice_number || "INV-POSTED"}
                      </td>
                      <td className="p-3 text-right font-black text-slate-900">
                        {formatCurrencyBDT(comm.billing_subtotal || comm.commission_base_amount)}
                      </td>
                      <td className="p-3 text-right font-bold text-indigo-700">
                        {formatCurrencyBDT(comm.commission_amount)}
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-700">
                        {formatCurrencyBDT(comm.amount_paid || 0)}
                      </td>
                      <td className="p-3 text-center">
                        {comm.settlement_status === "PAID" && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            পরিশোধিত
                          </span>
                        )}
                        {comm.settlement_status === "PARTIAL" && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            আংশিক
                          </span>
                        )}
                        {(!comm.settlement_status || comm.settlement_status === "PENDING") && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                            বকেয়া
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => {
                            const foundAgent = agents.find((a) => a.id === comm.referral_agent_id);
                            if (foundAgent) {
                              handleOpenAgentDetail(foundAgent.id);
                            }
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition border border-emerald-200"
                        >
                          বোনাস / প্রোফাইল
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SETTLEMENTS & PAYOUTS */}
      {activeTab === "SETTLEMENTS" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="font-bold text-slate-800 text-xs">Treasury Settlement Disbursements</h3>
              <p className="text-[11px] text-slate-500">
                Documented payouts with double-entry General Ledger balancing.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-600">
              {settlements.length} Settlements
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-3.5">Settlement #</th>
                  <th className="p-3.5">তারিখ</th>
                  <th className="p-3.5">Referral Partner</th>
                  <th className="p-3.5">রোগী / খাত</th>
                  <th className="p-3.5 text-right">রোগীর বিল (৳)</th>
                  <th className="p-3.5">পেমেন্ট মাধ্যম</th>
                  <th className="p-3.5">রেফারেন্স / Txn ID</th>
                  <th className="p-3.5 text-right">পরিশোধিত কমিশন (৳)</th>
                  <th className="p-3.5 text-center">স্ট্যাটাস</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400">
                      No payout settlements processed yet.
                    </td>
                  </tr>
                ) : (
                  settlements.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 font-mono font-bold text-sky-700">
                        {st.settlement_number}
                      </td>
                      <td className="p-3.5 text-slate-600 font-mono text-[11px]">
                        {formatDateBDT(st.settlement_date || st.created_at)}
                      </td>
                      <td className="p-3.5">
                        <span className="font-mono font-semibold text-slate-800 mr-1.5">
                          {st.referral_agents?.agent_code}
                        </span>
                        <span className="text-slate-600">{st.referral_agents?.full_name}</span>
                      </td>
                      <td className="p-3.5">
                        {st.patient_name ? (
                          <div>
                            <span className="font-bold text-slate-800">{st.patient_name}</span>
                            {st.patient_code && <span className="ml-1 text-[10px] font-mono text-slate-400">({st.patient_code})</span>}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">সাধারণ পার্টনার কমিশন</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right font-semibold text-slate-800">
                        {st.patient_total_bill ? formatCurrencyBDT(st.patient_total_bill) : "—"}
                      </td>
                      <td className="p-3.5">
                        <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {st.payment_method}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-500">
                        {st.transaction_reference || "N/A"}
                      </td>
                      <td className="p-3.5 text-right font-black text-emerald-700">
                        {formatCurrencyBDT(st.net_paid_amount)}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {st.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PERFORMANCE & ANALYTICS */}
      {activeTab === "PERFORMANCE" && (
        <div className="space-y-6">
          {/* Performance Filter & Toolbar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row gap-3 justify-between items-center">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold">
                <Calendar className="w-4 h-4 text-sky-600" />
                <span>Time Period:</span>
              </div>
              <select
                value={perfDateRange}
                onChange={(e) => setPerfDateRange(e.target.value as "THIS_MONTH" | "LAST_MONTH" | "THIS_YEAR" | "LAST_YEAR" | "ALL" | "CUSTOM")}
                className="text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-hidden font-medium"
              >
                <option value="THIS_MONTH">This Month</option>
                <option value="LAST_MONTH">Last Month</option>
                <option value="THIS_YEAR">This Calendar Year</option>
                <option value="LAST_YEAR">Previous Year</option>
                <option value="ALL">All Available History</option>
                <option value="CUSTOM">Custom Date Range</option>
              </select>

              {perfDateRange === "CUSTOM" && (
                <div className="flex items-center gap-2 bg-slate-100/80 px-2 py-1 rounded-lg border border-slate-200">
                  <span className="text-[11px] text-slate-500 font-medium">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="text-xs px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 outline-hidden"
                  />
                  <span className="text-[11px] text-slate-500 font-medium">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="text-xs px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => loadPerformanceData()}
                    disabled={!customStartDate || !customEndDate || customStartDate > customEndDate}
                    className="text-xs px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded font-medium disabled:opacity-50 transition"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStartDate("");
                      setCustomEndDate("");
                      setPerfDateRange("THIS_MONTH");
                    }}
                    className="text-xs px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-medium transition"
                  >
                    Reset
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold ml-2">
                <Users className="w-4 h-4 text-sky-600" />
                <span>Partner:</span>
              </div>
              <select
                value={selectedPerfAgentId}
                onChange={(e) => setSelectedPerfAgentId(e.target.value)}
                className="text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-hidden font-medium max-w-[200px]"
              >
                <option value="ALL">All Partners</option>
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.agent_code} — {ag.full_name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => loadPerformanceData()}
              disabled={loadingPerformance}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPerformance ? "animate-spin" : ""}`} />
              <span>Refresh Analytics</span>
            </button>
          </div>

          {loadingPerformance ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-600" />
              Loading server-side aggregated performance analytics...
            </div>
          ) : !performanceData ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-400 text-xs">
              No analytics data retrieved for selected window.
            </div>
          ) : (
            <>
              {/* Aggregate KPI Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Referred Patients
                  </span>
                  <div className="text-2xl font-black text-slate-900">
                    {performanceData.summary?.total_referred_patients ?? 0}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    OPD: {performanceData.summary?.opd_referrals ?? 0} • IPD: {performanceData.summary?.ipd_referrals ?? 0} • CCU: {performanceData.summary?.critical_care_referrals ?? 0}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Net Hospital Revenue
                  </span>
                  <div className="text-2xl font-black text-emerald-600">
                    {formatCurrencyBDT(performanceData.summary?.net_revenue ?? 0)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Gross: {formatCurrencyBDT(performanceData.summary?.gross_revenue ?? 0)} (Discount: {formatCurrencyBDT(performanceData.summary?.total_discount ?? 0)})
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Commission Accrued
                  </span>
                  <div className="text-2xl font-black text-amber-600">
                    {formatCurrencyBDT(performanceData.summary?.commission_earned ?? 0)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Approved: {formatCurrencyBDT(performanceData.summary?.commission_approved ?? 0)}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Commission Disbursed
                  </span>
                  <div className="text-2xl font-black text-teal-600">
                    {formatCurrencyBDT(performanceData.summary?.commission_paid ?? 0)}
                  </div>
                  <div className="text-[10px] text-rose-500 font-semibold mt-1">
                    Outstanding: {formatCurrencyBDT(performanceData.summary?.commission_outstanding ?? 0)}
                  </div>
                </div>
              </div>

              {/* Monthly Breakdown Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-sky-600" />
                    Monthly Financial Trajectory
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {performanceData.monthly?.length || 0} Months in Scope
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="p-3.5">Month</th>
                        <th className="p-3.5 text-center">Referred Patients</th>
                        <th className="p-3.5 text-right">Gross Billing</th>
                        <th className="p-3.5 text-right">Admission Discount</th>
                        <th className="p-3.5 text-right">Net Hospital Revenue</th>
                        <th className="p-3.5 text-right">Commission Accrued</th>
                        <th className="p-3.5 text-right">Disbursed Payout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(!performanceData.monthly || performanceData.monthly.length === 0) ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">
                            No monthly referral transactions found in this period.
                          </td>
                        </tr>
                      ) : (
                        performanceData.monthly.map((m) => (
                          <tr key={m.year_month} className="hover:bg-slate-50/80 transition">
                            <td className="p-3.5 font-bold text-slate-800">{m.month_name}</td>
                            <td className="p-3.5 text-center font-bold text-sky-700">{m.referred_patients}</td>
                            <td className="p-3.5 text-right text-slate-600">{formatCurrencyBDT(m.gross_revenue)}</td>
                            <td className="p-3.5 text-right text-rose-600">-{formatCurrencyBDT(m.discount_amount)}</td>
                            <td className="p-3.5 text-right font-black text-emerald-700">{formatCurrencyBDT(m.net_revenue)}</td>
                            <td className="p-3.5 text-right font-bold text-amber-600">{formatCurrencyBDT(m.commission_earned)}</td>
                            <td className="p-3.5 text-right font-bold text-teal-600">{formatCurrencyBDT(m.commission_paid)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Yearly Comparison & Top Partners Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Yearly Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <History className="w-4 h-4 text-indigo-600" />
                      Annual Comparison
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold">
                          <th className="p-3">Year</th>
                          <th className="p-3 text-center">Patients</th>
                          <th className="p-3 text-right">Net Revenue</th>
                          <th className="p-3 text-right">Commission</th>
                          <th className="p-3 text-right">Paid</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(!performanceData.yearly || performanceData.yearly.length === 0) ? (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-slate-400">
                              No annual history recorded.
                            </td>
                          </tr>
                        ) : (
                          performanceData.yearly.map((y) => (
                            <tr key={y.year} className="hover:bg-slate-50/80 transition">
                              <td className="p-3 font-bold text-slate-800">{y.year}</td>
                              <td className="p-3 text-center font-bold text-sky-700">{y.referred_patients}</td>
                              <td className="p-3 text-right font-black text-emerald-700">{formatCurrencyBDT(y.net_revenue)}</td>
                              <td className="p-3 text-right font-bold text-amber-600">{formatCurrencyBDT(y.commission_earned)}</td>
                              <td className="p-3 text-right font-bold text-teal-600">{formatCurrencyBDT(y.commission_paid)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top Performing Partners */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Award className="w-4 h-4 text-amber-500" />
                      Top Performing Referral Partners
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold">
                          <th className="p-3">Partner</th>
                          <th className="p-3">Type / Ethics</th>
                          <th className="p-3 text-center">Cases</th>
                          <th className="p-3 text-right">Net Revenue</th>
                          <th className="p-3 text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(!performanceData.top_agents || performanceData.top_agents.length === 0) ? (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-slate-400">
                              No top performers in selected window.
                            </td>
                          </tr>
                        ) : (
                          performanceData.top_agents.slice(0, 8).map((top) => (
                            <tr key={top.agent_id} className="hover:bg-slate-50/80 transition">
                              <td className="p-3">
                                <div className="font-mono font-bold text-sky-700 text-[11px]">{top.agent_code}</div>
                                <div className="font-semibold text-slate-800 truncate max-w-[140px]">{top.full_name}</div>
                              </td>
                              <td className="p-3">
                                <div className="text-[11px] font-bold text-slate-600">{top.agent_type}</div>
                                {top.agent_type === "DOCTOR" && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                    top.bmdc_ethics_acknowledged
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-amber-50 text-amber-700 border border-amber-200"
                                  }`}>
                                    {top.bmdc_ethics_acknowledged ? "BMDC Compliant" : "BMDC Pending"}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center font-bold text-slate-700">{top.patient_count}</td>
                              <td className="p-3 text-right font-black text-emerald-700">{formatCurrencyBDT(top.net_revenue)}</td>
                              <td className="p-3 text-right font-bold text-amber-600">{formatCurrencyBDT(top.commission_earned)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* MODAL 1: REGISTER REFERRAL AGENT */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Register Referral Partner</h3>
                <p className="text-[11px] text-slate-500">
                  Unique Profile ID and sequence-backed code (REF-XXXXX) will be generated automatically.
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAgent} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Mahinur Rahman"
                    value={addForm.fullName}
                    onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Partner Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={addForm.agentType}
                    onChange={(e) =>
                      setAddForm({
                        ...addForm,
                        agentType: e.target.value as "DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF",
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden bg-white"
                  >
                    <option value="COMMUNITY_PC">Community PC Agent</option>
                    <option value="DOCTOR">Referring Doctor</option>
                    <option value="ORGANIZATION">Corporate / Organization</option>
                    <option value="STAFF">Hospital Staff</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="01712000000"
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="partner@example.com"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                  />
                </div>
              </div>

              {addForm.agentType === "DOCTOR" && (
                <>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      BM&DC Registration No.
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. A-12345"
                      value={addForm.licenseNo}
                      onChange={(e) => setAddForm({ ...addForm, licenseNo: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden font-mono"
                    />
                  </div>

                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-700 shrink-0" />
                      <span className="font-bold text-xs text-indigo-900">BM&DC Medical Ethics Governance</span>
                    </div>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addForm.bmdcEthicsAcknowledged}
                        onChange={(e) => setAddForm({ ...addForm, bmdcEthicsAcknowledged: e.target.checked })}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-indigo-950 font-medium leading-relaxed">
                        Doctor confirms compliance with Bangladesh Medical & Dental Council (BM&DC) Code of Ethics regarding patient referral integrity and absence of unethical financial inducement.
                      </span>
                    </label>
                    <div>
                      <label className="text-[11px] font-semibold text-indigo-900 block mb-0.5">
                        Ethics & Compliance Notes (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Verified BMDC Registration, Hospital Affiliation"
                        value={addForm.complianceNotes}
                        onChange={(e) => setAddForm({ ...addForm, complianceNotes: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Commission Rate (%): <strong className="text-sky-600 font-bold">{addForm.commissionRate}%</strong>
                  <span className="text-slate-400 font-normal ml-2">(Allowed: 1% – 40%)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={40}
                    step={1}
                    value={addForm.commissionRate}
                    onChange={(e) => setAddForm({ ...addForm, commissionRate: Number(e.target.value) })}
                    className="flex-1 accent-sky-600"
                  />
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={addForm.commissionRate}
                    onChange={(e) => setAddForm({ ...addForm, commissionRate: Number(e.target.value) })}
                    className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-center font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Postal Address</label>
                <input
                  type="text"
                  placeholder="Address or clinic location..."
                  value={addForm.address}
                  onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addForm.isEligible}
                    onChange={(e) => setAddForm({ ...addForm, isEligible: e.target.checked })}
                    className="rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Approved for Referral Commission Program
                  </span>
                </label>
                <p className="text-[10px] text-slate-500">
                  {addForm.agentType === "DOCTOR"
                    ? "In accordance with BM&DC clinical ethics, doctor referral disbursements require hospital management compliance authorization."
                    : "Enables automatic commission accrual on patient invoices."}
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl shadow-xs"
                >
                  {submitting ? "Registering..." : "Confirm & Generate Code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADJUST COMMISSION RATE */}
      {showRateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Adjust Commission Rate</h3>
                <p className="text-[11px] text-slate-500">
                  Historical commissions remain immutable. Only future invoices will use the new rate.
                </p>
              </div>
              <button onClick={() => setShowRateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateRate} className="space-y-4 text-xs">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 flex justify-between items-center">
                <span>Current Effective Rate:</span>
                <strong className="text-sm font-black">{rateForm.currentRate}%</strong>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  New Rate (%): <strong className="text-sky-600 font-bold">{rateForm.newRate}%</strong>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={40}
                    step={1}
                    value={rateForm.newRate}
                    onChange={(e) => setRateForm({ ...rateForm, newRate: Number(e.target.value) })}
                    className="flex-1 accent-sky-600"
                  />
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={rateForm.newRate}
                    onChange={(e) => setRateForm({ ...rateForm, newRate: Number(e.target.value) })}
                    className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-center font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Reason for Adjustment <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual contractual rate adjustment"
                  value={rateForm.reason}
                  onChange={(e) => setRateForm({ ...rateForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRateModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl"
                >
                  {submitting ? "Updating..." : "Save Rate & Log Audit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: SETTLEMENT PAYOUT */}
      {showSettleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Process Treasury Payout</h3>
                <p className="text-[11px] text-slate-500">
                  Select outstanding commission entries to disburse. Automatically creates balanced General Ledger journal entries.
                </p>
              </div>
              <button onClick={() => setShowSettleModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSettleSubmit} className="space-y-4 text-xs">
              {/* Commission Selection Table */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-slate-800">
                    Outstanding Pending Invoices ({pendingCommissionsForAgent.length})
                  </span>
                  <div className="space-x-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSettleForm({
                          ...settleForm,
                          selectedCommissionIds: pendingCommissionsForAgent.map((c) => c.id),
                        })
                      }
                      className="text-[11px] text-sky-600 hover:underline font-semibold"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSettleForm({
                          ...settleForm,
                          selectedCommissionIds: [],
                        })
                      }
                      className="text-[11px] text-slate-500 hover:underline"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2 w-8"></th>
                        <th className="p-2">Invoice #</th>
                        <th className="p-2">Date</th>
                        <th className="p-2 text-right">Net Bill</th>
                        <th className="p-2 text-center">Rate</th>
                        <th className="p-2 text-right">Commission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loadingPendingComms ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-400">
                            Loading pending invoices...
                          </td>
                        </tr>
                      ) : pendingCommissionsForAgent.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-slate-400">
                            No pending commissions available for settlement.
                          </td>
                        </tr>
                      ) : (
                        pendingCommissionsForAgent.map((comm) => {
                          const isSelected = settleForm.selectedCommissionIds.includes(comm.id);
                          return (
                            <tr
                              key={comm.id}
                              onClick={() => {
                                setSettleForm((prev) => ({
                                  ...prev,
                                  selectedCommissionIds: isSelected
                                    ? prev.selectedCommissionIds.filter((id) => id !== comm.id)
                                    : [...prev.selectedCommissionIds, comm.id],
                                }));
                              }}
                              className={`cursor-pointer hover:bg-slate-50 ${
                                isSelected ? "bg-sky-50/50" : ""
                              }`}
                            >
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // handled by tr onClick
                                  className="rounded text-sky-600 focus:ring-sky-500"
                                />
                              </td>
                              <td className="p-2 font-mono font-semibold text-slate-800">
                                {comm.invoices?.invoice_number || "INV-POSTED"}
                              </td>
                              <td className="p-2 text-slate-500">{formatDateBDT(comm.created_at)}</td>
                              <td className="p-2 text-right text-slate-700">
                                {formatCurrencyBDT(comm.commission_base_amount)}
                              </td>
                              <td className="p-2 text-center font-bold text-amber-700">
                                {comm.commission_rate_percent}%
                              </td>
                              <td className="p-2 text-right font-black text-emerald-700">
                                {formatCurrencyBDT(comm.amount_pending)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Settlement Summary Box */}
              {(() => {
                const totalSelectedAmount = pendingCommissionsForAgent
                  .filter((c) => settleForm.selectedCommissionIds.includes(c.id))
                  .reduce((sum, c) => sum + Number(c.amount_pending || 0), 0);

                return (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center text-emerald-900">
                    <div>
                      <span className="font-bold text-xs">Total Selected to Disburse:</span>
                      <p className="text-[10px] text-emerald-700">
                        {settleForm.selectedCommissionIds.length} invoice(s) selected
                      </p>
                    </div>
                    <div className="text-xl font-black text-emerald-700">
                      {formatCurrencyBDT(totalSelectedAmount)}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Disbursement Method <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={settleForm.paymentMethod}
                    onChange={(e) =>
                      setSettleForm({
                        ...settleForm,
                        paymentMethod: e.target.value as
                          | "CASH"
                          | "BANK_TRANSFER"
                          | "BKASH"
                          | "NAGAD"
                          | "ROCKET"
                          | "UPAY",
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden bg-white"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer (Cash at Bank)</option>
                    <option value="CASH">Cash in Hand (Cashier Drawer)</option>
                    <option value="BKASH">bKash Commercial Merchant</option>
                    <option value="NAGAD">Nagad Corporate Payout</option>
                    <option value="ROCKET">DBBL Rocket</option>
                    <option value="UPAY">UCB Upay</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Transaction / Cheque Reference
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TR-20261007-9912 or Cheque #1029"
                    value={settleForm.transactionRef}
                    onChange={(e) => setSettleForm({ ...settleForm, transactionRef: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Disbursement Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly referral incentive payment approved by MS"
                  value={settleForm.notes}
                  onChange={(e) => setSettleForm({ ...settleForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || settleForm.selectedCommissionIds.length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-xl shadow-xs"
                >
                  {submitting ? "Processing Payout..." : "Authorize Payout & Post to GL"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER / MODAL: AGENT PROFILE LOADING STATE */}
      {selectedAgentId && loadingDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl p-6 flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-600">Loading partner financial dossier...</p>
          </div>
        </div>
      )}

      {/* DRAWER / MODAL: AGENT PROFILE & CHRONOLOGICAL HISTORY */}
      {selectedAgentId && !loadingDetail && agentDetailData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl p-6 overflow-y-auto space-y-6">
            <div className="flex justify-between items-start pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded text-xs border border-sky-100">
                    {agentDetailData.agent.agent_code}
                  </span>
                  <span className="font-semibold text-slate-500 text-xs">
                    {agentDetailData.agent.agent_type}
                  </span>
                </div>
                <h2 className="text-xl font-black text-slate-900 mt-1">
                  {agentDetailData.agent.full_name}
                </h2>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Phone: {agentDetailData.agent.phone} {agentDetailData.agent.email && `| Email: ${agentDetailData.agent.email}`}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {canEdit && (
                    <button
                      onClick={() => handleOpenEditPartner(agentDetailData.agent)}
                      className="px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg transition border border-amber-300 flex items-center gap-1 shadow-2xs cursor-pointer"
                      title="প্রোফাইল সংশোধন করুন"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      প্রোফাইল এডিট
                    </button>
                  )}
                  {canSettle && (
                    <button
                      onClick={() => setShowDiscretionaryPayoutModal(true)}
                      className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition border border-emerald-300 flex items-center gap-1 shadow-2xs cursor-pointer"
                      title="কমিশন পরিশোধ করুন"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      কমিশন প্রদান
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDeactivate(agentDetailData.agent)}
                      className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition border border-rose-300 flex items-center gap-1 shadow-2xs cursor-pointer"
                      title="পার্টনার মুছে ফেলুন বা নিষ্ক্রিয় করুন"
                    >
                      মুছে ফেলুন / Archive
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedAgentId(null);
                  setAgentDetailData(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Performance Stats & Periodic Breakdown */}
            {(() => {
              const periodic = agentDetailData.periodicBilling || {
                todayBilled: 0,
                weekBilled: 0,
                monthBilled: 0,
                yearBilled: 0,
                allTimeBilled: 0,
                referredPatientsCount: agentDetailData.attributions?.length || 0,
              };

              const todayBilled = periodic.todayBilled;
              const weekBilled = periodic.weekBilled;
              const monthBilled = periodic.monthBilled;
              const yearBilled = periodic.yearBilled;
              const allBilled = periodic.allTimeBilled;
              const referredPatientsCount = periodic.referredPatientsCount;

              const patientServices = agentDetailData.patientServicesSummary || [];

              const now = new Date();
              const dhakaOffsetMs = 6 * 60 * 60 * 1000;
              const dhakaNow = new Date(now.getTime() + dhakaOffsetMs);
              const y = dhakaNow.getUTCFullYear();
              const m = dhakaNow.getUTCMonth();
              const d = dhakaNow.getUTCDate();
              const startOfToday = new Date(Date.UTC(y, m, d) - dhakaOffsetMs).getTime();
              const startOfMonth = new Date(Date.UTC(y, m, 1) - dhakaOffsetMs).getTime();
              const startOfYear = new Date(Date.UTC(y, 0, 1) - dhakaOffsetMs).getTime();
              const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

              const filteredPatients = patientServices.filter((ps) => {
                if (agentPeriodFilter === "ALL") return true;
                const time = new Date(ps.attributedAt || (ps.invoices[0]?.createdAt ?? 0)).getTime();
                if (agentPeriodFilter === "TODAY") return time >= startOfToday;
                if (agentPeriodFilter === "WEEK") return time >= sevenDaysAgo;
                if (agentPeriodFilter === "MONTH") return time >= startOfMonth;
                if (agentPeriodFilter === "YEAR") return time >= startOfYear;
                return true;
              });

              return (
                <div className="space-y-4">
                  {/* Periodic Billing Analytics Cards (Asia/Dhaka) */}
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      রোগীর হাসপাতাল সেবার মোট বিল সামারি (Periodic Billing)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div className="p-2.5 bg-sky-50/80 rounded-xl border border-sky-200 text-center">
                        <span className="text-[10px] font-bold text-sky-700 block">আজ (Daily)</span>
                        <strong className="text-xs sm:text-sm text-sky-950 font-black">
                          {formatCurrencyBDT(todayBilled)}
                        </strong>
                      </div>
                      <div className="p-2.5 bg-blue-50/80 rounded-xl border border-blue-200 text-center">
                        <span className="text-[10px] font-bold text-blue-700 block">এই সপ্তাহ (Weekly)</span>
                        <strong className="text-xs sm:text-sm text-blue-950 font-black">
                          {formatCurrencyBDT(weekBilled)}
                        </strong>
                      </div>
                      <div className="p-2.5 bg-indigo-50/80 rounded-xl border border-indigo-200 text-center">
                        <span className="text-[10px] font-bold text-indigo-700 block">এই মাস (Monthly)</span>
                        <strong className="text-xs sm:text-sm text-indigo-950 font-black">
                          {formatCurrencyBDT(monthBilled)}
                        </strong>
                      </div>
                      <div className="p-2.5 bg-purple-50/80 rounded-xl border border-purple-200 text-center">
                        <span className="text-[10px] font-bold text-purple-700 block">এই বছর (Yearly)</span>
                        <strong className="text-xs sm:text-sm text-purple-950 font-black">
                          {formatCurrencyBDT(yearBilled)}
                        </strong>
                      </div>
                      <div className="p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-200 text-center col-span-2 sm:col-span-1">
                        <span className="text-[10px] font-bold text-emerald-700 block">সর্বমোট (All-Time)</span>
                        <strong className="text-xs sm:text-sm text-emerald-950 font-black">
                          {formatCurrencyBDT(allBilled)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* General Status Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold text-slate-500 block">রেফার করা রোগী</span>
                      <strong className="text-xs sm:text-sm text-slate-900 font-black">
                        {referredPatientsCount} জন
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold text-slate-500 block">মোট রোগীর সেবা বিল</span>
                      <strong className="text-xs sm:text-sm text-slate-900 font-black">
                        {formatCurrencyBDT(allBilled)}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold text-slate-500 block">সেবা ইনভয়েস সংখ্যা</span>
                      <strong className="text-xs sm:text-sm text-teal-700 font-black">
                        {patientServices.reduce((sum, p) => sum + p.invoicesCount, 0)} টি
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold text-slate-500 block">পার্টনার স্ট্যাটাস</span>
                      <strong className="text-xs sm:text-sm text-emerald-700 font-black">
                        {agentDetailData.agent.is_active ? "সক্রিয় পার্টনার" : "নিষ্ক্রিয়"}
                      </strong>
                    </div>
                  </div>

                  {/* Authority Discretionary Payout Button */}
                  <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div>
                      <h5 className="font-bold text-emerald-950 text-xs">কর্তৃপক্ষ কমিশন প্রদান ও খরচ বুকিং</h5>
                      <p className="text-[11px] text-emerald-800">
                        রোগীর মোট সেবা যাচাই করে এজেন্টের অনুকূলে যে কোনো কাস্টম কমিশন প্রদান করুন। এটি সরাসরি হাসপাতাল খরচ হিসেবে রেকর্ড হবে।
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDiscretionaryPayoutModal(true)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs transition shrink-0"
                    >
                      কমিশন পরিশোধ করুন
                    </button>
                  </div>

                  {/* Period Filter Buttons for Ledger */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-bold text-slate-700">হিস্ট্রি ফিল্টার:</span>
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-[11px] font-semibold">
                      {(["ALL", "TODAY", "WEEK", "MONTH", "YEAR"] as const).map((period) => (
                        <button
                          key={period}
                          type="button"
                          onClick={() => setAgentPeriodFilter(period)}
                          className={`px-2 py-1 rounded transition ${
                            agentPeriodFilter === period
                              ? "bg-white text-sky-700 shadow-xs font-bold"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {period === "ALL" && "সকল সময়"}
                          {period === "TODAY" && "আজ"}
                          {period === "WEEK" && "এই সপ্তাহ"}
                          {period === "MONTH" && "এই মাস"}
                          {period === "YEAR" && "এই বছর"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Patient Services & Billing Details Sub-ledger */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-800 text-xs flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Receipt className="w-4 h-4 text-sky-600" />
                        রেফারেল করা রোগীদের সেবার বিস্তারিত ও বিল হিসাব ({filteredPatients.length})
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">রোগী কি কি সেবা নিয়েছে এবং মোট কত টাকা বিল হয়েছে</span>
                    </h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                          <tr>
                            <th className="p-2">তারিখ</th>
                            <th className="p-2">রোগীর নাম ও কোড</th>
                            <th className="p-2">মোবাইল</th>
                            <th className="p-2">গ্রহনকৃত সেবাসমূহ</th>
                            <th className="p-2">ইনভয়েস #</th>
                            <th className="p-2 text-right">মোট সেবা বিল (৳)</th>
                            <th className="p-2 text-right">প্রদেয় কমিশন (৳)</th>
                            <th className="p-2 text-right">পরিশোধিত কমিশন (৳)</th>
                            <th className="p-2 text-right">বকেয়া কমিশন (৳)</th>
                            <th className="p-2 text-center">কমিশন স্ট্যাটাস</th>
                            <th className="p-2 text-center">অ্যাকশন</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredPatients.length === 0 ? (
                            <tr>
                              <td colSpan={11} className="p-4 text-center text-slate-400">
                                নির্বাচিত সময়ে কোনো রেফারেল রোগীর সেবা রেকর্ড পাওয়া যায়নি।
                              </td>
                            </tr>
                          ) : (
                            filteredPatients.map((ps) => (
                              <tr key={ps.patientId} className="hover:bg-slate-50/70">
                                <td className="p-2 text-slate-500 font-mono text-[11px]">
                                  {ps.attributedAt ? formatDateBDT(ps.attributedAt) : (ps.invoices[0]?.createdAt ? formatDateBDT(ps.invoices[0].createdAt) : "—")}
                                </td>
                                <td className="p-2">
                                  <div className="font-bold text-slate-800">{ps.fullName}</div>
                                  {ps.patientCode && (
                                    <div className="text-[10px] font-mono text-slate-400">{ps.patientCode}</div>
                                  )}
                                </td>
                                <td className="p-2 font-mono text-slate-600 text-[11px]">
                                  {ps.phone || "—"}
                                </td>
                                <td className="p-2">
                                  <div className="flex flex-wrap gap-1 max-w-xs">
                                    {ps.services.slice(0, 4).map((s, idx) => (
                                      <span key={idx} className="px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-700 rounded font-medium">
                                        {s.name} {s.quantity > 1 ? `(${s.quantity})` : ""}
                                      </span>
                                    ))}
                                    {ps.services.length > 4 && (
                                      <span className="text-[10px] text-slate-400 font-medium">+{ps.services.length - 4} more</span>
                                    )}
                                    {ps.services.length === 0 && (
                                      <span className="text-[10px] text-slate-400">হাসপাতাল সাধারণ সেবা</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 font-mono font-semibold text-slate-800 text-[11px]">
                                  {ps.invoices.map((i) => i.invoiceNumber).join(", ") || "INV-POSTED"}
                                </td>
                                <td className="p-2 text-right font-black text-slate-900">
                                  {formatCurrencyBDT(ps.totalBilled)}
                                </td>
                                <td className="p-2 text-right">
                                  <div className="font-bold text-indigo-700">{formatCurrencyBDT(ps.commissionEarned)}</div>
                                  <span className="text-[10px] text-slate-400 font-medium">({ps.commissionRatePercent}%)</span>
                                </td>
                                <td className="p-2 text-right font-bold text-emerald-700">
                                  {formatCurrencyBDT(ps.commissionPaid)}
                                </td>
                                <td className="p-2 text-right font-bold text-rose-600">
                                  {formatCurrencyBDT(ps.commissionDue)}
                                </td>
                                <td className="p-2 text-center">
                                  {ps.commissionStatus === "PAID" && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      পরিশোধিত (PAID)
                                    </span>
                                  )}
                                  {ps.commissionStatus === "PARTIAL" && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                      আংশিক (PARTIAL)
                                    </span>
                                  )}
                                  {ps.commissionStatus === "PENDING" && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                                      বকেয়া (PENDING)
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPayoutSelectedPatientId(ps.patientId);
                                      setDiscretionaryPayoutAmount(ps.commissionDue > 0 ? ps.commissionDue : ps.commissionEarned);
                                      setShowDiscretionaryPayoutModal(true);
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 transition shrink-0"
                                  >
                                    কমিশন পরিশোধ
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Patient Intake & Admission Attributions */}
            {agentDetailData.attributions && agentDetailData.attributions.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-bold text-slate-800 text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-teal-600" />
                    রেজিস্ট্রেশন ও ভর্তি রেফারেল তালিকা ({agentDetailData.attributions.length})
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">রোগী ভর্তি ও রেজিস্ট্রেশন সময়কাল</span>
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2">তারিখ</th>
                        <th className="p-2">রোগীর নাম</th>
                        <th className="p-2">রোগীর কোড</th>
                        <th className="p-2">মোবাইল নম্বর</th>
                        <th className="p-2">নোট / সোর্স</th>
                        <th className="p-2 text-center">স্ট্যাটাস</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {agentDetailData.attributions.map((a: ReferralAttribution) => (
                        <tr key={a.id} className="hover:bg-slate-50/70">
                          <td className="p-2 text-slate-500 font-mono text-[11px]">{formatDateBDT(a.assigned_at)}</td>
                          <td className="p-2 font-bold text-slate-800">
                            {a.patients?.full_name || a.referral_name_snapshot}
                          </td>
                          <td className="p-2 font-mono text-slate-500 text-[11px]">
                            {a.patients?.patient_code || "—"}
                          </td>
                          <td className="p-2 font-mono text-slate-600 text-[11px]">
                            {a.patients?.phone || "—"}
                          </td>
                          <td className="p-2 text-slate-600 text-[11px]">
                            {a.notes || "ইনটেক রেফারেন্স"}
                          </td>
                          <td className="p-2 text-center">
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rate Change History */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <History className="w-4 h-4 text-amber-600" />
                Audited Rate Changes ({agentDetailData.rateHistory.length})
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2 text-center">Old Rate</th>
                      <th className="p-2 text-center">New Rate</th>
                      <th className="p-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {agentDetailData.rateHistory.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-400">
                          Initial rate active. No changes recorded.
                        </td>
                      </tr>
                    ) : (
                      agentDetailData.rateHistory.map((r: ReferralRateHistory) => (
                        <tr key={r.id}>
                          <td className="p-2 text-slate-500">{formatDateBDT(r.created_at)}</td>
                          <td className="p-2 text-center font-bold text-slate-600">{r.old_rate}%</td>
                          <td className="p-2 text-center font-black text-sky-600">{r.new_rate}%</td>
                          <td className="p-2 text-slate-700">{r.reason || "Management review"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Settlements */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-teal-600" />
                Settlement Payout History ({agentDetailData.settlements.length})
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2">Settlement #</th>
                      <th className="p-2">তারিখ</th>
                      <th className="p-2">রোগী / বিবরণ</th>
                      <th className="p-2 text-right">রোগীর বিল (৳)</th>
                      <th className="p-2 text-right">পরিশোধিত কমিশন</th>
                      <th className="p-2">মাধ্যম</th>
                      <th className="p-2 text-center">স্ট্যাটাস</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {agentDetailData.settlements.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-slate-400">
                          No settlements disbursed yet.
                        </td>
                      </tr>
                    ) : (
                      agentDetailData.settlements.map((s: ReferralSettlement) => (
                        <tr key={s.id} className="hover:bg-slate-50/70">
                          <td className="p-2 font-mono font-bold text-sky-700">{s.settlement_number}</td>
                          <td className="p-2 text-slate-500 font-mono text-[11px]">{formatDateBDT(s.settlement_date || s.created_at)}</td>
                          <td className="p-2">
                            {s.patient_name ? (
                              <div>
                                <span className="font-bold text-slate-800">{s.patient_name}</span>
                                {s.patient_code && <span className="ml-1 text-[10px] font-mono text-slate-400">({s.patient_code})</span>}
                              </div>
                            ) : (
                              <span className="text-slate-600 italic">সাধারণ পার্টনার কমিশন</span>
                            )}
                          </td>
                          <td className="p-2 text-right font-semibold text-slate-800">
                            {s.patient_total_bill ? formatCurrencyBDT(s.patient_total_bill) : "—"}
                          </td>
                          <td className="p-2 text-right font-black text-emerald-700">
                            {formatCurrencyBDT(s.net_paid_amount)}
                          </td>
                          <td className="p-2 font-semibold text-slate-700 text-[11px]">{s.payment_method}</td>
                          <td className="p-2 text-center">
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {s.status || "PAID"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DISCRETIONARY COMMISSION PAYOUT & AUTO-EXPENSE POSTING */}
      {showDiscretionaryPayoutModal && agentDetailData && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm">
                কমিশন পরিশোধ ও খরচ লিপিবদ্ধকরণ
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowDiscretionaryPayoutModal(false);
                  setPayoutSelectedPatientId("");
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-900 space-y-1">
              <p className="font-bold">
                এজেন্ট: {agentDetailData.agent.full_name} ({agentDetailData.agent.agent_code})
              </p>
              <p className="text-[11px] text-sky-700">
                রোগী নির্বাচন করে নির্দিষ্ট রোগীর সেবা বিলের কমিশন পরিশোধ করুন অথবা সাধারণ কমিশন বুকিং দিন।
              </p>
            </div>

            {payoutToast && (
              <div
                className={`p-2.5 rounded-lg text-xs font-semibold ${
                  payoutToast.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {payoutToast.message}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  কমিশনের ধরণ / নির্দিষ্ট রোগী নির্বাচন
                </label>
                <select
                  value={payoutSelectedPatientId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    setPayoutSelectedPatientId(selId);
                    if (selId && agentDetailData?.patientServicesSummary) {
                      const found = agentDetailData.patientServicesSummary.find((p) => p.patientId === selId);
                      if (found) {
                        setDiscretionaryPayoutAmount(found.commissionDue > 0 ? found.commissionDue : found.commissionEarned);
                      }
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 bg-white"
                >
                  <option value="">সাধারণ পার্টনার কমিশন (কোনো নির্দিষ্ট রোগী নয়)</option>
                  {agentDetailData.patientServicesSummary?.map((p) => (
                    <option key={p.patientId} value={p.patientId}>
                      {p.fullName} ({p.patientCode || "N/A"}) — মোট বিল: ৳{p.totalBilled} (বকেয়া: ৳{p.commissionDue})
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const sel = agentDetailData.patientServicesSummary?.find((p) => p.patientId === payoutSelectedPatientId);
                if (!sel) return null;
                return (
                  <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between items-center font-bold text-emerald-950">
                      <span>নির্বাচিত রোগী: {sel.fullName} ({sel.patientCode})</span>
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-white text-emerald-800 border border-emerald-200">
                        {sel.commissionStatus}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div className="text-slate-600">রোগীর মোট সেবা বিল: <strong className="text-slate-900">{formatCurrencyBDT(sel.totalBilled)}</strong></div>
                      <div className="text-slate-600">কমিশন হার: <strong className="text-indigo-700">{sel.commissionRatePercent}%</strong></div>
                      <div className="text-slate-600">মোট প্রদেয় কমিশন: <strong className="text-indigo-700">{formatCurrencyBDT(sel.commissionEarned)}</strong></div>
                      <div className="text-slate-600">ইতোপূর্বে পরিশোধিত: <strong className="text-emerald-700">{formatCurrencyBDT(sel.commissionPaid)}</strong></div>
                      <div className="text-slate-600 col-span-2 bg-white/80 p-1.5 rounded-lg border border-emerald-100 flex justify-between">
                        <span>বর্তমান বকেয়া কমিশন:</span>
                        <strong className="text-rose-700 font-black">{formatCurrencyBDT(sel.commissionDue)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  কমিশন পরিশোধের পরিমাণ (৳) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={discretionaryPayoutAmount}
                  onChange={(e) => setDiscretionaryPayoutAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="যেমন: ১০০০"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  পেমেন্ট মাধ্যম <span className="text-rose-500">*</span>
                </label>
                <select
                  value={discretionaryPaymentMethod}
                  onChange={(e) => setDiscretionaryPaymentMethod(e.target.value as "CASH" | "BANK_TRANSFER" | "BKASH" | "NAGAD")}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 bg-white"
                >
                  <option value="CASH">ক্যাশ (নগদ)</option>
                  <option value="BANK_TRANSFER">ব্যাংক ট্রান্সফার</option>
                  <option value="BKASH">বিকাশ (bKash)</option>
                  <option value="NAGAD">নগদ (Nagad)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ট্রানজেকশন / ভাউচার রেফারেন্স (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  value={discretionaryPaymentRef}
                  onChange={(e) => setDiscretionaryPaymentRef(e.target.value)}
                  placeholder="ভাউচার বা ট্রানজেকশন আইডি"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  মন্তব্য / বিবরণ (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  value={discretionaryPaymentNotes}
                  onChange={(e) => setDiscretionaryPaymentNotes(e.target.value)}
                  placeholder="কমিশন প্রদানের কারণ বা বিবরণ"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-800"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800">
                <p className="font-semibold">স্বয়ংক্রিয় হাসপাতাল খরচ নোটিশ:</p>
                <p>
                  উক্ত অর্থ প্রদান করার সাথে সাথে এটি <strong>&apos;Marketing & Referral Commission&apos;</strong> ক্যাটাগরিতে হাসপাতাল খরচে (Hospital Expenses) এবং আর্থিক লেজারে সরাসরি যুক্ত হবে।
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDiscretionaryPayoutModal(false)}
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                বাতিল
              </button>
              <button
                type="button"
                disabled={discretionaryPayoutLoading || !discretionaryPayoutAmount || Number(discretionaryPayoutAmount) <= 0}
                onClick={handleDiscretionaryPayoutSubmit}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 transition"
              >
                {discretionaryPayoutLoading ? "প্রক্রিয়াধীন..." : "কমিশন পরিশোধ করুন"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT REFERRAL PARTNER PROFILE */}
      {partnerToEdit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-8">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    রেফারেল পার্টনার প্রোফাইল সংশোধন (Edit Partner)
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    ID: {partnerToEdit.agent_code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPartnerToEdit(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditPartner} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    পূর্ণ নাম (Full Name) *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    পার্টনার ক্যাটাগরি (Partner Type) *
                  </label>
                  <select
                    value={editForm.agentType}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        agentType: e.target.value as "DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF",
                      })
                    }
                    className="w-full px-3.5 py-2 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    <option value="COMMUNITY_PC">Community PC Agent</option>
                    <option value="DOCTOR">Doctor / Specialist</option>
                    <option value="ORGANIZATION">Organization / Clinic</option>
                    <option value="STAFF">Internal Hospital Staff</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    মোবাইল নম্বর (Phone) *
                  </label>
                  <input
                    type="tel"
                    required
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ইমেইল (Email Address)
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    BMDC / ট্রেড লাইসেন্স নং
                  </label>
                  <input
                    type="text"
                    value={editForm.licenseNo}
                    onChange={(e) => setEditForm({ ...editForm, licenseNo: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ঠিকানা / ক্লিনিক লোকেশন (Postal Address)
                  </label>
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>

                <div className="sm:col-span-2 bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-amber-950">
                    <span>কমিশন হার (Commission Rate):</span>
                    <span className="font-mono text-sm font-black text-amber-800 bg-white px-2 py-0.5 rounded-lg border border-amber-300">
                      {editForm.commissionRate}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="40"
                    value={editForm.commissionRate}
                    onChange={(e) => setEditForm({ ...editForm, commissionRate: Number(e.target.value) })}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                  <p className="text-[10px] text-amber-800">
                    * অনুমোদিত সীমা: ১% থেকে ৪০%। পরিবর্তন করলে অডিট হিস্ট্রিতে সংরক্ষিত হবে।
                  </p>
                </div>

                <div className="sm:col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit-partner-eligible"
                    checked={editForm.isEligible}
                    onChange={(e) => setEditForm({ ...editForm, isEligible: e.target.checked })}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                  <label htmlFor="edit-partner-eligible" className="text-xs font-bold text-slate-800 cursor-pointer">
                    কমিশন পাওয়ার জন্য সক্রিয় এবং অনুমোদিত (Active & Approved)
                  </label>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    নোট / মন্তব্য (Notes)
                  </label>
                  <textarea
                    rows={2}
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPartnerToEdit(null)}
                  className="px-4 py-2 font-bold text-xs text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 font-bold text-xs text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-xl transition shadow-xs flex items-center gap-1.5"
                >
                  {savingEdit ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      সংরক্ষণ হচ্ছে...
                    </>
                  ) : (
                    "পরিবর্তন সংরক্ষণ করুন"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ACCESSIBLE CONFIRM DIALOG: ARCHIVE REFERRAL PARTNER */}
      <ConfirmDialog
        isOpen={!!agentToArchive}
        title="Archive Referral Partner"
        description={
          agentToArchive
            ? `Are you sure you want to archive referral partner ${agentToArchive.full_name} (${agentToArchive.agent_code})? Historical commissions and payout ledgers remain strictly preserved.`
            : ""
        }
        confirmLabel="মুছে ফেলুন / Archive"
        cancelLabel="বাতিল"
        isDestructive={true}
        isLoading={submitting}
        onConfirm={async () => {
          if (!agentToArchive) return;
          setSubmitting(true);
          try {
            const res = await deleteReferralAgentAction(agentToArchive.id);
            if (res.success) {
              setAlertSuccess(`এজেন্ট/পার্টনার ${agentToArchive.agent_code} সফলভাবে মুছে ফেলা/আর্কাইভ করা হয়েছে।`);
              setAgentToArchive(null);
              await refreshAll();
            } else {
              setAlertError(res.error || "Failed to delete/archive partner.");
            }
          } catch {
            setAlertError("An unexpected error occurred while deleting partner.");
          } finally {
            setSubmitting(false);
          }
        }}
        onCancel={() => setAgentToArchive(null)}
      />

      {/* ACCESSIBLE CONFIRM DIALOG: APPROVE COMMISSION */}
      <ConfirmDialog
        isOpen={!!commToApprove}
        title="Authorize Referral Commission"
        description={
          commToApprove
            ? `Authorize commission of ${formatCurrencyBDT(commToApprove.commission_amount)} (${commToApprove.commission_rate_percent}%) for ${commToApprove.referral_name_snapshot} (${commToApprove.referral_code_snapshot}) on Invoice ${commToApprove.invoices?.invoice_number || ""}? Once approved, it becomes eligible for treasury settlement disbursement.`
            : ""
        }
        confirmLabel="Approve Commission"
        cancelLabel="Cancel"
        isDestructive={false}
        isLoading={submitting}
        onConfirm={async () => {
          if (!commToApprove) return;
          setSubmitting(true);
          try {
            const res = await approveCommissionAction(commToApprove.id);
            if (res.success) {
              setAlertSuccess(`Commission ${commToApprove.id.slice(0, 8)} approved successfully.`);
              setCommToApprove(null);
              await refreshAll();
            } else {
              setAlertError(res.error || "Failed to approve commission.");
            }
          } catch {
            setAlertError("An unexpected error occurred while approving commission.");
          } finally {
            setSubmitting(false);
          }
        }}
        onCancel={() => setCommToApprove(null)}
      />

      {/* ACCESSIBLE MODAL: REJECT COMMISSION */}
      {commToReject && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-sm">Reject Commission Claim</h3>
              <button
                onClick={() => setCommToReject(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4 text-xs">
              <p className="text-slate-600">
                Rejecting this commission will cancel the accrual and prevent any payout for partner{" "}
                <span className="font-bold">{commToReject.referral_name_snapshot}</span>.
              </p>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Rejection Reason *
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter supervisory reason for rejection..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCommToReject(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || rejectReason.trim().length < 3}
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      const res = await rejectCommissionAction(commToReject.id, rejectReason.trim());
                      if (res.success) {
                        setAlertSuccess("Commission rejected.");
                        setCommToReject(null);
                        setRejectReason("");
                        await refreshAll();
                      } else {
                        setAlertError(res.error || "Failed to reject commission.");
                      }
                    } catch {
                      setAlertError("An unexpected error occurred while rejecting commission.");
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="px-4 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg transition"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
