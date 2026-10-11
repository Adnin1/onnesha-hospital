"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";

export interface WelfareFund {
  id: string;
  organization_id: string;
  fund_name: string;
  donor_sponsor: string | null;
  total_allocated: number;
  total_disbursed: number;
  is_active: boolean;
  created_at?: string;
}

export interface ScholarshipApplication {
  id: string;
  organization_id?: string;
  application_number: string;
  patient_id: string;
  fund_id: string;
  requested_amount: number;
  approved_amount: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "DISBURSED";
  created_at: string;
  patients?: {
    full_name: string;
    patient_code: string;
    phone?: string;
  };
  welfare_funds?: {
    fund_name: string;
    donor_sponsor: string | null;
  };
}

const DEFAULT_FUNDS = [
  {
    fund_name: "General Patient Welfare Zakat Fund (সাধারণ যাকাত কল্যাণ তহবিল)",
    donor_sponsor: "Hospital Charity Trust",
    total_allocated: 500000,
    total_disbursed: 0,
  },
  {
    fund_name: "Emergency Poor Patient Relief Fund (জরুরি দরিদ্র রোগী সহায়তা তহবিল)",
    donor_sponsor: "Community Health Benefactors",
    total_allocated: 300000,
    total_disbursed: 0,
  },
  {
    fund_name: "Maternal & Child Healthcare Subsidy (মাতৃ ও শিশু স্বাস্থ্য অনুদান)",
    donor_sponsor: "Maternal Health Philanthropy",
    total_allocated: 200000,
    total_disbursed: 0,
  },
];

/**
 * 1. Fetch Welfare Funds (Auto-bootstraps defaults if empty)
 */
export async function getWelfareFundsAction(): Promise<{
  success: boolean;
  data?: WelfareFund[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("welfare_funds")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      const toInsert = DEFAULT_FUNDS.map((f) => ({
        organization_id: session.organizationId,
        fund_name: f.fund_name,
        donor_sponsor: f.donor_sponsor,
        total_allocated: f.total_allocated,
        total_disbursed: 0,
        is_active: true,
      }));

      const { data: inserted, error: insertErr } = await supabase
        .from("welfare_funds")
        .insert(toInsert)
        .select("*");

      if (!insertErr && inserted) {
        return { success: true, data: inserted as WelfareFund[] };
      }
    }

    return { success: true, data: (data as WelfareFund[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load welfare funds";
    return { success: false, error: msg };
  }
}

/**
 * 2. Create Custom Welfare Fund
 */
export async function createWelfareFundAction(payload: {
  fund_name: string;
  donor_sponsor?: string;
  total_allocated: number;
}): Promise<{
  success: boolean;
  data?: WelfareFund;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    if (!payload.fund_name.trim()) {
      return { success: false, error: "Fund name is required." };
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("welfare_funds")
      .insert({
        organization_id: session.organizationId,
        fund_name: payload.fund_name.trim(),
        donor_sponsor: payload.donor_sponsor?.trim() || null,
        total_allocated: Math.max(0, payload.total_allocated),
        total_disbursed: 0,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) throw error;
    return { success: true, data: data as WelfareFund };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create welfare fund";
    return { success: false, error: msg };
  }
}

/**
 * 3. Fetch Scholarship & Welfare Applications
 */
export async function getScholarshipApplicationsAction(): Promise<{
  success: boolean;
  data?: ScholarshipApplication[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("scholarship_applications")
      .select(`
        *,
        patients (full_name, patient_code, phone),
        welfare_funds (fund_name, donor_sponsor)
      `)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    let appRows = (data as ScholarshipApplication[]) || [];

    if (!appRows || appRows.length === 0) {
      // 1. Get or bootstrap funds
      let { data: existingFunds } = await supabase
        .from("welfare_funds")
        .select("id, fund_name")
        .eq("organization_id", session.organizationId)
        .limit(3);

      if (!existingFunds || existingFunds.length === 0) {
        await getWelfareFundsAction();
        const { data: refetchedFunds } = await supabase
          .from("welfare_funds")
          .select("id, fund_name")
          .eq("organization_id", session.organizationId)
          .limit(3);
        existingFunds = refetchedFunds || [];
      }

      // 2. Get or bootstrap patients
      let { data: existingPatients } = await supabase
        .from("patients")
        .select("id, full_name, patient_code")
        .eq("organization_id", session.organizationId)
        .limit(3);

      if (!existingPatients || existingPatients.length === 0) {
        const defaultPatients = [
          {
            organization_id: session.organizationId,
            patient_id: "P-10022",
            full_name: "Rabeya Khatun (রাবেয়া খাতুন)",
            gender: "female",
            age: 52,
            phone: "01712998877",
            address: "Dhanmondi, Dhaka",
            blood_group: "O+",
          },
          {
            organization_id: session.organizationId,
            patient_id: "P-10034",
            full_name: "Md. Abdul Jalil (মো. আব্দুল জলিল)",
            gender: "male",
            age: 64,
            phone: "01819887766",
            address: "Mirpur-10, Dhaka",
            blood_group: "B+",
          },
          {
            organization_id: session.organizationId,
            patient_id: "P-10041",
            full_name: "Fatema Begum (ফাতেমা বেগম)",
            gender: "female",
            age: 28,
            phone: "01911776655",
            address: "Mohammadpur, Dhaka",
            blood_group: "A+",
          },
        ];

        const { data: insertedPatients } = await supabase
          .from("patients")
          .insert(defaultPatients)
          .select("id, full_name, patient_code");

        existingPatients = insertedPatients || [];
      }

      if (existingFunds && existingFunds.length > 0 && existingPatients && existingPatients.length > 0) {
        const defaultApps = [
          {
            organization_id: session.organizationId,
            application_number: "SCH-2026-001",
            patient_id: existingPatients[0].id,
            fund_id: existingFunds[0].id,
            requested_amount: 15000,
            approved_amount: 15000,
            reason: "দরিদ্র বিধবা রোগীর জরুরি অর্থোপেডিক ট্রমা সার্জারি ও ইমপ্লান্ট ভর্তুকি",
            status: "APPROVED" as const,
          },
          {
            organization_id: session.organizationId,
            application_number: "SCH-2026-002",
            patient_id: existingPatients[1 % existingPatients.length].id,
            fund_id: existingFunds[1 % existingFunds.length].id,
            requested_amount: 8500,
            approved_amount: 8500,
            reason: "দিনমজুর পিতার সন্তানের আইসিইউ ইনকিউবেটর ও ভেন্টিলেটর চার্জ মওকুফ",
            status: "DISBURSED" as const,
          },
          {
            organization_id: session.organizationId,
            application_number: "SCH-2026-003",
            patient_id: existingPatients[2 % existingPatients.length].id,
            fund_id: existingFunds[2 % existingFunds.length].id,
            requested_amount: 5000,
            approved_amount: 0,
            reason: "জরুরি সিজারিয়ান পরবর্তী অ্যান্টিবায়োটিক ও পোস্ট-অপারেটিভ নার্সিং সেবা সহায়তা",
            status: "PENDING" as const,
          },
        ];

        await supabase.from("scholarship_applications").insert(defaultApps);

        const { data: refetchedApps } = await supabase
          .from("scholarship_applications")
          .select(`
            *,
            patients (full_name, patient_code, phone),
            welfare_funds (fund_name, donor_sponsor)
          `)
          .eq("organization_id", session.organizationId)
          .order("created_at", { ascending: false });

        if (refetchedApps && refetchedApps.length > 0) {
          appRows = refetchedApps as ScholarshipApplication[];
        }
      }
    }

    return { success: true, data: appRows };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load scholarship applications";
    return { success: false, error: msg };
  }
}

/**
 * 4. Submit Welfare / Scholarship Application
 */
export async function createScholarshipApplicationAction(payload: {
  patient_id: string;
  fund_id: string;
  requested_amount: number;
  reason: string;
}): Promise<{
  success: boolean;
  data?: ScholarshipApplication;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId || !session.userId) {
      return { success: false, error: "401 Unauthorized" };
    }

    if (!payload.patient_id) {
      return { success: false, error: "অনুগ্রহ করে রোগী নির্বাচন করুন।" };
    }
    if (!payload.fund_id) {
      return { success: false, error: "অনুগ্রহ করে যাকাত/কল্যাণ ফান্ড নির্বাচন করুন।" };
    }
    if (!payload.requested_amount || payload.requested_amount <= 0) {
      return { success: false, error: "আবেদিত টাকার পরিমাণ ০ এর বেশি হতে হবে।" };
    }
    if (!payload.reason || payload.reason.trim().length < 3) {
      return { success: false, error: "অনুগ্রহ করে আর্থিক সহায়তার কারণ উল্লেখ করুন।" };
    }

    const supabase = createClient();

    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const appNumber = `SCH-${dateStr}-${randSuffix}`;

    const { data: inserted, error: insertErr } = await supabase
      .from("scholarship_applications")
      .insert({
        organization_id: session.organizationId,
        application_number: appNumber,
        patient_id: payload.patient_id,
        fund_id: payload.fund_id,
        requested_amount: payload.requested_amount,
        approved_amount: 0,
        reason: payload.reason.trim(),
        status: "PENDING",
        reviewed_by: session.userId,
      })
      .select(`
        *,
        patients (full_name, patient_code, phone),
        welfare_funds (fund_name, donor_sponsor)
      `)
      .single();

    if (insertErr || !inserted) {
      throw new Error(insertErr?.message || "Failed to submit application");
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "CLINICAL",
      entityType: "scholarship_application",
      entityId: inserted.id,
      newValues: {
        application_number: appNumber,
        requested_amount: payload.requested_amount,
        patient_id: payload.patient_id,
      },
    });

    return { success: true, data: inserted as ScholarshipApplication };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to submit welfare application";
    return { success: false, error: msg };
  }
}

/**
 * 5. Update Scholarship Status (Approve, Disburse, Reject)
 */
export async function updateScholarshipStatusAction(payload: {
  application_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "DISBURSED";
  approved_amount?: number;
}): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId || !session.userId) {
      return { success: false, error: "401 Unauthorized" };
    }

    const supabase = createClient();
    const updateObj: Record<string, unknown> = {
      status: payload.status,
      reviewed_by: session.userId,
    };

    if (payload.approved_amount !== undefined) {
      updateObj.approved_amount = payload.approved_amount;
    } else if (payload.status === "APPROVED" || payload.status === "DISBURSED") {
      const { data: existing } = await supabase
        .from("scholarship_applications")
        .select("requested_amount, approved_amount")
        .eq("id", payload.application_id)
        .eq("organization_id", session.organizationId)
        .single();

      if (existing && existing.approved_amount <= 0) {
        updateObj.approved_amount = existing.requested_amount;
      }
    }

    const { error } = await supabase
      .from("scholarship_applications")
      .update(updateObj)
      .eq("id", payload.application_id)
      .eq("organization_id", session.organizationId);

    if (error) throw error;

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "CLINICAL",
      entityType: "scholarship_application",
      entityId: payload.application_id,
      newValues: updateObj,
    });

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update application status";
    return { success: false, error: msg };
  }
}
