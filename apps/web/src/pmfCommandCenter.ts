import { VerticalPmfSummaryProfile } from "@kwakopos2/contracts";
import { FalsePmfAnomalyAlert } from "@kwakopos2/domain";

export interface PmfCommandCenterProps {
  verticalProfiles: VerticalPmfSummaryProfile[];
  anomalies: FalsePmfAnomalyAlert[];
}

export function renderPmfCommandCenterDashboard(props: PmfCommandCenterProps): string {
  const { verticalProfiles, anomalies } = props;

  let html = `
    <div style="font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 12px; max-width: 1360px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #334155; padding-bottom: 20px; margin-bottom: 28px;">
        <div>
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #38bdf8;">KWAKOPOS PMF VALIDATION COMMAND CENTER</h1>
          <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 14px;">Phase 17 — Permanent Evidence-Driven Product Intelligence & Investment Governance</p>
        </div>
        <div style="text-align: right;">
          <span style="background: #15803d; color: white; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 13px; display: inline-block;">
            EVIDENCE LAYER ACTIVE
          </span>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Problem → Workflow → Pilot → Retention → Investment</p>
        </div>
      </div>

      <!-- Anomaly Alerts Banner -->
      ${
        anomalies.length > 0
          ? `
        <div style="background: #451a03; border: 1px solid #f97316; padding: 16px; border-radius: 8px; margin-bottom: 28px;">
          <h3 style="margin: 0 0 8px 0; color: #fb923c; font-size: 15px;">⚠️ False PMF Anomaly Alerts Detected (${anomalies.length})</h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${anomalies
              .map(
                (a) => `
              <div style="background: #292524; padding: 10px; border-radius: 6px; font-size: 12px;">
                <strong style="color: #fdba74;">[${a.severity}] ${a.anomalyType}:</strong> ${a.description}
                <div style="color: #94a3b8; margin-top: 4px;"><em>Rec: ${a.recommendation}</em></div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `
          : ""
      }

      <!-- Cross-Vertical Executive Matrix -->
      <h2 style="color: #f8fafc; font-size: 20px; margin-bottom: 16px;">Cross-Vertical PMF Validation Matrix</h2>
      <div style="overflow-x: auto; margin-bottom: 32px; background: #1e293b; border-radius: 10px; border: 1px solid #334155;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px;">
          <thead>
            <tr style="background: #0f172a; border-bottom: 1px solid #334155; color: #94a3b8;">
              <th style="padding: 12px;">Vertical</th>
              <th style="padding: 12px;">North Star Metric</th>
              <th style="padding: 12px;">Activation %</th>
              <th style="padding: 12px;">TTFV</th>
              <th style="padding: 12px;">WAU</th>
              <th style="padding: 12px;">Ret W4 %</th>
              <th style="padding: 12px;">Adoption %</th>
              <th style="padding: 12px;">Support/Cust</th>
              <th style="padding: 12px;">Reliability</th>
              <th style="padding: 12px;">PMF Score</th>
              <th style="padding: 12px;">State</th>
              <th style="padding: 12px;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${verticalProfiles
              .map((p) => {
                const stateBg = p.pmfState === "PROVEN" ? "#15803d" : "#0369a1";
                const actionColor = p.investmentAction === "DOUBLE_DOWN" ? "#4ade80" : "#fbbf24";
                return `
                <tr style="border-bottom: 1px solid #334155; color: #f8fafc;">
                  <td style="padding: 12px; font-weight: 600; color: #38bdf8;">${p.displayName}</td>
                  <td style="padding: 12px; color: #cbd5e1;">${p.northStarMetricName}</td>
                  <td style="padding: 12px;">${p.activationRatePct}%</td>
                  <td style="padding: 12px;">${p.ttfvDaysAverage}d</td>
                  <td style="padding: 12px;">${p.wauTenantsCount}</td>
                  <td style="padding: 12px;">${p.cohortRetentionW4Pct}%</td>
                  <td style="padding: 12px;">${p.featureAdoptionRatePct}%</td>
                  <td style="padding: 12px;">$${p.supportCostPerCustomerUsd}</td>
                  <td style="padding: 12px;">${p.operationalReliabilityPct}%</td>
                  <td style="padding: 12px; font-weight: 800; font-size: 14px; color: #38bdf8;">${p.pmfHealthScore}/100</td>
                  <td style="padding: 12px;"><span style="background: ${stateBg}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700;">${p.pmfState}</span></td>
                  <td style="padding: 12px; font-weight: 700; color: ${actionColor};">${p.investmentAction}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>

      <!-- Core PMF Principles -->
      <div style="background: #1e293b; border: 1px solid #334155; padding: 20px; border-radius: 10px; font-size: 12px; color: #cbd5e1; line-height: 1.6;">
        <h3 style="margin: 0 0 8px 0; color: #38bdf8; font-size: 15px;">Governing PMF Principles</h3>
        <p style="margin: 0 0 6px 0;"><strong>Principle 01:</strong> <em>"Engineering completion does not prove product-market fit. Customer behavior and retention provide the evidence."</em></p>
        <p style="margin: 0 0 6px 0;"><strong>Principle 02:</strong> Investment decisions follow: <strong>DOUBLE DOWN</strong> on Proven Winners ➔ <strong>OPTIMIZE</strong> Promising Products ➔ <strong>PILOT MORE</strong> Uncertain Products ➔ <strong>PAUSE/RETIRE</strong> Unviable Products.</p>
        <p style="margin: 0;"><strong>Principle 03:</strong> Customer feedback is automatically classified and linked directly to measurable engineering roadmap decisions.</p>
      </div>
    </div>
  `;

  return html;
}
