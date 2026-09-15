// ============================================================
// Phase 42 — KwakoPos Autonomous Command UI (KABO v1.0.0)
// ============================================================

export interface AutonomousBusinessUiProps {
  tenantId: string;
  activePoliciesCount: number;
  executedActionsCount: number;
  pendingApprovalCount: number;
  blockedActionsCount: number;
  isGlobalKillSwitchActive: boolean;
}

export function renderAutonomousBusinessCommandCenter(props: AutonomousBusinessUiProps): string {
  return `
<div class="kabo-command-center" style="background: #0f172a; color: #f8fafc; font-family: 'Inter', sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem; color: #6366f1; font-weight: 700;">
      <span style="background: #4f46e5; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">KABO v1.0.0</span>
      Autonomous Business Operations Layer
    </h2>
    <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
    <div style="background: #1e293b; border-left: 4px solid #6366f1; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Active Agent Policies</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.activePoliciesCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Executed Actions</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #34d399; margin-top: 4px;">${props.executedActionsCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #fbbf24; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Pending Human Approval</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #fbbf24; margin-top: 4px;">${props.pendingApprovalCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid ${props.isGlobalKillSwitchActive ? '#f43f5e' : '#38bdf8'}; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Kill Switch Status</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: ${props.isGlobalKillSwitchActive ? '#f43f5e' : '#38bdf8'}; margin-top: 4px;">
        ${props.isGlobalKillSwitchActive ? '🛑 ACTIVATED' : '✓ ARMED (NORMAL)'}
      </div>
    </div>
  </div>
</div>
  `;
}
