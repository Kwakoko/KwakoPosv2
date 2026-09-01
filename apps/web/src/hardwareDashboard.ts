export function renderHardwareDashboard(): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; background: #1c1917; color: #fafaf9; padding: 2rem; min-height: 100vh;">
      <header style="border-bottom: 1px solid #292524; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="background: #f97316; color: #431407; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 800; font-size: 0.875rem;">HARDWARE & BUILDING MATERIALS MODULE</span>
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: #ffffff;">KwakoPos Hardware Store & Project Command Center</h1>
          <p style="color: #a8a29e; margin-top: 0.25rem;">Multi-Unit Conversions, Contractor Pricing, Project Materials & Intelligent Reordering Engine</p>
        </div>
        <div style="display: flex; gap: 1rem;">
          <button style="background: #f97316; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">NEW HARDWARE QUOTATION</button>
          <button style="background: #eab308; color: #431407; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">PROJECT MATERIAL REQUISITION</button>
        </div>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: #292524; border: 1px solid #44403c; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a8a29e; font-size: 0.875rem;">INVENTORY VALUATION</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #fb923c;">420.5M TZS</div>
          <div style="color: #78716c; font-size: 0.75rem; margin-top: 0.5rem;">1,420 Active SKUs | 3 Warehouses</div>
        </div>

        <div style="background: #292524; border: 1px solid #44403c; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a8a29e; font-size: 0.875rem;">ACTIVE CONTRACTOR PROJECTS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #4ade80;">18 PROJECTS</div>
          <div style="color: #78716c; font-size: 0.75rem; margin-top: 0.5rem;">Total Committed Value: 185.0M TZS</div>
        </div>

        <div style="background: #292524; border: 1px solid #44403c; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a8a29e; font-size: 0.875rem;">AVERAGE GROSS MARGIN</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #facc15;">22.4%</div>
          <div style="color: #78716c; font-size: 0.75rem; margin-top: 0.5rem;">Retail: 28% | Contractor: 18% | Wholesale: 14%</div>
        </div>

        <div style="background: #292524; border: 1px solid #44403c; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a8a29e; font-size: 0.875rem;">CONTRACTOR RECEIVABLES</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #60a5fa;">48.2M TZS</div>
          <div style="color: #78716c; font-size: 0.75rem; margin-top: 0.5rem;">Credit Limit Utilization: 62.0%</div>
        </div>
      </div>

      <main style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">BUILDING MATERIALS & CONSTRUCTIONS CATALOG</h2>
          <div style="background: #292524; border: 1px solid #44403c; border-radius: 0.75rem; padding: 1.5rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #1c1917; color: #a8a29e; font-size: 0.875rem;">
                  <th style="padding: 0.75rem;">SKU</th>
                  <th style="padding: 0.75rem;">PRODUCT NAME</th>
                  <th style="padding: 0.75rem;">CATEGORY</th>
                  <th style="padding: 0.75rem;">CURRENT STOCK</th>
                  <th style="padding: 0.75rem;">RETAIL PRICE</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.875rem;">
                <tr style="border-bottom: 1px solid #44403c;">
                  <td style="padding: 0.75rem; font-family: monospace; color: #fb923c;">HW-CEM-001</td>
                  <td style="padding: 0.75rem; font-weight: 600;">Dangote 42.5N Portland Cement 50kg</td>
                  <td style="padding: 0.75rem;">Construction Materials</td>
                  <td style="padding: 0.75rem;">450 Bags</td>
                  <td style="padding: 0.75rem; font-weight: 700;">21,500 TZS / Bag</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">AI HARDWARE REORDERING & MARGIN INTELLIGENCE</h2>
          <div style="background: #292524; border: 1px solid #44403c; border-radius: 0.75rem; padding: 1.5rem;">
            <div style="background: #1c1917; border: 1px solid #f9731650; border-radius: 0.5rem; padding: 1rem;">
              <span style="background: #f9731620; color: #fb923c; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.75rem;">INTELLIGENT REORDERING (96% CONFIDENCE)</span>
              <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.5rem;">High-Velocity Cement Stock</h4>
              <p style="color: #d6d3d1; font-size: 0.875rem; margin-top: 0.25rem;">Projected sales velocity is 120 bags/day. Current stock of 450 bags will run out in 3.7 days.</p>
              <div style="color: #fb923c; font-weight: 700; font-size: 0.75rem; margin-top: 0.5rem;">RECOMMENDATION: Issue PO for 600 bags to Dangote Cement Tanzania.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}
