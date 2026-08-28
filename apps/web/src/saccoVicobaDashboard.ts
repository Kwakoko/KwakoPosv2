export function renderSaccoVicobaDashboard(): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; background: #064e3b; color: #ecfdf5; padding: 2rem; min-height: 100vh;">
      <header style="border-bottom: 1px solid #047857; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="background: #10b981; color: #022c22; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 800; font-size: 0.875rem;">SACCO & VICOBA OPERATING SYSTEM MODULE</span>
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: #ffffff;">KwakoPos Digital SACCO & VICOBA Command Center</h1>
          <p style="color: #6ee7b7; margin-top: 0.25rem;">Member Savings, Share Capital, AI Credit Intelligence, Repayment Waterfall & VICOBA Cycle Engine</p>
        </div>
        <div style="display: flex; gap: 1rem;">
          <button style="background: #34d399; color: #022c22; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">VICOBA MEETING CYCLE</button>
          <button style="background: #059669; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">LOAN APPLICATION</button>
        </div>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: #022c22; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a7f3d0; font-size: 0.875rem;">TOTAL REGISTERED MEMBERS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #34d399;">1,240 MEMBERS</div>
          <div style="color: #6ee7b7; font-size: 0.75rem; margin-top: 0.5rem;">850 SACCO | 390 VICOBA Group Members</div>
        </div>

        <div style="background: #022c22; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a7f3d0; font-size: 0.875rem;">MEMBER SAVINGS & SHARES</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #34d399;">485,000,000 TZS</div>
          <div style="color: #6ee7b7; font-size: 0.75rem; margin-top: 0.5rem;">Shares: 120M TZS | Savings: 365M TZS</div>
        </div>

        <div style="background: #022c22; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a7f3d0; font-size: 0.875rem;">ACTIVE LOAN PORTFOLIO</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #f59e0b;">312,500,000 TZS</div>
          <div style="color: #6ee7b7; font-size: 0.75rem; margin-top: 0.5rem;">184 Active Loans | PAR-30: 1.8%</div>
        </div>

        <div style="background: #022c22; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a7f3d0; font-size: 0.875rem;">REPAID THIS MONTH</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #60a5fa;">42,800,000 TZS</div>
          <div style="color: #6ee7b7; font-size: 0.75rem; margin-top: 0.5rem;">Repayment Rate: 98.2% | Cash In Hand: 18.5M TZS</div>
        </div>
      </div>

      <main style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">MEMBER LOAN PORTFOLIO & REPAYMENT STATUS</h2>
          <div style="background: #022c22; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #064e3b; color: #a7f3d0; font-size: 0.875rem;">
                  <th style="padding: 0.75rem;">LOAN #</th>
                  <th style="padding: 0.75rem;">MEMBER NAME & GROUP</th>
                  <th style="padding: 0.75rem;">PRODUCT</th>
                  <th style="padding: 0.75rem;">OUTSTANDING PRINCIPAL</th>
                  <th style="padding: 0.75rem;">STATUS</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.875rem;">
                <tr style="border-bottom: 1px solid #047857;">
                  <td style="padding: 0.75rem; font-family: monospace; color: #34d399;">LN-2026-8801</td>
                  <td style="padding: 0.75rem; font-weight: 600;">Subira Hamisi (Amani VICOBA Group)</td>
                  <td style="padding: 0.75rem;">Business Growth Loan</td>
                  <td style="padding: 0.75rem;">1,500,000 TZS</td>
                  <td style="padding: 0.75rem;"><span style="background: #10b98120; color: #34d399; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">IN REPAYMENT</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">AI CREDIT INTELLIGENCE</h2>
          <div style="background: #022c22; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
            <div style="background: #064e3b; border: 1px solid #34d39950; border-radius: 0.5rem; padding: 1rem;">
              <span style="background: #34d39920; color: #34d399; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.75rem;">EXCELLENT CREDIT SCORE (96% CONFIDENCE)</span>
              <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.5rem;">Member Subira Hamisi</h4>
              <p style="color: #a7f3d0; font-size: 0.875rem; margin-top: 0.25rem;">100% weekly contribution attendance over 24 months. 0 arrears events on previous 3 loan cycles.</p>
              <div style="color: #34d399; font-weight: 700; font-size: 0.75rem; margin-top: 0.5rem;">RECOMMENDATION: Eligible for 3.0× savings limit expansion.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}
