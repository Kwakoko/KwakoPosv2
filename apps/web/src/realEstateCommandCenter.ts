import { RealEstateFinancialSummary } from "@kwakopos2/contracts";

export function renderRealEstateCommandCenterDashboard(summary: RealEstateFinancialSummary): string {
  return `
  <div class="real-estate-command-center" style="padding: 24px; background: #0f172a; color: #f8fafc; font-family: sans-serif; border-radius: 12px;">
    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-b: 1px solid #334155; padding-bottom: 16px;">
      <div>
        <h1 style="font-size: 24px; margin: 0; color: #38bdf8;">🏢 Real Estate & Property Command Center</h1>
        <p style="margin: 4px 0 0; color: #94a3b8;">Portfolio Occupancy, Lease Billing & Net Operating Income (NOI)</p>
      </div>
      <div style="background: #1e293b; padding: 8px 16px; border-radius: 8px; font-weight: bold; border: 1px solid #0284c7;">
        Properties: ${summary.totalPropertiesCount} | Units: ${summary.totalUnitsCount}
      </div>
    </header>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div style="background: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #38bdf8;">
        <span style="color: #94a3b8; font-size: 13px;">Occupancy Rate</span>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px;">${summary.averageOccupancyRatePct}%</div>
      </div>
      <div style="background: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #22c55e;">
        <span style="color: #94a3b8; font-size: 13px;">Rental Revenue</span>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #22c55e;">$${summary.totalRentalRevenueUsd.toLocaleString()}</div>
      </div>
      <div style="background: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #ef4444;">
        <span style="color: #94a3b8; font-size: 13px;">Overdue Arrears</span>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #ef4444;">$${summary.totalOverdueRentUsd.toLocaleString()}</div>
      </div>
      <div style="background: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #a855f7;">
        <span style="color: #94a3b8; font-size: 13px;">Net Operating Income (NOI)</span>
        <div style="font-size: 24px; font-weight: bold; margin-top: 4px; color: #a855f7;">$${summary.netOperatingIncomeNoiUsd.toLocaleString()}</div>
      </div>
    </div>
  </div>
  `;
}
