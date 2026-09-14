// ============================================================
// Phase 42 — KwakoPos Notification Command UI (KNCOL v1.0.0)
// ============================================================

export interface NotificationUiProps {
  tenantId: string;
  totalDispatchedCount: number;
  deliveredCount: number;
  failedCount: number;
  blockedConsentCount: number;
}

export function renderNotificationCommandCenter(props: NotificationUiProps): string {
  return `
<div class="kncol-command-center" style="background: #0f172a; color: #f8fafc; font-family: 'Inter', sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem; color: #a855f7; font-weight: 700;">
      <span style="background: #9333ea; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">KNCOL v1.0.0</span>
      Notification & Communication Operating Layer
    </h2>
    <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
    <div style="background: #1e293b; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Total Dispatched</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.totalDispatchedCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Delivered</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #34d399; margin-top: 4px;">${props.deliveredCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #f43f5e; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Failed</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f43f5e; margin-top: 4px;">${props.failedCount}</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #fbbf24; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Blocked Opt-Outs</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #fbbf24; margin-top: 4px;">${props.blockedConsentCount}</div>
    </div>
  </div>
</div>
  `;
}
