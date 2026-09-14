export function renderPartnerEcosystemCommandCenter(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KwakoPos Partner Ecosystem & Marketplace Control Tower (KPP)</title>
  <style>
    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 2rem; }
    .title { font-size: 1.75rem; font-weight: 700; color: #38bdf8; }
    .badge { padding: 0.5rem 1rem; border-radius: 9999px; font-weight: 600; background: #166534; color: #4ade80; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; }
    .card-title { font-size: 0.875rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .metric { font-size: 2rem; font-weight: 700; color: #ffffff; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">KwakoPos Partner Ecosystem Control Tower (KPP)</div>
      <div style="color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem;">Marketplace, Certified Partners & Capacity Orchestration Platform</div>
    </div>
    <div class="badge">ECOSYSTEM ACTIVE — 14.5x MULTIPLIER</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Certified Partners</div>
      <div class="metric">48 Active</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">7 Categories & 5 Earned Tiers</div>
    </div>
    <div class="card">
      <div class="card-title">Annual Implementation Capacity</div>
      <div class="metric">576 Projects/yr</div>
      <div style="color: #38bdf8; font-size: 0.875rem; margin-top: 0.5rem;">85% Partner-Delivered Ratio</div>
    </div>
    <div class="card">
      <div class="card-title">Marketplace 12-Gate Pass Rate</div>
      <div class="metric">100 %</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">12/12 Extension Validation Gates</div>
    </div>
    <div class="card">
      <div class="card-title">Headcount Efficiency Multiplier</div>
      <div class="metric">14.5 x</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Customer Scaling vs Internal Ops</div>
    </div>
  </div>
</body>
</html>
  `;
}
