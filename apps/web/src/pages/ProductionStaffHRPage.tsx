import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock, DollarSign, FileText, Plus, RefreshCw, Shield, Building2, Briefcase, Activity, ReceiptText } from "lucide-react";
import { apiFetch } from "../services/applicationApiService.js";

type Tab = "Overview" | "Employees" | "Org Structure" | "Attendance" | "Shifts" | "Payroll Prep" | "Staff Expenses" | "Commission" | "Activity & Audit" | "Permissions";
type AnyRow = Record<string, any>;

const money = (v: number) => "Tsh " + Math.round(Number(v || 0)).toLocaleString();

async function mutate<T = AnyRow>(url: string, init: RequestInit): Promise<{ success: boolean; data?: T; error?: { message?: string } }> {
  return apiFetch<{ success: boolean; data?: T; error?: { message?: string } }>(url, init);
}

async function getData<T = AnyRow[]>(url: string): Promise<T> {
  const r = await apiFetch<{ success: boolean; data: T; error?: { message?: string } }>(url);
  if (!r.success) throw new Error((r.error && r.error.message) || ("Request failed: " + url));
  return r.data;
}

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }> = ({ label, value, onChange, type = "text", placeholder }) => (
  <label className="v2-flex v2-flex-col v2-gap-1 v2-text-xs"><span className="v2-text-muted">{label}</span><input className="v2-input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></label>
);

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "danger" }> = ({ tone = "ghost", className = "", children, ...props }) => (
  <button {...props} className={"v2-btn v2-btn-sm " + (tone === "primary" ? "v2-btn-primary" : tone === "danger" ? "v2-btn-danger" : "v2-btn-ghost") + " " + className}>{children}</button>
);

export const ProductionStaffHRPage: React.FC<{ activeTab?: string }> = ({ activeTab }) => {
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState<AnyRow>({});
  const [employees, setEmployees] = useState<AnyRow[]>([]);
  const [departments, setDepartments] = useState<AnyRow[]>([]);
  const [positions, setPositions] = useState<AnyRow[]>([]);
  const [shifts, setShifts] = useState<AnyRow[]>([]);
  const [schedules, setSchedules] = useState<AnyRow[]>([]);
  const [attendance, setAttendance] = useState<AnyRow[]>([]);
  const [payroll, setPayroll] = useState<AnyRow[]>([]);
  const [commissions, setCommissions] = useState<AnyRow[]>([]);
  const [expenses, setExpenses] = useState<AnyRow[]>([]);
  const [audit, setAudit] = useState<AnyRow[]>([]);
  const [roles, setRoles] = useState<AnyRow[]>([]);

  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [positionTitle, setPositionTitle] = useState("");
  const [positionCode, setPositionCode] = useState("");
  const [positionDept, setPositionDept] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [employeeFirst, setEmployeeFirst] = useState("");
  const [employeeLast, setEmployeeLast] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeePhone, setEmployeePhone] = useState("");
  const [employeeSalary, setEmployeeSalary] = useState("");
  const [shiftName, setShiftName] = useState("");
  const [shiftStart, setShiftStart] = useState("08:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");
  const [scheduleEmployee, setScheduleEmployee] = useState("");
  const [scheduleShift, setScheduleShift] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleStart, setScheduleStart] = useState("08:00");
  const [scheduleEnd, setScheduleEnd] = useState("17:00");
  const [expenseEmployee, setExpenseEmployee] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("STAFF_EXPENSE");
  const [expenseReason, setExpenseReason] = useState("");
  const [commissionEmployee, setCommissionEmployee] = useState("");
  const [commissionSales, setCommissionSales] = useState("");
  const [commissionRate, setCommissionRate] = useState("");

  useEffect(() => {
    const normalized = (activeTab || "").toLowerCase();
    const map: Array<[string[], Tab]> = [
      [["employee", "staff"], "Employees"],
      [["department", "position", "org"], "Org Structure"],
      [["attendance", "leave"], "Attendance"],
      [["shift", "schedule", "roster"], "Shifts"],
      [["payroll", "salary"], "Payroll Prep"],
      [["expense"], "Staff Expenses"],
      [["commission"], "Commission"],
      [["audit", "activity"], "Activity & Audit"],
      [["permission", "role"], "Permissions"],
    ];
    const hit = map.find(([terms]) => terms.some((t) => normalized.includes(t)));
    setTab((hit && hit[1]) || "Overview");
  }, [activeTab]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        getData<AnyRow>("/api/v1/workforce/dashboard"),
        getData("/api/v1/workforce/employees"),
        getData("/api/v1/workforce/departments"),
        getData("/api/v1/workforce/positions"),
        getData("/api/v1/workforce/shifts/templates"),
        getData("/api/v1/workforce/schedules"),
        getData("/api/v1/workforce/attendance"),
        getData("/api/v1/workforce/payroll-inputs"),
        getData("/api/v1/workforce/commissions"),
        getData("/api/v1/expenses"),
        getData("/api/v1/audit/logs"),
        getData("/api/v1/roles"),
      ]);
      setDashboard(responses[0] || {});
      setEmployees(responses[1] || []);
      setDepartments(responses[2] || []);
      setPositions(responses[3] || []);
      setShifts(responses[4] || []);
      setSchedules(responses[5] || []);
      setAttendance(responses[6] || []);
      setPayroll(responses[7] || []);
      setCommissions(responses[8] || []);
      setExpenses((responses[9] || []).filter((x: AnyRow) => Boolean(x.employeeId) || String(x.category || "").startsWith("STAFF_")));
      setAudit(responses[10] || []);
      setRoles(responses[11] || []);
    } catch (e: any) {
      setError(e?.message || "Staff / HR data could not be loaded from the authoritative API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const activeEmployees = useMemo(() => employees.filter((e) => String(e.status).toUpperCase() === "ACTIVE"), [employees]);
  const openAttendance = useMemo(() => attendance.filter((a) => !a.clockOut), [attendance]);

  const createDepartment = async () => {
    if (!deptName.trim() || !deptCode.trim()) return;
    const r = await mutate("/api/v1/workforce/departments", { method: "POST", body: JSON.stringify({ name: deptName.trim(), code: deptCode.trim() }) });
    if (!r.success) throw new Error("Department creation was rejected.");
    setDeptName(""); setDeptCode(""); await load();
  };

  const createPosition = async () => {
    if (!positionTitle.trim() || !positionCode.trim()) return;
    const r = await mutate("/api/v1/workforce/positions", { method: "POST", body: JSON.stringify({ title: positionTitle.trim(), positionCode: positionCode.trim(), departmentId: positionDept || undefined }) });
    if (!r.success) throw new Error("Position creation was rejected.");
    setPositionTitle(""); setPositionCode(""); await load();
  };

  const createEmployee = async () => {
    if (!employeeNumber.trim() || !employeeFirst.trim() || !employeeLast.trim()) return;
    const r = await mutate("/api/v1/workforce/employees", {
      method: "POST",
      body: JSON.stringify({
        employeeNumber: employeeNumber.trim(), firstName: employeeFirst.trim(), lastName: employeeLast.trim(),
        email: employeeEmail.trim() || undefined, phone: employeePhone.trim() || undefined,
        baseSalary: Number(employeeSalary || 0), workType: "FULL_TIME", contractType: "PERMANENT",
      }),
    });
    if (!r.success) throw new Error("Employee creation was rejected.");
    setEmployeeNumber(""); setEmployeeFirst(""); setEmployeeLast(""); setEmployeeEmail(""); setEmployeePhone(""); setEmployeeSalary(""); await load();
  };

  const createShift = async () => {
    if (!shiftName.trim()) return;
    const r = await mutate("/api/v1/workforce/shifts/templates", { method: "POST", body: JSON.stringify({ name: shiftName.trim(), startTime: shiftStart, endTime: shiftEnd, workdays: [1,2,3,4,5,6], breakDurationMinutes: 60, requiredHeadcount: 1 }) });
    if (!r.success) throw new Error("Shift creation was rejected.");
    setShiftName(""); await load();
  };

  const createSchedule = async () => {
    if (!scheduleEmployee || !scheduleDate) return;
    const r = await mutate("/api/v1/workforce/schedules", { method: "POST", body: JSON.stringify({ employeeId: scheduleEmployee, shiftTemplateId: scheduleShift || undefined, date: scheduleDate, startTime: scheduleStart, endTime: scheduleEnd, status: "PUBLISHED" }) });
    if (!r.success) throw new Error("Schedule creation was rejected.");
    await load();
  };

  const clockIn = async (employeeId: string) => {
    const r = await mutate("/api/v1/workforce/attendance/clock-in", { method: "POST", body: JSON.stringify({ employeeId, method: "STANDARD", idempotencyKey: "hr-" + employeeId + "-" + Date.now() }) });
    if (!r.success) throw new Error("Clock-in was rejected.");
    await load();
  };

  const clockOut = async (recordId: string) => {
    const r = await mutate("/api/v1/workforce/attendance/" + recordId + "/clock-out", { method: "POST", body: JSON.stringify({}) });
    if (!r.success) throw new Error("Clock-out was rejected.");
    await load();
  };

  const approveCommission = async (id: string) => {
    const r = await mutate("/api/v1/workforce/commissions/" + id + "/approve", { method: "POST", body: "{}" });
    if (!r.success) throw new Error("Commission approval was rejected.");
    await load();
  };

  const createCommission = async () => {
    if (!commissionEmployee || !commissionSales || !commissionRate) return;
    const period = new Date().toISOString().slice(0, 7);
    const r = await mutate("/api/v1/workforce/commissions", { method: "POST", body: JSON.stringify({ employeeId: commissionEmployee, period, salesAmount: Number(commissionSales), commissionRate: Number(commissionRate) }) });
    if (!r.success) throw new Error("Commission creation was rejected.");
    setCommissionSales(""); setCommissionRate(""); await load();
  };

  const createStaffExpense = async () => {
    if (!expenseEmployee || !expenseAmount || !expenseReason.trim()) return;
    const employee = employees.find((e) => e.id === expenseEmployee);
    const r = await mutate("/api/v1/expenses", {
      method: "POST",
      body: JSON.stringify({
        category: expenseCategory, amount: Number(expenseAmount), reason: expenseReason.trim(),
        description: expenseReason.trim(), payee: employee ? (employee.firstName + " " + employee.lastName).trim() : "Staff",
        employeeId: expenseEmployee, paymentMethod: "CASH", status: "PENDING",
        idempotencyKey: "staff-" + expenseEmployee + "-" + Date.now(),
      }),
    });
    if (!r.success) throw new Error("Staff expense submission was rejected.");
    setExpenseAmount(""); setExpenseReason(""); await load();
  };

  const approvePayroll = async (id: string) => {
    const r = await mutate("/api/v1/workforce/payroll-inputs/" + id + "/approve", { method: "POST", body: "{}" });
    if (!r.success) throw new Error("Payroll approval was rejected.");
    await load();
  };

  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-gap-3 v2-mb-4">
        <div><h1 className="v2-text-xl v2-font-black">Staff / HR</h1><p className="v2-text-xs v2-text-muted">Authoritative workforce control: employees, org structure, attendance, shifts, payroll preparation, expenses, commission, activity and audit.</p></div>
        <Btn tone="primary" onClick={() => void load()}><RefreshCw size={14} /> Refresh</Btn>
      </div>
      {error && <div className="v2-alert v2-alert-danger v2-mb-4"><AlertTriangle size={16} /> {error}</div>}
      <div className="v2-flex v2-gap-1 v2-flex-wrap v2-mb-4" style={{ overflowX: "auto" }}>
        {(["Overview","Employees","Org Structure","Attendance","Shifts","Payroll Prep","Staff Expenses","Commission","Activity & Audit","Permissions"] as Tab[]).map((t) => (
          <button key={t} type="button" className={"sector-pill" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {loading && <div className="v2-card"><div className="v2-card-body">Loading authoritative Staff / HR data…</div></div>}

      {!loading && tab === "Overview" && (
        <>
          <div className="metrics-grid kpi-grid-4 v2-mb-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <div className="kpi-card"><div className="kpi-card-label">Employees</div><div className="kpi-card-value">{dashboard.totalEmployees ?? employees.length}</div><div className="kpi-card-desc">Active: {dashboard.activeEmployees ?? activeEmployees.length}</div></div>
            <div className="kpi-card"><div className="kpi-card-label">Attendance</div><div className="kpi-card-value">{dashboard.attendanceRecords ?? attendance.length}</div><div className="kpi-card-desc">Open: {openAttendance.length}</div></div>
            <div className="kpi-card"><div className="kpi-card-label">Payroll Inputs</div><div className="kpi-card-value">{payroll.length}</div><div className="kpi-card-desc">Approved: {payroll.filter((p) => p.status === "APPROVED" || p.status === "LOCKED").length}</div></div>
            <div className="kpi-card"><div className="kpi-card-label">Commission</div><div className="kpi-card-value">{money(commissions.reduce((s, c) => s + Number(c.commissionAmount || 0), 0))}</div><div className="kpi-card-desc">Pending: {commissions.filter((c) => c.status === "PENDING").length}</div></div>
          </div>
          <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title">Production authority</div><span className="badge v2-badge-success">POSTGRESQL AUTHORITY</span></div><div className="v2-card-body v2-grid v2-grid-cols-2 v2-gap-3">
            <div className="v2-text-sm">Employee master and employment history</div><div className="v2-text-sm">Attendance and timesheet lifecycle</div>
            <div className="v2-text-sm">Shift templates and published schedules</div><div className="v2-text-sm">Payroll inputs and commission approvals</div>
            <div className="v2-text-sm">Staff-linked expenses</div><div className="v2-text-sm">Audit trail and role permissions</div>
          </div></div>
        </>
      )}

      {!loading && tab === "Employees" && (
        <div className="v2-space-y-4">
          <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title">Add Employee</div></div><div className="v2-card-body v2-grid v2-grid-cols-2 v2-gap-3">
            <Field label="Employee Number" value={employeeNumber} onChange={setEmployeeNumber}/><Field label="First Name" value={employeeFirst} onChange={setEmployeeFirst}/>
            <Field label="Last Name" value={employeeLast} onChange={setEmployeeLast}/><Field label="Email" value={employeeEmail} onChange={setEmployeeEmail}/>
            <Field label="Phone" value={employeePhone} onChange={setEmployeePhone}/><Field label="Base Salary" type="number" value={employeeSalary} onChange={setEmployeeSalary}/>
            <div><Btn tone="primary" onClick={()=>void createEmployee()}><Plus size={14}/> Create employee</Btn></div>
          </div></div>
          <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title">Employees ({employees.length})</div></div><div className="v2-table-wrap"><table className="v2-table"><thead><tr><th>Number</th><th>Name</th><th>Department</th><th>Position</th><th>Status</th><th>Pay</th></tr></thead><tbody>
            {employees.map((e)=><tr key={e.id}><td className="v2-mono">{e.employeeNumber}</td><td className="v2-font-bold">{e.firstName} {e.lastName}</td><td>{e.departmentName || "—"}</td><td>{e.positionTitle || "—"}</td><td><span className="badge v2-badge-muted">{e.status}</span></td><td>{money(e.baseSalary || e.hourlyRate || 0)}</td></tr>)}
          </tbody></table></div></div>
        </div>
      )}

      {!loading && tab === "Org Structure" && (
        <div className="v2-grid v2-grid-cols-2 v2-gap-4">
          <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title"><Building2 size={16}/> Departments</div></div><div className="v2-card-body v2-space-y-3">
            <div className="v2-grid v2-grid-cols-2 v2-gap-2"><Field label="Name" value={deptName} onChange={setDeptName}/><Field label="Code" value={deptCode} onChange={setDeptCode}/></div>
            <Btn tone="primary" onClick={()=>void createDepartment()}><Plus size={14}/> Add Department</Btn>
            {departments.map((d)=><div key={d.id} className="v2-card" style={{padding:".7rem"}}><b>{d.name}</b><span className="v2-text-xs v2-text-muted"> · {d.code}</span></div>)}
          </div></div>
          <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title"><Briefcase size={16}/> Positions</div></div><div className="v2-card-body v2-space-y-3">
            <div className="v2-grid v2-grid-cols-2 v2-gap-2"><Field label="Title" value={positionTitle} onChange={setPositionTitle}/><Field label="Code" value={positionCode} onChange={setPositionCode}/></div>
            <select className="v2-input" value={positionDept} onChange={(e)=>setPositionDept(e.target.value)}><option value="">No department</option>{departments.map((d)=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
            <Btn tone="primary" onClick={()=>void createPosition()}><Plus size={14}/> Add Position</Btn>
            {positions.map((p)=><div key={p.id} className="v2-card" style={{padding:".7rem"}}><b>{p.title}</b><span className="v2-text-xs v2-text-muted"> · {p.positionCode}</span></div>)}
          </div></div>
        </div>
      )}

      {!loading && tab === "Attendance" && (
        <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title"><Clock size={16}/> Attendance</div></div><div className="v2-table-wrap"><table className="v2-table"><thead><tr><th>Employee</th><th>Work Date</th><th>Clock In</th><th>Clock Out</th><th>Status</th><th>Action</th></tr></thead><tbody>
          {employees.map((e)=>{ const row=attendance.filter((a)=>a.employeeId===e.id).sort((a,b)=>String(b.clockIn).localeCompare(String(a.clockIn)))[0]; return <tr key={e.id}><td>{e.firstName} {e.lastName}</td><td>{row ? new Date(row.workDate).toLocaleDateString() : "—"}</td><td>{row ? new Date(row.clockIn).toLocaleTimeString() : "—"}</td><td>{row?.clockOut ? new Date(row.clockOut).toLocaleTimeString() : "—"}</td><td><span className="badge v2-badge-muted">{row?.status || "OUT"}</span></td><td>{row && !row.clockOut ? <Btn onClick={()=>void clockOut(row.id)}><Check size={13}/> Clock out</Btn> : <Btn tone="primary" onClick={()=>void clockIn(e.id)}><Clock size={13}/> Clock in</Btn>}</td></tr>; })}
        </tbody></table></div></div>
      )}

      {!loading && tab === "Shifts" && (
        <div className="v2-grid v2-grid-cols-2 v2-gap-4">
          <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title">Shift Templates</div></div><div className="v2-card-body v2-space-y-3">
            <Field label="Name" value={shiftName} onChange={setShiftName}/><div className="v2-grid v2-grid-cols-2 v2-gap-2"><Field label="Start" value={shiftStart} onChange={setShiftStart}/><Field label="End" value={shiftEnd} onChange={setShiftEnd}/></div>
            <Btn tone="primary" onClick={()=>void createShift()}><Plus size={14}/> Add shift</Btn>{shifts.map((s)=><div key={s.id} className="v2-card" style={{padding:".7rem"}}><b>{s.name}</b><span className="v2-text-xs v2-text-muted"> · {s.startTime}–{s.endTime}</span></div>)}
          </div></div>
          <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title">Schedules</div></div><div className="v2-card-body v2-space-y-3">
            <select className="v2-input" value={scheduleEmployee} onChange={(e)=>setScheduleEmployee(e.target.value)}><option value="">Select employee</option>{activeEmployees.map((e)=><option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select>
            <select className="v2-input" value={scheduleShift} onChange={(e)=>setScheduleShift(e.target.value)}><option value="">Manual schedule</option>{shifts.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <Field label="Date" type="date" value={scheduleDate} onChange={setScheduleDate}/><div className="v2-grid v2-grid-cols-2 v2-gap-2"><Field label="Start" value={scheduleStart} onChange={setScheduleStart}/><Field label="End" value={scheduleEnd} onChange={setScheduleEnd}/></div>
            <Btn tone="primary" onClick={()=>void createSchedule()}><Plus size={14}/> Publish schedule</Btn>
            {schedules.slice(0,12).map((s)=><div key={s.id} className="v2-card" style={{padding:".7rem"}}><b>{new Date(s.date).toLocaleDateString()}</b><span className="v2-text-xs v2-text-muted"> · {s.startTime}–{s.endTime} · {s.status}</span></div>)}
          </div></div>
        </div>
      )}

      {!loading && tab === "Payroll Prep" && (
        <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title"><DollarSign size={16}/> Payroll Preparation</div><span className="badge v2-badge-warning">PREPARATION / APPROVAL</span></div><div className="v2-table-wrap"><table className="v2-table"><thead><tr><th>Employee</th><th>Period</th><th>Regular</th><th>OT</th><th>Commission</th><th>Gross</th><th>Status</th><th/></tr></thead><tbody>
          {payroll.map((p)=><tr key={p.id}><td>{employees.find((e)=>e.id===p.employeeId)?.firstName || p.employeeId}</td><td>{String(p.periodStart).slice(0,10)} → {String(p.periodEnd).slice(0,10)}</td><td>{money(p.regularPay)}</td><td>{money(p.overtimePay)}</td><td>{money(p.commissionsTotal)}</td><td className="v2-font-black">{money(p.grossPay)}</td><td><span className="badge v2-badge-muted">{p.status}</span></td><td>{p.status === "CALCULATED" ? <Btn tone="primary" onClick={()=>void approvePayroll(p.id)}><Check size={13}/> Approve</Btn> : <span className="v2-text-xs v2-text-muted">Locked workflow</span>}</td></tr>)}
        </tbody></table></div></div>
      )}

      {!loading && tab === "Staff Expenses" && (
        <div className="v2-grid v2-grid-cols-2 v2-gap-4">
          <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title"><ReceiptText size={16}/> Record Staff Expense</div></div><div className="v2-card-body v2-space-y-3">
            <select className="v2-input" value={expenseEmployee} onChange={(e)=>setExpenseEmployee(e.target.value)}><option value="">Select employee</option>{employees.map((e)=><option key={e.id} value={e.id}>{e.firstName} {e.lastName} · {e.employeeNumber}</option>)}</select>
            <Field label="Amount (TZS)" type="number" value={expenseAmount} onChange={setExpenseAmount}/><Field label="Category" value={expenseCategory} onChange={setExpenseCategory}/><Field label="Reason" value={expenseReason} onChange={setExpenseReason}/>
            <Btn tone="primary" onClick={()=>void createStaffExpense()}><Plus size={14}/> Submit staff expense</Btn>
          </div></div>
          <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title">Staff Expenses</div></div><div className="v2-table-wrap"><table className="v2-table"><thead><tr><th>Employee</th><th>Category</th><th>Amount</th><th>Status</th></tr></thead><tbody>
            {expenses.map((x)=><tr key={x.id}><td>{x.employeeId ? (employees.find((e)=>e.id===x.employeeId)?.firstName || x.payee) : x.payee}</td><td>{x.category}</td><td>{money(x.amount)}</td><td><span className="badge v2-badge-muted">{x.status}</span></td></tr>)}
          </tbody></table></div></div>
        </div>
      )}

      {!loading && tab === "Commission" && (
        <div className="v2-grid v2-grid-cols-2 v2-gap-4">
          <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title">Record Commission</div></div><div className="v2-card-body v2-space-y-3">
            <select className="v2-input" value={commissionEmployee} onChange={(e)=>setCommissionEmployee(e.target.value)}><option value="">Select employee</option>{employees.map((e)=><option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select>
            <Field label="Sales Amount" type="number" value={commissionSales} onChange={setCommissionSales}/><Field label="Commission Rate %" type="number" value={commissionRate} onChange={setCommissionRate}/>
            <Btn tone="primary" onClick={()=>void createCommission()}><Plus size={14}/> Record commission</Btn>
          </div></div>
          <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title">Commission Ledger</div></div><div className="v2-table-wrap"><table className="v2-table"><thead><tr><th>Employee</th><th>Period</th><th>Sales</th><th>Commission</th><th>Status</th><th/></tr></thead><tbody>
            {commissions.map((c)=><tr key={c.id}><td>{employees.find((e)=>e.id===c.employeeId)?.firstName || c.employeeId}</td><td>{c.period}</td><td>{money(c.salesAmount)}</td><td>{money(c.commissionAmount)}</td><td><span className="badge v2-badge-muted">{c.status}</span></td><td>{c.status === "PENDING" && <Btn tone="primary" onClick={()=>void approveCommission(c.id)}><Check size={13}/> Approve</Btn>}</td></tr>)}
          </tbody></table></div></div>
        </div>
      )}

      {!loading && tab === "Activity & Audit" && (
        <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title"><Activity size={16}/> Staff Activity & Audit</div><span className="badge v2-badge-info">APPEND-ONLY AUTHORITY</span></div><div className="v2-table-wrap"><table className="v2-table"><thead><tr><th>Timestamp</th><th>Action</th><th>Entity</th><th>User</th><th>Details</th></tr></thead><tbody>
          {audit.slice(0,200).map((a)=><tr key={a.id}><td>{a.timestamp ? new Date(a.timestamp).toLocaleString() : "—"}</td><td>{a.action}</td><td>{a.entityType}:{a.entityId}</td><td>{a.userEmail || a.userId || "System"}</td><td className="v2-text-xs v2-text-muted">{typeof a.metadata === "string" ? a.metadata : JSON.stringify(a.metadata || {})}</td></tr>)}
        </tbody></table></div></div>
      )}

      {!loading && tab === "Permissions" && (
        <div className="v2-card"><div className="v2-card-header"><div className="v2-card-title"><Shield size={16}/> Workforce Permissions</div><span className="badge v2-badge-success">SERVER ENFORCED</span></div><div className="v2-card-body">
          <p className="v2-text-xs v2-text-muted v2-mb-3">Sensitive Staff / HR mutations are authorized server-side. Tenant administrators can configure roles in Users & Roles.</p>
          <table className="v2-table"><thead><tr><th>Permission</th><th>Purpose</th></tr></thead><tbody>
            {[
              ["WORKFORCE_VIEW","Read workforce master data"],["WORKFORCE_EDIT","Mutate org structure, shifts, schedules and workforce records"],
              ["EMPLOYEE_VIEW / CREATE / EDIT / ARCHIVE","Employee lifecycle"],["ATTENDANCE_VIEW / RECORD","Clock-in/out and attendance"],["PAYROLL_INPUT_VIEW","Read payroll preparation"],
            ].map(([p,d])=><tr key={p}><td className="v2-mono">{p}</td><td>{d}</td></tr>)}
          </tbody></table>
          <div className="v2-mt-3"><b>Configured roles: {roles.length}</b> · <span className="v2-text-muted">{roles.map((r)=>r.name).join(", ")}</span></div>
        </div></div>
      )}
    </div>
  );
};
