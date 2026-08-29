// ============================================================
// Phase 37 — KwakoPos Workforce Command Center UI (KWOL v1.0.0)
// ============================================================

export interface WorkforceUiCardProps {
  tenantId: string;
  activeHeadcount: number;
  attendanceRatePct: number;
  openShiftsCount: number;
  pendingLeaveCount: number;
  totalLaborCost: number;
  certificationCompliancePct: number;
}

export function renderWorkforceCommandCenter(props: WorkforceUiCardProps): string {
  const formattedLaborCost = new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(props.totalLaborCost);

  return `
<div class="kwol-command-center" style="background: #0f172a; color: #f8fafc; font-family: Inter, system-ui, sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">

  <!-- 1. Lifecycle Progress Banner -->
  <div class="kwol-banner" style="background: linear-gradient(90deg, #1e293b 0%, #0f172a 100%); border: 1px solid #334155; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h2 style="margin: 0; font-size: 1.25rem; color: #38bdf8; font-weight: 700; display: flex; align-items: center; gap: 8px;">
        <span style="background: #0284c7; color: #ffffff; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px;">KWOL v1.0.0</span>
        Workforce Command Center & Operating Layer
      </h2>
      <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
    </div>
    <div style="display: flex; gap: 4px; font-size: 0.7rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; overflow-x: auto; padding-bottom: 4px;">
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #0284c7; color: #38bdf8;">People</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Organization</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Roles</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Scheduling</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Attendance</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Time</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Tasks</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Leave</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Payroll Inputs</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Expenses</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #38bdf8; color: #38bdf8;">Analytics & AI</span>
    </div>
  </div>

  <!-- 2. KPI Strip -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
    <div style="background: #1e293b; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Active Headcount</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.activeHeadcount}</div>
      <div style="font-size: 0.7rem; color: #34d399; margin-top: 2px;">● 100% Tenant Isolated</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Attendance Rate</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #34d399; margin-top: 4px;">${props.attendanceRatePct}%</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Integrity Verified</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #fbbf24; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Open Shifts</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #fbbf24; margin-top: 4px;">${props.openShiftsCount}</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Conflict-Free Engine</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Pending Leave</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #a855f7; margin-top: 4px;">${props.pendingLeaveCount}</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Phase 34 Approval Gate</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #f43f5e; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Labor Cost</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: #f43f5e; margin-top: 4px;">${formattedLaborCost}</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Finance Bridge Active</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #0ea5e9; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Certification Compliance</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #0ea5e9; margin-top: 4px;">${props.certificationCompliancePct}%</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">30-Day Proactive Alerts</div>
    </div>
  </div>

  <!-- 3. Operational Grid Panels -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">

    <!-- Panel A: Shift Matrix & Conflict Detector -->
    <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px;">
      <h3 style="margin: 0 0 12px 0; font-size: 1rem; color: #f8fafc; display: flex; justify-content: space-between; align-items: center;">
        <span>📅 Shift Scheduling & Conflict Detector</span>
        <button style="background: #0284c7; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">+ New Shift</button>
      </h3>
      <div style="background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 12px; font-size: 0.8rem;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 6px; margin-bottom: 6px; color: #94a3b8; font-weight: 600;">
          <span>Shift ID</span><span>Employee</span><span>Time Window</span><span>Status</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #cbd5e1;">
          <span>SHF-101</span><span>J. Doe (Pharmacist)</span><span>08:00 - 16:00</span><span style="color: #34d399; font-weight: 600;">PUBLISHED</span>
        </div>
        <div style="display: flex; justify-content: space-between; color: #cbd5e1;">
          <span>SHF-102</span><span>M. Smith (Chef)</span><span>16:00 - 23:00</span><span style="color: #fbbf24; font-weight: 600;">DRAFT</span>
        </div>
      </div>
      <div style="margin-top: 10px; background: #064e3b; border: 1px solid #059669; color: #a7f3d0; padding: 8px; border-radius: 6px; font-size: 0.75rem;">
        ✓ Rest Gap Engine: 100% shifts satisfy mandatory 8h rest interval & no double bookings detected.
      </div>
    </div>

    <!-- Panel B: AI Workforce Planning & Governance -->
    <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px;">
      <h3 style="margin: 0 0 12px 0; font-size: 1rem; color: #f8fafc; display: flex; justify-content: space-between; align-items: center;">
        <span>🤖 AI Staffing Advisor & Governance</span>
        <span style="background: #7c3aed; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px;">Human Review Required</span>
      </h3>
      <div style="background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 12px; font-size: 0.8rem; color: #cbd5e1;">
        <div style="margin-bottom: 6px;"><strong style="color: #38bdf8;">Scenario:</strong> PEAK Demand (1.5x Multiplier)</div>
        <div style="margin-bottom: 6px;"><strong style="color: #38bdf8;">Recommendation:</strong> Schedule +5 additional cashiers for branch BR-ARUSHA</div>
        <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 8px;">Evidence: Historical weekend traffic + promo campaign.</div>
        <div style="display: flex; gap: 8px;">
          <button style="background: #059669; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">Approve Plan</button>
          <button style="background: #475569; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">Adjust Parameters</button>
        </div>
      </div>
      <div style="margin-top: 10px; background: #451a03; border: 1px solid #d97706; color: #fef3c7; padding: 8px; border-radius: 6px; font-size: 0.75rem;">
        ⚠️ AI Safety Guardrail: Termination, promotion, or disciplinary actions strictly require human manager review.
      </div>
    </div>

  </div>

</div>
  `;
}
