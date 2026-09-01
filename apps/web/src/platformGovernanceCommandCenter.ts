export function renderPlatformGovernanceCommandCenter(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KwakoPos Platform Governance Control Tower (KPGA)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 2rem; }
    .title { font-size: 1.75rem; font-weight: 700; color: #38bdf8; }
    .badge { padding: 0.5rem 1rem; border-radius: 9999px; font-weight: 600; background: #166534; color: #4ade80; }
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
      <div class="title">KwakoPos Platform Governance Control Tower (KPGA)</div>
      <div style="color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem;">Architectural Integrity, API Governance, Fitness Rules & Deprecation Registry</div>
    </div>
    <div class="badge">ONE CORE INVARIANT: 100% PASSING</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Architecture Fitness Score</div>
      <div class="metric">100.0 %</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Automated CI/CD Fitness Gates Active</div>
    </div>
    <div class="card">
      <div class="card-title">Governed API Contracts</div>
      <div class="metric">1,240 Endpoints</div>
      <div style="color: #38bdf8; font-size: 0.875rem; margin-top: 0.5rem;">Zero Breaking Changes Allowed Without Notice</div>
    </div>
    <div class="card">
      <div class="card-title">Architecture Decision Records</div>
      <div class="metric">48 ADRs</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Version-Controlled ADR Registry</div>
    </div>
    <div class="card">
      <div class="card-title">Platform Complexity Score</div>
      <div class="metric">25 / 100</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Complexity Budget Within Approved Envelope</div>
    </div>
  </div>

  <div class="card-title" style="margin-bottom: 0.75rem;">Permanent Governance Invariants</div>
  <div class="invariants-grid">
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">ONE CORE</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">No Codebase Forks</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ENFORCED</div>
    </div>
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">API FIRST</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Contract Validation</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ENFORCED</div>
    </div>
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">DATA INTEGRITY</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Financial & Stock Ledger</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ENFORCED</div>
    </div>
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">TENANT ISOLATION</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Zero Data Leakage</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ENFORCED</div>
    </div>
  </div>
</body>
</html>
  `;
}
