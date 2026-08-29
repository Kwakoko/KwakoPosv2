export function renderWholesaleCommandCenterDashboard(): string {
  return `
    <div style="font-family: 'Segoe UI', Inter, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 12px; max-width: 1360px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #334155; padding-bottom: 20px; margin-bottom: 28px;">
        <div>
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #38bdf8;">KWAKOPOS WHOLESALE & DISTRIBUTION COMMAND CENTER</h1>
          <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 14px;">64-Pillar B2B Distribution, Credit Control, Unit Conversions & Logistics OS</p>
        </div>
        <div style="background: #15803d; color: white; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 13px;">
          DISTRIBUTION ACTIVE 100%
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px;">
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Open Sales Orders</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #38bdf8;">42 Orders</h2>
        </div>
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Accounts Receivable</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #4ade80;">$42,000</h2>
        </div>
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Overdue Receivables</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #f87171;">$3,500</h2>
        </div>
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Gross Margin</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #38bdf8;">30.5% ($56,500)</h2>
        </div>
      </div>
    </div>
  `;
}
