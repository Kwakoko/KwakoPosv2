// ============================================================
// Phase 36 — Supply Chain Control Tower UI
// KwakoPos Design System (KDS v1.0.0) compliant
// ============================================================

export function renderSupplyChainControlTowerHtml(params: {
  tenantId: string;
  totalSuppliers: number;
  activePurchaseOrders: number;
  inboundShipmentsCount: number;
  pendingReceivingsCount: number;
  activeExceptionsCount: number;
  stockoutRiskProductCount: number;
  overallFillRatePct: number;
  overallOnTimeDeliveryPct: number;
  overallInventoryHealthScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}): string {
  const riskColors: Record<string, string> = {
    LOW: "#22c55e", MEDIUM: "#f59e0b", HIGH: "#f97316", CRITICAL: "#ef4444",
  };
  const rColor = riskColors[params.riskLevel] ?? "#6b7280";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>KwakoPos — Supply Chain Control Tower</title>
  <meta name="description" content="KwakoPos Supply Chain Control Tower — end-to-end supply chain visibility, demand forecasting, supplier scorecards, purchase orders, shipments, receiving, replenishment, inventory balancing"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --surface: #090d16;
      --surface-2: #101726;
      --surface-3: #182238;
      --border: rgba(148,163,184,0.12);
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #3b82f6;
      --accent-glow: rgba(59,130,246,0.2);
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --radius: 14px;
      --radius-sm: 8px;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',system-ui,sans-serif;background:var(--surface);color:var(--text);min-height:100vh}

    .hdr{background:linear-gradient(135deg,#090d16 0%,#0d1930 60%,#1e1b4b 100%);
      border-bottom:1px solid var(--border);padding:20px 32px;
      display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .hdr-title{font-size:20px;font-weight:800;
      background:linear-gradient(90deg,#3b82f6,#818cf8,#38bdf8);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .hdr-sub{font-size:11px;font-weight:600;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:4px}
    .badges{display:flex;gap:10px;align-items:center}
    .badge{display:flex;align-items:center;gap:6px;padding:5px 14px;border-radius:100px;
      font-size:12px;font-weight:600;background:rgba(255,255,255,0.05);border:1px solid var(--border)}
    .dot{width:7px;height:7px;border-radius:50%}

    .layout{display:grid;grid-template-columns:230px 1fr;min-height:calc(100vh - 73px)}
    .sidebar{background:var(--surface-2);border-right:1px solid var(--border);padding:20px 0}
    .sb-section{padding:0 12px;margin-bottom:20px}
    .sb-label{font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;padding:0 8px;margin-bottom:8px}
    .sb-item{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;
      border-radius:var(--radius-sm);cursor:pointer;font-size:13px;font-weight:500;color:var(--muted);
      transition:all .15s;text-decoration:none}
    .sb-item:hover,.sb-item.active{background:rgba(59,130,246,.12);color:#93c5fd}
    .sb-badge{font-size:10px;font-weight:700;padding:2px 6px;border-radius:100px;background:rgba(59,130,246,.15);color:#93c5fd}
    .sb-badge.alert{background:rgba(239,68,68,.15);color:#f87171}

    .main{padding:28px 32px;overflow-y:auto}

    .flow{display:flex;align-items:center;flex-wrap:wrap;margin-bottom:24px;gap:0}
    .flow-step{font-size:10px;font-weight:600;padding:5px 10px;background:rgba(59,130,246,.1);color:#93c5fd;border:1px solid rgba(59,130,246,.2)}
    .flow-step:first-child{border-radius:6px 0 0 6px}
    .flow-step:last-child{border-radius:0 6px 6px 0}
    .flow-arrow{font-size:11px;color:var(--muted);padding:5px 2px;background:var(--surface-2);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}

    .kpi-strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-bottom:28px}
    .kpi{background:var(--surface-3);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px}
    .kpi-label{font-size:11px;color:var(--muted);font-weight:500;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}
    .kpi-val{font-size:24px;font-weight:800;line-height:1}
    .kpi-sub{font-size:11px;color:var(--muted);margin-top:4px}

    .panels{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
    .panel{background:var(--surface-3);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
    .panel-title{font-size:13px;font-weight:700;margin-bottom:14px;color:var(--text)}

    .card-row{border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:10px;
      display:flex;justify-content:space-between;align-items:center;font-size:13px}
    .chip{font-size:10px;font-weight:700;padding:3px 8px;border-radius:100px}
    .chip-green{background:rgba(34,197,94,.12);color:#4ade80}
    .chip-yellow{background:rgba(245,158,11,.12);color:#fbbf24}
    .chip-red{background:rgba(239,68,68,.12);color:#f87171}
    .chip-blue{background:rgba(59,130,246,.12);color:#93c5fd}

    .btn{padding:7px 14px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
    .btn-primary{background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.3)}
    .btn-primary:hover{background:rgba(59,130,246,.25)}
  </style>
</head>
<body>

<header class="hdr">
  <div>
    <div class="hdr-sub">KwakoPos Supply Chain — KSCOL v1.0.0</div>
    <div class="hdr-title">Supply Chain Control Tower</div>
  </div>
  <div class="badges">
    <div class="badge">
      <div class="dot" style="background:${rColor}"></div>
      <span style="color:${rColor}">Risk Level: ${params.riskLevel}</span>
    </div>
    <button id="btn-new-po" class="btn btn-primary">+ Purchase Order</button>
  </div>
</header>

<div class="layout">
  <nav class="sidebar" aria-label="Supply Chain Navigation">
    <div class="sb-section">
      <div class="sb-label">Planning</div>
      <a class="sb-item active" href="#demand">Demand Planning</a>
      <a class="sb-item" href="#forecast">AI Forecasting</a>
      <a class="sb-item" href="#replenishment">
        Replenishment <span class="sb-badge alert">${params.stockoutRiskProductCount}</span>
      </a>
    </div>
    <div class="sb-section">
      <div class="sb-label">Sourcing &amp; Procurement</div>
      <a class="sb-item" href="#suppliers">
        Suppliers <span class="sb-badge">${params.totalSuppliers}</span>
      </a>
      <a class="sb-item" href="#scorecards">Supplier Scorecards</a>
      <a class="sb-item" href="#orders">
        Purchase Orders <span class="sb-badge">${params.activePurchaseOrders}</span>
      </a>
    </div>
    <div class="sb-section">
      <div class="sb-label">Logistics &amp; Warehouse</div>
      <a class="sb-item" href="#shipments">
        Inbound Shipments <span class="sb-badge">${params.inboundShipmentsCount}</span>
      </a>
      <a class="sb-item" href="#receiving">
        Goods Receiving <span class="sb-badge${params.pendingReceivingsCount > 0 ? " alert" : ""}">${params.pendingReceivingsCount}</span>
      </a>
      <a class="sb-item" href="#threeway">Three-Way Matching</a>
      <a class="sb-item" href="#warehouses">Warehouse &amp; Locations</a>
      <a class="sb-item" href="#balancing">Branch Replenishment</a>
    </div>
    <div class="sb-section">
      <div class="sb-label">Control &amp; Risk</div>
      <a class="sb-item" href="#exceptions">
        Exceptions <span class="sb-badge alert">${params.activeExceptionsCount}</span>
      </a>
      <a class="sb-item" href="#health">Supply Health</a>
      <a class="sb-item" href="#audit">Audit Trail</a>
    </div>
  </nav>

  <main class="main">
    <div class="flow">
      <span class="flow-step">Demand</span><span class="flow-arrow">→</span>
      <span class="flow-step">Forecast</span><span class="flow-arrow">→</span>
      <span class="flow-step">Plan</span><span class="flow-arrow">→</span>
      <span class="flow-step">Supplier</span><span class="flow-arrow">→</span>
      <span class="flow-step">Purchase Order</span><span class="flow-arrow">→</span>
      <span class="flow-step">Shipment</span><span class="flow-arrow">→</span>
      <span class="flow-step">Receiving</span><span class="flow-arrow">→</span>
      <span class="flow-step">3-Way Match</span><span class="flow-arrow">→</span>
      <span class="flow-step">Inventory</span><span class="flow-arrow">→</span>
      <span class="flow-step">Branch</span><span class="flow-arrow">→</span>
      <span class="flow-step">Customer</span>
    </div>

    <div class="kpi-strip">
      <div class="kpi">
        <div class="kpi-label">Active Suppliers</div>
        <div class="kpi-val" style="color:#3b82f6">${params.totalSuppliers}</div>
        <div class="kpi-sub">Governed registry</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Active POs</div>
        <div class="kpi-val" style="color:#818cf8">${params.activePurchaseOrders}</div>
        <div class="kpi-sub">In progress</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Inbound Shipments</div>
        <div class="kpi-val" style="color:#38bdf8">${params.inboundShipmentsCount}</div>
        <div class="kpi-sub">En route</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">On-Time Delivery</div>
        <div class="kpi-val" style="color:#22c55e">${params.overallOnTimeDeliveryPct}%</div>
        <div class="kpi-sub">Supplier average</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Fill Rate</div>
        <div class="kpi-val" style="color:#22c55e">${params.overallFillRatePct}%</div>
        <div class="kpi-sub">Order fulfillment</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Stockout Risk</div>
        <div class="kpi-val" style="color:${params.stockoutRiskProductCount > 0 ? "#ef4444" : "#22c55e"}">${params.stockoutRiskProductCount}</div>
        <div class="kpi-sub">Products at risk</div>
      </div>
    </div>

    <div class="panels">
      <div class="panel">
        <div class="panel-title">Active Replenishment Recommendations</div>
        <div class="card-row">
          <div>
            <div style="font-weight:600">Paracetamol 500mg (Box 100)</div>
            <div style="color:var(--muted);font-size:11px">Stock: 4 boxes · Reorder point: 10 boxes · Lead time: 5d</div>
          </div>
          <span class="chip chip-red">CRITICAL (Order 20)</span>
        </div>
        <div class="card-row">
          <div>
            <div style="font-weight:600">Amoxicillin 250mg Suspension</div>
            <div style="color:var(--muted);font-size:11px">Stock: 8 bottles · Reorder point: 15 bottles · Lead time: 7d</div>
          </div>
          <span class="chip chip-yellow">HIGH (Order 30)</span>
        </div>
        <div style="margin-top:12px">
          <button id="btn-run-replenish" class="btn btn-primary">Run Replenishment Engine</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Supplier Performance Scorecards</div>
        <div class="card-row">
          <div>
            <div style="font-weight:600">Tanzania Pharmaceutical Industries</div>
            <div style="color:var(--muted);font-size:11px">OTD: 96% · Fill Rate: 98% · Quality: 99%</div>
          </div>
          <span class="chip chip-green">EXCELLENT (96/100)</span>
        </div>
        <div class="card-row">
          <div>
            <div style="font-weight:600">East Africa Medical Supplies</div>
            <div style="color:var(--muted);font-size:11px">OTD: 82% · Fill Rate: 85% · Quality: 92%</div>
          </div>
          <span class="chip chip-yellow">ADEQUATE (83/100)</span>
        </div>
        <div style="margin-top:12px">
          <button id="btn-view-suppliers" class="btn btn-primary">Manage Suppliers</button>
        </div>
      </div>
    </div>

    <div class="panels">
      <div class="panel">
        <div class="panel-title">Inbound Shipments &amp; Goods Receiving</div>
        <div class="card-row">
          <div>
            <div style="font-weight:600">SHP-2026-089 — DHL Express</div>
            <div style="color:var(--muted);font-size:11px">PO-2026-042 · ETA: Today · Destination: Central WH</div>
          </div>
          <span class="chip chip-blue">IN TRANSIT</span>
        </div>
        <div class="card-row">
          <div>
            <div style="font-weight:600">REC-2026-012 — Goods Receipt</div>
            <div style="color:var(--muted);font-size:11px">PO-2026-039 · 2 damaged boxes flagged</div>
          </div>
          <span class="chip chip-yellow">EXCEPTION (3-Way Match Pending)</span>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Multi-Branch Inventory Balancing</div>
        <div class="card-row">
          <div>
            <div style="font-weight:600">Branch A (Arusha) → Branch B (Mwanza)</div>
            <div style="color:var(--muted);font-size:11px">Transfer 15 units Amoxicillin (Excess at Arusha)</div>
          </div>
          <span class="chip chip-green">SAVINGS: TZS 180,000</span>
        </div>
      </div>
    </div>
  </main>
</div>

<script>
  document.getElementById('btn-run-replenish')?.addEventListener('click', () => {
    alert('Supply Chain Engine: Running replenishment analysis across all branch & warehouse inventories...');
  });
  document.getElementById('btn-new-po')?.addEventListener('click', () => {
    alert('Supply Chain Control Tower: Purchase Order Creation wizard initialized. Checking supplier terms & liquidity buffer.');
  });
</script>
</body>
</html>`.trim();
}
