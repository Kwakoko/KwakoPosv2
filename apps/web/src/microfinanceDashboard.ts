export function renderMicrofinanceDashboard(): string {
  return `
    <div style="font-family: 'Inter', sans-serif; background: #1e1b4b; color: #e0e7ff; padding: 2rem; min-height: 100vh;">
      <header style="border-bottom: 1px solid #312e81; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="background: #6366f1; color: #ffffff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 800; font-size: 0.875rem;">MICROFINANCE & LENDING MODULE</span>
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: #ffffff;">KwakoPos Digital Microfinance & Credit Command Center</h1>
          <p style="color: #a5b4fc; margin-top: 0.25rem;">AI Credit Intelligence, Debt-Service Ratio Engine, Repayment Waterfall & Portfolio PAR-30 Risk</p>
        </div>
        <div style="display: flex; gap: 1rem;">
          <button style="background: #4f46e5; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">CREDIT ASSESSMENT</button>
          <button style="background: #10b981; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">DISBURSE LOAN</button>
        </div>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: #312e81; border: 1px solid #4338ca; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #c7d2fe; font-size: 0.875rem;">ACTIVE BORROWERS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #818cf8;">3,850 BORROWERS</div>
          <div style="color: #a5b4fc; font-size: 0.75rem; margin-top: 0.5rem;">Individual: 2,400 | SME: 950 | Group: 500</div>
        </div>

        <div style="background: #312e81; border: 1px solid #4338ca; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #c7d2fe; font-size: 0.875rem;">GROSS LOAN PORTFOLIO</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #34d399;">1,250,000,000 TZS</div>
          <div style="color: #a5b4fc; font-size: 0.75rem; margin-top: 0.5rem;">Disbursed This Month: 185,000,000 TZS</div>
        </div>

        <div style="background: #312e81; border: 1px solid #4338ca; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #c7d2fe; font-size: 0.875rem;">COLLECTIONS TODAY</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #38bdf8;">28,400,000 TZS</div>
          <div style="color: #a5b4fc; font-size: 0.75rem; margin-top: 0.5rem;">Mobile Money: 82% | Bank: 14% | Cash: 4%</div>
        </div>

        <div style="background: #312e81; border: 1px solid #4338ca; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #c7d2fe; font-size: 0.875rem;">PORTFOLIO AT RISK (PAR-30)</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #f59e0b;">2.1%</div>
          <div style="color: #a5b4fc; font-size: 0.75rem; margin-top: 0.5rem;">Target: < 3.5% | Collection Priority Queue: 14</div>
        </div>
      </div>

      <main style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">DISBURSED LOAN PORTFOLIO & REPAYMENT TRACKER</h2>
          <div style="background: #312e81; border: 1px solid #4338ca; border-radius: 0.75rem; padding: 1.5rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #1e1b4b; color: #c7d2fe; font-size: 0.875rem;">
                  <th style="padding: 0.75rem;">LOAN #</th>
                  <th style="padding: 0.75rem;">BORROWER & TYPE</th>
                  <th style="padding: 0.75rem;">PRODUCT</th>
                  <th style="padding: 0.75rem;">OUTSTANDING PRINCIPAL</th>
                  <th style="padding: 0.75rem;">STATUS</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.875rem;">
                <tr style="border-bottom: 1px solid #4338ca;">
                  <td style="padding: 0.75rem; font-family: monospace; color: #818cf8;">MFI-2026-9041</td>
                  <td style="padding: 0.75rem; font-weight: 600;">Kilio Agribusiness Ltd (SME)</td>
                  <td style="padding: 0.75rem;">Agri Working Capital Loan</td>
                  <td style="padding: 0.75rem;">15,000,000 TZS</td>
                  <td style="padding: 0.75rem;"><span style="background: #10b98120; color: #34d399; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">DISBURSED</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">AI CREDIT INTELLIGENCE & RISK DRIVERS</h2>
          <div style="background: #312e81; border: 1px solid #4338ca; border-radius: 0.75rem; padding: 1.5rem;">
            <div style="background: #1e1b4b; border: 1px solid #818cf850; border-radius: 0.5rem; padding: 1rem;">
              <span style="background: #818cf820; color: #a5b4fc; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.75rem;">LOW RISK (SCORE: 740)</span>
              <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.5rem;">Kilio Agribusiness Ltd</h4>
              <p style="color: #c7d2fe; font-size: 0.875rem; margin-top: 0.25rem;">Debt Service Ratio: 28.4% (Healthy < 50%). Verified bank cash flow exceeds 4.5× monthly loan installment.</p>
              <div style="color: #34d399; font-weight: 700; font-size: 0.75rem; margin-top: 0.5rem;">RECOMMENDATION: Approved for instant disbursement.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}
