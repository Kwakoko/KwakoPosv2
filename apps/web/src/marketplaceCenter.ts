// ============================================================
// Phase 40 — KwakoPos Marketplace Command UI (KMKOL v1.0.0)
// ============================================================

export interface MarketplaceUiProps {
  tenantId: string;
  totalPublishedListingsCount: number;
  verifiedProvidersCount: number;
  installedExtensionsCount: number;
  certifiedListingsRatioPercent: number;
}

export function renderMarketplaceCommandCenter(props: MarketplaceUiProps): string {
  return `
<div class="kmkol-command-center" style="background: #0f172a; color: #f8fafc; font-family: Inter, system-ui, sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem; color: #ec4899; font-weight: 700;">
      <span style="background: #db2777; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">KMKOL v1.0.0</span>
      Marketplace & Commercial Ecosystem Layer
    </h2>
    <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
    <div style="background: #1e293b; border-left: 4px solid #ec4899; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Published Listings</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.totalPublishedListingsCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Verified Providers</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #38bdf8; margin-top: 4px;">${props.verifiedProvidersCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Installed Extensions</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #34d399; margin-top: 4px;">${props.installedExtensionsCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Certified Ratio</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #a855f7; margin-top: 4px;">${props.certifiedListingsRatioPercent}%</div>
    </div>
  </div>
</div>
  `;
}
