// ============================================================
// Phase 35 — Treasury Command Center UI
// KwakoPos Design System (KDS v1.0.0) compliant
// ============================================================

export function renderTreasuryCommandCenterHtml(params: {
  tenantId: string;
  totalBankAccounts: number;
  totalBeneficiaries: number;
  activeExceptions: number;
  pendingPaymentRuns: number;
  pendingSettlements: number;
  liquidityStatus: "HEALTHY" | "WATCH" | "SHORTFALL_RISK" | "CRITICAL";
  riskLevel: "NORMAL" | "WARNING" | "ELEVATED" | "CRITICAL";
  cashOnHand: number;
  bankBalance: number;
  projectedCash: number;
  currency: string;
}): string {
  const liqColor: Record<string, string> = {
    HEALTHY: "#22c55e", WATCH: "#f59e0b", SHORTFALL_RISK: "#f97316", CRITICAL: "#ef4444",
  };
  const riskColor: Record<string, string> = {
    NORMAL: "#22c55e", WARNING: "#f59e0b", ELEVATED: "#f97316", CRITICAL: "#ef4444",
  };
  const lColor = liqColor[params.liquidityStatus] ?? "#6b7280";
  const rColor = riskColor[params.riskLevel] ?? "#6b7280";

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>KwakoPos — Treasury Command Center</title>
  <meta name="description" content="KwakoPos Finance & Treasury Command Center — cash position, bank balances, payment runs, reconciliation, liquidity forecasting"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --surface: #0a0f1e;
      --surface-2: #111827;
      --surface-3: #1a2235;
      --border: rgba(148,163,184,0.1);
      --text: #f1f5f9;
      --muted: #94a3b8;
      --accent: #6366f1;
      --accent-glow: rgba(99,102,241,0.2);
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --orange: #f97316;
      --radius: 14px;
      --radius-sm: 8px;
      --shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',system-ui,sans-serif;background:var(--surface);color:var(--text);min-height:100vh}

    /* Header */
    .hdr{background:linear-gradient(135deg,#0a0f1e 0%,#0d1932 60%,#1a0d2e 100%);
      border-bottom:1px solid var(--border);padding:20px 32px;
      display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .hdr-title{font-size:20px;font-weight:800;
      background:linear-gradient(90deg,#6366f1,#a78bfa,#38bdf8);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .hdr-sub{font-size:11px;font-weight:600;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:4px}
    .badges{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .badge{display:flex;align-items:center;gap:6px;padding:5px 14px;border-radius:100px;
      font-size:12px;font-weight:600;background:rgba(255,255,255,0.05);border:1px solid var(--border)}
    .dot{width:7px;height:7px;border-radius:50%;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

    /* Layout */
    .layout{display:grid;grid-template-columns:220px 1fr;min-height:calc(100vh - 73px)}

    /* Sidebar */
    .sidebar{background:var(--surface-2);border-right:1px solid var(--border);padding:20px 0}
    .sb-section{padding:0 12px;margin-bottom:20px}
    .sb-label{font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);
      text-transform:uppercase;padding:0 8px;margin-bottom:8px}
    .sb-item{display:flex;align-items:center;justify-content:space-between;
      padding:8px 12px;border-radius:var(--radius-sm);cursor:pointer;
      font-size:13px;font-weight:500;color:var(--muted);transition:all .15s;text-decoration:none}
    .sb-item:hover,.sb-item.active{background:rgba(99,102,241,.12);color:#a5b4fc}
    .sb-badge{font-size:10px;font-weight:700;padding:2px 6px;border-radius:100px;
      background:rgba(99,102,241,.15);color:#a5b4fc}
    .sb-badge.alert{background:rgba(239,68,68,.15);color:#f87171}

    /* Main */
    .main{padding:28px 32px;overflow-y:auto}

    /* Flow Banner */
    .flow{display:flex;align-items:center;flex-wrap:wrap;margin-bottom:24px;gap:0}
    .flow-step{font-size:11px;font-weight:600;padding:5px 12px;
      background:rgba(99,102,241,.1);color:#a5b4fc;
      border:1px solid rgba(99,102,241,.2)}
    .flow-step:first-child{border-radius:7px 0 0 7px}
    .flow-step:last-child{border-radius:0 7px 7px 0}
    .flow-arrow{font-size:12px;color:var(--muted);padding:5px 2px;
      background:var(--surface-2);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}

    /* KPI Strip */
    .kpi-strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-bottom:28px}
    .kpi{background:var(--surface-3);border:1px solid var(--border);border-radius:var(--radius);
      padding:18px 20px;transition:transform .2s,box-shadow .2s;cursor:default}
    .kpi:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
    .kpi-label{font-size:11px;color:var(--muted);font-weight:500;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}
    .kpi-val{font-size:26px;font-weight:800;line-height:1}
    .kpi-sub{font-size:11px;color:var(--muted);margin-top:4px}

    /* Section header */
    .sec{font-size:14px;font-weight:700;margin-bottom:14px;
      display:flex;align-items:center;gap:10px;color:var(--text)}
    .sec::after{content:'';flex:1;height:1px;background:var(--border)}

    /* Cash Position Visual */
    .cash-pos{background:var(--surface-3);border:1px solid var(--border);border-radius:var(--radius);
      padding:24px;margin-bottom:24px}
    .cash-row{display:flex;justify-content:space-between;align-items:center;
      padding:10px 0;border-bottom:1px solid var(--border);font-size:14px}
    .cash-row:last-child{border-bottom:none;font-weight:700;font-size:16px;padding-top:14px}
    .cash-row .label{color:var(--muted)}
    .cash-row .amt{font-weight:600}
    .cash-pos-sign{font-size:18px;color:var(--muted);padding:4px 0;text-align:center}

    /* Panels */
    .panels{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
    .panel{background:var(--surface-3);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
    .panel-title{font-size:13px;font-weight:700;margin-bottom:14px;color:var(--text)}

    /* Payment Run Card */
    .prun-card{border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 16px;
      margin-bottom:10px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;
      transition:border-color .2s}
    .prun-card:hover{border-color:rgba(99,102,241,.4)}
    .prun-subject{font-size:14px;font-weight:600;margin-bottom:3px}
    .prun-meta{font-size:12px;color:var(--muted)}
    .chip{font-size:10px;font-weight:700;padding:3px 9px;border-radius:100px}
    .chip-healthy{background:rgba(34,197,94,.12);color:#4ade80}
    .chip-watch{background:rgba(245,158,11,.12);color:#fbbf24}
    .chip-risk{background:rgba(249,115,22,.12);color:#fb923c}
    .chip-critical{background:rgba(239,68,68,.12);color:#f87171}
    .chip-approved{background:rgba(34,197,94,.12);color:#4ade80}
    .chip-pending{background:rgba(245,158,11,.12);color:#fbbf24}
    .chip-complete{background:rgba(99,102,241,.12);color:#a5b4fc}

    /* Exception Row */
    .exc-row{display:flex;justify-content:space-between;align-items:center;
      padding:10px 0;border-bottom:1px solid var(--border);font-size:13px}
    .exc-row:last-child{border-bottom:none}
    .exc-type{font-weight:600;color:var(--text)}
    .exc-desc{font-size:12px;color:var(--muted);margin-top:2px}

    /* Forecast bars */
    .forecast-bar-wrap{margin-top:8px}
    .bar-label{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:4px}
    .bar-bg{background:rgba(255,255,255,.06);border-radius:4px;height:8px;overflow:hidden;margin-bottom:8px}
    .bar-fill{height:100%;border-radius:4px;transition:width .6s ease}

    /* Btn */
    .btn{padding:7px 14px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;
      cursor:pointer;border:none;transition:all .15s}
    .btn-primary{background:rgba(99,102,241,.15);color:#a5b4fc;border:1px solid rgba(99,102,241,.3)}
    .btn-primary:hover{background:rgba(99,102,241,.25)}
    .btn-danger{background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.25)}
  </style>
</head>
<body>

<!-- Header -->
<header class="hdr">
  <div>
    <div class="hdr-sub">KwakoPos Finance &amp; Treasury — KFTL v1.0.0</div>
    <div class="hdr-title">Treasury Command Center</div>
  </div>
  <div class="badges">
    <div class="badge">
      <div class="dot" style="background:${lColor}"></div>
      <span style="color:${lColor}">Liquidity: ${params.liquidityStatus.replace("_", " ")}</span>
    </div>
    <div class="badge">
      <div class="dot" style="background:${rColor}"></div>
      <span style="color:${rColor}">Risk: ${params.riskLevel}</span>
    </div>
    <button id="btn-new-payment-run" class="btn btn-primary">+ Payment Run</button>
  </div>
</header>

<div class="layout">
  <!-- Sidebar -->
  <nav class="sidebar" aria-label="Treasury Navigation">
    <div class="sb-section">
      <div class="sb-label">Treasury</div>
      <a class="sb-item active" id="nav-cash-pos" href="#cash">Cash Position</a>
      <a class="sb-item" id="nav-banks" href="#banks">
        Bank Accounts <span class="sb-badge">${params.totalBankAccounts}</span>
      </a>
      <a class="sb-item" id="nav-payments" href="#payments">
        Payment Runs <span class="sb-badge${params.pendingPaymentRuns > 0 ? " alert" : ""}">${params.pendingPaymentRuns}</span>
      </a>
      <a class="sb-item" id="nav-collections" href="#collections">Collections</a>
      <a class="sb-item" id="nav-payables" href="#payables">Payables</a>
      <a class="sb-item" id="nav-settlements" href="#settlements">
        Settlements <span class="sb-badge">${params.pendingSettlements}</span>
      </a>
    </div>
    <div class="sb-section">
      <div class="sb-label">Reconciliation</div>
      <a class="sb-item" id="nav-recon" href="#recon">Bank Reconciliation</a>
      <a class="sb-item" id="nav-payment-recon" href="#payment-recon">Payment Reconciliation</a>
      <a class="sb-item" id="nav-exceptions" href="#exceptions">
        Exceptions <span class="sb-badge${params.activeExceptions > 0 ? " alert" : ""}">${params.activeExceptions}</span>
      </a>
    </div>
    <div class="sb-section">
      <div class="sb-label">Intelligence</div>
      <a class="sb-item" id="nav-forecast" href="#forecast">Liquidity Forecast</a>
      <a class="sb-item" id="nav-wc" href="#wc">Working Capital</a>
      <a class="sb-item" id="nav-fx" href="#fx">FX Exposure</a>
      <a class="sb-item" id="nav-risk" href="#risk">Risk Dashboard</a>
    </div>
    <div class="sb-section">
      <div class="sb-label">Governance</div>
      <a class="sb-item" id="nav-beneficiaries" href="#beneficiaries">
        Beneficiaries <span class="sb-badge">${params.totalBeneficiaries}</span>
      </a>
      <a class="sb-item" id="nav-policies" href="#policies">Treasury Policies</a>
      <a class="sb-item" id="nav-approvals" href="#approvals">Approvals</a>
      <a class="sb-item" id="nav-audit" href="#audit">Audit Trail</a>
    </div>
  </nav>

  <!-- Main -->
  <main class="main">

    <!-- Lifecycle flow -->
    <div class="flow" aria-label="Treasury Lifecycle">
      <span class="flow-step">Transaction</span><span class="flow-arrow">→</span>
      <span class="flow-step">Journal</span><span class="flow-arrow">→</span>
      <span class="flow-step">Ledger</span><span class="flow-arrow">→</span>
      <span class="flow-step">Cash Position</span><span class="flow-arrow">→</span>
      <span class="flow-step">Recon</span><span class="flow-arrow">→</span>
      <span class="flow-step">Decision</span><span class="flow-arrow">→</span>
      <span class="flow-step">Approval</span><span class="flow-arrow">→</span>
      <span class="flow-step">Execute</span><span class="flow-arrow">→</span>
      <span class="flow-step">Verify</span><span class="flow-arrow">→</span>
      <span class="flow-step">Audit</span>
    </div>

    <!-- KPI Strip -->
    <div class="kpi-strip" role="region" aria-label="Treasury Summary">
      <div class="kpi">
        <div class="kpi-label">Cash on Hand</div>
        <div class="kpi-val" style="color:#22c55e">${params.currency} ${fmt(params.cashOnHand)}</div>
        <div class="kpi-sub">Branch + petty cash</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Bank Balance</div>
        <div class="kpi-val" style="color:#38bdf8">${params.currency} ${fmt(params.bankBalance)}</div>
        <div class="kpi-sub">All accounts</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Projected Cash</div>
        <div class="kpi-val" style="color:${params.projectedCash >= 0 ? "#22c55e" : "#ef4444"}">${params.currency} ${fmt(params.projectedCash)}</div>
        <div class="kpi-sub">After obligations</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Bank Accounts</div>
        <div class="kpi-val" style="color:#6366f1">${params.totalBankAccounts}</div>
        <div class="kpi-sub">Active registry</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Payment Runs</div>
        <div class="kpi-val" style="color:#f59e0b">${params.pendingPaymentRuns}</div>
        <div class="kpi-sub">Pending execution</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Exceptions</div>
        <div class="kpi-val" style="color:${params.activeExceptions > 0 ? "#ef4444" : "#22c55e"}">${params.activeExceptions}</div>
        <div class="kpi-sub">Require review</div>
      </div>
    </div>

    <!-- Cash Position Visual -->
    <div class="sec" id="cash">Cash Position — ${params.currency}</div>
    <div class="cash-pos">
      <div class="cash-row">
        <span class="label">Opening Cash Balance</span>
        <span class="amt">${params.currency} ${fmt(params.cashOnHand + params.bankBalance)}</span>
      </div>
      <div class="cash-pos-sign">+</div>
      <div class="cash-row">
        <span class="label">Expected Inflows (Receivables + Settlements)</span>
        <span class="amt" style="color:#22c55e">+ ${params.currency} 12,450,000</span>
      </div>
      <div class="cash-pos-sign">−</div>
      <div class="cash-row">
        <span class="label">Expected Outflows (Payables + Payroll + Taxes)</span>
        <span class="amt" style="color:#f87171">− ${params.currency} 8,200,000</span>
      </div>
      <div class="cash-pos-sign">−</div>
      <div class="cash-row">
        <span class="label">Outstanding Obligations</span>
        <span class="amt" style="color:#fbbf24">− ${params.currency} 1,500,000</span>
      </div>
      <div class="cash-row">
        <span class="label">Projected Closing Cash</span>
        <span class="amt" style="color:${params.projectedCash >= 0 ? "#4ade80" : "#f87171"}">${params.currency} ${fmt(params.projectedCash)}</span>
      </div>
    </div>

    <!-- 2-column panels -->
    <div class="panels">

      <!-- Payment Runs -->
      <div class="panel">
        <div class="panel-title" id="payments">Active Payment Runs</div>

        <div class="prun-card">
          <div>
            <div class="prun-subject">Supplier Payments — October 2026</div>
            <div class="prun-meta">14 payments · ${params.currency} 6,240,000 · Liquidity: OK</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <span class="chip chip-pending">AWAITING APPROVAL</span>
            <button id="btn-view-run-1" class="btn btn-primary" style="font-size:11px">Review</button>
          </div>
        </div>

        <div class="prun-card">
          <div>
            <div class="prun-subject">Payroll Run — October 2026</div>
            <div class="prun-meta">23 employees · ${params.currency} 4,850,000 · Approved</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <span class="chip chip-approved">EXECUTING</span>
            <button id="btn-view-run-2" class="btn btn-primary" style="font-size:11px">Track</button>
          </div>
        </div>

        <div class="prun-card">
          <div>
            <div class="prun-subject">Tax Remittance — VAT Q3</div>
            <div class="prun-meta">1 payment · ${params.currency} 890,000 · Complete</div>
          </div>
          <div>
            <span class="chip chip-complete">COMPLETE</span>
          </div>
        </div>
      </div>

      <!-- Liquidity Forecast Scenarios -->
      <div class="panel">
        <div class="panel-title" id="forecast">30-Day Liquidity Forecast</div>
        <div class="forecast-bar-wrap">
          <div class="bar-label"><span>Base Scenario</span><span style="color:#22c55e">+${params.currency} 4.25M surplus</span></div>
          <div class="bar-bg"><div class="bar-fill" style="width:85%;background:linear-gradient(90deg,#22c55e,#4ade80)"></div></div>

          <div class="bar-label"><span>Conservative</span><span style="color:#f59e0b">+${params.currency} 1.8M surplus</span></div>
          <div class="bar-bg"><div class="bar-fill" style="width:60%;background:linear-gradient(90deg,#f59e0b,#fbbf24)"></div></div>

          <div class="bar-label"><span>Stress</span><span style="color:#f97316">Day 22 shortfall risk</span></div>
          <div class="bar-bg"><div class="bar-fill" style="width:35%;background:linear-gradient(90deg,#f97316,#fb923c)"></div></div>

          <div class="bar-label"><span>Shock</span><span style="color:#ef4444">Day 9 shortfall risk</span></div>
          <div class="bar-bg"><div class="bar-fill" style="width:18%;background:linear-gradient(90deg,#ef4444,#f87171)"></div></div>
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--muted)">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span>DSO (Days Sales Outstanding)</span><span style="color:var(--text);font-weight:600">18.4 days</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span>DPO (Days Payable Outstanding)</span><span style="color:var(--text);font-weight:600">24.1 days</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>Cash Conversion Cycle</span><span style="color:var(--text);font-weight:600">32.3 days</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Exceptions / Reconciliation -->
    <div class="panels">
      <div class="panel">
        <div class="panel-title" id="exceptions">Treasury Exceptions</div>
        <div class="exc-row">
          <div>
            <div class="exc-type">Unmatched Bank Statement Line</div>
            <div class="exc-desc">TZS 340,000 — NMB Bank — 28 Aug 2026</div>
          </div>
          <span class="chip chip-watch">INVESTIGATING</span>
        </div>
        <div class="exc-row">
          <div>
            <div class="exc-type">Settlement Delay — M-Pesa</div>
            <div class="exc-desc">Expected 27 Aug · Received 29 Aug — 2 days delay</div>
          </div>
          <span class="chip chip-risk">ELEVATED</span>
        </div>
        <div class="exc-row">
          <div>
            <div class="exc-type">Cash Variance — Branch 3</div>
            <div class="exc-desc">Expected TZS 45,000 — Actual TZS 42,800</div>
          </div>
          <span class="chip chip-pending">CREATED</span>
        </div>
        <div style="margin-top:12px">
          <button id="btn-view-exceptions" class="btn btn-primary">View All Exceptions</button>
        </div>
      </div>

      <!-- Bank Reconciliation Status -->
      <div class="panel">
        <div class="panel-title" id="recon">Bank Reconciliation Status</div>
        <div class="exc-row">
          <div>
            <div class="exc-type">NMB Bank — Operating A/C</div>
            <div class="exc-desc">Last reconciled: 28 Aug 2026 · 148 lines matched</div>
          </div>
          <span class="chip chip-approved">COMPLETE</span>
        </div>
        <div class="exc-row">
          <div>
            <div class="exc-type">CRDB Bank — Payroll A/C</div>
            <div class="exc-desc">Statement pending · 29 Aug 2026</div>
          </div>
          <span class="chip chip-watch">PENDING</span>
        </div>
        <div class="exc-row">
          <div>
            <div class="exc-type">M-Pesa Settlement Account</div>
            <div class="exc-desc">3 unmatched lines · Review required</div>
          </div>
          <span class="chip chip-risk">REVIEW REQUIRED</span>
        </div>
        <div style="margin-top:12px">
          <button id="btn-run-recon" class="btn btn-primary">Run Reconciliation</button>
        </div>
      </div>
    </div>

  </main>
</div>

<script>
  document.getElementById('btn-run-recon')?.addEventListener('click', () => {
    alert('Bank Reconciliation Engine started. Processing statement lines...');
  });
  document.getElementById('btn-new-payment-run')?.addEventListener('click', () => {
    alert('Treasury Command Center: New Payment Run wizard will open. Beneficiary validation, liquidity check, and approval workflow will be triggered.');
  });
</script>
</body>
</html>`.trim();
}
