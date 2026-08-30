// ============================================================
// Phase 41 — KwakoPos Global Control Tower UI (KGPA v1.0.0)
// ============================================================

export interface GlobalPlatformUiProps {
  tenantId: string;
  activeCountryPacksCount: number;
  supportedRegionsCount: number;
  dataResidencyCompliant: boolean;
  activeExchangeRatesCount: number;
}

export function renderGlobalPlatformCommandCenter(props: GlobalPlatformUiProps): string {
  return `
<div class="kgpa-command-center" style="background: #0f172a; color: #f8fafc; font-family: Inter, system-ui, sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem; color: #38bdf8; font-weight: 700;">
      <span style="background: #0284c7; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">KGPA v1.0.0</span>
      Global Platform & Multi-Region Operating Layer
    </h2>
    <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
    <div style="background: #1e293b; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Active Country Packs</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.activeCountryPacksCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Active Regions</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #a855f7; margin-top: 4px;">${props.supportedRegionsCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Residency Compliance</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: ${props.dataResidencyCompliant ? '#34d399' : '#f43f5e'}; margin-top: 4px;">
        ${props.dataResidencyCompliant ? '✓ COMPLIANT' : '❌ VIOLATION'}
      </div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #fbbf24; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Exchange Rates</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #fbbf24; margin-top: 4px;">${props.activeExchangeRatesCount}</div>
    </div>
  </div>
</div>
  `;
}
