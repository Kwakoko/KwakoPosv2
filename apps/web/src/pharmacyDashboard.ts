export function renderPharmacyDashboard(): string {
  return `
    <div style="font-family: 'Inter', sans-serif; background: #022c22; color: #ecfdf5; padding: 2rem; min-height: 100vh;">
      <header style="border-bottom: 1px solid #065f46; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="background: #10b981; color: #022c22; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 800; font-size: 0.875rem;">PHARMACY OPERATING SYSTEM MODULE</span>
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: #ffffff;">KwakoPos Clinical Pharmacy & FEFO Dispensing</h1>
          <p style="color: #6ee7b7; margin-top: 0.25rem;">Mandatory Batch & Expiry Traceability, Prescription Workflow, Drug Safety Engine & FEFO Inventory</p>
        </div>
        <div style="display: flex; gap: 1rem;">
          <button style="background: #34d399; color: #022c22; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">FEFO DISPENSING COUNTER</button>
        </div>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: #064e3b; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a7f3d0; font-size: 0.875rem;">TODAY'S DISPENSED MEDICINES</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #34d399;">6,180,000 TZS</div>
          <div style="color: #6ee7b7; font-size: 0.75rem; margin-top: 0.5rem;">248 Prescriptions Dispensed | FEFO Compliance: 100%</div>
        </div>

        <div style="background: #064e3b; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a7f3d0; font-size: 0.875rem;">EXPIRY ALERTS (< 90 DAYS)</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #f59e0b;">6 BATCHES</div>
          <div style="color: #6ee7b7; font-size: 0.75rem; margin-top: 0.5rem;">Value: 840,000 TZS | Action: Supplier Return Candidate</div>
        </div>

        <div style="background: #064e3b; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a7f3d0; font-size: 0.875rem;">DRUG SAFETY ALERTS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #f43f5e;">2 ALERTS</div>
          <div style="color: #6ee7b7; font-size: 0.75rem; margin-top: 0.5rem;">1 Allergy Conflict | 1 Duplicate Active Ingredient</div>
        </div>

        <div style="background: #064e3b; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a7f3d0; font-size: 0.875rem;">QUARANTINED BATCHES</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #60a5fa;">1 BATCH</div>
          <div style="color: #6ee7b7; font-size: 0.75rem; margin-top: 0.5rem;">Batch #AMO-2026-09 | Reason: Supplier Recall Investigation</div>
        </div>
      </div>

      <main style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">DISPENSING & BATCH TRACEABILITY</h2>
          <div style="background: #064e3b; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #022c22; color: #a7f3d0; font-size: 0.875rem;">
                  <th style="padding: 0.75rem;">GENERIC / BRAND NAME</th>
                  <th style="padding: 0.75rem;">BATCH #</th>
                  <th style="padding: 0.75rem;">EXPIRY DATE</th>
                  <th style="padding: 0.75rem;">STOCK</th>
                  <th style="padding: 0.75rem;">FEFO STATUS</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.875rem;">
                <tr style="border-bottom: 1px solid #047857;">
                  <td style="padding: 0.75rem; font-weight: 600;">Amoxicillin 500mg (Amoxil)</td>
                  <td style="padding: 0.75rem; font-family: monospace;">BAT-AMO-8841</td>
                  <td style="padding: 0.75rem; color: #f59e0b;">2026-11-15</td>
                  <td style="padding: 0.75rem;">450 Caps</td>
                  <td style="padding: 0.75rem;"><span style="background: #34d39920; color: #34d399; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">RECOMMENDED (FEFO #1)</span></td>
                </tr>
                <tr style="border-bottom: 1px solid #047857;">
                  <td style="padding: 0.75rem; font-weight: 600;">Amoxicillin 500mg (Amoxil)</td>
                  <td style="padding: 0.75rem; font-family: monospace;">BAT-AMO-9902</td>
                  <td style="padding: 0.75rem; color: #6ee7b7;">2027-05-20</td>
                  <td style="padding: 0.75rem;">1,200 Caps</td>
                  <td style="padding: 0.75rem;"><span style="background: #64748b20; color: #94a3b8; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 600;">STANDBY (FEFO #2)</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">AI PHARMACY SAFETY ENGINE</h2>
          <div style="background: #064e3b; border: 1px solid #047857; border-radius: 0.75rem; padding: 1.5rem;">
            <div style="background: #022c22; border: 1px solid #f43f5e50; border-radius: 0.5rem; padding: 1rem;">
              <span style="background: #f43f5e20; color: #fb7185; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.75rem;">ALLERGY CONFLICT (CRITICAL)</span>
              <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.5rem;">Patient: Juma Rashid</h4>
              <p style="color: #a7f3d0; font-size: 0.875rem; margin-top: 0.25rem;">Patient has recorded allergy to Penicillin. Prescribed Amoxicillin contains Penicillin ring structure.</p>
              <div style="color: #fb7185; font-weight: 700; font-size: 0.75rem; margin-top: 0.5rem;">ACTION REQUIRED: Pharmacist approval or drug substitution.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}
