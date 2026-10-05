export function renderGarageCommandCenterDashboard(): string {
  return `
    <div style="font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 12px; max-width: 1360px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #334155; padding-bottom: 20px; margin-bottom: 28px;">
        <div>
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #38bdf8;">KWAKOPOS AUTOMOTIVE WORKSHOP COMMAND CENTER</h1>
          <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 14px;">Automotive Service, Job Cards, Parts, Labor & Predictive Maintenance OS</p>
        </div>
        <div style="background: #15803d; color: white; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 13px;">
          WORKSHOP OPERATIONAL 100%
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px;">
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Active Job Cards</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #38bdf8;">14 Jobs</h2>
        </div>
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Bays Utilized</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #4ade80;">6 / 8 Bays</h2>
        </div>
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Waiting Approval</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #fbbf24;">3 Estimates</h2>
        </div>
        <div style="background: #1e293b; padding: 18px; border-radius: 8px; border: 1px solid #334155;">
          <span style="color: #94a3b8; font-size: 12px;">Monthly Margin</span>
          <h2 style="margin: 6px 0 0 0; font-size: 24px; color: #38bdf8;">50.0% ($21,500)</h2>
        </div>
      </div>
    </div>
  `;
}
