export function renderBiAnalyticsCommandCenter(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KwakoPos BI & Analytics Control Tower (KBI)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 2rem; }
    .title { font-size: 1.75rem; font-weight: 700; color: #38bdf8; }
    .badge { padding: 0.5rem 1rem; border-radius: 9999px; font-weight: 600; background: #0369a1; color: #7dd3fc; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; }
    .card-title { font-size: 0.875rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .metric { font-size: 2rem; font-weight: 700; color: #ffffff; }
    .invariants-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; }
    .invariant-box { background: #0f172a; padding: 1rem; border-radius: 0.5rem; text-align: center; border: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">KwakoPos Business Intelligence & Analytics Control Tower</div>
      <div style="color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem;">Governed Intelligence & Semantic Decision-Support Layer (KBI v1.0.0)</div>
    </div>
    <div class="badge">BI PLATFORM: 100% OPERATIONAL</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Canonical Metrics Layer</div>
      <div class="metric">48 Metrics</div>
      <div style="color: #38bdf8; font-size: 0.875rem; margin-top: 0.5rem;">Single Source of Analytical Truth</div>
    </div>
    <div class="card">
      <div class="card-title">Data Freshness Index</div>
      <div class="metric">99.8 %</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Real-time POS & Ledger Alignment</div>
    </div>
    <div class="card">
      <div class="card-title">Analytical Reconciliation</div>
      <div class="metric">100.0 %</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Reconciled with Transaction Ledgers</div>
    </div>
    <div class="card">
      <div class="card-title">AI Forecast Accuracy</div>
      <div class="metric">94.6 %</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Demand & Cash Flow Predictions</div>
    </div>
  </div>

  <div class="card-title" style="margin-bottom: 0.75rem;">10 Analytical Pillar Invariants</div>
  <div class="invariants-grid">
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">OPERATIONAL SEPARATION</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Read-only Observation</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">PROTECTED</div>
    </div>
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">SEMANTIC METRIC GOVERNANCE</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Authoritative Formulas</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ACTIVE</div>
    </div>
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">PHASE 31 WORKFLOW ALERTS</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Automated Task Dispatch</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ACTIVE</div>
    </div>
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">RBAC & RLS SECURITY</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Tenant & Role Scoping</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ACTIVE</div>
    </div>
  </div>
</body>
</html>
  `;
}
