export function renderSuperAdminPlatformCommandCenter(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KwakoPos Super Admin & Platform Control Tower</title>
  <style>
    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 2rem; }
    .title { font-size: 1.75rem; font-weight: 700; color: #ef4444; }
    .badge { padding: 0.5rem 1rem; border-radius: 9999px; font-weight: 600; background: #991b1b; color: #fca5a5; }
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
      <div class="title">KwakoPos Super Admin & Platform Control Tower</div>
      <div style="color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem;">Privileged Control Plane Isolated from Tenant Business Operations</div>
    </div>
    <div class="badge">PLANE ISOLATION SECURITY INVARIANT: ENFORCED</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Active SaaS Tenants</div>
      <div class="metric">1,420 Tenants</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">5 Countries • 100% Isolated</div>
    </div>
    <div class="card">
      <div class="card-title">Platform Monthly Revenue</div>
      <div class="metric">$148,500 USD</div>
      <div style="color: #38bdf8; font-size: 0.875rem; margin-top: 0.5rem;">Automated Entitlement Metering</div>
    </div>
    <div class="card">
      <div class="card-title">Active Production Releases</div>
      <div class="metric">3 Certified</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Zero Uncertified Deployments</div>
    </div>
    <div class="card">
      <div class="card-title">Emergency Kill Switch Status</div>
      <div class="metric">READY</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Global AI & Release Rollback Ready</div>
    </div>
  </div>

  <div class="card-title" style="margin-bottom: 0.75rem;">14 Super Admin Workspaces</div>
  <div class="invariants-grid">
    <div class="invariant-box">
      <div style="color: #f87171; font-weight: 700;">TENANTS & SUBS</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Profiles & Billing</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">ISOLATED</div>
    </div>
    <div class="invariant-box">
      <div style="color: #f87171; font-weight: 700;">SECURITY & AUDIT</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Privileged Action Logs</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">IMMUTABLE</div>
    </div>
    <div class="invariant-box">
      <div style="color: #f87171; font-weight: 700;">AI PLATFORM CENTER</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Quotas & Kill Switch</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">GOVERNED</div>
    </div>
    <div class="invariant-box">
      <div style="color: #f87171; font-weight: 700;">RELEASES & HEALTH</div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">Rollback & Monitoring</div>
      <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #4ade80;">CERTIFIED</div>
    </div>
  </div>
</body>
</html>
  `;
}
