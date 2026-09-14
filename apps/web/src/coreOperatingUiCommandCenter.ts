export function renderCoreOperatingUiCommandCenter(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KwakoPos Core Operating UI Control Tower</title>
  <style>
    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 2rem; }
    .title { font-size: 1.75rem; font-weight: 700; color: #38bdf8; }
    .badge { padding: 0.5rem 1rem; border-radius: 9999px; font-weight: 600; background: #166534; color: #4ade80; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; }
    .card-title { font-size: 0.875rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .metric { font-size: 2rem; font-weight: 700; color: #ffffff; }
    .workspaces-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; }
    .workspace-box { background: #0f172a; padding: 1rem; border-radius: 0.5rem; text-align: center; border: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">KwakoPos Core Operating UI Control Tower</div>
      <div style="color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem;">Daily Operating Interface Across 13 Primary Workspaces & Role Dashboards</div>
    </div>
    <div class="badge">ONE OPERATING SYSTEM: 100% OPERATIONAL</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Primary Workspaces</div>
      <div class="metric">13 Workspaces</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Dashboard -> POS -> Finance -> Settings</div>
    </div>
    <div class="card">
      <div class="card-title">POS Checkout Latency</div>
      <div class="metric">12 ms</div>
      <div style="color: #38bdf8; font-size: 0.875rem; margin-top: 0.5rem;">High-Speed Cashier UX Active</div>
    </div>
    <div class="card">
      <div class="card-title">Financial Traceability</div>
      <div class="metric">100 %</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Sale -> Payment -> Journal -> Ledger</div>
    </div>
    <div class="card">
      <div class="card-title">Role Dashboards Supported</div>
      <div class="metric">6 Perspectives</div>
      <div style="color: #4ade80; font-size: 0.875rem; margin-top: 0.5rem;">Executive, Manager, Cashier, Finance, Storekeeper, Admin</div>
    </div>
  </div>

  <div class="card-title" style="margin-bottom: 0.75rem;">13 Core Operating Workspaces</div>
  <div class="workspaces-grid">
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">1. Dashboard</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">2. POS</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">3. Products</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">4. Inventory</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">5. Customers</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">6. Suppliers</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">7. Sales</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">8. Purchases</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">9. Expenses</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">10. Finance</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">11. Reports</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box">
      <div style="color: #38bdf8; font-weight: 700;">12. Users</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
    <div class="workspace-box" style="grid-column: span 2;">
      <div style="color: #38bdf8; font-weight: 700;">13. Settings</div>
      <div style="font-size: 0.75rem; color: #4ade80; margin-top: 0.25rem;">OPERATIONAL</div>
    </div>
  </div>
</body>
</html>
  `;
}
