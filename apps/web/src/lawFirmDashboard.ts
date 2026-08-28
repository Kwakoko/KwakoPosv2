export function renderLawFirmDashboard(): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; min-height: 100vh;">
      <header style="border-bottom: 1px solid #1e293b; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="background: #6366f1; color: #ffffff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 700; font-size: 0.875rem;">LAW FIRM OPERATING SYSTEM MODULE</span>
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: #ffffff;">KwakoPos Legal Practice Command Center</h1>
          <p style="color: #94a3b8; margin-top: 0.25rem;">Conflict-of-Interest Engine, Limitation Deadlines, Trust Accounting & AI Legal Intelligence</p>
        </div>
        <div style="display: flex; gap: 1rem;">
          <button style="background: #6366f1; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 700; cursor: pointer;">CONFLICT SEARCH</button>
          <button style="background: #10b981; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 700; cursor: pointer;">NEW MATTER INTAKE</button>
        </div>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">ACTIVE MATTERS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #6366f1;">48 MATTERS</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">22 Litigation | 14 Corporate | 12 Conveyancing</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">CRITICAL COURT DEADLINES</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #f59e0b;">5 DUE SOON</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">Limitation Date Risk: 0 | Auto-Escalated: 1</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">APPROVED UNBILLED TIME</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #10b981;">18,500,000 TZS</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">74.0 Attorney Billable Hours Pending Invoice</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">SEGREGATED TRUST FUNDS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #3b82f6;">45,200,000 TZS</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">Client Funds Segregated 100% (Zero Delta)</div>
        </div>
      </div>

      <main style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">ACTIVE LEGAL MATTERS & COURT HEARINGS</h2>
          <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #0f172a; color: #94a3b8; font-size: 0.875rem;">
                  <th style="padding: 0.75rem;">MATTER #</th>
                  <th style="padding: 0.75rem;">TITLE & PRACTICE AREA</th>
                  <th style="padding: 0.75rem;">CLIENT</th>
                  <th style="padding: 0.75rem;">RESPONSIBLE PARTNER</th>
                  <th style="padding: 0.75rem;">STATUS</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.875rem;">
                <tr style="border-bottom: 1px solid #334155;">
                  <td style="padding: 0.75rem; font-family: monospace; color: #818cf8;">MAT-2026-081</td>
                  <td style="padding: 0.75rem; font-weight: 600;">Standard Chartered vs. Tanzania Telecom (Litigation)</td>
                  <td style="padding: 0.75rem;">Tanzania Telecom Ltd</td>
                  <td style="padding: 0.75rem;">Advocate M. K. Lyimo</td>
                  <td style="padding: 0.75rem;"><span style="background: #6366f120; color: #a5b4fc; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">LITIGATION</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">EXPLAINABLE AI LEGAL INSIGHTS</h2>
          <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
            <div style="background: #0f172a; border: 1px solid #6366f150; border-radius: 0.5rem; padding: 1rem;">
              <span style="background: #6366f120; color: #818cf8; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.75rem;">DEADLINE RISK (98% CONFIDENCE)</span>
              <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.5rem;">High Court Appeal Filing Due</h4>
              <p style="color: #cbd5e1; font-size: 0.875rem; margin-top: 0.25rem;">Statutory appeal filing deadline for Matter #MAT-2026-081 is in 3 days.</p>
              <div style="color: #818cf8; font-weight: 700; font-size: 0.75rem; margin-top: 0.5rem;">RECOMMENDATION: Finalize memorandum of appeal.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}
