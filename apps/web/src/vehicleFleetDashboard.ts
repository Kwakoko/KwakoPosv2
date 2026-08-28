export function renderVehicleFleetDashboard(): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; min-height: 100vh;">
      <header style="border-bottom: 1px solid #1e293b; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="background: #3b82f6; color: #ffffff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 800; font-size: 0.875rem;">VEHICLE & FLEET MODULE</span>
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: #ffffff;">KwakoPos Digital Fleet Operations & GPS Dispatch</h1>
          <p style="color: #94a3b8; margin-top: 0.25rem;">Fuel Efficiency (km/L), Driver Compliance, Trip Margin, Maintenance Scheduler & Telematics Anomaly Engine</p>
        </div>
        <div style="display: flex; gap: 1rem;">
          <button style="background: #3b82f6; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">DISPATCH TRIP</button>
          <button style="background: #10b981; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">FUEL & MAINTENANCE LOG</button>
        </div>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">TOTAL FLEET VEHICLES</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #60a5fa;">84 VEHICLES</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">62 Active | 14 Maintenance | 8 Standby</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">FLEET UTILIZATION RATE</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #10b981;">87.5%</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">Active Trips Today: 42 | Downtime: 4.2%</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">AVG FUEL CONSUMPTION</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #f59e0b;">8.4 KM / L</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">Avg Cost: 357 TZS/km | Total Fuel: 1,420L</div>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #94a3b8; font-size: 0.875rem;">DRIVER COMPLIANCE</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #34d399;">100% COMPLIANT</div>
          <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;">58 Drivers Verified | 0 Expired Licenses</div>
        </div>
      </div>

      <main style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">ACTIVE DISPATCH TRIPS & FLEET LOGISTICS</h2>
          <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #0f172a; color: #94a3b8; font-size: 0.875rem;">
                  <th style="padding: 0.75rem;">TRIP #</th>
                  <th style="padding: 0.75rem;">REGISTRATION & TYPE</th>
                  <th style="padding: 0.75rem;">ROUTE</th>
                  <th style="padding: 0.75rem;">DRIVER</th>
                  <th style="padding: 0.75rem;">STATUS</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.875rem;">
                <tr style="border-bottom: 1px solid #334155;">
                  <td style="padding: 0.75rem; font-family: monospace; color: #60a5fa;">TRIP-2026-4401</td>
                  <td style="padding: 0.75rem; font-weight: 600;">T 882 DKL (Scania Semi-Trailer)</td>
                  <td style="padding: 0.75rem;">Dar es Salaam -> Mwanza (1,150 km)</td>
                  <td style="padding: 0.75rem;">Driver J. Kibona</td>
                  <td style="padding: 0.75rem;"><span style="background: #3b82f620; color: #60a5fa; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">IN TRANSIT</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">AI FLEET & TELEMATICS INSIGHTS</h2>
          <div style="background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem;">
            <div style="background: #0f172a; border: 1px solid #3b82f650; border-radius: 0.5rem; padding: 1rem;">
              <span style="background: #3b82f620; color: #60a5fa; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.75rem;">PREDICTIVE MAINTENANCE (94% CONFIDENCE)</span>
              <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.5rem;">Scania Semi-Trailer (T 882 DKL)</h4>
              <p style="color: #cbd5e1; font-size: 0.875rem; margin-top: 0.25rem;">Odometer reached 98,450 km (950 km to 100,000 km major service window).</p>
              <div style="color: #60a5fa; font-weight: 700; font-size: 0.75rem; margin-top: 0.5rem;">RECOMMENDATION: Schedule oil & filter service upon arrival at Mwanza depot.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}
