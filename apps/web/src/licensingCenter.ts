// ============================================================
// Phase 45 — KwakoPos Licensing Command UI (KPLOL v1.0.0)
// ============================================================

export interface LicensingUiProps {
  tenantId: string;
  activeLicenseTier: string;
  licenseStatus: string;
  isEntitled: boolean;
  quotaUtilizationPercent: number;
}

export function renderLicensingCommandCenter(props: LicensingUiProps): string {
  return `
<div class="kplol-command-center" style="background: #0f172a; color: #f8fafc; font-family: Inter, system-ui, sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem; color: #eab308; font-weight: 700;">
      <span style="background: #ca8a04; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">KPLOL v1.0.0</span>
      Platform Licensing & Monetization Operating Layer
    </h2>
    <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
    <div style="background: #1e293b; border-left: 4px solid #eab308; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">License Tier</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.activeLicenseTier}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">License Status</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: ${props.licenseStatus === 'ACTIVE' ? '#34d399' : '#f43f5e'}; margin-top: 4px;">
        ${props.licenseStatus}
      </div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Entitlement Gate</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: ${props.isEntitled ? '#34d399' : '#f43f5e'}; margin-top: 4px;">
        ${props.isEntitled ? '✓ ALLOWED' : '❌ BLOCKED'}
      </div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Quota Usage</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #a855f7; margin-top: 4px;">${props.quotaUtilizationPercent}%</div>
    </div>
  </div>
</div>
  `;
}
