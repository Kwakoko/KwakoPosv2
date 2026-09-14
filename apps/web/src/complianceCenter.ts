// ============================================================
// Phase 43 — KwakoPos Compliance Command UI (KCAOL v1.0.0)
// ============================================================

export interface ComplianceUiProps {
  tenantId: string;
  totalRulesCount: number;
  compliantRulesCount: number;
  nonCompliantRulesCount: number;
  auditLogChainVerified: boolean;
  totalAuditRecordsCount: number;
}

export function renderComplianceCommandCenter(props: ComplianceUiProps): string {
  return `
<div class="kcaol-command-center" style="background: #0f172a; color: #f8fafc; font-family: 'Inter', sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem; color: #10b981; font-weight: 700;">
      <span style="background: #059669; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">KCAOL v1.0.0</span>
      Compliance & Audit Operating Layer
    </h2>
    <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
    <div style="background: #1e293b; border-left: 4px solid #10b981; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Total Rules Evaluated</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.totalRulesCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Compliant Rules</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #34d399; margin-top: 4px;">${props.compliantRulesCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #f43f5e; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Non-Compliant Rules</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f43f5e; margin-top: 4px;">${props.nonCompliantRulesCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Audit Chain Status</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: ${props.auditLogChainVerified ? '#34d399' : '#f43f5e'}; margin-top: 4px;">
        ${props.auditLogChainVerified ? '✓ VERIFIED' : '❌ TAMPERED'}
      </div>
    </div>
  </div>
</div>
  `;
}
