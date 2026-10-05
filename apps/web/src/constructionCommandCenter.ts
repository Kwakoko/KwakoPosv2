export function renderConstructionCommandCenterDashboard(): string {
  return `
    <div style="font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 12px; max-width: 1360px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #334155; padding-bottom: 20px; margin-bottom: 28px;">
        <div>
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #38bdf8;">KWAKOPOS CONSTRUCTION & PROJECT CONTROLS COMMAND CENTER</h1>
          <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 14px;">Construction Project Controls, BOQs, EVM, Site Stores & Project Controls OS</p>
        </div>
        <div style="background: #15803d; color: white; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 13px;">
          PROJECT CONTROLS ACTIVE 100%
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px;">
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Active Portfolio Value</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #38bdf8;">$1,250,000</h2>
        </div>
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Cost Performance Index (CPI)</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #4ade80;">1.14 (Under Budget)</h2>
        </div>
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Schedule Performance Index (SPI)</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #fbbf24;">0.96 (On Track)</h2>
        </div>
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Gross Margin</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #38bdf8;">23.6% ($130,000)</h2>
        </div>
      </div>
    </div>
  `;
}
