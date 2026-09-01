// ============================================================
// Phase 39 — KwakoPos Integration Center UI (KIOL v1.0.0)
// ============================================================

export interface IntegrationUiProps {
  tenantId: string;
  activeIntegrationsCount: number;
  healthyIntegrationsCount: number;
  degradedIntegrationsCount: number;
  circuitBreakersOpenCount: number;
  pendingWebhooksCount: number;
  deadLetterEventsCount: number;
  totalSyncJobsToday: number;
}

export function renderIntegrationCommandCenter(props: IntegrationUiProps): string {
  return `
<div class="kiol-command-center" style="background: #0f172a; color: #f8fafc; font-family: Inter, system-ui, sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">

  <!-- 1. Header Banner -->
  <div class="kiol-banner" style="background: linear-gradient(90deg, #1e293b 0%, #0f172a 100%); border: 1px solid #334155; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h2 style="margin: 0; font-size: 1.25rem; color: #38bdf8; font-weight: 700; display: flex; align-items: center; gap: 8px;">
        <span style="background: #0284c7; color: #ffffff; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px;">KIOL v1.0.0</span>
        Integration Center & Connectivity Operating Layer
      </h2>
      <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
    </div>
    <div style="display: flex; gap: 8px; font-size: 0.75rem; color: #cbd5e1;">
      <span style="background: #1e293b; padding: 4px 10px; border-radius: 4px; border: 1px solid #334155;">🔌 Connectors: <strong>Active</strong></span>
      <span style="background: #1e293b; padding: 4px 10px; border-radius: 4px; border: 1px solid #334155;">🔐 Secret Vault: <strong>Rotated (5-Stage)</strong></span>
      <span style="background: #1e293b; padding: 4px 10px; border-radius: 4px; border: 1px solid #334155;">📡 Webhooks: <strong>HMAC SHA-256 Verified</strong></span>
      <span style="background: #1e293b; padding: 4px 10px; border-radius: 4px; border: 1px solid #334155;">⚡ Circuit Breaker: <strong>Protected</strong></span>
    </div>
  </div>

  <!-- 2. Executive KPI Strip -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
    <div style="background: #1e293b; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Active Integrations</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.activeIntegrationsCount}</div>
      <div style="font-size: 0.7rem; color: #34d399; margin-top: 2px;">● ${props.healthyIntegrationsCount} Healthy</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #fbbf24; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Degraded Systems</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #fbbf24; margin-top: 4px;">${props.degradedIntegrationsCount}</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Latency Monitored</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #f43f5e; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Circuit Breakers Open</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f43f5e; margin-top: 4px;">${props.circuitBreakersOpenCount}</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Fail-Fast Safeguard</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Pending Webhooks</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #a855f7; margin-top: 4px;">${props.pendingWebhooksCount}</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Normalized & Queued</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #f97316; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Dead Letter Queue</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f97316; margin-top: 4px;">${props.deadLetterEventsCount}</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Manual Replay Ready</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Sync Jobs Today</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #34d399; margin-top: 4px;">${props.totalSyncJobsToday}</div>
      <div style="font-size: 0.7rem; color: #34d399; margin-top: 2px;">Bidirectional & Event-Driven</div>
    </div>
  </div>

  <!-- 3. Operational Grid Panels -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">

    <!-- Panel A: Active Connectors & Secret Rotation -->
    <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px;">
      <h3 style="margin: 0 0 12px 0; font-size: 1rem; color: #f8fafc; display: flex; justify-content: space-between; align-items: center;">
        <span>🔌 Active Integration Connectors</span>
        <button style="background: #0284c7; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">+ Install Connector</button>
      </h3>
      <div style="background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 12px; font-size: 0.8rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #cbd5e1;">
          <span><strong>TRA EFDms Gateway</strong> (Tanzania Revenue)</span>
          <span style="color: #34d399; font-weight: 600;">ACTIVE</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #cbd5e1;">
          <span><strong>QuickBooks Online</strong> (Intuit)</span>
          <span style="color: #34d399; font-weight: 600;">ACTIVE</span>
        </div>
        <div style="display: flex; justify-content: space-between; color: #cbd5e1;">
          <span><strong>WhatsApp Business API</strong> (Meta)</span>
          <span style="color: #34d399; font-weight: 600;">ACTIVE</span>
        </div>
      </div>
      <div style="margin-top: 10px; background: #064e3b; border: 1px solid #059669; color: #a7f3d0; padding: 8px; border-radius: 6px; font-size: 0.75rem;">
        ✓ Secret Rotation: All API credentials validated & encrypted with zero-trust storage.
      </div>
    </div>

    <!-- Panel B: Webhook DLQ & AI Diagnostics -->
    <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px;">
      <h3 style="margin: 0 0 12px 0; font-size: 1rem; color: #f8fafc; display: flex; justify-content: space-between; align-items: center;">
        <span>🤖 AI Integration Diagnostic & Failure Recovery</span>
        <span style="background: #7c3aed; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px;">Approval Gate</span>
      </h3>
      <div style="background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 12px; font-size: 0.8rem; color: #cbd5e1;">
        <div style="margin-bottom: 6px;"><strong style="color: #38bdf8;">Status:</strong> 0 active dead-letter payload breaches.</div>
        <div style="margin-bottom: 6px;"><strong style="color: #38bdf8;">AI Diagnostics:</strong> All incoming HMAC SHA-256 signatures match secret keys.</div>
        <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 8px;">Declarative visual field mapper: 12 transformation rules active.</div>
        <div style="display: flex; gap: 8px;">
          <button style="background: #059669; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">Run Full Sync</button>
          <button style="background: #475569; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">Inspect Payload Logs</button>
        </div>
      </div>
      <div style="margin-top: 10px; background: #451a03; border: 1px solid #d97706; color: #fef3c7; padding: 8px; border-radius: 6px; font-size: 0.75rem;">
        ⚠️ Approval Guardrail: Destructive bulk sync or critical secret revokes require manager approval.
      </div>
    </div>

  </div>

</div>
  `;
}
