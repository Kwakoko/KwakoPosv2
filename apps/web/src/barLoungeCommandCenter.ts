import { BarLoungeFinancialSummary } from "@kwakopos2/contracts";

export function renderBarLoungeCommandCenterDashboard(summary: BarLoungeFinancialSummary): string {
  return `
  <div class="bar-lounge-command-center" style="padding: 24px; background: #0f172a; color: #f8fafc; font-family: sans-serif; border-radius: 12px;">
    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-b: 1px solid #334155; padding-bottom: 16px;">
      <div>
        <h1 style="font-size: 24px; margin: 0; color: #f59e0b;">🍸 Bar, Pub & Lounge Command Center</h1>
        <p style="margin: 4px 0 0; color: #94a3b8;">Active Tabs, Beverage Stock Variance & Shift Profitability</p>
      </div>
      <div style="background: #1e293b; padding: 8px 16px; border-radius: 8px; font-weight: bold; border: 1px solid #d97706;">
        Closed Tabs: ${summary.totalTabsCount}
      </div>
    </header>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div style="background: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b;">
        <span style="color: #94a3b8; font-size: 13px;">Beverage Sales</span>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #f59e0b;">$${summary.totalBeverageRevenueUsd.toLocaleString()}</div>
      </div>
      <div style="background: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #22c55e;">
        <span style="color: #94a3b8; font-size: 13px;">Gross Margin</span>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #22c55e;">$${summary.grossMarginUsd.toLocaleString()} (${summary.grossMarginPct}%)</div>
      </div>
      <div style="background: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #ef4444;">
        <span style="color: #94a3b8; font-size: 13px;">Wastage & Spoilage</span>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #ef4444;">$${summary.totalWastageCostUsd.toLocaleString()}</div>
      </div>
    </div>
  </div>
  `;
}
