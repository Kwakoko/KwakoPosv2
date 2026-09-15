// ============================================================
// Phase 42 — KwakoPos Security Operations Center (SOC) UI (KSOL v2.0.0)
// ============================================================

export interface PlatformSecurityUiProps {
  tenantId: string;
  activeAlertsCount: number;
  criticalIncidentsCount: number;
  containedIncidentsCount: number;
  tenantIsolationVerified: boolean;
  isKillSwitchActive: boolean;
}

export function renderPlatformSecurityCommandCenter(props: PlatformSecurityUiProps): string {
  return `
<div class="ksol-soc-command-center" style="background: #0f172a; color: #f8fafc; font-family: 'Inter', sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem; color: #f43f5e; font-weight: 700;">
      <span style="background: #e11d48; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">KSOL v2.0.0</span>
      Security Operations Center (SOC)
    </h2>
    <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
    <div style="background: #1e293b; border-left: 4px solid #f43f5e; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Active Threat Alerts</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f43f5e; margin-top: 4px;">${props.activeAlertsCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #fbbf24; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Critical Incidents</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #fbbf24; margin-top: 4px;">${props.criticalIncidentsCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Contained Incidents</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #34d399; margin-top: 4px;">${props.containedIncidentsCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Tenant Isolation</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: ${props.tenantIsolationVerified ? '#34d399' : '#f43f5e'}; margin-top: 4px;">
        ${props.tenantIsolationVerified ? '✓ VERIFIED ENFORCED' : '❌ BREACH RISK'}
      </div>
    </div>
  </div>
</div>
  `;
}
