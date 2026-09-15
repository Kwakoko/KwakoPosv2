export function renderGlobalExpansionCommandCenter(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KwakoPos Global Expansion Control Tower (KGF)</title>
  <style>
    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 2rem; }
    .title { font-size: 1.75rem; font-weight: 700; color: #38bdf8; }
    .badge { padding: 0.5rem 1rem; border-radius: 9999px; font-weight: 600; background: #166534; color: #4ade80; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; }
    .card-title { font-size: 0.875rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .metric { font-size: 2rem; font-weight: 700; color: #ffffff; }
    .expansion-map { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 2rem; }
    .market-row { display: flex; justify-content: space-between; padding: 0.75rem; border-bottom: 1px solid #334155; }
    .market-row:last-child { border-bottom: none; }
    .status-pill { padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; }
    .status-scale { background: #065f46; color: #34d399; }
    .status-ga { background: #0284c7; color: #38bdf8; }
    .status-pilot { background: #854d0e; color: #fde047; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">KwakoPos Global Expansion Control Tower (KGF)</div>
      <div style="color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem;">Multi-Country Packs & Zero Platform Code Fork Governance</div>
    </div>
    <div class="badge">ZERO CODE FORKS — 100% COMPLIANCE</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Reference Market</div>
      <div class="metric">Tanzania (TZ)</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">TZ Pack v1.0.0 — SCALE State</div>
    </div>
    <div class="card">
      <div class="card-title">Active Country Packs</div>
      <div class="metric">3 Countries</div>
      <div style="color: #38bdf8; font-size: 0.875rem; margin-top: 0.5rem;">TZ (Scale), KE (GA), UG (Pilot)</div>
    </div>
    <div class="card">
      <div class="card-title">15-Criteria Gate Compliance</div>
      <div class="metric">15 / 15</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">100% Market Readiness Certification</div>
    </div>
    <div class="card">
      <div class="card-title">Multi-Currency Transaction Volume</div>
      <div class="metric">$ 1,250,000</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Immutable Historical Rate Context</div>
    </div>
  </div>

  <div class="expansion-map">
    <div class="card-title" style="margin-bottom: 1rem;">Geographic Expansion Pipeline & Country Health States</div>
    <div class="market-row">
      <div><strong>🇹🇿 Tanzania (Reference Market)</strong> — TZS Currency, 18% VAT, TRA EFD/EFDMS Fiscal E-Invoicing</div>
      <span class="status-pill status-scale">SCALE (GA)</span>
    </div>
    <div class="market-row">
      <div><strong>🇰🇪 Kenya (East Africa Expansion)</strong> — KES Currency, 16% VAT, KRA eTIMS Integration</div>
      <span class="status-pill status-ga">GENERAL AVAILABILITY</span>
    </div>
    <div class="market-row">
      <div><strong>🇺🇬 Uganda (East Africa Expansion)</strong> — UGX Currency, 18% VAT, URA EFRIS Integration</div>
      <span class="status-pill status-pilot">PILOT VALIDATION</span>
    </div>
    <div class="market-row">
      <div><strong>🇷🇼 Rwanda (East Africa Pipeline)</strong> — RWF Currency, 18% VAT, RRA EBM Fiscal Integration</div>
      <span class="status-pill" style="background: #334155; color: #cbd5e1;">BUILDING PACK</span>
    </div>
  </div>
</body>
</html>
  `;
}
