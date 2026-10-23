"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Trash2,
  Printer,
  Ban,
  Search,
  Loader2,
  RefreshCw,
  Wallet,
  X,
  AlertTriangle,
  UserCheck,
  Check,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  Edit3,
  ChevronLeft,
  ChevronRight,
  Bed,
  History,
  UserPlus,
  ChevronDown,
} from "lucide-react";
import {
  InvoiceRecord,
  InvoiceItemRecord,
  PaymentRecord,
  CashRegisterSummary,
} from "@/types/billing";
import {
  getInvoicesAction,
  createInvoiceAction,
  collectPaymentAction,
  voidInvoiceAction,
  deleteInvoiceAction,
  getCashierAuthorizationStatusAction,
  toggleCashierEditAuthorizationAction,
  getCashRegisterSummaryAction,
  getEpisodeBillingPreviewAction,
  getHospitalServiceTariffsAction,
  HospitalServiceTariffRecord,
} from "@/lib/billing/actions";
import { getCurrentUserSession } from "@/lib/auth/session";
import { EditInvoiceModal } from "@/components/billing/EditInvoiceModal";
import { InvoiceEditHistoryModal } from "@/components/billing/InvoiceEditHistoryModal";
import { searchPatientsAction, updatePatientAction } from "@/lib/patient/actions";
import { getDoctorsAction } from "@/lib/appointments/actions";
import { DoctorRecord } from "@/types/appointments";
import { HalfLetterInvoicePrint } from "@/components/print/HalfLetterInvoicePrint";
import {
  getPatientReferralAttributionAction,
  searchReferralAgentsForBillingAction,
  createReferralAgentAction,
} from "@/lib/referrals/actions";
import { PatientMaster } from "@/types/clinical";
import {
  formatCurrencyBDT,
  formatDateBDT,
  formatTimeBDT,
  formatPatientAgeDisplay,
  calculateDetailedAgeFromDOB,
  calculateDOBFromYMD,
} from "@/lib/utils";
import { PediatricAgeInputGroup } from "@/components/patient/PediatricAgeInputGroup";
import { Toast } from "@/components/ui/Toast";
import { EpisodeBillingPanel } from "@/components/patient/EpisodeBillingPanel";
import {
  getAllHospitalServices,
  MASTER_HOSPITAL_SERVICES,
  HospitalServiceItem,
  ServiceCategory,
  toDbInvoiceCategory,
} from "@/lib/billing/serviceCatalog";
import { getDiagnosticTestsCatalogAction } from "@/lib/lab/actions";
import { printBillingInvoiceReceipt, BillingReceiptData } from "@/lib/hardware/escpos";

function BillingManagementContent() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [registerSummary, setRegisterSummary] = useState<CashRegisterSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Void Modal State
  const [voidModalInv, setVoidModalInv] = useState<InvoiceRecord | null>(null);
  const [voidReasonInput, setVoidReasonInput] = useState("");
  const [voidLoading, setVoidLoading] = useState(false);

  // Edit & Delete Modal States
  const [editModalInv, setEditModalInv] = useState<InvoiceRecord | null>(null);
  const [historyModalInv, setHistoryModalInv] = useState<InvoiceRecord | null>(null);
  const [deleteModalInv, setDeleteModalInv] = useState<InvoiceRecord | null>(null);
  const [deleteReasonInput, setDeleteReasonInput] = useState("");
  const [deletePermanentPurge, setDeletePermanentPurge] = useState<boolean>(true);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // User Roles & Cashier Authorization
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [cashierCanEditBills, setCashierCanEditBills] = useState<boolean>(false);
  const [togglingCashierAuth, setTogglingCashierAuth] = useState(false);

  // New Invoice Modal
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [patientIdInput, setPatientIdInput] = useState("");
  const [items, setItems] = useState<Array<{
    category: InvoiceItemRecord["service_category"];
    itemName: string;
    unitPrice: number;
    quantity: number;
    referenceId?: string;
  }>>([]);
  const [billingEncounterType, setBillingEncounterType] = useState<"OPD" | "IPD">("OPD");
  const [loadingUnbilledServices, setLoadingUnbilledServices] = useState(false);
  const [unbilledServicesCount, setUnbilledServicesCount] = useState(0);
  const [unbilledServicesTotal, setUnbilledServicesTotal] = useState(0);
  const [_detectedUnbilledLines, setDetectedUnbilledLines] = useState<Array<{
    referenceId?: string;
    category: InvoiceItemRecord["service_category"];
    itemName: string;
    unitPrice: number;
    quantity: number;
  }>>([]);
  const [discountMode, setDiscountMode] = useState<"PERCENT" | "FIXED">("FIXED");
  const [discountPercent, setDiscountPercent] = useState<number | "">("");
  const [discountFixed, setDiscountFixed] = useState<number | "">("");
  const [discountReason, setDiscountReason] = useState("");
  const [initialPaymentAmount, setInitialPaymentAmount] = useState(0);
  const [initialPaymentMode, setInitialPaymentMode] = useState<"DUE" | "FULL" | "CUSTOM">("FULL");
  const [paymentMethod, setPaymentMethod] = useState<PaymentRecord["payment_method"]>("CASH");
  const [formLoading, setFormLoading] = useState(false);

  // Quick Service Adder & Dynamic Tests State
  const [allServices, setAllServices] = useState<HospitalServiceItem[]>(MASTER_HOSPITAL_SERVICES);
  const [serviceFilterGroup, setServiceFilterGroup] = useState<string>("ALL");
  const [serviceSearchTerm, setServiceSearchTerm] = useState<string>("");

  // Category Tabs Horizontal Scroll State & Ref
  const categoryTabsRef = React.useRef<HTMLDivElement>(null);
  const [canScrollCategoryLeft, setCanScrollCategoryLeft] = useState(false);
  const [canScrollCategoryRight, setCanScrollCategoryRight] = useState(true);

  const checkCategoryScroll = () => {
    if (categoryTabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = categoryTabsRef.current;
      setCanScrollCategoryLeft(scrollLeft > 4);
      setCanScrollCategoryRight(scrollLeft + clientWidth < scrollWidth - 4);
    }
  };

  const scrollCategoryTabs = (direction: "left" | "right") => {
    if (categoryTabsRef.current) {
      const step = 220;
      categoryTabsRef.current.scrollBy({
        left: direction === "left" ? -step : step,
        behavior: "smooth",
      });
      setTimeout(checkCategoryScroll, 320);
    }
  };

  const handleCategoryWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (categoryTabsRef.current && e.deltaY !== 0) {
      categoryTabsRef.current.scrollLeft += e.deltaY;
      checkCategoryScroll();
    }
  };

  // New Invoice Patient Search & Referral State
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [searchedPatients, setSearchedPatients] = useState<PatientMaster[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientMaster | null>(null);
  const [patientSearchNotice, setPatientSearchNotice] = useState<string | null>(null);
  const [billingReferralAgents, setBillingReferralAgents] = useState<
    Array<{
      id: string;
      agent_code: string;
      full_name: string;
      agent_type: string;
      phone: string;
      commission_rate_percent: number;
      is_commission_eligible: boolean;
    }>
  >([]);
  const [selectedReferralAgentId, setSelectedReferralAgentId] = useState("");
  const [referralCommissionRate, setReferralCommissionRate] = useState<number>(10);
  const [isAttributionSuggested, setIsAttributionSuggested] = useState(false);
  const [attributionSource, setAttributionSource] = useState<string>("");
  const [attributionAgentName, setAttributionAgentName] = useState<string>("");
  const [attributionAgentCode, setAttributionAgentCode] = useState<string>("");
  const [checkingAttribution, setCheckingAttribution] = useState(false);
  const [noReferral, setNoReferral] = useState(false);

  // Referral Combobox & Quick-Add State
  const [referralSearchQuery, setReferralSearchQuery] = useState("");
  const [isReferralDropdownOpen, setIsReferralDropdownOpen] = useState(false);
  const [showQuickAddReferralModal, setShowQuickAddReferralModal] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddPhone, setQuickAddPhone] = useState("");
  const [quickAddType, setQuickAddType] = useState<"DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF">("COMMUNITY_PC");
  const [quickAddCommissionRate, setQuickAddCommissionRate] = useState<number>(10);
  const [savingQuickAddAgent, setSavingQuickAddAgent] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  // Doctor & Service Tariffs State
  const [doctorsList, setDoctorsList] = useState<DoctorRecord[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [hospitalServiceTariffs, setHospitalServiceTariffs] = useState<HospitalServiceTariffRecord[]>([]);

  // Patient Demographic Invariant State
  const [patientAddressInput, setPatientAddressInput] = useState("");
  const [patientAgeInput, setPatientAgeInput] = useState<number | "">("");
  const [patientAgeMonthsInput, setPatientAgeMonthsInput] = useState<number | "">("");
  const [patientAgeDaysInput, setPatientAgeDaysInput] = useState<number | "">("");
  const [patientDobInput, setPatientDobInput] = useState("");
  const [savingPatientDemographics, setSavingPatientDemographics] = useState(false);

  // Medicine Itemization State
  const [medicineNameInput, setMedicineNameInput] = useState("");
  const [medicineUnitInput, setMedicineUnitInput] = useState("Tablet");
  const [medicineQtyInput, setMedicineQtyInput] = useState(1);
  const [medicinePriceInput, setMedicinePriceInput] = useState<number | "">("");

  // Print Mode State
  const [halfLetterPrintInv, setHalfLetterPrintInv] = useState<InvoiceRecord | null>(null);

  // Collect Payment Modal
  const [paymentModalInv, setPaymentModalInv] = useState<InvoiceRecord | null>(null);
  const [collectAmount, setCollectAmount] = useState(0);
  const [collectMethod, setCollectMethod] = useState<PaymentRecord["payment_method"]>("CASH");
  const [collectNotes, setCollectNotes] = useState("");
  const [collectLoading, setCollectLoading] = useState(false);

  const loadBillingData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [invRes, regRes, session, cashierStatus] = await Promise.all([
        getInvoicesAction({ status: statusFilter }),
        getCashRegisterSummaryAction(),
        getCurrentUserSession(),
        getCashierAuthorizationStatusAction(),
      ]);

      if (session) {
        if (session.roles) setUserRoles(session.roles);
        if (session.permissions) setUserPermissions(session.permissions);
      }
      if (cashierStatus?.success && cashierStatus.data) {
        setCashierCanEditBills(cashierStatus.data.cashierCanEditBills);
      }

      if (invRes.success && invRes.data) {
        const invoicesList = invRes.data.invoices;
        setInvoices(invoicesList);
        if (invoicesList.length > 0) {
          setSelectedInvoice((prev) => {
            if (!prev) return invoicesList[0];
            const updated = invoicesList.find((i) => i.id === prev.id);
            return updated || invoicesList[0];
          });
        }
      } else {
        setErrorMsg(invRes.error || "Failed to load invoices");
      }

      if (regRes.success && regRes.data) {
        setRegisterSummary(regRes.data.summary);
      }
    } catch (err: unknown) {
      console.error("[loadBillingData] error:", err);
      setErrorMsg("Network error loading billing ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [invRes, regRes, session, cashierStatus] = await Promise.all([
          getInvoicesAction({ status: statusFilter === "ALL" ? undefined : statusFilter }),
          getCashRegisterSummaryAction(),
          getCurrentUserSession(),
          getCashierAuthorizationStatusAction(),
        ]);

        if (isMounted) {
          if (session) {
            if (session.roles) setUserRoles(session.roles);
            if (session.permissions) setUserPermissions(session.permissions);
          }
          if (cashierStatus?.success && cashierStatus.data) {
            setCashierCanEditBills(cashierStatus.data.cashierCanEditBills);
          }

          if (invRes.success && invRes.data) {
            setInvoices(invRes.data.invoices);
          } else {
            setErrorMsg(invRes.error || "Failed to load invoices");
          }

          if (regRes.success && regRes.data) {
            setRegisterSummary(regRes.data.summary);
          }
        }
      } catch (err: unknown) {
        console.error("[init billing] error:", err);
        if (isMounted) setErrorMsg("Network error loading billing ledger");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [statusFilter]);

  // Fetch referral agents and lab tests catalog when invoice modal opens
  useEffect(() => {
    let active = true;
    if (isCreatingNew) {
      async function loadAgentsAndCatalog() {
        try {
          const [agentRes, diagRes, docRes, tariffRes] = await Promise.allSettled([
            searchReferralAgentsForBillingAction(),
            getDiagnosticTestsCatalogAction(),
            getDoctorsAction(),
            getHospitalServiceTariffsAction(),
          ]);
          if (active && agentRes.status === "fulfilled" && agentRes.value.success && agentRes.value.data) {
            setBillingReferralAgents(agentRes.value.data);
          }
          let loadedDoctors: DoctorRecord[] = [];
          if (active && docRes.status === "fulfilled" && docRes.value.success && docRes.value.data?.doctors) {
            loadedDoctors = docRes.value.data.doctors;
            setDoctorsList(loadedDoctors);
          }
          const dynamicTests = diagRes.status === "fulfilled" && diagRes.value.success ? diagRes.value.data?.tests : undefined;
          const tariffs = tariffRes.status === "fulfilled" && tariffRes.value.success ? tariffRes.value.data?.tariffs : undefined;
          if (active && tariffs) {
            setHospitalServiceTariffs(tariffs);
          }
          if (active) {
            const baseUnified = getAllHospitalServices(dynamicTests, tariffs);
            const doctorServices: HospitalServiceItem[] = loadedDoctors.map((doc) => ({
              id: `srv-doc-${doc.id}`,
              category: "CONSULTATION" as ServiceCategory,
              name: `Dr. ${doc.full_name} (${doc.designation || doc.specialization || "Consultant"}) - Consultation Fee`,
              price: doc.opd_fee ?? doc.consultation_fee ?? 500,
              group: "CONSULTATION" as const,
              description: `${doc.specialization || "Specialist"} Consultation Doctor Fee OPD Chamber ${doc.room_number || ""}`,
            }));
            setAllServices([...baseUnified, ...doctorServices]);
          }
        } catch (err) {
          console.error("Failed loading billing catalog/agents:", err);
        }
      }
      loadAgentsAndCatalog();
      setTimeout(checkCategoryScroll, 150);
    }
    return () => {
      active = false;
    };
  }, [isCreatingNew]);

  useEffect(() => {
    const handleResize = () => checkCategoryScroll();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Debounced search for patients in invoice modal
  useEffect(() => {
    let active = true;
    if (!isCreatingNew || !patientSearchQuery.trim()) {
      setSearchedPatients([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoadingPatients(true);
      const res = await searchPatientsAction({ query: patientSearchQuery.trim(), pageSize: 8 });
      if (active && res.success && res.data?.patients) {
        setSearchedPatients(res.data.patients);
      }
      if (active) setLoadingPatients(false);
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [patientSearchQuery, isCreatingNew]);

  // Check referral attribution whenever patient ID changes
  const checkAttributionForPatient = async (patientId: string) => {
    if (!patientId || !patientId.trim()) {
      setIsAttributionSuggested(false);
      setSelectedReferralAgentId("");
      setAttributionSource("");
      setAttributionAgentName("");
      setAttributionAgentCode("");
      return;
    }
    setCheckingAttribution(true);
    try {
      const res = await getPatientReferralAttributionAction(patientId.trim());
      if (res.success && res.data) {
        setSelectedReferralAgentId(res.data.referralAgentId);
        setReferralCommissionRate(res.data.commissionRatePercent || 10);
        setIsAttributionSuggested(true);
        setAttributionSource(res.data.source);
        setAttributionAgentName(res.data.fullName);
        setAttributionAgentCode(res.data.agentCode);
        setNoReferral(false);
      } else {
        setIsAttributionSuggested(false);
        setAttributionSource("");
        setAttributionAgentName("");
        setAttributionAgentCode("");
      }
    } catch (err) {
      console.error("[checkAttributionForPatient] err:", err);
    } finally {
      setCheckingAttribution(false);
    }
  };

  const searchParams = useSearchParams();

  const loadUnbilledServicesForPatient = async (patientIdentifier: string) => {
    if (!patientIdentifier || !patientIdentifier.trim()) return;
    setLoadingUnbilledServices(true);
    try {
      const res = await getEpisodeBillingPreviewAction({ patientId: patientIdentifier.trim() });
      if (res.success && res.data) {
        const rawLines = [...(res.data.lines || [])];
        const isIpd =
          (res.data.encounters || []).some((e) => /ipd|inpatient|admission/i.test(e.visit_type || "")) ||
          (res.data.resources || []).length > 0 ||
          (res.data.criticalCare || []).length > 0 ||
          rawLines.some((l) => /bed|cabin|ward|icu|ccu|hdu|nicu|picu|ipd|ভর্তি|কেবিন|বেড|ওয়ার্ড/i.test(l.item_name));

        if (isIpd) {
          setBillingEncounterType("IPD");
          const hasAdmissionFee = rawLines.some(
            (l) => l.item_name.includes("Admission") || l.item_name.includes("ভর্তি ফি")
          );
          if (!hasAdmissionFee) {
            rawLines.unshift({
              reference_id: `auto-ipd-adm-${patientIdentifier.trim()}`,
              service_category: "MISC",
              item_name: "IPD Admission Fee (ভর্তি ফি - এককালীন)",
              unit_price: 300,
              quantity: 1,
              total_price: 300,
            });
          }

          const hasServiceCharge = rawLines.some(
            (l) => l.item_name.includes("Service Charge") || l.item_name.includes("সার্ভিস চার্জ") || l.item_name.includes("সেবা চার্জ")
          );
          if (!hasServiceCharge) {
            const ipdEnc = (res.data.encounters || []).find((e) => e.visit_type === "IPD");
            const admitMs = ipdEnc?.admitted_at ? new Date(ipdEnc.admitted_at).getTime() : Date.now();
            const stayDays = Math.max(1, Math.ceil((Date.now() - admitMs) / (1000 * 60 * 60 * 24)));
            rawLines.push({
              reference_id: `auto-ipd-svc-${patientIdentifier.trim()}`,
              service_category: "MISC",
              item_name: `IPD Daily Service Charge (দৈনিক সেবা চার্জ - ৳৫০০/দিন × ${stayDays} দিন)`,
              unit_price: 500,
              quantity: stayDays,
              total_price: 500 * stayDays,
            });
          }
        }

        if (rawLines.length > 0) {
          const mappedLines = rawLines.map((l) => {
            let cat: InvoiceItemRecord["service_category"] = "MISC";
            const rawCat = (l.service_category || "").toUpperCase();
            if (["CONSULTATION", "LAB", "XRAY", "USG", "ECG", "PHARMACY", "BED", "CABIN", "OT", "AMBULANCE", "MISC"].includes(rawCat)) {
              cat = rawCat as InvoiceItemRecord["service_category"];
            } else if (rawCat === "INVESTIGATION") {
              cat = "LAB";
            } else if (rawCat === "PROCEDURE") {
              cat = "OT";
            } else if (rawCat === "ROOM") {
              cat = "BED";
            }
            return {
              referenceId: l.reference_id,
              category: cat,
              itemName: l.item_name,
              unitPrice: Number(l.unit_price || 0),
              quantity: Number(l.quantity || 1),
            };
          });

          setDetectedUnbilledLines(mappedLines);
          setUnbilledServicesCount(mappedLines.length);
          const total = mappedLines.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
          setUnbilledServicesTotal(total);

          // Auto-populate items directly into invoice
          setItems(mappedLines);

          if (res.data.admissionDiscountAmount && res.data.admissionDiscountAmount > 0) {
            setDiscountMode("FIXED");
            setDiscountFixed(res.data.admissionDiscountAmount);
            setDiscountReason(res.data.admissionDiscountReason || `ভর্তি ছাড়: ৳${res.data.admissionDiscountAmount}`);
            setInitialPaymentAmount(Math.max(0, total - res.data.admissionDiscountAmount));
          } else {
            setInitialPaymentAmount(total);
          }

          if (res.data.referralAgentId && !selectedReferralAgentId) {
            handleReferralAgentChange(res.data.referralAgentId);
          }
        } else {
          setDetectedUnbilledLines([]);
          setUnbilledServicesCount(0);
          setUnbilledServicesTotal(0);
        }
      } else {
        setDetectedUnbilledLines([]);
        setUnbilledServicesCount(0);
        setUnbilledServicesTotal(0);
      }
    } catch (err) {
      console.error("[loadUnbilledServicesForPatient] err:", err);
    } finally {
      setLoadingUnbilledServices(false);
    }
  };

  const handleSelectPatient = (p: PatientMaster) => {
    setSelectedPatient(p);
    setPatientIdInput(p.id);
    setPatientAddressInput(p.address || "");
    setPatientDobInput(p.dob || "");
    if (p.dob) {
      const d = calculateDetailedAgeFromDOB(p.dob);
      setPatientAgeInput(d.years);
      setPatientAgeMonthsInput(d.months);
      setPatientAgeDaysInput(d.days);
    } else {
      setPatientAgeInput(p.age !== undefined && p.age !== null ? p.age : "");
      setPatientAgeMonthsInput(p.age_months !== undefined && p.age_months !== null ? p.age_months : "");
      setPatientAgeDaysInput(p.age_days !== undefined && p.age_days !== null ? p.age_days : "");
    }
    setPatientSearchQuery(`${p.full_name} (${p.patient_code || p.registration_serial || ""})`);
    setSearchedPatients([]);
    setPatientSearchNotice(null);
    checkAttributionForPatient(p.id);
    void loadUnbilledServicesForPatient(p.id);
  };

  const autoLookupAndSelectPatient = async (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setPatientSearchNotice(null);
    setLoadingPatients(true);
    try {
      const res = await searchPatientsAction({ query: clean, pageSize: 10 });
      if (res.success && res.data?.patients && res.data.patients.length > 0) {
        const patients = res.data.patients;
        const cleanUpper = clean.toUpperCase();

        // Priority 1: Check for exact unique match on patient_code or UUID or phone number
        const exactMatch = patients.find(
          (p) =>
            p.patient_code?.toUpperCase() === cleanUpper ||
            p.id.toUpperCase() === cleanUpper ||
            (p.phone && p.phone.trim() === clean)
        );

        if (exactMatch) {
          handleSelectPatient(exactMatch);
        } else if (patients.length === 1) {
          // Exactly one match in directory
          handleSelectPatient(patients[0]);
        } else {
          // Multiple matching patients found on ambiguous query (e.g. common name like 'Rahim').
          // Never auto-select patients[0] blindly to prevent billing attribution errors.
          // Surface search results so cashier explicitly selects the intended patient.
          setSearchedPatients(patients);
          setPatientSearchNotice(
            `একাধিক রোগী পাওয়া গেছে (${patients.length} জন)। অনুগ্রহ করে নিচের তালিকা থেকে নির্দিষ্ট রোগীটি নির্বাচন করুন।`
          );
        }
      } else {
        setSearchedPatients([]);
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
        if (isUUID) {
          setPatientIdInput(clean);
          checkAttributionForPatient(clean);
          void loadUnbilledServicesForPatient(clean);
        } else {
          setPatientSearchNotice(`"${clean}" সম্পর্কিত কোনো রোগী পাওয়া যায়নি।`);
        }
      }
    } catch (err) {
      console.error("[autoLookupAndSelectPatient] error:", err);
      setPatientSearchNotice("রোগী অনুসন্ধানে ত্রুটি দেখা দিয়েছে।");
    } finally {
      setLoadingPatients(false);
    }
  };

  // Auto-listen to URL search params (e.g. /app/billing?code=OH-010104 or ?patientId=...)
  useEffect(() => {
    const codeParam = searchParams.get("code") || searchParams.get("patient_code") || searchParams.get("patientId");
    if (codeParam && codeParam.trim()) {
      setIsCreatingNew(true);
      setPatientSearchQuery(codeParam.trim());
      void autoLookupAndSelectPatient(codeParam.trim());
    }
  }, [searchParams]);

  const handleReferralAgentChange = (agentId: string) => {
    if (!agentId) {
      setSelectedReferralAgentId("");
      setNoReferral(true);
      setIsAttributionSuggested(false);
      setReferralSearchQuery("");
      return;
    }
    setSelectedReferralAgentId(agentId);
    setNoReferral(false);
    const found = billingReferralAgents.find((a) => a.id === agentId);
    if (found) {
      setReferralCommissionRate(found.commission_rate_percent || 10);
      setReferralSearchQuery("");
    }
  };

  const selectedReferralAgent = useMemo(() => {
    if (!selectedReferralAgentId) return null;
    return billingReferralAgents.find((a) => a.id === selectedReferralAgentId) || null;
  }, [selectedReferralAgentId, billingReferralAgents]);

  const filteredReferralAgents = useMemo(() => {
    if (!referralSearchQuery.trim()) return billingReferralAgents;
    const q = referralSearchQuery.toLowerCase().trim();
    return billingReferralAgents.filter(
      (a) =>
        a.full_name.toLowerCase().includes(q) ||
        a.agent_code.toLowerCase().includes(q) ||
        (a.phone && a.phone.includes(q)) ||
        a.agent_type.toLowerCase().includes(q)
    );
  }, [billingReferralAgents, referralSearchQuery]);

  const handleSaveQuickAddReferral = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quickAddName.trim()) {
      setQuickAddError("রেফারেন্স পার্টনারের নাম আবশ্যক");
      return;
    }
    if (!quickAddPhone.trim()) {
      setQuickAddError("মোবাইল নম্বর আবশ্যক");
      return;
    }
    setSavingQuickAddAgent(true);
    setQuickAddError(null);
    try {
      const res = await createReferralAgentAction({
        full_name: quickAddName.trim(),
        agent_type: quickAddType,
        phone: quickAddPhone.trim(),
        commission_rate_percent: quickAddCommissionRate,
        is_commission_eligible: true,
      });

      if (!res.success || !res.data) {
        setQuickAddError(res.error || "পার্টনার তৈরি করতে ব্যর্থ হয়েছে");
        return;
      }

      const created = res.data;
      const newAgent = {
        id: created.id,
        agent_code: created.agent_code,
        full_name: created.full_name,
        agent_type: created.agent_type,
        phone: created.phone,
        commission_rate_percent: created.commission_rate_percent ?? quickAddCommissionRate,
        is_commission_eligible: created.is_commission_eligible ?? true,
      };

      setBillingReferralAgents((prev) => [newAgent, ...prev]);
      handleReferralAgentChange(newAgent.id);
      setShowQuickAddReferralModal(false);
      setQuickAddName("");
      setQuickAddPhone("");
      setQuickAddType("COMMUNITY_PC");
      setQuickAddCommissionRate(10);
      setToast({
        message: `রেফারেন্স পার্টনার "${newAgent.full_name}" সফলভাবে যুক্ত ও সিলেক্ট করা হয়েছে (${newAgent.agent_code})।`,
        type: "success",
      });
    } catch (err: unknown) {
      setQuickAddError(err instanceof Error ? err.message : "অপ্রত্যাশিত ত্রুটি ঘটেছে");
    } finally {
      setSavingQuickAddAgent(false);
    }
  };

  // Calculations for new invoice with dual discount support
  const subtotal = items.reduce((acc, it) => acc + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0), 0);
  const isPercentOverLimit = discountMode === "PERCENT" && discountPercent !== "" && Number(discountPercent) > 60;
  const calculatedDiscountAmount = discountMode === "PERCENT"
    ? (discountPercent !== "" && Number(discountPercent) > 0
        ? (isPercentOverLimit ? 0 : Math.min(subtotal, Math.round((subtotal * Number(discountPercent)) / 100)))
        : 0)
    : (discountFixed !== "" && Number(discountFixed) > 0
        ? Math.min(subtotal, Math.round(Number(discountFixed)))
        : 0);
  const netTotal = Math.max(0, subtotal - calculatedDiscountAmount);
  const dueAmount = Math.max(0, netTotal - initialPaymentAmount);

  // Keep payment intent separate from invoice totals. Adding/removing an item or
  // changing a discount must not silently convert a due/custom payment into FULL.
  // Custom payments are clamped to the new net total to prevent stale overpayment.
  useEffect(() => {
    setInitialPaymentAmount((current) => {
      if (initialPaymentMode === "FULL") return netTotal;
      if (initialPaymentMode === "DUE") return 0;
      const safeCurrent = Number.isFinite(current) ? current : 0;
      return Math.min(Math.max(0, safeCurrent), netTotal);
    });
  }, [netTotal, initialPaymentMode]);

  const injectIpdAdmissionCharges = (currentItems: typeof items): typeof items => {
    const updated = [...currentItems];
    const hasAdmFee = updated.some((it) => /admission\s*fee|ভর্তি\s*ফি/i.test(it.itemName));
    if (!hasAdmFee) {
      updated.unshift({
        category: "MISC",
        itemName: "IPD Admission Fee (ভর্তি ফি - এককালীন)",
        unitPrice: 300,
        quantity: 1,
      });
    }

    const hasDailyCharge = updated.some(
      (it) => /daily\s*service\s*charge|দৈনিক\s*সেবা\s*চার্জ|দৈনিক\s*সার্ভিস\s*চার্জ/i.test(it.itemName)
    );
    if (!hasDailyCharge) {
      updated.push({
        category: "MISC",
        itemName: "IPD Daily Service Charge (দৈনিক সেবা চার্জ)",
        unitPrice: 500,
        quantity: 1,
      });
    }
    return updated;
  };

  const handleToggleBillingEncounterType = (type: "OPD" | "IPD") => {
    setBillingEncounterType(type);
    if (type === "IPD") {
      const next = injectIpdAdmissionCharges(items);
      setItems(next);

    }
  };

  const addItemRow = (
    category: ServiceCategory | InvoiceItemRecord["service_category"],
    name: string,
    price: number,
    quantity: number = 1
  ) => {
    const dbCategory = toDbInvoiceCategory(category);
    const existingIndex = items.findIndex((it) => it.itemName.toLowerCase() === name.toLowerCase());
    let next: typeof items;
    if (existingIndex >= 0) {
      next = [...items];
      next[existingIndex] = {
        ...next[existingIndex],
        quantity: next[existingIndex].quantity + quantity,
      };
    } else {
      next = [...items, { category: dbCategory, itemName: name, unitPrice: price, quantity }];
    }

    // Auto-inject IPD admission fee (300 BDT) and daily service charge (500 BDT)
    // when any IPD / Bed / Cabin service is added to the invoice
    const isIpdService =
      dbCategory === "BED" ||
      dbCategory === "CABIN" ||
      /bed|cabin|ward|icu|ccu|hdu|nicu|picu|ipd|ভর্তি|কেবিন|বেড|ওয়ার্ড/i.test(name);
    const isAdmFeeItem = /admission\s*fee|ভর্তি\s*ফি/i.test(name);
    const isDailyChargeItem = /service\s*charge|সেবা\s*চার্জ|সার্ভিস\s*চার্জ/i.test(name);

    if (isIpdService) {
      setBillingEncounterType("IPD");
      if (!isAdmFeeItem && !isDailyChargeItem) {
        next = injectIpdAdmissionCharges(next);
      }
    }

    setItems(next);

  };

  const removeItemRow = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    setItems(next);

  };

  const handleSavePatientDemographics = async () => {
    if (!selectedPatient) return;
    if (!patientAddressInput.trim()) {
      setToast({ message: "রোগীর ঠিকানা প্রদান করুন।", type: "error" });
      return;
    }
    const hasAge = patientAgeInput !== "" || patientAgeMonthsInput !== "" || patientAgeDaysInput !== "" || !!patientDobInput;
    if (!hasAge) {
      setToast({ message: "রোগীর বয়স বা জন্ম তারিখ প্রদান করুন।", type: "error" });
      return;
    }

    setSavingPatientDemographics(true);
    try {
      const y = typeof patientAgeInput === "number" ? patientAgeInput : 0;
      const m = typeof patientAgeMonthsInput === "number" ? patientAgeMonthsInput : 0;
      const d = typeof patientAgeDaysInput === "number" ? patientAgeDaysInput : 0;
      const computedDob = patientDobInput || calculateDOBFromYMD(y, m, d);

      const res = await updatePatientAction({
        patientId: selectedPatient.id,
        fullName: selectedPatient.full_name,
        phone: selectedPatient.phone,
        gender: selectedPatient.gender,
        address: patientAddressInput.trim(),
        dob: computedDob || undefined,
        age: y,
        age_months: m,
        age_days: d,
      });

      if (res.success && res.data?.patient) {
        setSelectedPatient(res.data.patient);
        setToast({ message: "রোগীর ঠিকানা ও বিস্তারিত বয়স সফলভাবে সংরক্ষিত হয়েছে!", type: "success" });
      } else {
        setToast({ message: res.error || "সংরক্ষণ করা যায়নি।", type: "error" });
      }
    } catch {
      setToast({ message: "Network error saving demographics", type: "error" });
    } finally {
      setSavingPatientDemographics(false);
    }
  };

  const handleAddDoctorConsultation = (doctorId: string) => {
    if (!doctorId) return;
    const doc = doctorsList.find((d) => d.id === doctorId);
    if (!doc) return;

    const tariffFee = hospitalServiceTariffs.find((t) => t.category === "CONSULTATION" && t.is_active)?.price;
    const configuredFee = doc.opd_fee ?? doc.consultation_fee ?? tariffFee;
    const fee = configuredFee !== undefined && configuredFee !== null ? Number(configuredFee) : 0;

    if (fee <= 0) {
      setToast({
        message: `ডাক্তার ${doc.full_name}-এর কনসালটেশন ফি ডাটাবেজে কনফিগার করা নেই। অনুগ্রহ করে ট্যারিফ থেকে ফি সেট করুন।`,
        type: "error",
      });
      return;
    }

    const itemName = `Consultation: ${doc.full_name} (${doc.designation || doc.specialization || "Consultant"})`;
    addItemRow("CONSULTATION", itemName, fee);
    setSelectedDoctorId("");
  };

  const handleAddMedicineItem = () => {
    if (!medicineNameInput.trim()) {
      setToast({ message: "ঔষধের নাম প্রদান করুন।", type: "error" });
      return;
    }
    const unitPrice = Number(medicinePriceInput);
    if (isNaN(unitPrice) || unitPrice < 0) {
      setToast({ message: "সঠিক ইউনিট মূল্য দিন।", type: "error" });
      return;
    }
    const qty = Math.max(1, Number(medicineQtyInput) || 1);
    const desc = `${medicineNameInput.trim()} (${medicineUnitInput})`;
    addItemRow("PHARMACY", desc, unitPrice, qty);
    setMedicineNameInput("");
    setMedicinePriceInput("");
    setMedicineQtyInput(1);
  };

  const BENGALI_SEARCH_SYNONYMS: Record<string, string[]> = {
    "ফি": ["fee", "consultation", "doctor", "charge", "visit"],
    "ডাক্তার": ["doctor", "consultation", "dr", "opd", "physician", "specialist"],
    "ভিজিট": ["fee", "visit", "consultation", "doctor"],
    "রোগী": ["patient", "admission", "bed", "cabin"],
    "ভর্তি": ["admission", "bed", "cabin", "reg"],
    "বেড": ["bed", "ward", "general"],
    "কেবিন": ["cabin", "ac", "non-ac", "vip"],
    "রক্ত": ["blood", "cbc", "serum", "hematology"],
    "প্রস্রাব": ["urine", "routine"],
    "এক্সরে": ["x-ray", "xray", "radiology"],
    "আল্ট্রা": ["usg", "ultrasonography", "ultrasound", "abdomen"],
    "ইসিজি": ["ecg", "cardiology"],
    "ইকো": ["echo", "echocardiogram"],
    "সার্জারি": ["surgery", "ot", "operation"],
    "অপারেশন": ["ot", "surgery", "operation"],
    "অ্যাম্বুলেন্স": ["ambulance", "transport"],
  };

  const filteredServices = useMemo(() => {
    return allServices.filter((s) => {
      const matchesGroup = serviceFilterGroup === "ALL" || s.group === serviceFilterGroup;
      const rawTerm = serviceSearchTerm.trim().toLowerCase();
      if (!rawTerm) return matchesGroup;

      const expandedTerms = [rawTerm];
      for (const [bnKey, engList] of Object.entries(BENGALI_SEARCH_SYNONYMS)) {
        if (rawTerm.includes(bnKey) || bnKey.includes(rawTerm)) {
          expandedTerms.push(...engList);
        }
      }

      const nameLower = s.name.toLowerCase();
      const catLower = s.category.toLowerCase();
      const descLower = (s.description || "").toLowerCase();
      const priceStr = String(s.price);

      const matchesTerm = expandedTerms.some(
        (t) =>
          nameLower.includes(t) ||
          catLower.includes(t) ||
          descLower.includes(t) ||
          priceStr.includes(t)
      );

      return matchesGroup && matchesTerm;
    });
  }, [allServices, serviceFilterGroup, serviceSearchTerm]);

  const instantSearchResults = useMemo(() => {
    const rawTerm = serviceSearchTerm.trim().toLowerCase();
    if (!rawTerm) return [];

    const expandedTerms = [rawTerm];
    for (const [bnKey, engList] of Object.entries(BENGALI_SEARCH_SYNONYMS)) {
      if (rawTerm.includes(bnKey) || bnKey.includes(rawTerm)) {
        expandedTerms.push(...engList);
      }
    }

    const matches: Array<{ service: (typeof allServices)[0]; score: number }> = [];

    for (const s of allServices) {
      const name = s.name.toLowerCase();
      const cat = s.category.toLowerCase();
      const desc = (s.description || "").toLowerCase();
      const priceStr = String(s.price);

      let score = -1;

      // Direct term matching (highest priority)
      if (name === rawTerm) {
        score = 100; // Exact name match
      } else if (name.startsWith(rawTerm)) {
        score = 80; // Starts with term
      } else if (name.includes(rawTerm)) {
        score = 60; // Whole word match
      } else if (priceStr === rawTerm) {
        score = 55;
      } else if (cat === rawTerm || cat.startsWith(rawTerm)) {
        score = 30; // Category match
      } else if (priceStr.includes(rawTerm)) {
        score = 25;
      } else if (desc.includes(rawTerm)) {
        score = 20; // Description substring
      }

      // Synonym expansion matching
      if (score < 0) {
        for (const t of expandedTerms) {
          if (name.includes(t)) {
            score = Math.max(score, 35);
          } else if (cat.includes(t)) {
            score = Math.max(score, 30);
          } else if (desc.includes(t)) {
            score = Math.max(score, 25);
          }
        }
      }

      if (score > 0) {
        matches.push({ service: s, score });
      }
    }

    matches.sort((a, b) => b.score - a.score || a.service.name.localeCompare(b.service.name));
    return matches.map((m) => m.service);
  }, [allServices, serviceSearchTerm]);

  const serviceGroupCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: allServices.length };
    for (const s of allServices) {
      counts[s.group] = (counts[s.group] || 0) + 1;
    }
    return counts;
  }, [allServices]);

  const getCategoryBadgeStyle = (category: string, group: string) => {
    const cat = (category || "").toUpperCase();
    if (cat === "CT_SCAN") return { label: "CT SCAN", bg: "bg-cyan-50 text-cyan-800 border-cyan-200" };
    if (cat === "MRI") return { label: "MRI", bg: "bg-blue-50 text-blue-800 border-blue-200" };
    if (cat === "XRAY") return { label: "X-RAY", bg: "bg-indigo-50 text-indigo-800 border-indigo-200" };
    if (cat === "USG") return { label: "USG", bg: "bg-purple-50 text-purple-800 border-purple-200" };
    if (cat === "ECG") return { label: "ECG", bg: "bg-rose-50 text-rose-800 border-rose-200" };
    if (cat === "ENDOSCOPY") return { label: "ENDOSCOPY", bg: "bg-amber-50 text-amber-800 border-amber-200" };
    if (group === "LAB" || cat === "LAB") return { label: "LAB", bg: "bg-emerald-50 text-emerald-800 border-emerald-200" };
    if (group === "CONSULTATION" || cat === "CONSULTATION") return { label: "DOCTOR", bg: "bg-sky-50 text-sky-800 border-sky-200" };
    if (group === "BED_CABIN" || cat === "BED" || cat === "CABIN" || cat === "IPD_BED") return { label: "BED/CABIN", bg: "bg-amber-50 text-amber-900 border-amber-300" };
    if (group === "CRITICAL_CARE" || cat === "CRITICAL_CARE") return { label: "ICU/CCU", bg: "bg-red-50 text-red-800 border-red-200" };
    if (group === "OT_SURGERY" || cat === "OT" || cat === "OT_SURGERY") return { label: "OT/SURGERY", bg: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200" };
    if (group === "EMERGENCY_NURSING" || cat === "AMBULANCE" || cat === "ADMISSION") return { label: "EMERGENCY", bg: "bg-teal-50 text-teal-800 border-teal-200" };
    return { label: cat || "SERVICE", bg: "bg-slate-50 text-slate-700 border-slate-200" };
  };

  const resetInvoiceModal = () => {
    setIsCreatingNew(false);
    setPatientIdInput("");
    setPatientSearchQuery("");
    setSearchedPatients([]);
    setSelectedPatient(null);
    setSelectedReferralAgentId("");
    setReferralCommissionRate(10);
    setIsAttributionSuggested(false);
    setAttributionSource("");
    setAttributionAgentName("");
    setAttributionAgentCode("");
    setNoReferral(false);
    setServiceFilterGroup("ALL");
    setServiceSearchTerm("");
    setItems([]);
    setDetectedUnbilledLines([]);
    setUnbilledServicesCount(0);
    setUnbilledServicesTotal(0);
    setLoadingUnbilledServices(false);
    setDiscountMode("FIXED");
    setDiscountPercent("");
    setDiscountFixed("");
    setDiscountReason("");
    setInitialPaymentAmount(0);
    setInitialPaymentMode("FULL");
    setPaymentMethod("CASH");
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientIdInput.trim() || !selectedPatient) {
      setToast({ message: "অনুগ্রহ করে একজন রোগী নির্বাচন করুন (Please select a patient).", type: "error" });
      return;
    }

    // Mandatory Patient Demographic Validation Invariants: Name, ID, Phone, Address, Age
    if (!selectedPatient.full_name || selectedPatient.full_name.trim().length < 2) {
      setToast({ message: "রোগীর নাম আবশ্যক (Patient name is mandatory).", type: "error" });
      return;
    }
    if (!selectedPatient.phone) {
      setToast({ message: "রোগীর মোবাইল নম্বর আবশ্যক (Patient contact phone is mandatory).", type: "error" });
      return;
    }

    const effectiveAddress = (selectedPatient.address || patientAddressInput).trim();
    const hasPatientAge = (selectedPatient.age !== undefined && selectedPatient.age !== null) ||
      (selectedPatient.age_months !== undefined && selectedPatient.age_months !== null && selectedPatient.age_months > 0) ||
      (selectedPatient.age_days !== undefined && selectedPatient.age_days !== null && selectedPatient.age_days > 0) ||
      !!selectedPatient.dob;
    const hasInputAge = patientAgeInput !== "" || patientAgeMonthsInput !== "" || patientAgeDaysInput !== "" || !!patientDobInput;

    if (!effectiveAddress || effectiveAddress.length < 2) {
      setToast({ message: "বিলিংয়ের জন্য রোগীর ঠিকানা প্রদান করা বাধ্যতামূলক (Patient address is mandatory).", type: "error" });
      return;
    }
    if (!hasPatientAge && !hasInputAge) {
      setToast({ message: "বিলিংয়ের জন্য রোগীর বয়স প্রদান করা বাধ্যতামূলক (Patient age is mandatory).", type: "error" });
      return;
    }

    // Auto-sync missing demographics to patient database record
    if (!selectedPatient.address || (!hasPatientAge && hasInputAge)) {
      try {
        const y = typeof patientAgeInput === "number" ? patientAgeInput : (selectedPatient.age ?? 0);
        const m = typeof patientAgeMonthsInput === "number" ? patientAgeMonthsInput : (selectedPatient.age_months ?? 0);
        const d = typeof patientAgeDaysInput === "number" ? patientAgeDaysInput : (selectedPatient.age_days ?? 0);
        const computedDob = patientDobInput || selectedPatient.dob || calculateDOBFromYMD(y, m, d);

        await updatePatientAction({
          patientId: selectedPatient.id,
          fullName: selectedPatient.full_name,
          phone: selectedPatient.phone,
          gender: selectedPatient.gender,
          address: effectiveAddress,
          dob: computedDob || undefined,
          age: y,
          age_months: m,
          age_days: d,
        });
      } catch (err) {
        console.error("Auto-syncing demographics failed:", err);
      }
    }

    if (!items || items.length === 0) {
      setToast({ message: "কমপক্ষে একটি সার্ভিস বা টেস্ট আইটেম যোগ করুন।", type: "error" });
      return;
    }

    if (!Number.isFinite(initialPaymentAmount) || initialPaymentAmount < 0 || initialPaymentAmount > netTotal) {
      setToast({ message: "প্রাথমিক পেমেন্ট মোট বিলের মধ্যে হতে হবে (Initial payment must be between 0 and the grand total).", type: "error" });
      return;
    }

    if (discountMode === "PERCENT" && discountPercent !== "" && Number(discountPercent) > 0) {
      const p = Number(discountPercent);
      if (p < 5 || p > 60) {
        setToast({
          message: "ডিসকাউন্ট ৫% থেকে ৬০% এর মধ্যে হতে হবে (বা ০% কোন ছাড় না থাকলে)।",
          type: "error",
        });
        return;
      }
    }

    if (discountMode === "FIXED" && discountFixed !== "" && Number(discountFixed) < 0) {
      setToast({
        message: "ডিসকাউন্টের পরিমাণ ঋণাত্মক হতে পারবে না।",
        type: "error",
      });
      return;
    }

    setFormLoading(true);
    try {
      const res = await createInvoiceAction({
        patientId: patientIdInput.trim(),
        items,
        discountAmount: calculatedDiscountAmount,
        discountReason: calculatedDiscountAmount > 0
          ? (discountMode === "PERCENT"
              ? `[Discount: ${discountPercent}%] ${discountReason.trim()}`.trim()
              : `[Concession: ৳${calculatedDiscountAmount}] ${discountReason.trim()}`.trim())
          : discountReason.trim() || undefined,
        initialPaymentAmount: Number(initialPaymentAmount),
        paymentMethod,
        referralAgentId: !noReferral && selectedReferralAgentId ? selectedReferralAgentId : undefined,
        referralCommissionRate: !noReferral && selectedReferralAgentId ? Number(referralCommissionRate) : undefined,
        noReferral: noReferral || !selectedReferralAgentId,
      });

      if (res.success && res.data) {
        const newlyCreatedInv = res.data.invoice;
        resetInvoiceModal();
        setSelectedInvoice(newlyCreatedInv);
        setHalfLetterPrintInv(newlyCreatedInv);
        await loadBillingData();
        setTimeout(() => {
          window.print();
        }, 350);
        setToast({ message: `Invoice ${newlyCreatedInv.invoice_number} created successfully!`, type: "success" });
      } else {
        setToast({ message: res.error || "Failed to generate invoice", type: "error" });
      }
    } catch (err: unknown) {
      console.error("[handleCreateInvoice] error:", err);
      setToast({ message: "Error generating invoice", type: "error" });
    } finally {
      setFormLoading(false);
    }
  };

  const handlePrintInvoice = async (inv: InvoiceRecord) => {
    try {
      const receiptData: BillingReceiptData = {
        invoiceNumber: inv.invoice_number,
        patientName: inv.patient?.full_name || "Hospital Patient",
        uhid: inv.patient?.patient_code || "OH-P-WALKIN",
        items: (inv.items || []).map((it) => ({
          description: it.item_name,
          qty: it.quantity,
          unitPrice: it.unit_price,
          total: it.total_price,
        })),
        subtotal: inv.subtotal,
        discount: inv.discount_amount,
        tax: inv.tax_amount,
        total: inv.grand_total,
        paid: inv.paid_amount,
        balance: inv.due_amount,
        paymentMethod: inv.payments?.[0]?.payment_method || "CASH",
        cashierName: "Cashier",
      };

      const result = await printBillingInvoiceReceipt(receiptData);
      if (result.success && result.transport !== "BROWSER_PRINT") {
        setToast({ message: `Receipt sent to ${result.deviceName || result.transport}`, type: "success" });
      } else {
        setHalfLetterPrintInv(inv);
        setTimeout(() => {
          window.print();
        }, 300);
      }
    } catch (err) {
      console.error("[handlePrintInvoice] error:", err);
      setHalfLetterPrintInv(inv);
      setTimeout(() => {
        window.print();
      }, 300);
    }
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInv) return;

    setCollectLoading(true);
    try {
      const res = await collectPaymentAction({
        invoiceId: paymentModalInv.id,
        amount: Number(collectAmount),
        paymentMethod: collectMethod,
        notes: collectNotes.trim() || undefined,
      });

      if (res.success) {
        setPaymentModalInv(null);
        await loadBillingData();
        setToast({ message: "Payment collected and recorded in cash register.", type: "success" });
      } else {
        setToast({ message: res.error || "Failed to collect payment", type: "error" });
      }
    } catch (err: unknown) {
      console.error("[handleCollectPayment] error:", err);
      setToast({ message: "Error processing payment", type: "error" });
    } finally {
      setCollectLoading(false);
    }
  };

  const handleVoidInvoice = (invoice: InvoiceRecord) => {
    setVoidModalInv(invoice);
    setVoidReasonInput("");
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalInv) return;
    if (voidReasonInput.trim().length < 5) {
      setToast({ message: "Mandatory justification must be at least 5 characters.", type: "error" });
      return;
    }

    setVoidLoading(true);
    try {
      const res = await voidInvoiceAction({ invoiceId: voidModalInv.id, reason: voidReasonInput.trim() });
      if (res.success) {
        const invNum = voidModalInv.invoice_number;
        setVoidModalInv(null);
        setVoidReasonInput("");
        await loadBillingData();
        setToast({ message: `Invoice ${invNum} voided and recorded in audit vault.`, type: "success" });
      } else {
        setToast({ message: res.error || "Failed to void invoice", type: "error" });
      }
    } catch (err: unknown) {
      console.error("[handleConfirmVoid] error:", err);
      setToast({ message: "Error voiding invoice", type: "error" });
    } finally {
      setVoidLoading(false);
    }
  };

  const isSuperAdmin = userRoles.some((r) =>
    ["super_admin", "admin", "hospital_admin"].includes(String(r).toLowerCase())
  );
  const hasEditPerm = userPermissions.includes("billing.edit");

  // If user has explicit billing.edit permission, or Super Admin, or cashierCanEditBills is enabled, bill edit is allowed.
  const canEditBills = isSuperAdmin || hasEditPerm || cashierCanEditBills;

  const handleToggleCashierAuth = async () => {
    setTogglingCashierAuth(true);
    try {
      const nextVal = !cashierCanEditBills;
      const res = await toggleCashierEditAuthorizationAction({ allowCashierEdit: nextVal });
      if (res.success && res.data) {
        setCashierCanEditBills(res.data.cashierCanEditBills);
        setToast({
          message: nextVal
            ? "ক্যাশিয়ারদের বিল এডিট করার অনুমতি দেওয়া হয়েছে।"
            : "ক্যাশিয়ারদের বিল এডিট করার অনুমতি স্থগিত করা হয়েছে।",
          type: "success",
        });
      } else {
        setToast({ message: res.error || "Failed to update authorization", type: "error" });
      }
    } catch (err: unknown) {
      console.error("[handleToggleCashierAuth] error:", err);
      setToast({ message: "Error updating cashier permission", type: "error" });
    } finally {
      setTogglingCashierAuth(false);
    }
  };

  const handleConfirmDeleteInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteModalInv) return;

    setDeleteLoading(true);
    try {
      const res = await deleteInvoiceAction({
        invoiceId: deleteModalInv.id,
        reason: deleteReasonInput.trim() || (deletePermanentPurge ? "Permanent Purge by Super Admin" : "Voided by Super Admin"),
        permanentPurge: deletePermanentPurge,
      });

      if (res.success) {
        const invNum = deleteModalInv.invoice_number;
        setDeleteModalInv(null);
        setDeleteReasonInput("");
        setSelectedInvoice(null);
        await loadBillingData();
        setToast({
          message: deletePermanentPurge
            ? `বিল #${invNum} এবং এর সমস্ত হিস্ট্রি ডাটাবেজ থেকে স্থায়ীভাবে মুছে ফেলা হয়েছে`
            : `বিল #${invNum} সফলভাবে Void হিসেবে চিহ্নিত করা হয়েছে`,
          type: "success",
        });
      } else {
        setToast({ message: res.error || "Failed to delete invoice", type: "error" });
      }
    } catch (err: unknown) {
      console.error("[handleConfirmDeleteInvoice] error:", err);
      setToast({ message: "Error deleting invoice", type: "error" });
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.patient?.full_name && inv.patient.full_name.toLowerCase().includes(q)) ||
      (inv.patient?.patient_code && inv.patient.patient_code.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (statusFilter === "DUE") {
      return inv.due_amount > 0 && !inv.is_voided;
    }
    if (statusFilter === "PAID") {
      return inv.status === "PAID" || (inv.due_amount <= 0 && !inv.is_voided);
    }
    if (statusFilter === "UNPAID") {
      return inv.status === "UNPAID" && !inv.is_voided;
    }
    if (statusFilter === "PARTIAL") {
      return inv.status === "PARTIAL" && !inv.is_voided;
    }
    if (statusFilter === "VOID") {
      return inv.status === "VOID" || inv.is_voided;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Revenue Cycle & Cash Counter
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Billing & Invoicing Engine
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Non-destructive ledger, multi-service invoices, partial payment tracking, and digital cashier receipts.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {isSuperAdmin && (
            <button
              type="button"
              onClick={handleToggleCashierAuth}
              disabled={togglingCashierAuth}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center shadow-xs border cursor-pointer ${
                cashierCanEditBills
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                  : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
              }`}
              title="সুপার অ্যাডমিন অনুমতি: ক্যাশিয়ারদের বিল এডিট করার অনুমতি অন/অফ করুন"
            >
              {cashierCanEditBills ? "✓ Cashier Edit: Allowed" : "🔒 Cashier Edit: Restricted"}
            </button>
          )}
          <button
            onClick={loadBillingData}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
            title="Refresh billing data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <EpisodeBillingPanel />
          <button
            onClick={() => setIsCreatingNew(true)}
            className="btn-3d btn-3d-slate px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Generate New Invoice
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold print:hidden">
          {errorMsg}
        </div>
      )}

      {/* CASH COUNTER SUMMARY STRIP */}
      {registerSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
          <div className="stat-card-3d p-4 bg-white">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Today&apos;s Invoiced</span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {formatCurrencyBDT(registerSummary.todayTotalInvoiced)}
            </div>
            <span className="text-[10px] text-slate-400">{registerSummary.activeInvoiceCount} Active Bills</span>
          </div>

          <div className="stat-card-3d p-4 bg-gradient-to-br from-emerald-50/80 to-white border-emerald-200">
            <span className="text-[11px] font-bold text-emerald-800 uppercase">Cash Collected</span>
            <div className="text-2xl font-black text-emerald-700 mt-1">
              {formatCurrencyBDT(registerSummary.todayCashCollected)}
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">Physical cash register</span>
          </div>

          <div className="stat-card-3d p-4 bg-gradient-to-br from-sky-50/80 to-white border-sky-200">
            <span className="text-[11px] font-bold text-sky-800 uppercase">MFS (bKash/Nagad)</span>
            <div className="text-2xl font-black text-sky-700 mt-1">
              {formatCurrencyBDT(registerSummary.todayMfsCollected)}
            </div>
            <span className="text-[10px] text-sky-700 font-medium">Digital gateway receipts</span>
          </div>

          <div className="stat-card-3d p-4 bg-gradient-to-br from-indigo-50/80 to-white border-indigo-200">
            <span className="text-[11px] font-bold text-indigo-800 uppercase">Total Collected</span>
            <div className="text-2xl font-black text-indigo-700 mt-1">
              {formatCurrencyBDT(registerSummary.todayTotalCollected)}
            </div>
            <span className="text-[10px] text-indigo-700 font-medium">Settled today</span>
          </div>
        </div>
      )}

      {/* FILTER & SEARCH */}
      <div className="flex flex-col sm:flex-row justify-between gap-3 items-center print:hidden">
        <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto gap-0.5">
          {/* Status filters: ["ALL", "UNPAID", "PARTIAL", "PAID", "VOID"] */}
          {[
            { id: "ALL", label: "All (সকল)" },
            { id: "PAID", label: "Paid (পরিশোধিত)" },
            { id: "DUE", label: "Due (বকেয়া)" },
            { id: "PARTIAL", label: "Partial (আংশিক)" },
            { id: "UNPAID", label: "Unpaid (বাকি)" },
            { id: "VOID", label: "Void (বাতিল)" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setStatusFilter(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                statusFilter === item.id ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search invoice number, patient..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-sky-500/20"
          />
        </div>
      </div>

      {/* MAIN LAYOUT: INVOICES LIST & DETAILS */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-start ${halfLetterPrintInv ? "print:hidden" : "print:block print:w-full"}`}>
        {/* LEFT COLUMN: INVOICE TABLE */}
        <div className="lg:col-span-7 card-3d overflow-hidden print:hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Due</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      Loading invoices...
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      No invoices found.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className={`cursor-pointer transition hover:bg-slate-50/80 ${
                        selectedInvoice?.id === inv.id ? "bg-sky-50/50 font-semibold" : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{inv.patient?.full_name || "Patient"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{inv.patient?.patient_code}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrencyBDT(inv.grand_total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-600 font-bold">
                        {formatCurrencyBDT(inv.paid_amount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-rose-600 font-bold">
                        {formatCurrencyBDT(inv.due_amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.status === "PAID"
                              ? "bg-emerald-100 text-emerald-800"
                              : inv.status === "PARTIAL"
                              ? "bg-amber-100 text-amber-800"
                              : inv.status === "VOID"
                              ? "bg-slate-200 text-slate-700 line-through"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div
                          className="flex items-center justify-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {inv.due_amount > 0 && !inv.is_voided && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setPaymentModalInv(inv);
                                setCollectAmount(inv.due_amount);
                              }}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] flex items-center transition shadow-2xs whitespace-nowrap"
                              title="Pay / Collect Due Balance (বকেয়া পরিশোধ)"
                            >
                              <Wallet className="w-3 h-3 mr-1" />
                              Pay Due
                            </button>
                          )}
                          {canEditBills && !inv.is_voided && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setEditModalInv(inv);
                              }}
                              className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition"
                              title="Edit Bill Details"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setHistoryModalInv(inv);
                            }}
                            className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition"
                            title="ইনভয়েস অডিট ও সংশোধন ইতিহাস দেখুন"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setHalfLetterPrintInv(inv);
                            }}
                            className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition"
                            title="Print Half-Letter Slip"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setDeleteModalInv(inv);
                                setDeletePermanentPurge(true);
                                setDeleteReasonInput("");
                              }}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Bill (Super Admin Only)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: INVOICE PREVIEW / PRINT SLIP */}
        <div className={`lg:col-span-5 card-3d p-6 space-y-4 ${halfLetterPrintInv ? "print:hidden" : "print:col-span-12 print:border-none print:p-0 print:shadow-none print:w-full print:block"}`}>
          {selectedInvoice ? (
            <div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-200 print:hidden">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Official Invoice</span>
                  <h3 className="text-base font-black text-slate-900 font-mono">{selectedInvoice.invoice_number}</h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => handlePrintInvoice(selectedInvoice)}
                    className="p-2 border rounded-xl hover:bg-slate-50 text-slate-700 transition"
                    title="Print Invoice / Thermal Slip"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setHalfLetterPrintInv(selectedInvoice)}
                    className="px-2.5 py-1.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition flex items-center shadow-2xs"
                    title="Print Half-Letter Invoice Slip (5.5 × 8.5 in)"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1" />
                    Half-Letter Slip
                  </button>
                  {canEditBills && !selectedInvoice.is_voided && (
                    <button
                      onClick={() => setEditModalInv(selectedInvoice)}
                      className="px-2.5 py-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-xl text-xs transition flex items-center shadow-2xs"
                      title="Edit Invoice Items & Adjustments"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1" />
                      Edit Bill
                    </button>
                  )}
                  <button
                    onClick={() => setHistoryModalInv(selectedInvoice)}
                    className="px-2.5 py-1.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold rounded-xl text-xs transition flex items-center shadow-2xs cursor-pointer"
                    title="ইনভয়েস অডিট ও সংশোধন ইতিহাস"
                  >
                    <History className="w-3.5 h-3.5 mr-1" />
                    অডিট ইতিহাস
                  </button>
                  {selectedInvoice.due_amount > 0 && !selectedInvoice.is_voided && (
                    <button
                      onClick={() => {
                        setPaymentModalInv(selectedInvoice);
                        setCollectAmount(selectedInvoice.due_amount);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center shadow-2xs"
                    >
                      <Wallet className="w-3.5 h-3.5 mr-1" />
                      Collect Due
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button
                      onClick={() => {
                        setDeleteModalInv(selectedInvoice);
                        setDeletePermanentPurge(true);
                        setDeleteReasonInput("");
                      }}
                      className="px-2.5 py-1.5 border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs transition flex items-center shadow-2xs"
                      title="Delete Invoice (Super Admin Exclusive)"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Delete Bill
                    </button>
                  )}
                  {!selectedInvoice.is_voided && (
                    <button
                      onClick={() => handleVoidInvoice(selectedInvoice)}
                      className="p-2 border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-600 transition"
                      title="Void Invoice"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* ADVANCED COLORFUL HALF-LETTER INVOICE PREVIEW & PRINT SLIP */}
              <div className="pt-2">
                <HalfLetterInvoicePrint
                  invoiceNumber={selectedInvoice.invoice_number}
                  dateStr={`${formatDateBDT(selectedInvoice.created_at)}, ${formatTimeBDT(selectedInvoice.created_at)}`}
                  dueDateStr={formatDateBDT(selectedInvoice.created_at)}
                  cashierName="Cashier"
                  patient={{
                    name: selectedInvoice.patient?.full_name || "Patient",
                    patientCode: selectedInvoice.patient?.patient_code || "OH-P-WALKIN",
                    phone: selectedInvoice.patient?.phone,
                    address: selectedInvoice.patient?.address,
                    gender: selectedInvoice.patient?.gender,
                    age: formatPatientAgeDisplay(
                      selectedInvoice.patient?.age,
                      selectedInvoice.patient?.age_months,
                      selectedInvoice.patient?.age_days,
                      selectedInvoice.patient?.dob
                    ) || selectedInvoice.patient?.age,
                    bloodGroup: selectedInvoice.patient?.blood_group,
                  }}
                  items={(selectedInvoice.items || []).map((it) => ({
                    description: it.item_name,
                    serviceCategory: it.service_category || "General",
                    unitPrice: it.unit_price,
                    quantity: it.quantity,
                    totalAmount: it.total_price,
                  }))}
                  payments={(selectedInvoice.payments || []).map((p) => ({
                    receiptNumber: p.receipt_number,
                    paymentMethod: p.payment_method,
                    amount: p.amount,
                    paidAt: formatDateBDT(p.created_at),
                  }))}
                  subtotal={selectedInvoice.subtotal}
                  discount={selectedInvoice.discount_amount}
                  tax={selectedInvoice.tax_amount}
                  totalAmount={selectedInvoice.grand_total}
                  paidAmount={selectedInvoice.paid_amount}
                  dueAmount={selectedInvoice.due_amount}
                />
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs">
              Select an invoice from the ledger to view detailed receipts.
            </div>
          )}
        </div>
      </div>

      {/* GENERATE INVOICE MODAL */}
      {isCreatingNew && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 text-xs max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-black text-slate-900 mb-1">Generate Patient Invoice</h3>
            <p className="text-slate-500 mb-4">Add consultation, diagnostic, bed, or surgery charges.</p>

            <form onSubmit={handleCreateInvoice} className="space-y-4">
              {/* Patient Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>রোগী অনুসন্ধান ও নির্বাচন (Select Patient) *</span>
                  {selectedPatient && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatient(null);
                        setPatientIdInput("");
                        setPatientSearchQuery("");
                        setItems([]);
                        setUnbilledServicesCount(0);
                        setUnbilledServicesTotal(0);
                        checkAttributionForPatient("");
                      }}
                      className="text-[10px] text-rose-500 hover:underline font-semibold"
                    >
                      পরিবর্তন করুন (Change)
                    </button>
                  )}
                </label>

                {selectedPatient ? (
                  <div className="space-y-2">
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center justify-between text-xs shadow-xs">
                      <div>
                        <p className="font-black text-emerald-950 text-sm">{selectedPatient.full_name}</p>
                        <p className="text-[11px] text-emerald-800 font-mono mt-0.5">
                          কোড: {selectedPatient.patient_code || selectedPatient.registration_serial} • {selectedPatient.gender} • 📱 {selectedPatient.phone}
                        </p>
                        {selectedPatient.address && (
                          <p className="text-[11px] text-emerald-900 mt-0.5">
                            ঠিকানা: {selectedPatient.address}
                          </p>
                        )}
                        {((selectedPatient.age !== undefined && selectedPatient.age !== null) || selectedPatient.dob || selectedPatient.age_months || selectedPatient.age_days) && (
                          <p className="text-[11px] text-emerald-900">
                            বয়স: {formatPatientAgeDisplay(selectedPatient.age, selectedPatient.age_months, selectedPatient.age_days, selectedPatient.dob)} {selectedPatient.blood_group ? `• রক্ত: [${selectedPatient.blood_group}]` : ""}
                          </p>
                        )}
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px] flex items-center gap-1 shadow-xs">
                        <Check className="w-3.5 h-3.5" /> নির্বাচিত
                      </span>
                    </div>

                    {/* Mandatory Demographic Verification Block (Address & Pediatric/Adult Age) */}
                    {(!selectedPatient.address || (selectedPatient.age === null && selectedPatient.age === undefined && !selectedPatient.dob && !selectedPatient.age_months && !selectedPatient.age_days)) && (
                      <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-2">
                        <div className="flex items-center gap-1.5 text-amber-900 font-bold text-[11px]">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>বিলিংয়ের জন্য রোগীর পূর্ণাঙ্গ ঠিকানা ও বয়স আবশ্যক (Address & Detailed Age Required):</span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-700 block mb-0.5">ঠিকানা / গ্রাম / এলাকা *</label>
                            <input
                              type="text"
                              placeholder="ঠিকানা (গ্রাম/পোস্ট/থানা)..."
                              value={patientAddressInput}
                              onChange={(e) => setPatientAddressInput(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-lg bg-white"
                            />
                          </div>
                          <div>
                            <PediatricAgeInputGroup
                              dob={patientDobInput}
                              onDobChange={setPatientDobInput}
                              ageYears={patientAgeInput}
                              onAgeYearsChange={setPatientAgeInput}
                              ageMonths={patientAgeMonthsInput}
                              onAgeMonthsChange={setPatientAgeMonthsInput}
                              ageDays={patientAgeDaysInput}
                              onAgeDaysChange={setPatientAgeDaysInput}
                              variant="compact"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleSavePatientDemographics}
                            disabled={savingPatientDemographics}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold rounded-lg transition"
                          >
                            {savingPatientDemographics ? "সংরক্ষণ হচ্ছে..." : "প্রোফাইলে সংরক্ষণ করুন"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          placeholder="রোগীর কোড (OH-010104), নাম, মোবাইল, বা UUID দিয়ে খুঁজুন..."
                          value={patientSearchQuery}
                          onChange={(e) => setPatientSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void autoLookupAndSelectPatient(patientSearchQuery);
                            }
                          }}
                          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl bg-slate-50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void autoLookupAndSelectPatient(patientSearchQuery)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
                      >
                        খুঁজুন
                      </button>
                    </div>

                    {patientSearchNotice && (
                      <div role="alert" className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{patientSearchNotice}</span>
                      </div>
                    )}

                    {/* Patient search results dropdown */}
                    {loadingPatients ? (
                      <div className="p-3 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-1.5 shadow-lg">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                        <span>রোগী খোঁজা হচ্ছে...</span>
                      </div>
                    ) : searchedPatients.length > 0 ? (
                      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-xl">
                        {searchedPatients.map((pat) => (
                          <div
                            key={pat.id}
                            onClick={() => handleSelectPatient(pat)}
                            className="p-3 hover:bg-emerald-50 cursor-pointer flex items-center justify-between transition text-xs"
                          >
                            <div>
                              <p className="font-bold text-slate-900">{pat.full_name}</p>
                              <p className="text-[11px] text-slate-500 font-mono">
                                কোড: {pat.patient_code || pat.registration_serial} • 📱 {pat.phone}
                              </p>
                            </div>
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-bold hover:bg-emerald-600 hover:text-white transition">
                              নির্বাচন করুন
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Preset quick buttons & Comprehensive Hospital Service Catalog */}
              <div className="space-y-3 border-t border-slate-100 pt-3">
                {/* 🌟 389-Service Instant Search & Auto-Recommend Box */}
                <div className="relative p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border-2 border-emerald-300 rounded-2xl shadow-sm space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-emerald-600 text-white rounded-lg shadow-2xs">
                        <Search className="w-4 h-4" />
                      </span>
                      <div>
                        <span className="text-xs font-black text-emerald-950 block">
                          হাসপাতাল সেবা ও প্যাথলজি টেস্ট ক্যাটালগ — ইনস্ট্যান্ট সার্চ ({allServices.length}টি মোট সার্ভিস)
                        </span>
                        <span className="text-[10px] text-emerald-800">
                          যেকোনো কি-ওয়ার্ড লিখুন — নিমেষেই টেস্ট খুঁজে পেয়ে ১-ক্লিকে বিলে যোগ করুন
                        </span>
                      </div>
                    </div>
                    {serviceSearchTerm && (
                      <span className="text-[10px] font-bold text-emerald-900 bg-emerald-200/90 px-2 py-0.5 rounded-full">
                        {instantSearchResults.length}টি টেস্ট পাওয়া গেছে
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-emerald-600" />
                    <input
                      type="text"
                      placeholder="সার্ভিস বা টেস্টের নাম লিখুন (যেমন: CBC, USG, X-Ray, Blood, ECG, Cabin, OT, Urea)..."
                      value={serviceSearchTerm}
                      onChange={(e) => setServiceSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && instantSearchResults.length > 0) {
                          e.preventDefault();
                          const topMatch = instantSearchResults[0];
                          addItemRow(topMatch.category, topMatch.name, topMatch.price);
                          setToast({ message: `${topMatch.name} বিলে যুক্ত হয়েছে!`, type: "success" });
                        }
                      }}
                      className="w-full pl-9 pr-9 py-2 text-xs font-bold border-2 border-emerald-400 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-xs"
                    />
                    {serviceSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setServiceSearchTerm("")}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 transition"
                        title="সার্চ মুছুন"
                        aria-label="সার্চ মুছুন"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Live Recommendation Dropdown / Floating Results */}
                  {serviceSearchTerm.trim().length > 0 && (
                    <div className="max-h-56 overflow-y-auto border border-emerald-200 rounded-xl bg-white shadow-xl divide-y divide-slate-100 z-20">
                      {instantSearchResults.length > 0 ? (
                        instantSearchResults.slice(0, 15).map((srv) => {
                          const badge = getCategoryBadgeStyle(srv.category, srv.group);
                          const inBill = items.find(
                            (it) => it.itemName.trim().toLowerCase() === srv.name.trim().toLowerCase()
                          );
                          return (
                            <div
                              key={srv.id}
                              onClick={() => {
                                addItemRow(srv.category, srv.name, srv.price);
                                setToast({ message: `${srv.name} বিলে যুক্ত হয়েছে!`, type: "success" });
                              }}
                              className="p-2.5 hover:bg-emerald-50 cursor-pointer flex items-center justify-between transition gap-2 group"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded border ${badge.bg}`}>
                                    {badge.label}
                                  </span>
                                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900 truncate">
                                    {srv.name}
                                  </span>
                                  {inBill && (
                                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                      ✓ {inBill.quantity}x যুক্ত
                                    </span>
                                  )}
                                </div>
                                {srv.description && (
                                  <p className="text-[9.5px] text-slate-500 truncate mt-0.5">{srv.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-mono font-black text-emerald-800">
                                  {formatCurrencyBDT(srv.price)}
                                </span>
                                <button
                                  type="button"
                                  className="px-2.5 py-1 bg-emerald-600 group-hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 shadow-2xs"
                                >
                                  <Plus className="w-3 h-3" /> যোগ করুন
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-3 text-center text-xs text-slate-500">
                          &quot;{serviceSearchTerm}&quot; দিয়ে কোনো সার্ভিস বা টেস্ট পাওয়া যায়নি।
                        </div>
                      )}
                    </div>
                  )}

                  {/* Popular Service Quick Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] font-bold text-slate-500 mr-1">জনপ্রিয় টেস্ট:</span>
                    {[
                      { name: "CBC (Complete Blood Count)", cat: "LAB" as ServiceCategory, price: 400, label: "CBC (৳৪০০)" },
                      { name: "USG of Whole Abdomen", cat: "USG" as ServiceCategory, price: 1200, label: "USG Abdomen (৳১২০০)" },
                      { name: "Chest X-Ray P/A View", cat: "XRAY" as ServiceCategory, price: 500, label: "X-Ray Chest (৳৫০০)" },
                      { name: "Serum Creatinine", cat: "LAB" as ServiceCategory, price: 350, label: "Creatinine (৳৩৫০)" },
                      { name: "Blood Sugar Fasting", cat: "LAB" as ServiceCategory, price: 150, label: "Blood Sugar (৳১৫০)" },
                      { name: "ECG 12 Lead", cat: "LAB" as ServiceCategory, price: 300, label: "ECG (৳৩০০)" },
                      { name: "General Bed (Non-AC)", cat: "BED" as ServiceCategory, price: 800, label: "Bed (৳৮০০)" },
                      { name: "Single Cabin (AC)", cat: "CABIN" as ServiceCategory, price: 1500, label: "AC Cabin (৳১৫০০)" },
                    ].map((pill, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          addItemRow(pill.cat, pill.name, pill.price);
                          setToast({ message: `${pill.name} বিলে যুক্ত হয়েছে!`, type: "success" });
                        }}
                        className="px-2 py-0.5 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold text-emerald-900 transition flex items-center gap-0.5 shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5 text-emerald-600" />
                        {pill.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Consultation Doctor Fee Quick Adder */}
                <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl text-xs space-y-2">
                  <span className="font-bold text-sky-950 text-[11px] block">
                    🩺 ডাক্তার কনসালটেশন যোগ করুন (Consultation Doctor Fee):
                  </span>
                  <div className="flex gap-2">
                    <select
                      value={selectedDoctorId}
                      onChange={(e) => setSelectedDoctorId(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 border border-sky-300 rounded-lg bg-white text-xs"
                    >
                      <option value="">-- ডাক্তার নির্বাচন করুন --</option>
                      {doctorsList.map((doc) => {
                        const tariffFee = hospitalServiceTariffs.find((t) => t.category === "CONSULTATION" && t.is_active)?.price;
                        const fee = doc.opd_fee ?? doc.consultation_fee ?? tariffFee;
                        return (
                          <option key={doc.id} value={doc.id}>
                            {doc.full_name} ({doc.designation || doc.specialization}) — ফি: {fee ? `৳${fee}` : "ফি নির্ধারিত নেই"}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleAddDoctorConsultation(selectedDoctorId)}
                      disabled={!selectedDoctorId}
                      className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg text-xs transition disabled:opacity-50"
                    >
                      + যোগ করুন
                    </button>
                  </div>
                </div>

                {/* Pharmacy Medicine Itemization Quick Adder */}
                <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl text-xs space-y-2">
                  <span className="font-bold text-teal-950 text-[11px] block">
                    💊 ঔষধ আইটেম যোগ করুন (Pharmacy Medicine Itemization):
                  </span>
                  <div className="grid grid-cols-12 gap-2">
                    <input
                      type="text"
                      placeholder="ঔষধের নাম (Brand / Generic)"
                      value={medicineNameInput}
                      onChange={(e) => setMedicineNameInput(e.target.value)}
                      className="col-span-4 px-2.5 py-1.5 border border-teal-300 rounded-lg bg-white text-xs"
                    />
                    <select
                      value={medicineUnitInput}
                      onChange={(e) => setMedicineUnitInput(e.target.value)}
                      className="col-span-3 px-2 py-1.5 border border-teal-300 rounded-lg bg-white text-xs"
                    >
                      <option value="Tablet">Tablet (ট্যাবলেট)</option>
                      <option value="Capsule">Capsule (ক্যাপসুল)</option>
                      <option value="Syrup">Syrup (সিরাপ)</option>
                      <option value="Injection">Injection (ইনজেকশন)</option>
                      <option value="Vial">Vial (ভায়াল)</option>
                      <option value="Ampoule">Ampoule (অ্যাম্পুল)</option>
                      <option value="Strip">Strip (পাতা)</option>
                      <option value="Bottle">Bottle (বোতল)</option>
                      <option value="Ointment">Ointment (মলম)</option>
                      <option value="Suspension">Suspension</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      placeholder="পরিমাণ"
                      value={medicineQtyInput}
                      onChange={(e) => setMedicineQtyInput(Number(e.target.value))}
                      className="col-span-2 px-2 py-1.5 border border-teal-300 rounded-lg bg-white text-xs font-mono text-center"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="দর (৳)"
                      value={medicinePriceInput}
                      onChange={(e) => setMedicinePriceInput(e.target.value === "" ? "" : Number(e.target.value))}
                      className="col-span-2 px-2 py-1.5 border border-teal-300 rounded-lg bg-white text-xs font-mono text-right"
                    />
                    <button
                      type="button"
                      onClick={handleAddMedicineItem}
                      className="col-span-1 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg text-xs transition flex items-center justify-center"
                      title="ঔষধ যোগ করুন"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Category Filter Pills with 3D Left & Right Scroll Controls */}
                <div className="relative group/tabs flex items-center gap-1.5 p-1 rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 border border-slate-200/90 shadow-sm">
                  {/* Left Scroll Button */}
                  <button
                    type="button"
                    onClick={() => scrollCategoryTabs("left")}
                    disabled={!canScrollCategoryLeft}
                    className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 border ${
                      canScrollCategoryLeft
                        ? "bg-white text-emerald-800 border-slate-300 shadow-sm hover:bg-emerald-50 hover:border-emerald-400 hover:scale-105 active:scale-95 cursor-pointer"
                        : "bg-slate-100/60 text-slate-300 border-slate-200/50 cursor-not-allowed opacity-30"
                    }`}
                    title="বামে স্ক্রল করুন (Scroll Left)"
                    aria-label="বামে স্ক্রল করুন"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Scrollable Tabs Track with Wheel Intercept */}
                  <div
                    ref={categoryTabsRef}
                    onScroll={checkCategoryScroll}
                    onWheel={handleCategoryWheel}
                    className="flex-1 flex gap-1.5 py-0.5 text-[10px] font-bold"
                    style={{ overflowX: "auto", scrollBehavior: "smooth", scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    {[
                      { id: "ALL", label: "সকল সেবা", icon: "🧪" },
                      { id: "LAB", label: "ল্যাব ও প্যাথলজি টেস্ট", icon: "🔬" },
                      { id: "IMAGING", label: "রেডিওলজি ও ইমেজিং", icon: "🩻" },
                      { id: "CONSULTATION", label: "ডাক্তার কনসালটেশন", icon: "🩺" },
                      { id: "BED_CABIN", label: "বেড ও কেবিন (IPD)", icon: "🛏️" },
                      { id: "CRITICAL_CARE", label: "ICU / CCU / HDU", icon: "🏥" },
                      { id: "OT_SURGERY", label: "অপারেশন ও OT", icon: "🔪" },
                      { id: "EMERGENCY_NURSING", label: "ইমার্জেন্সি ও নার্সিং", icon: "🚑" },
                    ].map((grp) => {
                      const count = serviceGroupCounts[grp.id] || 0;
                      const isActive = serviceFilterGroup === grp.id;
                      return (
                        <button
                          key={grp.id}
                          type="button"
                          onClick={(e) => {
                            setServiceFilterGroup(grp.id);
                            (e.currentTarget as HTMLElement).scrollIntoView({
                              behavior: "smooth",
                              inline: "center",
                              block: "nearest",
                            });
                          }}
                          className={`px-3 py-1.5 rounded-xl shrink-0 transition-all duration-150 flex items-center gap-1.5 border ${
                            isActive
                              ? "bg-gradient-to-r from-emerald-700 to-emerald-800 text-white border-emerald-900 shadow-sm font-black scale-[1.02]"
                              : "bg-white hover:bg-slate-100/90 text-slate-700 border-slate-200/90 hover:border-slate-300 shadow-sm"
                          }`}
                        >
                          <span className="text-xs">{grp.icon}</span>
                          <span>{grp.label}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold ${
                              isActive
                                ? "bg-emerald-950/60 text-emerald-100 border border-emerald-600/40"
                                : "bg-slate-100 text-slate-600 border border-slate-200"
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Right Scroll Button */}
                  <button
                    type="button"
                    onClick={() => scrollCategoryTabs("right")}
                    disabled={!canScrollCategoryRight}
                    className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 border ${
                      canScrollCategoryRight
                        ? "bg-white text-emerald-800 border-slate-300 shadow-sm hover:bg-emerald-50 hover:border-emerald-400 hover:scale-105 active:scale-95 cursor-pointer"
                        : "bg-slate-100/60 text-slate-300 border-slate-200/50 cursor-not-allowed opacity-30"
                    }`}
                    title="ডানে স্ক্রল করুন (Scroll Right)"
                    aria-label="ডানে স্ক্রল করুন"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Service Cards Grid (Scrollable Quick Adder with 3D feel & smart badges) */}
                <div className="max-h-64 sm:max-h-72 overflow-y-auto pr-1 border border-slate-200/90 rounded-2xl p-2.5 bg-slate-50/70 shadow-inner">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {filteredServices.map((srv) => {
                      const badge = getCategoryBadgeStyle(srv.category, srv.group);
                      const inInvoiceCount = items.filter(
                        (it) => it.itemName.trim().toLowerCase() === srv.name.trim().toLowerCase()
                      ).length;

                      return (
                        <button
                          key={srv.id}
                          type="button"
                          onClick={() => addItemRow(srv.category, srv.name, srv.price)}
                          className="text-left p-2.5 rounded-xl bg-white border border-slate-200/90 hover:border-emerald-500 hover:bg-emerald-50/30 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-150 group flex flex-col justify-between gap-1.5 cursor-pointer"
                          title={srv.description || srv.name}
                        >
                          <div className="w-full flex items-start justify-between gap-1.5">
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border tracking-wider shrink-0 ${badge.bg}`}
                            >
                              {badge.label}
                            </span>
                            {inInvoiceCount > 0 && (
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200 flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5" /> {inInvoiceCount}টি
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 my-0.5">
                            <p className="text-[11px] font-bold text-slate-900 group-hover:text-emerald-950 line-clamp-2 leading-tight">
                              {srv.name}
                            </p>
                            {srv.description && (
                              <p className="text-[9px] text-slate-400 truncate mt-0.5">
                                {srv.description}
                              </p>
                            )}
                          </div>
                          <div className="w-full flex items-center justify-between border-t border-slate-100 pt-1 mt-0.5">
                            <span className="text-xs font-mono font-black text-emerald-700">
                              {formatCurrencyBDT(srv.price)}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 group-hover:text-emerald-700 flex items-center gap-0.5 transition">
                              <Plus className="w-3 h-3 group-hover:scale-125 transition" /> যোগ করুন
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    {filteredServices.length === 0 && (
                      <div className="col-span-full py-8 text-center text-slate-400 text-xs">
                        কোনো সার্ভিস বা টেস্ট পাওয়া যায়নি। অনুগ্রহ করে সার্চ ফিল্টার পরিবর্তন করুন।
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                {/* Unbilled Services Banner */}
                {loadingUnbilledServices && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-2 text-xs animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                    <span className="font-semibold">রোগীর অবিলকৃত সেবা (OPD / IPD / ICU / OT) স্বয়ংক্রিয়ভাবে অনুসন্ধান ও লোড করা হচ্ছে...</span>
                  </div>
                )}

                {!loadingUnbilledServices && unbilledServicesCount > 0 && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-xs">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-bold text-emerald-900">
                          {unbilledServicesCount}টি অবিলকৃত সেবা স্বয়ংক্রিয়ভাবে ইনভয়েসে যুক্ত হয়েছে
                        </span>
                        <span className="text-[11px] text-emerald-700 ml-1.5 font-mono">
                          (মোট: {formatCurrencyBDT(unbilledServicesTotal)})
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (patientIdInput.trim()) {
                            void loadUnbilledServicesForPatient(patientIdInput.trim());
                          }
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        পুনরায় লোড
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setItems([]);
                          setDetectedUnbilledLines([]);
                          setUnbilledServicesCount(0);
                          setUnbilledServicesTotal(0);
                          setInitialPaymentAmount(0);
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 transition"
                      >
                        মুছুন
                      </button>
                    </div>
                  </div>
                )}

                {!loadingUnbilledServices && selectedPatient && unbilledServicesCount === 0 && (
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 flex items-center gap-2 text-[11px]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>এই রোগীর কোনো অবিলকৃত ভর্তি বা সেবা বাকি নেই। ক্যাটালগ থেকে যেকোনো টেস্ট বা সেবা যোগ করতে পারেন।</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      ইনভয়েস আইটেম তালিকা (Invoice Line Items - {items.length}টি):
                    </span>
                    {/* Billing Encounter Type Selector (OPD vs IPD) */}
                    <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={() => handleToggleBillingEncounterType("OPD")}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                          billingEncounterType === "OPD"
                            ? "bg-white text-slate-800 shadow-2xs"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        OPD (বহির্বিভাগ)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleBillingEncounterType("IPD")}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                          billingEncounterType === "IPD"
                            ? "bg-purple-600 text-white shadow-2xs"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <span>🛏️ IPD (ভর্তি রোগী)</span>
                        <span className="text-[9px] bg-purple-800/40 px-1 rounded text-purple-100">+৩০০/৫০০</span>
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addItemRow("MISC", "Custom Medical Service", 100)}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    + নতুন কাস্টম আইটেম যোগ করুন
                  </button>
                </div>

                {billingEncounterType === "IPD" && (
                  <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Bed className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>
                        <strong className="font-bold">IPD ইনডোর মোড সক্রিয়:</strong> এককালীন ভর্তি ফি (৳৩০০) এবং দৈনিক সেবা চার্জ (৳৫০০/দিন) স্বয়ংক্রিয়ভাবে ইনভয়েসে যুক্ত হয়েছে। নিচে যে কোনো পরিমাণ বা দর পরিবর্তন করা যাবে।
                      </span>
                    </div>
                  </div>
                )}

                {/* Autocomplete Datalist */}
                <datalist id="all-hospital-services-datalist">
                  {allServices.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.category} • {formatCurrencyBDT(s.price)}
                    </option>
                  ))}
                </datalist>

                {items.length > 0 && (
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase px-2 py-1 bg-slate-100 rounded-lg">
                    <div className="col-span-2">ক্যাটাগরি</div>
                    <div className="col-span-4">সার্ভিস / টেস্টের নাম</div>
                    <div className="col-span-2 text-center">পরিমাণ (Qty)</div>
                    <div className="col-span-2 text-right">ইউনিট মূল্য (৳)</div>
                    <div className="col-span-2 text-right pr-6">মোট টাকা (৳)</div>
                  </div>
                )}

                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50/70 hover:bg-slate-50 p-1.5 rounded-xl border border-slate-200/80 transition">
                    <div className="col-span-2">
                      <select
                        value={it.category}
                        onChange={(e) => {
                          const val = e.target.value as InvoiceItemRecord["service_category"];
                          let next = [...items];
                          next[idx].category = val;
                          if (val === "BED" || val === "CABIN") {
                            setBillingEncounterType("IPD");
                            next = injectIpdAdmissionCharges(next);
                          }
                          setItems(next);

                        }}
                        className="w-full px-2 py-1.5 border rounded-lg bg-white font-semibold text-[11px]"
                      >
                        <option value="CONSULTATION">Consultation</option>
                        <option value="LAB">Lab</option>
                        <option value="XRAY">X-Ray</option>
                        <option value="USG">USG</option>
                        <option value="BED">Bed</option>
                        <option value="CABIN">Cabin</option>
                        <option value="OT">OT</option>
                        <option value="PHARMACY">Pharmacy</option>
                        <option value="AMBULANCE">Ambulance</option>
                        <option value="MISC">Misc</option>
                      </select>
                    </div>

                    <div className="col-span-4">
                      <input
                        type="text"
                        list="all-hospital-services-datalist"
                        required
                        placeholder="সার্ভিস বা টেস্টের নাম"
                        value={it.itemName}
                        onChange={(e) => {
                          const val = e.target.value;
                          let next = [...items];
                          const matched = allServices.find((s) => s.name.toLowerCase() === val.toLowerCase());
                          if (matched) {
                            next[idx] = {
                              ...next[idx],
                              itemName: matched.name,
                              category: toDbInvoiceCategory(matched.category),
                              unitPrice: matched.price,
                            };
                            if (
                              next[idx].category === "BED" ||
                              next[idx].category === "CABIN" ||
                              /bed|cabin|ward|icu|ccu|hdu|nicu|picu|ipd|ভর্তি|কেবিন|বেড|ওয়ার্ড/i.test(matched.name)
                            ) {
                              setBillingEncounterType("IPD");
                              next = injectIpdAdmissionCharges(next);
                            }
                          } else {
                            next[idx].itemName = val;
                            if (/bed|cabin|ward|icu|ccu|hdu|nicu|picu|ipd|ভর্তি|কেবিন|বেড|ওয়ার্ড/i.test(val)) {
                              setBillingEncounterType("IPD");
                              next = injectIpdAdmissionCharges(next);
                            }
                          }
                          setItems(next);

                        }}
                        className="w-full px-2.5 py-1.5 border rounded-lg bg-white font-semibold text-[11px]"
                      />
                    </div>

                    <div className="col-span-2">
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="Qty"
                        value={it.quantity}
                        onChange={(e) => {
                          const next = [...items];
                          const rawVal = e.target.value;
                          next[idx].quantity = rawVal === "" ? 0 : Number(rawVal);
                          setItems(next);

                        }}
                        className="w-full px-2 py-1.5 border rounded-lg bg-white font-mono text-center text-[11px] font-bold text-sky-900"
                        title="পরিমাণ (Quantity) - পরিবর্তন করলে স্বয়ংক্রিয় গুণফল হিসাব হবে"
                      />
                    </div>

                    <div className="col-span-2">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Rate"
                        value={it.unitPrice}
                        onChange={(e) => {
                          const next = [...items];
                          const rawVal = e.target.value;
                          next[idx].unitPrice = rawVal === "" ? 0 : Number(rawVal);
                          setItems(next);

                        }}
                        className="w-full px-2 py-1.5 border rounded-lg bg-white font-mono text-right text-[11px]"
                        title="প্রতি ইউনিটের মূল্য (Unit Price)"
                      />
                    </div>

                    <div className="col-span-2 flex items-center gap-1.5">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Total"
                        value={Math.round((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0) * 100) / 100}
                        onChange={(e) => {
                          const lineTotal = Number(e.target.value) || 0;
                          const next = [...items];
                          const curQty = Number(next[idx].quantity) || 1;
                          next[idx].unitPrice = curQty > 0 ? Math.round((lineTotal / curQty) * 100) / 100 : lineTotal;
                          setItems(next);

                        }}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-emerald-300 rounded-lg bg-emerald-50/70 font-mono text-right text-[11px] font-black text-emerald-800"
                        title="মোট মূল্য (Qty * Unit Rate) - সরাসরি টাইপ করেও পরিবর্তনযোগ্য"
                      />
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition shrink-0"
                        title="আইটেমটি বাদ দিন"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {items.length === 0 && (
                  <div className="p-4 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-400 text-xs">
                    <p className="font-semibold text-slate-600 mb-0.5">কোনো আইটেম যোগ করা হয়নি</p>
                    <p className="text-[10px]">উপরে ক্যাটালগ থেকে টেস্ট/সার্ভিস ক্লিক করুন অথবা &quot;+ নতুন কাস্টম আইটেম যোগ করুন&quot; চাপুন।</p>
                  </div>
                )}
              </div>

              {/* Totals & Initial Settlement */}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                <div className="space-y-2">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <label className="block font-bold text-slate-800 text-[11px] flex items-center justify-between">
                      <span>১. রোগীর ছাড় / কমিশন (Patient Concession / Discount)</span>
                      <span className="text-[10px] text-slate-400">শতকরা বা নির্দিষ্ট টাকা</span>
                    </label>

                    {/* Dual Mode Switcher */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountMode("PERCENT");
                          let targetVal: number | "" = discountPercent;
                          if (targetVal === "" && discountFixed !== "") {
                            const num = Number(discountFixed);
                            if (num > 0 && num <= 60) {
                              targetVal = num;
                              setDiscountPercent(num);
                            }
                          }
                          const disc = targetVal !== "" && Number(targetVal) > 0 && Number(targetVal) <= 60
                            ? Math.round((subtotal * Number(targetVal)) / 100)
                            : 0;
                          setInitialPaymentAmount(Math.max(0, subtotal - disc));
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                          discountMode === "PERCENT"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-white border text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        % শতকরা ছাড়
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountMode("FIXED");
                          let targetVal: number | "" = discountFixed;
                          if (targetVal === "" && discountPercent !== "") {
                            targetVal = Number(discountPercent);
                            setDiscountFixed(targetVal);
                          }
                          const disc = targetVal !== "" && Number(targetVal) > 0
                            ? Math.min(subtotal, Number(targetVal))
                            : 0;
                          setInitialPaymentAmount(Math.max(0, subtotal - disc));
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                          discountMode === "FIXED"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-white border text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        ৳ নির্দিষ্ট টাকা
                      </button>
                    </div>

                    <div className="relative">
                      {discountMode === "PERCENT" ? (
                        <>
                          <input
                            type="number"
                            min="0"
                            max="60"
                            step="0.5"
                            placeholder="৫% - ৬০%"
                            value={discountPercent}
                            onChange={(e) => {
                              const rawVal = e.target.value === "" ? "" : Number(e.target.value);
                              setDiscountPercent(rawVal);
                              const num = Number(rawVal);
                              const disc = rawVal !== "" && num > 0 && num <= 60
                                ? Math.round((subtotal * num) / 100)
                                : 0;
                              setInitialPaymentAmount(Math.max(0, subtotal - disc));
                            }}
                            className="w-full px-3 py-1.5 border rounded-xl bg-white font-mono font-bold pr-8 text-xs"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs pointer-events-none">
                            %
                          </span>
                        </>
                      ) : (
                        <>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            placeholder="ছাড়ের নির্দিষ্ট পরিমাণ (৳) যেমন: ২০০ বা ৫০০"
                            value={discountFixed}
                            onChange={(e) => {
                              const rawVal = e.target.value === "" ? "" : Number(e.target.value);
                              setDiscountFixed(rawVal);
                              const num = Number(rawVal);
                              const disc = rawVal !== "" && num > 0 ? Math.min(subtotal, num) : 0;
                              setInitialPaymentAmount(Math.max(0, subtotal - disc));
                            }}
                            className="w-full px-3 py-1.5 border rounded-xl bg-white font-mono font-bold pr-8 text-xs"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs pointer-events-none">
                            ৳
                          </span>
                        </>
                      )}
                    </div>

                    {discountMode === "PERCENT" && discountPercent !== "" && Number(discountPercent) > 0 && (
                      <div className="mt-1 text-[11px]">
                        {Number(discountPercent) > 60 ? (
                          <div className="p-2 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 space-y-1">
                            <div className="font-bold text-amber-800">
                              ⚠️ অনুমোদিত ডিসকাউন্ট শতকরা সীমা ৫% থেকে ৬০%। আপনি {discountPercent}% লিখেছেন।
                            </div>
                            <div className="text-[11px] text-amber-700">
                              আপনি কি <strong>৳ {discountPercent} টাকা নির্দিষ্ট ছাড়</strong> দিতে চান?
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const val = Number(discountPercent);
                                setDiscountMode("FIXED");
                                setDiscountFixed(val);
                                setDiscountPercent("");
                                const disc = Math.min(subtotal, val);
                                setInitialPaymentAmount(Math.max(0, subtotal - disc));
                              }}
                              className="mt-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[11px] cursor-pointer inline-flex items-center gap-1 shadow-xs transition"
                            >
                              ৳ {discountPercent} নির্দিষ্ট টাকায় পরিবর্তন করুন
                            </button>
                          </div>
                        ) : Number(discountPercent) < 5 ? (
                          <span className="text-amber-600 font-bold">
                            ⚠️ অনুমোদিত ডিসকাউন্ট শতকরা সীমা ৫% থেকে ৬০%
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-bold">
                            রোগীর ছাড়: {formatCurrencyBDT(calculatedDiscountAmount)} BDT ({discountPercent}% of Subtotal {formatCurrencyBDT(subtotal)})
                          </span>
                        )}
                      </div>
                    )}

                    {discountMode === "FIXED" && discountFixed !== "" && Number(discountFixed) > 0 && (
                      <div className="mt-1 text-[11px]">
                        {Number(discountFixed) > subtotal ? (
                          <span className="text-rose-600 font-bold">
                            ⚠️ নির্দিষ্ট ডিসকাউন্ট মোট বিল ({formatCurrencyBDT(subtotal)})-এর চেয়ে বেশি হতে পারবে না।
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-bold">
                            রোগীর ছাড়: {formatCurrencyBDT(calculatedDiscountAmount)} BDT (নির্দিষ্ট ছাড়)
                          </span>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">ছাড় / কমিশনের কারণ (Reason / Authority)</label>
                      <input
                        type="text"
                        placeholder="e.g. Director waiver / Poor patient subsidy"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        className="w-full px-2.5 py-1 border rounded-lg bg-white text-xs"
                      />
                    </div>
                  </div>
                </div>


                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-700">Initial Payment (BDT)</label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => { setInitialPaymentMode("FULL"); setInitialPaymentAmount(netTotal); }}
                          className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded cursor-pointer transition"
                          title="সম্পূর্ণ টাকা পরিশোধ হিসেবে সেট করুন"
                        >
                          সম্পূর্ণ (Full)
                        </button>
                        <button
                          type="button"
                          onClick={() => { setInitialPaymentMode("DUE"); setInitialPaymentAmount(0); }}
                          className="text-[10px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-1.5 py-0.5 rounded cursor-pointer transition"
                          title="বকেয়া হিসেবে শূন্য টাকা সেট করুন"
                        >
                          বকেয়া (Due)
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={netTotal}
                      step="0.01"
                      value={initialPaymentAmount}
                      onChange={(e) => { setInitialPaymentMode("CUSTOM"); setInitialPaymentAmount(Number(e.target.value)); }}
                      className="w-full px-3 py-1.5 border rounded-xl bg-slate-50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentRecord["payment_method"])}
                      className="w-full px-3 py-1.5 border rounded-xl bg-slate-50 font-semibold"
                    >
                      <option value="CASH">Cash Counter</option>
                      <option value="BKASH">bKash Merchant</option>
                      <option value="NAGAD">Nagad</option>
                      <option value="ROCKET">Rocket</option>
                      <option value="VISA">Visa / Mastercard</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* REFERRAL ATTRIBUTION & PARTNER SELECTION */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    ২. রেফারেল এজেন্ট (Referral Partner / Agent)
                  </span>
                  {checkingAttribution ? (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                      রেফারেন্স যাচাই হচ্ছে...
                    </span>
                  ) : isAttributionSuggested ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      ✓ {attributionSource === "ADMISSION" ? "ভর্তি থেকে স্বয়ংক্রিয় প্রাপ্ত" : "রেজিস্ট্রেশন থেকে প্রাপ্ত"}
                      {attributionAgentName ? `: ${attributionAgentName}` : ""}
                      {attributionAgentCode ? ` (${attributionAgentCode})` : ""}
                    </span>
                  ) : null}
                </div>

                {/* Reference Partner Selector Combobox & Quick Add */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-700 flex items-center gap-1">
                      <span>রেফারেন্স পার্টনার / এজেন্ট (Referral Partner)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddName(referralSearchQuery.trim());
                        setQuickAddError(null);
                        setShowQuickAddReferralModal(true);
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg transition cursor-pointer"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>+ নতুন পার্টনার</span>
                    </button>
                  </div>

                  {selectedReferralAgent ? (
                    /* Selected Referral Partner Card */
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                          {selectedReferralAgent.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-extrabold text-emerald-950 truncate">
                              {selectedReferralAgent.full_name}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-white text-emerald-800 border border-emerald-300">
                              {selectedReferralAgent.agent_code}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-200 text-emerald-900">
                              {selectedReferralAgent.agent_type}
                            </span>
                          </div>
                          <div className="text-[10px] text-emerald-700 flex items-center gap-2 mt-0.5 font-medium">
                            {selectedReferralAgent.phone && <span>📞 {selectedReferralAgent.phone}</span>}
                            <span>কমিশন: {referralCommissionRate}%</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleReferralAgentChange("")}
                        className="text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg border border-transparent hover:border-rose-200 font-bold transition shrink-0 ml-2 cursor-pointer"
                        title="রেফারেন্স বাদ দিন / পরিবর্তন করুন"
                      >
                        ✕ পরিবর্তন
                      </button>
                    </div>
                  ) : (
                    /* Searchable Suggestion Input */
                    <div className="relative">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={referralSearchQuery}
                          onChange={(e) => {
                            setReferralSearchQuery(e.target.value);
                            setIsReferralDropdownOpen(true);
                          }}
                          onFocus={() => setIsReferralDropdownOpen(true)}
                          placeholder="নাম, কোড বা ফোন দিয়ে খুঁজুন... (Search referral partner)"
                          className="w-full pl-8 pr-8 py-2 border border-slate-200 rounded-xl bg-white text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                        />
                        <button
                          type="button"
                          onClick={() => setIsReferralDropdownOpen(!isReferralDropdownOpen)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Dropdown Suggestions List */}
                      {isReferralDropdownOpen && (
                        <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl divide-y divide-slate-100">
                          {/* Option to clear / direct */}
                          <div
                            onClick={() => {
                              handleReferralAgentChange("");
                              setIsReferralDropdownOpen(false);
                            }}
                            className="p-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs text-slate-600"
                          >
                            <span className="font-semibold text-slate-700">কোনো রেফারেন্স নেই (Direct / No Referral)</span>
                            <span className="text-[10px] text-slate-400">০% কমিশন</span>
                          </div>

                          {filteredReferralAgents.map((ag) => (
                            <div
                              key={ag.id}
                              onClick={() => {
                                handleReferralAgentChange(ag.id);
                                setIsReferralDropdownOpen(false);
                              }}
                              className="p-2.5 hover:bg-emerald-50/80 cursor-pointer transition flex items-center justify-between text-xs"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-800">{ag.full_name}</span>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    {ag.agent_code}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-800">
                                    {ag.agent_type}
                                  </span>
                                </div>
                                {ag.phone && (
                                  <div className="text-[10px] text-slate-500 mt-0.5">📞 {ag.phone}</div>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  {ag.commission_rate_percent}%
                                </span>
                              </div>
                            </div>
                          ))}

                          {filteredReferralAgents.length === 0 && (
                            <div className="p-3 text-center text-xs text-slate-500">
                              <p className="mb-2">কোনো রেফারেন্স পার্টনার পাওয়া যায়নি</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setQuickAddName(referralSearchQuery.trim());
                                  setQuickAddError(null);
                                  setShowQuickAddReferralModal(true);
                                  setIsReferralDropdownOpen(false);
                                }}
                                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-lg transition cursor-pointer"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>&quot;{referralSearchQuery}&quot; দিয়ে নতুন পার্টনার যুক্ত করুন</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>


              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>মোট বিল (Subtotal):</span>
                  <span className="font-bold text-slate-900">{formatCurrencyBDT(subtotal)}</span>
                </div>
                {calculatedDiscountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>রোগীর ছাড় ({discountMode === "PERCENT" ? `${discountPercent}%` : "নির্দিষ্ট"} Discount):</span>
                    <span className="font-bold">-{formatCurrencyBDT(calculatedDiscountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-slate-200 pt-1.5 font-bold">
                  <span>Grand Total: {formatCurrencyBDT(netTotal)}</span>
                  <span className="text-rose-600">Remaining Due: {formatCurrencyBDT(dueAmount)}</span>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl disabled:opacity-50 flex items-center"
                >
                  {formLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Confirm & Issue Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COLLECT PAYMENT MODAL */}
      {paymentModalInv && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-xs">
            <h3 className="text-base font-black text-slate-900 mb-1">Collect Due Payment</h3>
            <p className="text-slate-500 mb-4">
              Invoice: <strong>{paymentModalInv.invoice_number}</strong> • Total Due:{" "}
              <strong className="text-rose-600">{formatCurrencyBDT(paymentModalInv.due_amount)}</strong>
            </p>

            <form onSubmit={handleCollectPayment} className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-slate-700">Collect Amount (BDT) *</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCollectAmount(paymentModalInv.due_amount)}
                      className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-md text-[10px] font-bold transition"
                    >
                      Full Due (৳{paymentModalInv.due_amount})
                    </button>
                    {paymentModalInv.due_amount > 100 && (
                      <button
                        type="button"
                        onClick={() => setCollectAmount(Math.round(paymentModalInv.due_amount / 2))}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold transition"
                      >
                        50% (৳{Math.round(paymentModalInv.due_amount / 2)})
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="number"
                  min="1"
                  max={paymentModalInv.due_amount}
                  required
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono font-bold text-slate-900"
                />

                {/* Real-time Seal indicator */}
                <div className="mt-2 p-2 rounded-xl text-[11px] font-medium border transition">
                  {collectAmount >= paymentModalInv.due_amount ? (
                    <div className="text-emerald-800 bg-emerald-50 border border-emerald-200 p-2 rounded-lg flex items-center space-x-1.5">
                      <span className="font-black text-xs">★ PAID SEAL:</span>
                      <span>This payment completes full settlement. The invoice will be stamped with <strong>PAID / পরিশোধিত</strong>.</span>
                    </div>
                  ) : (
                    <div className="text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded-lg flex items-center space-x-1.5">
                      <span className="font-black text-xs">⚠ DUE SEAL:</span>
                      <span>Remaining balance: <strong>{formatCurrencyBDT(paymentModalInv.due_amount - collectAmount)}</strong>. The invoice will retain a <strong>DUE / বকেয়া</strong> seal.</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value as PaymentRecord["payment_method"])}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                >
                  <option value="CASH">Cash Counter</option>
                  <option value="BKASH">bKash Merchant</option>
                  <option value="NAGAD">Nagad</option>
                  <option value="ROCKET">Rocket</option>
                  <option value="VISA">Visa / Mastercard</option>
                  <option value="SSLCOMMERZ">SSLCommerz (Cards & Net Banking)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Transaction ID</label>
                <input
                  type="text"
                  placeholder="e.g. TrxID / Counter note"
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPaymentModalInv(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collectLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-50 flex items-center"
                >
                  {collectLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Confirm Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID INVOICE MODAL */}
      {voidModalInv && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-black text-slate-900">Void Invoice (Audit Vault)</h3>
              </div>
              <button
                onClick={() => setVoidModalInv(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmVoid} className="space-y-4 pt-4 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
                <p className="font-bold">Warning: Irreversible Financial Action</p>
                <p className="mt-1 text-[11px] leading-relaxed">
                  Voiding invoice <span className="font-mono font-bold">{voidModalInv.invoice_number}</span> will cancel all remaining due balance and record a forensic audit trail with your supervisor ID and timestamp.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mandatory Clinical / Administrative Justification <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Enter detailed reason for voiding (e.g. Duplicate entry by counter staff, patient transferred to tertiary facility)..."
                  value={voidReasonInput}
                  onChange={(e) => setVoidReasonInput(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-xs focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setVoidModalInv(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voidLoading || voidReasonInput.trim().length < 5}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center shadow-xs"
                >
                  {voidLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Confirm Void & Record Audit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HALF-LETTER PRINT PREVIEW MODAL */}
      {halfLetterPrintInv && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto print:p-0 print:bg-white print:static">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden print:border-none print:shadow-none print:max-w-none print:w-full">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900">
                  Half-Letter (5.5″ × 8.5″) Invoice Slip — {halfLetterPrintInv.invoice_number}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition flex items-center shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Print Slip
                </button>
                <button
                  type="button"
                  onClick={() => setHalfLetterPrintInv(null)}
                  className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition cursor-pointer"
                  title="Close Preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-x-auto max-h-[80vh] print:max-h-none print:p-0">
              <HalfLetterInvoicePrint
                invoiceNumber={halfLetterPrintInv.invoice_number}
                dateStr={`${formatDateBDT(halfLetterPrintInv.created_at)}, ${formatTimeBDT(halfLetterPrintInv.created_at)}`}
                dueDateStr={formatDateBDT(halfLetterPrintInv.created_at)}
                cashierName="Cashier"
                patient={{
                  name: halfLetterPrintInv.patient?.full_name || "Patient",
                  patientCode: halfLetterPrintInv.patient?.patient_code || "OH-P-WALKIN",
                  phone: halfLetterPrintInv.patient?.phone,
                  address: halfLetterPrintInv.patient?.address,
                  gender: halfLetterPrintInv.patient?.gender,
                  age: formatPatientAgeDisplay(
                    halfLetterPrintInv.patient?.age,
                    halfLetterPrintInv.patient?.age_months,
                    halfLetterPrintInv.patient?.age_days,
                    halfLetterPrintInv.patient?.dob
                  ) || halfLetterPrintInv.patient?.age,
                  bloodGroup: halfLetterPrintInv.patient?.blood_group,
                }}
                items={(halfLetterPrintInv.items || []).map((it) => ({
                  description: it.item_name,
                  serviceCategory: it.service_category || "General",
                  unitPrice: it.unit_price,
                  quantity: it.quantity,
                  totalAmount: it.total_price,
                }))}
                payments={(halfLetterPrintInv.payments || []).map((p) => ({
                  receiptNumber: p.receipt_number,
                  paymentMethod: p.payment_method,
                  amount: p.amount,
                  paidAt: formatDateBDT(p.created_at || new Date().toISOString()),
                }))}
                subtotal={halfLetterPrintInv.subtotal}
                discount={halfLetterPrintInv.discount_amount}
                discountReason={halfLetterPrintInv.discount_reason || undefined}
                tax={halfLetterPrintInv.tax_amount}
                totalAmount={halfLetterPrintInv.grand_total}
                paidAmount={halfLetterPrintInv.paid_amount}
                dueAmount={halfLetterPrintInv.due_amount}
              />
            </div>
          </div>
        </div>
      )}

      {/* INVOICE EDIT HISTORY MODAL */}
      {historyModalInv && (
        <InvoiceEditHistoryModal
          isOpen={!!historyModalInv}
          invoiceId={historyModalInv.id}
          invoiceNumber={historyModalInv.invoice_number}
          patientName={historyModalInv.patient?.full_name}
          onClose={() => setHistoryModalInv(null)}
        />
      )}

      {/* EDIT INVOICE MODAL */}
      {editModalInv && canEditBills && (
        <EditInvoiceModal
          isOpen={!!editModalInv}
          invoice={editModalInv}
          onClose={() => setEditModalInv(null)}
          onSuccess={async () => {
            setEditModalInv(null);
            await loadBillingData();
            setToast({
              message: "ইনভয়েস বিল সফলভাবে পরিমার্জন ও আপডেট করা হয়েছে (Bill Updated Successfully)",
              type: "success",
            });
          }}
        />
      )}

      {/* SUPER ADMIN ONLY DELETE INVOICE CONFIRMATION MODAL */}
      {deleteModalInv && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full border border-rose-200 shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    Super Admin Exclusive
                  </span>
                  <h3 className="text-base font-black text-slate-900 mt-0.5">Delete Billing Invoice</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalInv(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Selection Cards */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                মুছে ফেলার মোড নির্বাচন করুন (Select Action Mode)
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setDeletePermanentPurge(true)}
                  className={`p-3 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
                    deletePermanentPurge
                      ? "bg-rose-50/80 border-rose-300 ring-2 ring-rose-500/20 text-rose-950"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100/70"
                  }`}
                >
                  <div className={`p-1.5 rounded-xl shrink-0 mt-0.5 ${deletePermanentPurge ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black flex items-center gap-1.5">
                      <span>স্থায়ীভাবে সম্পূর্ণ ডিলিট ও হিস্ট্রি রিমুভ</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 bg-rose-200/70 text-rose-800 rounded font-bold">Hard Delete</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      বিল #{deleteModalInv.invoice_number}, সমস্ত আইটেম এবং পেমেন্ট ট্রানজ্যাকশন ডাটাবেজ থেকে চিরতরে মুছে যাবে। লেজারে আর কোনো চিহ্ন থাকবে না।
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDeletePermanentPurge(false)}
                  className={`p-3 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
                    !deletePermanentPurge
                      ? "bg-amber-50/80 border-amber-300 ring-2 ring-amber-500/20 text-amber-950"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100/70"
                  }`}
                >
                  <div className={`p-1.5 rounded-xl shrink-0 mt-0.5 ${!deletePermanentPurge ? "bg-amber-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                    <Ban className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black flex items-center gap-1.5">
                      <span>নিরাপদ বাতিল (Safe Void)</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 bg-amber-200/70 text-amber-800 rounded font-bold">Soft Delete</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      বিলটি VOID হিসেবে চিহ্নিত থাকবে কিন্তু অডিট রেকর্ডে থেকে যাবে।
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {deletePermanentPurge && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-[11px] text-rose-900 leading-relaxed font-medium">
                ⚠️ <strong>স্থায়ী ডিলিট সতর্কতা:</strong> এই অপারেশনটি অপরিবর্তনীয় (irreversible)। বিলের সমস্ত পেমেন্ট ও অডিট হিস্ট্রি ডাটাবেজ থেকে চিরতরে নিশ্চিহ্ন হয়ে যাবে।
              </div>
            )}

            <form onSubmit={handleConfirmDeleteInvoice} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  মুছে ফেলার কারণ বা সুপার অ্যাডমিন অডিট নোট (Reason / Audit Note)
                </label>
                <textarea
                  required
                  rows={2}
                  value={deleteReasonInput}
                  onChange={(e) => setDeleteReasonInput(e.target.value)}
                  placeholder="যেমন: ভুল এন্ট্রি, টেস্ট বিল ক্লিয়ারেন্স, ডুপ্লিকেট ইনভয়েস সংশোধন..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalInv(null)}
                  disabled={deleteLoading}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleteLoading}
                  className={`px-4 py-2 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                    deletePermanentPurge
                      ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                      : "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                  }`}
                >
                  {deleteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {deletePermanentPurge ? "Confirm Permanent Delete & Wipe" : "Confirm Safe Void"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Referral Partner Modal */}
      {showQuickAddReferralModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">নতুন রেফারেন্স পার্টনার নিবন্ধন</h3>
                  <p className="text-[11px] text-slate-500">বিলিং সময় তাৎক্ষণিক পার্টনার যুক্ত ও সিলেক্ট করুন</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowQuickAddReferralModal(false);
                  setQuickAddError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {quickAddError && (
              <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{quickAddError}</span>
              </div>
            )}

            <form onSubmit={handleSaveQuickAddReferral} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  পার্টনারের পূর্ণ নাম <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder="যেমন: ডাঃ রফিকুল ইসলাম / ব্রাদার করিম"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    পার্টনারের ধরন <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={quickAddType}
                    onChange={(e) => setQuickAddType(e.target.value as "DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF")}
                    className="w-full px-2.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="COMMUNITY_PC">কমিউনিটি পিসি (Community PC)</option>
                    <option value="DOCTOR">রেফারিং ডাক্তার (Doctor)</option>
                    <option value="ORGANIZATION">প্রতিষ্ঠান (Organization)</option>
                    <option value="STAFF">হসপিটাল স্টাফ (Staff)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    মোবাইল নম্বর <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={quickAddPhone}
                    onChange={(e) => setQuickAddPhone(e.target.value)}
                    placeholder="017xxxxxxxx"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  কমিশন হার % (Commission Rate)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="40"
                    step="0.5"
                    value={quickAddCommissionRate}
                    onChange={(e) => setQuickAddCommissionRate(Number(e.target.value))}
                    className="w-28 px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-slate-500 font-bold">% (১% থেকে ৪০% এর মধ্যে)</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={savingQuickAddAgent}
                  onClick={() => {
                    setShowQuickAddReferralModal(false);
                    setQuickAddError(null);
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={savingQuickAddAgent}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {savingQuickAddAgent && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>সংরক্ষণ ও সিলেক্ট করুন</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default function BillingManagementPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-slate-600 font-bold text-sm bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span>বিলিং ড্যাশবোর্ড লোড হচ্ছে... (Loading Billing Dashboard)</span>
          </div>
        </div>
      }
    >
      <BillingManagementContent />
    </Suspense>
  );
}
