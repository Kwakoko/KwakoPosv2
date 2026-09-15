export function renderRestaurantDashboard(): string {
  return `
    <div style="font-family: 'Inter', sans-serif; background: #0c0a09; color: #f5f5f4; padding: 2rem; min-height: 100vh;">
      <header style="border-bottom: 1px solid #292524; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="background: #f97316; color: #ffffff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 600; font-size: 0.875rem;">RESTAURANT OPERATING SYSTEM MODULE</span>
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: #ffffff;">KwakoPos Restaurant & Kitchen Display System (KDS)</h1>
          <p style="color: #a8a29e; margin-top: 0.25rem;">Real-Time Food Costing, Table Management, Recipe BOM & AI Station Intelligence</p>
        </div>
        <div style="display: flex; gap: 1rem;">
          <button style="background: #eab308; color: #000000; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 700; cursor: pointer;">TABLE MAP (12 SEATED)</button>
          <button style="background: #f97316; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 700; cursor: pointer;">KITCHEN DISPLAY (KDS)</button>
        </div>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: #1c1917; border: 1px solid #44403c; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a8a29e; font-size: 0.875rem;">TODAY'S ORDERS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #f97316;">3,420,000 TZS</div>
          <div style="color: #78716c; font-size: 0.75rem; margin-top: 0.5rem;">118 Orders | Avg Table Spend: 28,983 TZS</div>
        </div>

        <div style="background: #1c1917; border: 1px solid #44403c; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a8a29e; font-size: 0.875rem;">FOOD COST %</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #22c55e;">28.4%</div>
          <div style="color: #78716c; font-size: 0.75rem; margin-top: 0.5rem;">Gross Margin: 71.6% (BOM Ingredient Cost: 971,280 TZS)</div>
        </div>

        <div style="background: #1c1917; border: 1px solid #44403c; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a8a29e; font-size: 0.875rem;">AVG KITCHEN PREP TIME</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #06b6d4;">12.4 MINS</div>
          <div style="color: #78716c; font-size: 0.75rem; margin-top: 0.5rem;">Target: 15.0 Mins | KDS Queue: 4 Active Orders</div>
        </div>

        <div style="background: #1c1917; border: 1px solid #44403c; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a8a29e; font-size: 0.875rem;">MENU ENGINEERING MATRIX</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #eab308;">14 STARS</div>
          <div style="color: #78716c; font-size: 0.75rem; margin-top: 0.5rem;">8 Plowhorses | 4 Puzzles | 2 Dogs</div>
        </div>
      </div>

      <main style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">LIVE KITCHEN DISPLAY STATIONS (KDS)</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
            <div style="background: #1c1917; border: 2px solid #ef4444; border-radius: 0.5rem; padding: 1rem;">
              <div style="display: flex; justify-content: space-between; font-weight: 700;">
                <span>#KDS-1042 (TABLE 04)</span>
                <span style="color: #ef4444;">18 MINS (PRIORITY)</span>
              </div>
              <hr style="border: 0; border-top: 1px solid #44403c; margin: 0.5rem 0;" />
              <div style="font-size: 0.875rem;">
                <div>• 2× Flame Grilled Burger [GRILL]</div>
                <div>• 1× Truffle Fries [FRY]</div>
                <div style="color: #f97316;">• 1× Fresh Passion Juice [BAR]</div>
              </div>
            </div>

            <div style="background: #1c1917; border: 2px solid #eab308; border-radius: 0.5rem; padding: 1rem;">
              <div style="display: flex; justify-content: space-between; font-weight: 700;">
                <span>#KDS-1043 (TAKEAWAY)</span>
                <span style="color: #eab308;">09 MINS</span>
              </div>
              <hr style="border: 0; border-top: 1px solid #44403c; margin: 0.5rem 0;" />
              <div style="font-size: 0.875rem;">
                <div>• 1× Chicken Tikka Masala [GRILL]</div>
                <div>• 2× Garlic Naan [BAKERY]</div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">EXPLAINABLE AI KITCHEN INSIGHTS</h2>
          <div style="background: #1c1917; border: 1px solid #44403c; border-radius: 0.75rem; padding: 1.5rem;">
            <div style="background: #0c0a09; border: 1px solid #f9731650; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem;">
              <span style="background: #f9731620; color: #fb923c; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.75rem;">KITCHEN BOTTLENECK (94% CONFIDENCE)</span>
              <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.5rem;">GRILL Station Latency Spike</h4>
              <p style="color: #d6d3d1; font-size: 0.875rem; margin-top: 0.25rem;">Prep delay on GRILL station exceeded 15 mins for 4 consecutive orders during lunch rush.</p>
              <div style="color: #22c55e; font-weight: 600; font-size: 0.75rem; margin-top: 0.5rem;">RECOMMENDATION: Assign secondary line chef to GRILL station.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}
