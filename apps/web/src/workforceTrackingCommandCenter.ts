export function renderWorkforceTrackingCommandCenter(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KwakoPos Workforce Operating System Control Tower</title>
  <style>
    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; }
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
      <div class="title">KwakoPos Workforce Operating System Control Tower</div>
      <div style="color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem;">Workforce Management, Shift Rostering, Immutable Attendance & Project Labor Costing</div>
    </div>
    <div class="badge">PAYROLL RECONCILIATION: 100% PASSING</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Attendance Reliability</div>
      <div class="metric">98.5 %</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Immutable Event State Machine Active</div>
    </div>
    <div class="card">
      <div class="card-title">Allocated Labor Cost</div>
      <div class="metric">TZS 18,500,000</div>
      <div style="color: #38bdf8; font-size: 0.875rem; margin-top: 0.5rem;">Project & Task Cost Reconciliation Active</div>
    </div>
    <div class="card">
      <div class="card-title">Overtime Recorded</div>
      <div class="metric">42.5 Hours</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Approved Overtime Inputs Only</div>
    </div>
    <div class="card">
      <div class="card-title">Compliance Alerts</div>
      <div class="metric">0 Alerts</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Skill & Certification Assignment Gating</div>
    </div>
  </div>

  <div class="card-title" style="margin-bottom: 0.75rem;">Permanent Workforce Invariants</div>
  <div class="invariants-grid">
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">IMMUTABLE EVENTS</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">No Clock Rewrites</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ENFORCED</div>
    </div>
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">STATE MACHINE</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">No Out-Before-In</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ENFORCED</div>
    </div>
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">SKILL GATING</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Certification Check</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ENFORCED</div>
    </div>
    <div class="invariant-box">
      <div style="color: #38bdf8; font-weight: 700;">PAYROLL INVARIANT</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Approved Time Only</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ENFORCED</div>
    </div>
  </div>
</body>
</html>
  `;
}
