// ============================================================
// Phase 34 — Enterprise Approvals Center UI
// KwakoPos Design System (KDS v1.0.0) compliant
// ============================================================

export function renderEnterpriseApprovalsCenterHtml(params: {
  tenantId: string;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  escalatedCount: number;
  expiredCount: number;
  totalPolicies: number;
  healthStatus: "HEALTHY" | "WARNING" | "AT_RISK" | "CRITICAL";
}): string {
  const healthColor: Record<string, string> = {
    HEALTHY: "#22c55e",
    WARNING: "#f59e0b",
    AT_RISK: "#f97316",
    CRITICAL: "#ef4444",
  };

  const color = healthColor[params.healthStatus] ?? "#6b7280";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KwakoPos — Enterprise Approval Center</title>
  <meta name="description" content="KwakoPos Enterprise Approval Center — centralized, policy-driven approval and authorization for all governed business actions" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --kds-surface: #0f172a;
      --kds-surface-elevated: #1e293b;
      --kds-surface-card: #1e293b;
      --kds-border: rgba(148,163,184,0.12);
      --kds-text-primary: #f1f5f9;
      --kds-text-secondary: #94a3b8;
      --kds-accent: #6366f1;
      --kds-accent-hover: #818cf8;
      --kds-success: #22c55e;
      --kds-warning: #f59e0b;
      --kds-danger: #ef4444;
      --kds-info: #38bdf8;
      --kds-radius: 12px;
      --kds-radius-sm: 8px;
      --kds-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: var(--kds-surface);
      color: var(--kds-text-primary);
      min-height: 100vh;
    }

    /* ─── Header ─── */
    .approval-header {
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
      border-bottom: 1px solid var(--kds-border);
      padding: 24px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .approval-header h1 {
      font-size: 22px;
      font-weight: 700;
      background: linear-gradient(90deg, #6366f1, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .health-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 600;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--kds-border);
      color: ${color};
    }
    .health-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: ${color};
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ─── Layout ─── */
    .approval-layout {
      display: grid;
      grid-template-columns: 240px 1fr;
      min-height: calc(100vh - 81px);
    }

    /* ─── Sidebar Nav ─── */
    .approval-sidebar {
      background: var(--kds-surface-elevated);
      border-right: 1px solid var(--kds-border);
      padding: 24px 0;
    }
    .sidebar-section {
      padding: 0 16px;
      margin-bottom: 24px;
    }
    .sidebar-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1px;
      color: var(--kds-text-secondary);
      text-transform: uppercase;
      padding: 0 8px;
      margin-bottom: 8px;
    }
    .sidebar-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      border-radius: var(--kds-radius-sm);
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: var(--kds-text-secondary);
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .sidebar-item:hover, .sidebar-item.active {
      background: rgba(99,102,241,0.12);
      color: var(--kds-accent-hover);
    }
    .badge-count {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 100px;
      background: rgba(99,102,241,0.2);
      color: var(--kds-accent-hover);
    }
    .badge-urgent { background: rgba(239,68,68,0.15); color: #f87171; }

    /* ─── Main Content ─── */
    .approval-main {
      padding: 32px;
      overflow-y: auto;
    }

    /* ─── KPI Cards ─── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .kpi-card {
      background: var(--kds-surface-card);
      border: 1px solid var(--kds-border);
      border-radius: var(--kds-radius);
      padding: 20px;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--kds-shadow);
    }
    .kpi-label { font-size: 12px; color: var(--kds-text-secondary); font-weight: 500; margin-bottom: 8px; }
    .kpi-value { font-size: 32px; font-weight: 700; line-height: 1; }
    .kpi-sub { font-size: 12px; color: var(--kds-text-secondary); margin-top: 4px; }
    .kpi-pending .kpi-value { color: #f59e0b; }
    .kpi-approved .kpi-value { color: #22c55e; }
    .kpi-rejected .kpi-value { color: #ef4444; }
    .kpi-escalated .kpi-value { color: #f97316; }
    .kpi-expired .kpi-value { color: #6b7280; }
    .kpi-policies .kpi-value { color: #6366f1; }

    /* ─── Section ─── */
    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--kds-text-primary);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-title::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--kds-border);
    }

    /* ─── Approval Request Card ─── */
    .request-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 32px;
    }
    .request-card {
      background: var(--kds-surface-card);
      border: 1px solid var(--kds-border);
      border-radius: var(--kds-radius);
      padding: 20px 24px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      transition: border-color 0.2s ease;
    }
    .request-card:hover { border-color: rgba(99,102,241,0.4); }
    .request-card.risk-critical { border-left: 3px solid #ef4444; }
    .request-card.risk-high { border-left: 3px solid #f97316; }
    .request-card.risk-medium { border-left: 3px solid #f59e0b; }
    .request-card.risk-low { border-left: 3px solid #22c55e; }

    .request-subject { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
    .request-meta { font-size: 13px; color: var(--kds-text-secondary); }

    .status-chip {
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 100px;
      display: inline-block;
    }
    .chip-pending { background: rgba(245,158,11,0.15); color: #fbbf24; }
    .chip-approved { background: rgba(34,197,94,0.15); color: #4ade80; }
    .chip-rejected { background: rgba(239,68,68,0.15); color: #f87171; }
    .chip-escalated { background: rgba(249,115,22,0.15); color: #fb923c; }
    .chip-expired { background: rgba(107,114,128,0.15); color: #9ca3af; }
    .chip-complete { background: rgba(99,102,241,0.15); color: #a5b4fc; }

    /* ─── Action Buttons ─── */
    .action-row {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 8px 16px;
      border-radius: var(--kds-radius-sm);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }
    .btn-approve { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
    .btn-approve:hover { background: rgba(34,197,94,0.25); }
    .btn-reject { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
    .btn-reject:hover { background: rgba(239,68,68,0.22); }
    .btn-changes { background: rgba(245,158,11,0.12); color: #fbbf24; border: 1px solid rgba(245,158,11,0.25); }
    .btn-view { background: rgba(99,102,241,0.12); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.25); }
    .btn-view:hover { background: rgba(99,102,241,0.2); }

    /* ─── Policy Panel ─── */
    .policy-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }
    .policy-card {
      background: var(--kds-surface-card);
      border: 1px solid var(--kds-border);
      border-radius: var(--kds-radius);
      padding: 20px;
    }
    .policy-name { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
    .policy-detail { font-size: 12px; color: var(--kds-text-secondary); margin-top: 4px; display: flex; justify-content: space-between; }

    /* ─── Lifecycle Trail ─── */
    .lifecycle-trail {
      display: flex;
      align-items: center;
      gap: 0;
      flex-wrap: wrap;
      margin-bottom: 32px;
    }
    .lc-step {
      font-size: 12px;
      font-weight: 600;
      padding: 6px 14px;
      background: rgba(99,102,241,0.12);
      color: #a5b4fc;
      border: 1px solid rgba(99,102,241,0.2);
    }
    .lc-step:first-child { border-radius: 8px 0 0 8px; }
    .lc-step:last-child { border-radius: 0 8px 8px 0; }
    .lc-arrow {
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; color: var(--kds-text-secondary);
      background: var(--kds-surface-elevated);
      border-top: 1px solid var(--kds-border);
      border-bottom: 1px solid var(--kds-border);
    }
  </style>
</head>
<body>

  <!-- Header -->
  <header class="approval-header">
    <div>
      <div style="font-size:11px; font-weight:600; letter-spacing:1px; color:var(--kds-text-secondary); text-transform:uppercase; margin-bottom:4px;">
        KwakoPos Enterprise Approvals — KEAE v1.0.0
      </div>
      <h1>Enterprise Approval Center</h1>
    </div>
    <div style="display:flex; gap:12px; align-items:center;">
      <div class="health-badge">
        <div class="health-dot"></div>
        ${params.healthStatus}
      </div>
      <button id="btn-new-request" class="btn btn-view" style="font-size:14px;">+ New Request</button>
    </div>
  </header>

  <div class="approval-layout">

    <!-- Sidebar -->
    <nav class="approval-sidebar" aria-label="Approval Center Navigation">
      <div class="sidebar-section">
        <div class="sidebar-label">My Work</div>
        <a class="sidebar-item active" id="nav-pending" href="#pending">
          Pending Approval
          <span class="badge-count badge-urgent">${params.pendingCount}</span>
        </a>
        <a class="sidebar-item" id="nav-my-requests" href="#my-requests">My Requests</a>
        <a class="sidebar-item" id="nav-my-approvals" href="#my-approvals">My Approvals</a>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Status</div>
        <a class="sidebar-item" id="nav-approved" href="#approved">
          Approved
          <span class="badge-count">${params.approvedCount}</span>
        </a>
        <a class="sidebar-item" id="nav-rejected" href="#rejected">
          Rejected
          <span class="badge-count">${params.rejectedCount}</span>
        </a>
        <a class="sidebar-item" id="nav-escalated" href="#escalated">
          Escalated
          <span class="badge-count badge-urgent">${params.escalatedCount}</span>
        </a>
        <a class="sidebar-item" id="nav-expired" href="#expired">
          Expired
          <span class="badge-count">${params.expiredCount}</span>
        </a>
        <a class="sidebar-item" id="nav-executed" href="#executed">Executed</a>
        <a class="sidebar-item" id="nav-failed" href="#failed">Failed</a>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Governance</div>
        <a class="sidebar-item" id="nav-policies" href="#policies">
          Approval Policies
          <span class="badge-count">${params.totalPolicies}</span>
        </a>
        <a class="sidebar-item" id="nav-sla" href="#sla">Approval SLAs</a>
        <a class="sidebar-item" id="nav-analytics" href="#analytics">Policy Analytics</a>
        <a class="sidebar-item" id="nav-audit" href="#audit">Audit Trail</a>
      </div>
    </nav>

    <!-- Main Content -->
    <main class="approval-main">

      <!-- Approval Lifecycle Banner -->
      <div class="lifecycle-trail" aria-label="Approval Lifecycle">
        <span class="lc-step">Request</span>
        <span class="lc-arrow">→</span>
        <span class="lc-step">Validate</span>
        <span class="lc-arrow">→</span>
        <span class="lc-step">Policy</span>
        <span class="lc-arrow">→</span>
        <span class="lc-step">Approvers</span>
        <span class="lc-arrow">→</span>
        <span class="lc-step">Review</span>
        <span class="lc-arrow">→</span>
        <span class="lc-step">Decision</span>
        <span class="lc-arrow">→</span>
        <span class="lc-step">Execute</span>
        <span class="lc-arrow">→</span>
        <span class="lc-step">Verify</span>
        <span class="lc-arrow">→</span>
        <span class="lc-step">Audit</span>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid" role="region" aria-label="Approval Summary">
        <div class="kpi-card kpi-pending">
          <div class="kpi-label">Pending Approval</div>
          <div class="kpi-value">${params.pendingCount}</div>
          <div class="kpi-sub">Require action</div>
        </div>
        <div class="kpi-card kpi-approved">
          <div class="kpi-label">Approved</div>
          <div class="kpi-value">${params.approvedCount}</div>
          <div class="kpi-sub">Authorized</div>
        </div>
        <div class="kpi-card kpi-rejected">
          <div class="kpi-label">Rejected</div>
          <div class="kpi-value">${params.rejectedCount}</div>
          <div class="kpi-sub">Not authorized</div>
        </div>
        <div class="kpi-card kpi-escalated">
          <div class="kpi-label">Escalated</div>
          <div class="kpi-value">${params.escalatedCount}</div>
          <div class="kpi-sub">SLA exceeded</div>
        </div>
        <div class="kpi-card kpi-expired">
          <div class="kpi-label">Expired</div>
          <div class="kpi-value">${params.expiredCount}</div>
          <div class="kpi-sub">Revalidation needed</div>
        </div>
        <div class="kpi-card kpi-policies">
          <div class="kpi-label">Active Policies</div>
          <div class="kpi-value">${params.totalPolicies}</div>
          <div class="kpi-sub">Governing rules</div>
        </div>
      </div>

      <!-- Pending Requests -->
      <div class="section-title" id="pending">Pending Approval</div>
      <div class="request-grid" id="pending-requests-list">
        <div class="request-card risk-high">
          <div>
            <div class="request-subject">Purchase Order — 1,000 units Panadol 500mg (TZS 2,400,000)</div>
            <div class="request-meta">Domain: Procurement · Requested by: Storekeeper · Policy: POL-PROCUREMENT-001 · Risk: HIGH</div>
            <div class="action-row">
              <button id="btn-approve-1" class="btn btn-approve">✓ Approve</button>
              <button id="btn-reject-1" class="btn btn-reject">✗ Reject</button>
              <button id="btn-changes-1" class="btn btn-changes">Request Changes</button>
              <button id="btn-view-1" class="btn btn-view">View Evidence</button>
            </div>
          </div>
          <div>
            <span class="status-chip chip-pending">PENDING</span>
            <div style="font-size:12px; color:var(--kds-text-secondary); margin-top:8px; text-align:right;">Expires in 48h</div>
          </div>
        </div>

        <div class="request-card risk-medium">
          <div>
            <div class="request-subject">Staff Expense — Transport & Accommodation (TZS 450,000)</div>
            <div class="request-meta">Domain: Finance · Requested by: Senior Cashier · Policy: POL-EXPENSE-001 · Risk: MEDIUM</div>
            <div class="action-row">
              <button id="btn-approve-2" class="btn btn-approve">✓ Approve</button>
              <button id="btn-reject-2" class="btn btn-reject">✗ Reject</button>
              <button id="btn-view-2" class="btn btn-view">View Evidence</button>
            </div>
          </div>
          <div>
            <span class="status-chip chip-pending">PENDING</span>
            <div style="font-size:12px; color:var(--kds-text-secondary); margin-top:8px; text-align:right;">Expires in 24h</div>
          </div>
        </div>

        <div class="request-card risk-critical">
          <div>
            <div class="request-subject">Platform Critical Change — Global AI Control Override</div>
            <div class="request-meta">Domain: Platform · Policy: POL-PLATFORM-CRITICAL-001 · Quorum: 2 of 3 approvers · Risk: CRITICAL</div>
            <div class="action-row">
              <button id="btn-approve-3" class="btn btn-approve">✓ Approve</button>
              <button id="btn-reject-3" class="btn btn-reject">✗ Reject</button>
              <button id="btn-view-3" class="btn btn-view">View Evidence</button>
            </div>
          </div>
          <div>
            <span class="status-chip chip-pending">PENDING</span>
            <div style="font-size:12px; color:var(--kds-text-secondary); margin-top:8px; text-align:right; color:#ef4444;">⚠ Expires in 4h</div>
          </div>
        </div>

        <div class="request-card risk-low">
          <div>
            <div class="request-subject">AI Recommendation — Auto-Approve Reorder: Paracetamol 100mg (TZS 85,000)</div>
            <div class="request-meta">Domain: Inventory · Policy: POL-REORDER-AUTONOMOUS-001 · Mode: AUTONOMOUS · Risk: LOW</div>
            <div style="margin-top:8px;">
              <span style="font-size:12px; color:#4ade80; font-weight:600;">✓ Autonomously approved — below TZS 500,000 threshold. Audit recorded.</span>
            </div>
          </div>
          <div>
            <span class="status-chip chip-complete">AUTO-APPROVED</span>
          </div>
        </div>
      </div>

      <!-- Active Approval Policies -->
      <div class="section-title" id="policies">Active Approval Policies</div>
      <div class="policy-grid">
        <div class="policy-card">
          <div class="policy-name">POL-EXPENSE-001 <span class="status-chip chip-approved" style="margin-left:8px;">v1.0 ACTIVE</span></div>
          <div class="policy-detail"><span>Domain: Finance</span><span>Mode: Single</span></div>
          <div class="policy-detail"><span>Risk: Medium</span><span>Approver: Finance Manager</span></div>
          <div class="policy-detail"><span>SLA: 24h</span><span>Blast Radius: Branch</span></div>
        </div>
        <div class="policy-card">
          <div class="policy-name">POL-PROCUREMENT-001 <span class="status-chip chip-approved" style="margin-left:8px;">v1.0 ACTIVE</span></div>
          <div class="policy-detail"><span>Domain: Procurement</span><span>Mode: Sequential</span></div>
          <div class="policy-detail"><span>Risk: High</span><span>Approvers: Mgr → Finance</span></div>
          <div class="policy-detail"><span>SLA: 48h · Threshold: TZS 5M</span></div>
        </div>
        <div class="policy-card">
          <div class="policy-name">POL-REORDER-AUTONOMOUS-001 <span class="status-chip chip-approved" style="margin-left:8px;">v1.0 ACTIVE</span></div>
          <div class="policy-detail"><span>Domain: Inventory</span><span>Mode: Autonomous</span></div>
          <div class="policy-detail"><span>Risk: Low</span><span>Auto-approve &lt; TZS 500K</span></div>
          <div class="policy-detail"><span>SLA: 1h · Blast: Record</span></div>
        </div>
        <div class="policy-card">
          <div class="policy-name">POL-PLATFORM-CRITICAL-001 <span class="status-chip chip-escalated" style="margin-left:8px;">v1.0 ACTIVE</span></div>
          <div class="policy-detail"><span>Domain: Platform</span><span>Mode: Quorum (2/3)</span></div>
          <div class="policy-detail"><span>Risk: Critical</span><span>Blast: Platform</span></div>
          <div class="policy-detail"><span>SLA: 4h · Self-approval: No</span></div>
        </div>
        <div class="policy-card">
          <div class="policy-name">POL-REFUND-001 <span class="status-chip chip-approved" style="margin-left:8px;">v1.0 ACTIVE</span></div>
          <div class="policy-detail"><span>Domain: Refund</span><span>Mode: Single</span></div>
          <div class="policy-detail"><span>Risk: High</span><span>Approver: Manager</span></div>
          <div class="policy-detail"><span>SLA: 12h · Blast: Branch</span></div>
        </div>
        <div class="policy-card">
          <div class="policy-name">POL-AI-ACTION-001 <span class="status-chip chip-approved" style="margin-left:8px;">v1.0 ACTIVE</span></div>
          <div class="policy-detail"><span>Domain: AI</span><span>Mode: Single</span></div>
          <div class="policy-detail"><span>Risk: High</span><span>Approver: Manager</span></div>
          <div class="policy-detail"><span>SLA: 8h · Blast: Tenant</span></div>
        </div>
      </div>

    </main>
  </div>

  <script>
    // Approval Center interactivity — approve / reject state transitions
    document.querySelectorAll('[id^="btn-approve-"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.request-card');
        const chip = card?.querySelector('.status-chip');
        if (chip) { chip.className = 'status-chip chip-approved'; chip.textContent = 'APPROVED'; }
        [btn, card?.querySelector('[id^="btn-reject-"]'), card?.querySelector('[id^="btn-changes-"]')]
          .forEach(b => { if (b && b !== btn) b.style.display = 'none'; });
        btn.textContent = '✓ Approved';
        btn.disabled = true;
      });
    });
    document.querySelectorAll('[id^="btn-reject-"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.request-card');
        const chip = card?.querySelector('.status-chip');
        if (chip) { chip.className = 'status-chip chip-rejected'; chip.textContent = 'REJECTED'; }
        card?.querySelectorAll('.btn').forEach(b => { b.disabled = true; });
        btn.textContent = '✗ Rejected';
      });
    });
  </script>
</body>
</html>
  `.trim();
}
