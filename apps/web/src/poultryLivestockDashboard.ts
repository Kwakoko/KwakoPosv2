export function renderPoultryLivestockDashboard(): string {
  return `
    <div style="font-family: 'Inter', sans-serif; background: #14532d; color: #f0fdf4; padding: 2rem; min-height: 100vh;">
      <header style="border-bottom: 1px solid #166534; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="background: #22c55e; color: #052e16; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 800; font-size: 0.875rem;">POULTRY & LIVESTOCK MODULE</span>
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: #ffffff;">KwakoPos Digital Farm & Livestock Command Center</h1>
          <p style="color: #86efac; margin-top: 0.25rem;">Flock Population Reconciliation, Feed Conversion Ratio (FCR), Egg/Milk Production & AI Health Early Warning</p>
        </div>
        <div style="display: flex; gap: 1rem;">
          <button style="background: #22c55e; color: #052e16; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">LOG EGG/MILK PRODUCTION</button>
          <button style="background: #eab308; color: #052e16; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">FEED & VACCINATION LOG</button>
        </div>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: #052e16; border: 1px solid #166534; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #bbf7d0; font-size: 0.875rem;">TOTAL BIRDS / LIVESTOCK</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #4ade80;">14,500 BIRDS</div>
          <div style="color: #86efac; font-size: 0.75rem; margin-top: 0.5rem;">12,000 Layers | 2,500 Broilers | 45 Cattle</div>
        </div>

        <div style="background: #052e16; border: 1px solid #166534; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #bbf7d0; font-size: 0.875rem;">DAILY EGG PRODUCTION</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #4ade80;">10,850 EGGS</div>
          <div style="color: #86efac; font-size: 0.75rem; margin-top: 0.5rem;">Average Lay Rate: 90.4% (361 Trays/Day)</div>
        </div>

        <div style="background: #052e16; border: 1px solid #166534; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #bbf7d0; font-size: 0.875rem;">FEED CONVERSION RATIO (FCR)</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #eab308;">1.62 FCR</div>
          <div style="color: #86efac; font-size: 0.75rem; margin-top: 0.5rem;">Target: 1.65 FCR | Feed Stock: 18.5 Tons</div>
        </div>

        <div style="background: #052e16; border: 1px solid #166534; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #bbf7d0; font-size: 0.875rem;">FLOCK MORTALITY RATE</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #60a5fa;">0.45%</div>
          <div style="color: #86efac; font-size: 0.75rem; margin-top: 0.5rem;">Threshold: < 2.0% | Biosecurity Status: OPTIMAL</div>
        </div>
      </div>

      <main style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">FLOCK BATCHES & EGG LAYING PERFORMANCE</h2>
          <div style="background: #052e16; border: 1px solid #166534; border-radius: 0.75rem; padding: 1.5rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #14532d; color: #bbf7d0; font-size: 0.875rem;">
                  <th style="padding: 0.75rem;">FLOCK CODE</th>
                  <th style="padding: 0.75rem;">FARM / HOUSE</th>
                  <th style="padding: 0.75rem;">SPECIES & BREED</th>
                  <th style="padding: 0.75rem;">CURRENT BIRDS</th>
                  <th style="padding: 0.75rem;">LAY RATE %</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.875rem;">
                <tr style="border-bottom: 1px solid #166534;">
                  <td style="padding: 0.75rem; font-family: monospace; color: #4ade80;">FLK-2026-H1</td>
                  <td style="padding: 0.75rem; font-weight: 600;">Main Farm / House 01</td>
                  <td style="padding: 0.75rem;">Layers (Lohmann Brown)</td>
                  <td style="padding: 0.75rem;">6,000 Birds</td>
                  <td style="padding: 0.75rem;"><span style="background: #22c55e20; color: #4ade80; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">92.5% LAY RATE</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">AI FARM HEALTH & FEED INTELLIGENCE</h2>
          <div style="background: #052e16; border: 1px solid #166534; border-radius: 0.75rem; padding: 1.5rem;">
            <div style="background: #14532d; border: 1px solid #4ade8050; border-radius: 0.5rem; padding: 1rem;">
              <span style="background: #4ade8020; color: #4ade80; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.75rem;">OPTIMAL PRODUCTION (95% CONFIDENCE)</span>
              <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.5rem;">House 01 Layers Batch</h4>
              <p style="color: #bbf7d0; font-size: 0.875rem; margin-top: 0.25rem;">Feed Conversion Ratio (1.62) is 3% better than industry standard. Vaccination schedule is 100% up-to-date.</p>
              <div style="color: #4ade80; font-weight: 700; font-size: 0.75rem; margin-top: 0.5rem;">RECOMMENDATION: Maintain current layer mash formulation.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}
