export function renderRetailDashboard(): string {
  return `
    <div style="font-family: 'Inter', sans-serif; background: #0a0f1d; color: #f8fafc; padding: 2rem; min-height: 100vh;">
      <header style="border-bottom: 1px solid #1e293b; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="background: #3b82f6; color: #ffffff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 600; font-size: 0.875rem;">RETAIL OPERATING SYSTEM MODULE</span>
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: #ffffff;">KwakoPos Retail Command Center & PWA POS</h1>
          <p style="color: #94a3b8; margin-top: 0.25rem;">Ledger-Driven Inventory, Multi-Variant Catalog, Fast POS Checkout & AI Replenishment</p>
        </div>
        <div>
          <button style="background: #10b981; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 700; cursor: pointer;">LAUNCH FAST POS CHECKOUT</button>
        </div>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">TODAY'S RETAIL SALES</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #10b981;">4,850,000 TZS</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">142 Transactions | Avg Basket: 34,154 TZS</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">GROSS PROFIT MARGIN</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #3b82f6;">34.8%</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">Net Profit: 1,687,800 TZS (COGS: 3,162,200 TZS)</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">TOTAL INVENTORY VALUE</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #f59e0b;">42,100,000 TZS</div>
          <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.5rem;">1,240 SKUs across 3 Active Branches</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">AI REPLENISHMENT ALERTS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #ec4899;">4 REORDERS</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">Suggested PO Value: 1,840,000 TZS</div>
        </div>
      </div>

      <main style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">FAST RETAIL POS CHECKOUT & CART</h2>
          <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
            <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
              <input type="text" placeholder="Scan Barcode (EAN13/Code128) or Search Product/SKU..." style="flex: 1; background: #0f172a; border: 1px solid #475569; border-radius: 0.5rem; padding: 0.75rem; color: #ffffff; font-size: 1rem;" />
              <button style="background: #3b82f6; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 700;">ADD ITEM</button>
            </div>

            <table style="width: 100%; border-collapse: collapse; text-align: left; margin-bottom: 1.5rem;">
              <thead>
                <tr style="background: #0f172a; border-bottom: 1px solid #334155; color: #94a3b8; font-size: 0.875rem;">
                  <th style="padding: 0.75rem;">SKU / BARCODE</th>
                  <th style="padding: 0.75rem;">PRODUCT & VARIANT</th>
                  <th style="padding: 0.75rem;">QTY</th>
                  <th style="padding: 0.75rem;">UNIT PRICE</th>
                  <th style="padding: 0.75rem;">LINE TOTAL</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.875rem;">
                <tr style="border-bottom: 1px solid #334155;">
                  <td style="padding: 0.75rem; font-family: monospace; color: #94a3b8;">RET-SHRT-BLU-4021</td>
                  <td style="padding: 0.75rem; font-weight: 600;">Cotton Slim Fit Shirt (Blue / Large)</td>
                  <td style="padding: 0.75rem;">2</td>
                  <td style="padding: 0.75rem;">45,000 TZS</td>
                  <td style="padding: 0.75rem; font-weight: 700; color: #34d399;">90,000 TZS</td>
                </tr>
                <tr style="border-bottom: 1px solid #334155;">
                  <td style="padding: 0.75rem; font-family: monospace; color: #94a3b8;">RET-JEAN-BLK-1092</td>
                  <td style="padding: 0.75rem; font-weight: 600;">Denim Straight Jeans (Black / 32)</td>
                  <td style="padding: 0.75rem;">1</td>
                  <td style="padding: 0.75rem;">65,000 TZS</td>
                  <td style="padding: 0.75rem; font-weight: 700; color: #34d399;">65,000 TZS</td>
                </tr>
              </tbody>
            </table>

            <div style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 1rem; border-radius: 0.5rem;">
              <div>
                <div style="color: #94a3b8; font-size: 0.875rem;">TAX INCLUSIVE TOTAL (18% VAT)</div>
                <div style="font-size: 1.75rem; font-weight: 800; color: #10b981;">155,000 TZS</div>
              </div>
              <div style="display: flex; gap: 0.75rem;">
                <button style="background: #64748b; color: #ffffff; border: none; padding: 0.75rem 1.25rem; border-radius: 0.5rem; font-weight: 600;">HOLD SALE</button>
                <button style="background: #10b981; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800;">COLLECT PAYMENT</button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">EXPLAINABLE RETAIL AI INSIGHTS</h2>
          <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
            <div style="background: #0f172a; border: 1px solid #ec489950; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem;">
              <span style="background: #ec489920; color: #f472b6; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.75rem;">STOCKOUT PREDICTION (96% CONFIDENCE)</span>
              <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.5rem;">Cotton Slim Fit Shirt (Blue / Large)</h4>
              <p style="color: #cbd5e1; font-size: 0.875rem; margin-top: 0.25rem;">Current stock is 8 units (below reorder threshold of 10). Sales velocity is 3.2 units/day. Stock depletes in 2.5 days.</p>
              <div style="color: #34d399; font-weight: 600; font-size: 0.75rem; margin-top: 0.5rem;">EXPECTED IMPACT: Prevents 450,000 TZS lost sales.</div>
            </div>

            <div style="background: #0f172a; border: 1px solid #3b82f650; border-radius: 0.5rem; padding: 1rem;">
              <span style="background: #3b82f620; color: #60a5fa; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.75rem;">SLOW MOVING STOCK (92% CONFIDENCE)</span>
              <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.5rem;">Winter Heavy Jacket (Brown / XL)</h4>
              <p style="color: #cbd5e1; font-size: 0.875rem; margin-top: 0.25rem;">42 units held with only 1 unit sold in 30 days. Tying up 2,520,000 TZS capital.</p>
              <div style="color: #60a5fa; font-weight: 600; font-size: 0.75rem; margin-top: 0.5rem;">RECOMMENDATION: Apply 15% clearance bundle.</div>
            </div>
          </div>
        </section>
      </main>

      <footer style="margin-top: 2rem; border-top: 1px solid #1e293b; padding-top: 1rem; color: #64748b; font-size: 0.75rem; display: flex; justify-content: space-between;">
        <div>STATUS: PRODUCTION CERTIFIED RETAIL OS MODULE (KWAKOPOS 2.2.0)</div>
        <div>IMMUTABLE EVIDENCE: artifacts/retail-evidence/</div>
      </footer>
    </div>
  `;
}
