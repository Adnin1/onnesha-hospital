"use client";

import React, { useState, useEffect } from "react";
import {
  UserCheck,
  Fingerprint,
  DollarSign,
  CheckCircle2,
  Server,
  Plus,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  EmployeeRecord,
  AttendanceRecordItem,
  PayrollRunRecord,
} from "@/types/hr";
import {
  getEmployeesAction,
  createEmployeeAction,
  recordBiometricPunchAction,
  getTodayAttendanceAction,
  getPayrollSummaryAction,
} from "@/lib/hr/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function HRManagementPage() {
  const [activeTab, setActiveTab] = useState<"staff" | "attendance" | "payroll" | "bridge">("staff");
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecordItem[]>([]);
  const [presentCount, setPresentCount] = useState(0);
  const [lateCount, setLateCount] = useState(0);
  const [payrollSummary, setPayrollSummary] = useState<{
    monthYear: string;
    totalStaff: number;
    estimatedGross: number;
    estimatedNet: number;
    payrollRuns: PayrollRunRecord[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Employee Modal
  const [showNewEmpModal, setShowNewEmpModal] = useState(false);
  const [empFullName, setEmpFullName] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empSalary, setEmpSalary] = useState(25000);
  const [empPin, setEmpPin] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Biometric Test Punch Modal
  const [showPunchModal, setShowPunchModal] = useState(false);
  const [punchEmpId, setPunchEmpId] = useState("");
  const [punchType, setPunchType] = useState<"CHECK_IN" | "CHECK_OUT">("CHECK_IN");
  const [punchLoading, setPunchLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [empRes, attRes, payRes] = await Promise.all([
        getEmployeesAction(),
        getTodayAttendanceAction(),
        getPayrollSummaryAction(),
      ]);

      if (empRes.success && empRes.data) {
        setEmployees(empRes.data.employees);
        if (empRes.data.employees.length > 0 && !punchEmpId) {
          setPunchEmpId(empRes.data.employees[0].id);
        }
      }
      if (attRes.success && attRes.data) {
        setAttendanceRecords(attRes.data.records);
        setPresentCount(attRes.data.presentCount);
        setLateCount(attRes.data.lateCount);
      }
      if (payRes.success && payRes.data) {
        setPayrollSummary(payRes.data);
      }
    } catch {
      setErrorMsg("Failed to load HR and Attendance roster");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [empRes, attRes, payRes] = await Promise.all([
          getEmployeesAction(),
          getTodayAttendanceAction(),
          getPayrollSummaryAction(),
        ]);

        if (isMounted) {
          if (empRes.success && empRes.data) {
            setEmployees(empRes.data.employees);
            if (empRes.data.employees.length > 0 && !punchEmpId) {
              setPunchEmpId(empRes.data.employees[0].id);
            }
          }
          if (attRes.success && attRes.data) {
            setAttendanceRecords(attRes.data.records);
            setPresentCount(attRes.data.presentCount);
            setLateCount(attRes.data.lateCount);
          }
          if (payRes.success && payRes.data) {
            setPayrollSummary(payRes.data);
          }
        }
      } catch {
        if (isMounted) setErrorMsg("Failed to load HR and Attendance roster");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [punchEmpId]);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const res = await createEmployeeAction({
        fullName: empFullName,
        phone: empPhone,
        email: empEmail.trim() || undefined,
        basicSalary: Number(empSalary),
        biometricPin: empPin.trim() || undefined,
      });

      if (res.success) {
        setShowNewEmpModal(false);
        setEmpFullName("");
        setEmpPhone("");
        await loadData();
      } else {
        alert(res.error || "Failed to register employee");
      }
    } catch {
      alert("Network error creating employee");
    } finally {
      setFormLoading(false);
    }
  };

  const handleBiometricPunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!punchEmpId) return;

    setPunchLoading(true);
    try {
      const res = await recordBiometricPunchAction({
        employeeId: punchEmpId,
        punchType,
        verificationMode: "FINGERPRINT",
      });

      if (res.success) {
        setShowPunchModal(false);
        await loadData();
      } else {
        alert(res.error || "Failed to record punch");
      }
    } catch {
      alert("Error simulating biometric punch");
    } finally {
      setPunchLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Human Resources & Staff Administration
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            HR, Attendance & Biometric Device Bridge
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Employee roster, biometric fingerprint bridge connector, monthly attendance logs, and payroll calculations.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh HR data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowPunchModal(true)}
            className="px-3.5 py-2 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold transition flex items-center shadow-2xs"
          >
            <Fingerprint className="w-4 h-4 mr-1 text-sky-600" />
            Biometric Punch
          </button>
          <button
            onClick={() => setShowNewEmpModal(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Staff
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* TABS HEADER */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab("staff")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center ${
            activeTab === "staff" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <UserCheck className="w-3.5 h-3.5 mr-1.5" />
          Staff Directory ({employees.length})
        </button>
        <button
          onClick={() => setActiveTab("attendance")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center ${
            activeTab === "attendance" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Fingerprint className="w-3.5 h-3.5 mr-1.5" />
          {"Today's Attendance"} ({attendanceRecords.length})
        </button>
        <button
          onClick={() => setActiveTab("payroll")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center ${
            activeTab === "payroll" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <DollarSign className="w-3.5 h-3.5 mr-1.5" />
          Payroll Summary
        </button>
        <button
          onClick={() => setActiveTab("bridge")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center ${
            activeTab === "bridge" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Server className="w-3.5 h-3.5 mr-1.5" />
          Hardware Bridge
        </button>
      </div>

      {/* TAB 1: STAFF DIRECTORY */}
      {activeTab === "staff" && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Employee Name</th>
                  <th className="py-3 px-4">Designation / Role</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      Loading staff roster...
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      No employees registered yet.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{emp.employee_code}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{emp.full_name}</td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {emp.designation?.title || "Clinical Staff"}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{emp.department?.name || "General"}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{emp.phone}</td>
                      <td className="py-3 px-4 text-slate-500">{emp.joining_date}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            emp.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {emp.status}
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

      {/* TAB 2: ATTENDANCE */}
      {activeTab === "attendance" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Punches Today</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{attendanceRecords.length} Records</div>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-800 uppercase">Staff Present</span>
              <div className="text-2xl font-black text-emerald-700 mt-1">{presentCount} On Duty</div>
            </div>
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-800 uppercase">Late Arrivals</span>
              <div className="text-2xl font-black text-amber-700 mt-1">{lateCount} Employees</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Punch Time</th>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Punch Type</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4 text-center">Late Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendanceRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-500">
                        No biometric punches recorded for today.
                      </td>
                    </tr>
                  ) : (
                    attendanceRecords.map((att) => (
                      <tr key={att.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {new Date(att.punch_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{att.employee?.full_name || "Employee"}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{att.employee?.employee_code}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              att.punch_type === "CHECK_IN"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-sky-100 text-sky-800"
                            }`}
                          >
                            {att.punch_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">{att.verification_mode}</td>
                        <td className="py-3 px-4 text-center">
                          {att.is_late ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              LATE
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-bold text-[10px]">ON TIME</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PAYROLL */}
      {activeTab === "payroll" && payrollSummary && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Payroll Month</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{payrollSummary.monthYear}</div>
              <span className="text-[10px] text-slate-400">{payrollSummary.totalStaff} Eligible staff</span>
            </div>
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 shadow-2xs">
              <span className="text-[11px] font-bold text-indigo-800 uppercase">Estimated Gross Payroll</span>
              <div className="text-2xl font-black text-indigo-700 mt-1">
                {formatCurrencyBDT(payrollSummary.estimatedGross)}
              </div>
              <span className="text-[10px] text-indigo-700 font-medium">Basic + House Rent + Medical</span>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-800 uppercase">Net Payable</span>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                {formatCurrencyBDT(payrollSummary.estimatedNet)}
              </div>
              <span className="text-[10px] text-emerald-700 font-medium">Post-tax & deductions</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="font-extrabold text-sm text-slate-900 mb-2">Hospital Payroll Disbursement Policy</h3>
            <p className="text-xs text-slate-500 mb-4">
              Salaries are calculated automatically using biometric attendance summaries (absence deductions) and Bangladesh labor standard allowances.
            </p>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 space-y-1">
              <p>• Basic Salary represents 60% of gross pay scale.</p>
              <p>• House Rent Allowance: 40% of basic salary.</p>
              <p>• Medical Allowance fixed at BDT 2,000 per month for clinical personnel.</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: BIOMETRIC HARDWARE BRIDGE */}
      {activeTab === "bridge" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs max-w-xl space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">Local Hardware Gateway</h3>
              <p className="text-xs text-slate-500">ZKTeco / Anviz / Realtime Fingerprint Bridge Connector</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Default Port:</span>
              <span className="font-mono font-bold text-slate-900">4370 (TCP)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Sync Interval:</span>
              <span className="font-mono font-bold text-slate-900">Real-time Push / 60s Pull</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Device Handshake Status:</span>
              <span className="font-bold text-emerald-600 flex items-center">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                ONLINE (Ready)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* NEW EMPLOYEE MODAL */}
      {showNewEmpModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-xs">
            <h3 className="text-base font-black text-slate-900 mb-1">Register New Staff Member</h3>
            <p className="text-slate-500 mb-4">Add employee to staff registry and biometric roster.</p>

            <form onSubmit={handleCreateEmployee} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Mahmudul Hasan / Nurse Rina"
                  value={empFullName}
                  onChange={(e) => setEmpFullName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mobile Phone *</label>
                  <input
                    type="text"
                    required
                    placeholder="017XXXXXXXX"
                    value={empPhone}
                    onChange={(e) => setEmpPhone(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="staff@hospital.com"
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Basic Salary (BDT)</label>
                  <input
                    type="number"
                    value={empSalary}
                    onChange={(e) => setEmpSalary(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Biometric Pin</label>
                  <input
                    type="text"
                    placeholder="e.g. 1001"
                    value={empPin}
                    onChange={(e) => setEmpPin(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewEmpModal(false)}
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
                  Save Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BIOMETRIC PUNCH MODAL */}
      {showPunchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-xs">
            <h3 className="text-base font-black text-slate-900 mb-1">Biometric Device Punch Simulator</h3>
            <p className="text-slate-500 mb-4">Simulate hardware fingerprint scan from front door terminal.</p>

            <form onSubmit={handleBiometricPunch} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Staff Member *</label>
                <select
                  value={punchEmpId}
                  onChange={(e) => setPunchEmpId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name} ({e.employee_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Punch Action</label>
                <select
                  value={punchType}
                  onChange={(e) => setPunchType(e.target.value as "CHECK_IN" | "CHECK_OUT")}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                >
                  <option value="CHECK_IN">Shift Check-In</option>
                  <option value="CHECK_OUT">Shift Check-Out</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPunchModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={punchLoading}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl disabled:opacity-50 flex items-center"
                >
                  {punchLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Record Biometric Punch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
