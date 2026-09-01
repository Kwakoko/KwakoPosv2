export function renderKpcpCommercialDashboard(): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; background: #0b1120; color: #f8fafc; padding: 2rem; min-height: 100vh;">
      <header style="border-bottom: 1px solid #1e293b; padding-bottom: 1rem; margin-bottom: 2rem;">
        <span style="background: #ec4899; color: #ffffff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 600; font-size: 0.875rem;">PHASE 16 COMMERCIAL PRODUCT READINESS</span>
        <h1 style="font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: #ffffff;">KwakoPos Commercial Command Center & Portfolio Governance</h1>
        <p style="color: #94a3b8; margin-top: 0.25rem;">Market-First Industry Portfolio — Focused Commercialization across Tier 1 Flagships, Tier 2 Strategic & Tier 3 Ecosystem</p>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">PORTFOLIO READINESS SCORE</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #10b981;">100%</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">All 10 Flagship Verticals Productized & Gate Certified</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">TIER 1 FLAGSHIP VERTICALS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #ec4899;">10 VERTICALS</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">Retail, Restaurant, Pharmacy, Law Firm, SACCO, Microfinance...</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">AVERAGE REVENUE PER USER (ARPU)</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #3b82f6;">45,000 TZS</div>
          <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.5rem;">Estimated Gross Margin: 88.5% | LTV: 1,620,000 TZS</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">COMMERCIAL READINESS GATES</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #10b981;">GATES A-D PASSED</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">Product, Engineering, Commercial, Market Gates Certified</div>
        </div>
      </div>

      <main>
        <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">TIER 1 FLAGSHIP GROWTH VERTICALS</h2>
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; overflow: hidden; margin-bottom: 2rem;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: #0f172a; border-bottom: 1px solid #334155; color: #94a3b8; font-size: 0.875rem;">
                <th style="padding: 1rem;">VERTICAL NAME</th>
                <th style="padding: 1rem;">PRIMARY COMMERCIAL PROMISE</th>
                <th style="padding: 1rem;">ACTIVATION EVENT</th>
                <th style="padding: 1rem;">PRIORITY SCORE</th>
                <th style="padding: 1rem;">PORTFOLIO ACTION</th>
              </tr>
            </thead>
            <tbody style="font-size: 0.875rem;">
              <tr style="border-bottom: 1px solid #334155;">
                <td style="padding: 1rem; font-weight: 700; color: #f472b6;">Retail</td>
                <td style="padding: 1rem;">Simple, reliable retail operations across one or many branches</td>
                <td style="padding: 1rem; color: #34d399;">First completed POS sale with inventory reconciliation</td>
                <td style="padding: 1rem; font-weight: 700;">98 / 100</td>
                <td style="padding: 1rem;"><span style="background: #ec489920; color: #f472b6; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">INVEST</span></td>
              </tr>
              <tr style="border-bottom: 1px solid #334155;">
                <td style="padding: 1rem; font-weight: 700; color: #f472b6;">Restaurant</td>
                <td style="padding: 1rem;">Run front-of-house, kitchen, stock, and finance from one system</td>
                <td style="padding: 1rem; color: #34d399;">First completed order through kitchen workflow</td>
                <td style="padding: 1rem; font-weight: 700;">96 / 100</td>
                <td style="padding: 1rem;"><span style="background: #ec489920; color: #f472b6; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">INVEST</span></td>
              </tr>
              <tr style="border-bottom: 1px solid #334155;">
                <td style="padding: 1rem; font-weight: 700; color: #f472b6;">Pharmacy</td>
                <td style="padding: 1rem;">Controlled, traceable pharmacy operations with strong stock & dispensing governance</td>
                <td style="padding: 1rem; color: #34d399;">First controlled dispensing transaction recorded</td>
                <td style="padding: 1rem; font-weight: 700;">95 / 100</td>
                <td style="padding: 1rem;"><span style="background: #ec489920; color: #f472b6; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">INVEST</span></td>
              </tr>
              <tr style="border-bottom: 1px solid #334155;">
                <td style="padding: 1rem; font-weight: 700; color: #f472b6;">Law Firm</td>
                <td style="padding: 1rem;">Manage legal matters, documents, time, billing, and client operations in one workspace</td>
                <td style="padding: 1rem; color: #34d399;">First active matter created with billable time activity</td>
                <td style="padding: 1rem; font-weight: 700;">94 / 100</td>
                <td style="padding: 1rem;"><span style="background: #ec489920; color: #f472b6; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">INVEST</span></td>
              </tr>
              <tr style="border-bottom: 1px solid #334155;">
                <td style="padding: 1rem; font-weight: 700; color: #f472b6;">SACCO / VICOBA</td>
                <td style="padding: 1rem;">Digitize member-based savings, lending, governance, and financial operations</td>
                <td style="padding: 1rem; color: #34d399;">First member contribution and financial ledger posting</td>
                <td style="padding: 1rem; font-weight: 700;">95 / 100</td>
                <td style="padding: 1rem;"><span style="background: #ec489920; color: #f472b6; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">INVEST</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>

      <footer style="margin-top: 2rem; border-top: 1px solid #1e293b; padding-top: 1rem; color: #64748b; font-size: 0.75rem; display: flex; justify-content: space-between;">
        <div>STATUS: CERTIFIED COMMERCIAL-READY (COMM PHASE 16)</div>
        <div>IMMUTABLE EVIDENCE: artifacts/commercial-evidence/</div>
      </footer>
    </div>
  `;
}
