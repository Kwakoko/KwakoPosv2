import { TelecomFinancialSummary } from "@kwakopos2/contracts";

export function renderTelecomCommandCenterDashboard(summary: TelecomFinancialSummary): string {
  return `
  <div class="telecom-command-center" style="padding: 24px; background: #0f172a; color: #f8fafc; font-family: sans-serif; border-radius: 12px;">
    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-b: 1px solid #334155; padding-bottom: 16px;">
      <div>
        <h1 style="font-size: 24px; margin: 0; color: #06b6d4;">📡 Telecom & Technical Services Command Center</h1>
        <p style="margin: 4px 0 0; color: #94a3b8;">Site Operations, Work Orders, SLA Compliance & Service Profitability</p>
      </div>
      <div style="background: #1e293b; padding: 8px 16px; border-radius: 8px; font-weight: bold; border: 1px solid #0891b2;">
        Total Work Orders: ${summary.totalWorkOrdersCount}
      </div>
    </header>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div style="background: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #06b6d4;">
        <span style="color: #94a3b8; font-size: 13px;">Equipment Revenue</span>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #06b6d4;">$${summary.totalEquipmentRevenueUsd.toLocaleString()}</div>
      </div>
      <div style="background: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6;">
        <span style="color: #94a3b8; font-size: 13px;">Labor Revenue</span>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #3b82f6;">$${summary.totalLaborRevenueUsd.toLocaleString()}</div>
      </div>
      <div style="background: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #22c55e;">
        <span style="color: #94a3b8; font-size: 13px;">Service Gross Margin</span>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #22c55e;">$${summary.grossMarginUsd.toLocaleString()} (${summary.grossMarginPct}%)</div>
      </div>
    </div>
  </div>
  `;
}
