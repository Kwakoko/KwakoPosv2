// ============================================================
// Phase 43 — KwakoPos Autonomous Operations Control Tower UI (KAOL v2.0.0)
// ============================================================

export interface AutonomousOperationsUiProps {
  tenantId: string;
  activeAgentsCount: number;
  level4CertifiedCount: number;
  verifiedActionsCount: number;
  escalatedCount: number;
  blockedCount: number;
}

export function renderAutonomousOperationsCommandCenter(props: AutonomousOperationsUiProps): string {
  return `
<div class="kaol-command-center" style="background: #0f172a; color: #f8fafc; font-family: 'Inter', sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem; color: #14b8a6; font-weight: 700;">
      <span style="background: #0d9488; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">KAOL v2.0.0</span>
      Autonomous Operations Control Tower
    </h2>
    <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
    <div style="background: #1e293b; border-left: 4px solid #14b8a6; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Active Agents</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.activeAgentsCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Level 4/5 Certified</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #a855f7; margin-top: 4px;">${props.level4CertifiedCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Verified Actions</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #34d399; margin-top: 4px;">${props.verifiedActionsCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #fbbf24; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Human Escalations</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #fbbf24; margin-top: 4px;">${props.escalatedCount}</div>
    </div>
  </div>
</div>
  `;
}
