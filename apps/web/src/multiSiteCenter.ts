// ============================================================
// Phase 44 — KwakoPos Multi-Site Command UI (KMAOL v1.0.0)
// ============================================================

export interface MultiSiteUiProps {
  tenantId: string;
  totalNodesCount: number;
  subsidiariesCount: number;
  branchesCount: number;
  totalConsolidatedSalesVolume: number;
}

export function renderMultiSiteCommandCenter(props: MultiSiteUiProps): string {
  const formattedVolume = new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(props.totalConsolidatedSalesVolume);

  return `
<div class="kmaol-command-center" style="background: #0f172a; color: #f8fafc; font-family: 'Inter', sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem; color: #06b6d4; font-weight: 700;">
      <span style="background: #0891b2; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">KMAOL v1.0.0</span>
      Multi-Site & Enterprise Admin Operating Layer
    </h2>
    <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
    <div style="background: #1e293b; border-left: 4px solid #06b6d4; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Total Org Nodes</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.totalNodesCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Subsidiaries</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #38bdf8; margin-top: 4px;">${props.subsidiariesCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Branches & Sites</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #a855f7; margin-top: 4px;">${props.branchesCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Consolidated Volume</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: #34d399; margin-top: 4px;">${formattedVolume}</div>
    </div>
  </div>
</div>
  `;
}
