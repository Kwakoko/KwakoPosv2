// ============================================================
// Phase 45 — Full KwakoPos Operating System Certification Tower UI (KFOS-CERT v1.0.0)
// ============================================================

export interface FullSystemCertificationUiProps {
  tenantId: string;
  activeCampaignId: string;
  releaseVersion: string;
  overallStatus: string;
  certifiedDomainsPct: number;
  totalCertifiedPillars: number;
  auditLedgerCount: number;
}

export function renderFullSystemCertificationCommandCenter(props: FullSystemCertificationUiProps): string {
  return `
<div class="kfos-cert-command-center" style="background: #0f172a; color: #f8fafc; font-family: Inter, system-ui, sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem; color: #10b981; font-weight: 700;">
      <span style="background: #059669; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">KFOS-CERT v1.0.0</span>
      Full Operating System Certification Authority
    </h2>
    <span style="font-size: 0.85rem; color: #94a3b8;">Release: <strong style="color: #cbd5e1;">${props.releaseVersion}</strong></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
    <div style="background: #1e293b; border-left: 4px solid #10b981; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Certification Status</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: #10b981; margin-top: 4px;">${props.overallStatus}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Certified Domains</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #38bdf8; margin-top: 4px;">${props.certifiedDomainsPct}%</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Certified Pillars</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #a855f7; margin-top: 4px;">${props.totalCertifiedPillars} / 181</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #fbbf24; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Active Campaign</div>
      <div style="font-size: 0.85rem; font-weight: 600; color: #fbbf24; margin-top: 4px; overflow: hidden; text-overflow: ellipsis;">${props.activeCampaignId}</div>
    </div>
  </div>
</div>
  `;
}
