export function renderElectronicsDashboard(): string {
  return `
    <div style="font-family: 'Inter', sans-serif; background: #09090b; color: #fafafa; padding: 2rem; min-height: 100vh;">
      <header style="border-bottom: 1px solid #27272a; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="background: #a855f7; color: #ffffff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 800; font-size: 0.875rem;">ADVANCED ELECTRONICS MODULE</span>
          <h1 style="font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: #ffffff;">KwakoPos Device Lifecycle & Technical Service Center</h1>
          <p style="color: #a1a1aa; margin-top: 0.25rem;">Serial/IMEI Traceability, Warranty Tracking, Technical Repair Jobs, Refurbishment & Trade-In Engine</p>
        </div>
        <div style="display: flex; gap: 1rem;">
          <button style="background: #a855f7; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">REGISTER REPAIR TICKET</button>
          <button style="background: #06b6d4; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 800; cursor: pointer;">TRADE-IN / DEVICE VALUATION</button>
        </div>
      </header>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: #18181b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a1a1aa; font-size: 0.875rem;">SERIALIZED INVENTORY VALUE</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #c084fc;">685.2M TZS</div>
          <div style="color: #71717a; font-size: 0.75rem; margin-top: 0.5rem;">1,240 Serialized Units | 850 Active IMEIs</div>
        </div>

        <div style="background: #18181b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a1a1aa; font-size: 0.875rem;">ACTIVE REPAIR TICKETS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #38bdf8;">24 TICKETS</div>
          <div style="color: #71717a; font-size: 0.75rem; margin-top: 0.5rem;">Avg Turnaround Time: 1.8 Days | 4 Techs</div>
        </div>

        <div style="background: #18181b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a1a1aa; font-size: 0.875rem;">ACTIVE WARRANTY CLAIMS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #facc15;">9 CLAIMS</div>
          <div style="color: #71717a; font-size: 0.75rem; margin-top: 0.5rem;">Manufacturer Approved: 8 | Inspection: 1</div>
        </div>

        <div style="background: #18181b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1.5rem;">
          <div style="color: #a1a1aa; font-size: 0.875rem;">TRADE-IN & REFURBISHED UNITS</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #4ade80;">42 UNITS</div>
          <div style="color: #71717a; font-size: 0.75rem; margin-top: 0.5rem;">Grade A: 18 | Grade B: 20 | Grade C: 4</div>
        </div>
      </div>

      <main style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">SERIALIZED DEVICES & REPAIR SERVICE TICKETS</h2>
          <div style="background: #18181b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1.5rem;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #09090b; color: #a1a1aa; font-size: 0.875rem;">
                  <th style="padding: 0.75rem;">TICKET #</th>
                  <th style="padding: 0.75rem;">DEVICE & SERIAL / IMEI</th>
                  <th style="padding: 0.75rem;">REPORTED ISSUE</th>
                  <th style="padding: 0.75rem;">TECHNICIAN</th>
                  <th style="padding: 0.75rem;">STATUS</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.875rem;">
                <tr style="border-bottom: 1px solid #27272a;">
                  <td style="padding: 0.75rem; font-family: monospace; color: #c084fc;">REP-2026-8801</td>
                  <td style="padding: 0.75rem; font-weight: 600;">iPhone 15 Pro Max 256GB (IMEI: 359182094819201)</td>
                  <td style="padding: 0.75rem;">OLED Screen Crack & Battery Replacement</td>
                  <td style="padding: 0.75rem;">Tech D. Temba</td>
                  <td style="padding: 0.75rem;"><span style="background: #a855f720; color: #c084fc; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700;">REPAIRING</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ffffff;">AI DEVICE & REPAIR DIAGNOSTIC INSIGHTS</h2>
          <div style="background: #18181b; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1.5rem;">
            <div style="background: #09090b; border: 1px solid #a855f750; border-radius: 0.5rem; padding: 1rem;">
              <span style="background: #a855f720; color: #c084fc; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.75rem;">REPAIR DIAGNOSTIC ASSIST (98% CONFIDENCE)</span>
              <h4 style="font-size: 1rem; font-weight: 700; margin-top: 0.5rem;">iPhone 15 Pro Max Battery Health</h4>
              <p style="color: #d4d4d8; font-size: 0.875rem; margin-top: 0.25rem;">Intake voltage log indicates charging IC pin short circuit alongside screen replacement requirement.</p>
              <div style="color: #c084fc; font-weight: 700; font-size: 0.75rem; margin-top: 0.5rem;">RECOMMENDATION: Include Charging IC Flex Component in Repair Job BOM.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}
