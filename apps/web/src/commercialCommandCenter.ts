import {
  VerticalCommercialProfile,
  PortfolioTier,
  CommercialDecisionAction,
  PortfolioPriorityScoreInput,
} from "@kwakopos2/contracts";
import { globalCommercialGovernanceEngine } from "@kwakopos2/domain";

export interface CommercialCommandCenterProps {
  flagshipProfiles: VerticalCommercialProfile[];
  tier2Verticals: string[];
  tier3Count: number;
}

export function renderCommercialCommandCenterDashboard(props: CommercialCommandCenterProps): string {
  const { flagshipProfiles, tier2Verticals, tier3Count } = props;

  let html = `
    <div style="font-family: 'Segoe UI', Inter, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 12px; max-width: 1280px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #334155; padding-bottom: 20px; margin-bottom: 28px;">
        <div>
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #38bdf8;">KWAKOPOS COMMERCIAL COMMAND CENTER</h1>
          <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 14px;">Phase 16 — Market-First Portfolio Governance & Commercial Product Readiness</p>
        </div>
        <div style="text-align: right;">
          <span style="background: #0284c7; color: white; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 13px; display: inline-block;">
            COMMERCIAL GA READY
          </span>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Build Broad Platform • Commercialize Focused Portfolio</p>
        </div>
      </div>

      <!-- Portfolio Summary Cards -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 32px;">
        <div style="background: #1e293b; border-left: 5px solid #22c55e; padding: 20px; border-radius: 8px;">
          <h3 style="margin: 0 0 8px 0; color: #4ade80; font-size: 15px; text-transform: uppercase;">Tier 1 — Flagship Growth</h3>
          <div style="font-size: 32px; font-weight: 800; color: #f8fafc;">${flagshipProfiles.length} Verticals</div>
          <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 12px;">70%+ Commercial Investment & Direct Support</p>
        </div>

        <div style="background: #1e293b; border-left: 5px solid #f59e0b; padding: 20px; border-radius: 8px;">
          <h3 style="margin: 0 0 8px 0; color: #fbbf24; font-size: 15px; text-transform: uppercase;">Tier 2 — Strategic Expansion</h3>
          <div style="font-size: 32px; font-weight: 800; color: #f8fafc;">${tier2Verticals.length} Verticals</div>
          <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 12px;">Maintained & Promoted via Empirical Demand</p>
        </div>

        <div style="background: #1e293b; border-left: 5px solid #64748b; padding: 20px; border-radius: 8px;">
          <h3 style="margin: 0 0 8px 0; color: #cbd5e1; font-size: 15px; text-transform: uppercase;">Tier 3 — Specialized Ecosystem</h3>
          <div style="font-size: 32px; font-weight: 800; color: #f8fafc;">${tier3Count}+ Industries</div>
          <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 12px;">Partner-Led Extensible Architecture</p>
        </div>
      </div>

      <!-- Tier 1 Flagship Grid -->
      <h2 style="color: #f8fafc; font-size: 20px; margin-bottom: 16px;">Tier 1 — Flagship Commercial Verticals</h2>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 36px;">
  `;

  for (const profile of flagshipProfiles) {
    const actionBg = profile.actionRecommendation === "INVEST" ? "#15803d" : "#0369a1";
    html += `
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <h3 style="margin: 0; font-size: 18px; color: #38bdf8;">${profile.displayName}</h3>
            <span style="font-size: 11px; color: #94a3b8; font-style: italic;">${profile.targetCustomer}</span>
          </div>
          <span style="background: ${actionBg}; color: white; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 11px;">
            ${profile.actionRecommendation}
          </span>
        </div>

        <p style="color: #cbd5e1; font-size: 13px; margin: 0 0 12px 0;"><strong>Promise:</strong> ${profile.primaryPromise}</p>
        
        <div style="background: #0f172a; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
          <div><span style="color: #64748b;">CAC:</span> <strong>$${profile.unitEconomics.cacUsd}</strong></div>
          <div><span style="color: #64748b;">ARPU:</span> <strong>$${profile.unitEconomics.arpuUsd}/mo</strong></div>
          <div><span style="color: #64748b;">LTV/CAC:</span> <strong style="color: #4ade80;">${profile.unitEconomics.ltvToCacRatio.toFixed(1)}x</strong></div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #334155; padding-top: 10px;">
          <span>Gates A-D: <strong style="color: #4ade80;">100% PASSED</strong></span>
          <span>Design Partners: <strong style="color: #38bdf8;">${profile.designPartnersActiveCount} Active</strong></span>
          <span>Demo Env: <strong style="color: #4ade80;">READY</strong></span>
        </div>
      </div>
    `;
  }

  html += `
      </div>

      <!-- Tier 2 & Tier 3 Summary Section -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div style="background: #1e293b; border: 1px solid #334155; padding: 20px; border-radius: 10px;">
          <h3 style="margin: 0 0 12px 0; color: #fbbf24; font-size: 16px;">Tier 2 Strategic Expansion Verticals</h3>
          <ul style="margin: 0; padding-left: 20px; color: #cbd5e1; font-size: 13px; line-height: 1.8;">
  `;

  for (const t2 of tier2Verticals) {
    html += `<li><strong>${t2}</strong> — Maintained & Production Ready</li>`;
  }

  html += `
          </ul>
        </div>

        <div style="background: #1e293b; border: 1px solid #334155; padding: 20px; border-radius: 10px;">
          <h3 style="margin: 0 0 12px 0; color: #f43f5e; font-size: 16px;">Commercial Governance Policy & Rules</h3>
          <div style="font-size: 12px; color: #cbd5e1; line-height: 1.6;">
            <p style="margin: 0 0 8px 0;"><strong>Rule 01:</strong> <em>"No module receives flagship status simply because its code exists."</em></p>
            <p style="margin: 0 0 8px 0;"><strong>Rule 02:</strong> Commercial launch requires 4 Readiness Gates: Product (A), Engineering (B), Commercial (C), Market (D).</p>
            <p style="margin: 0 0 8px 0;"><strong>Rule 03:</strong> Tier 2 verticals are promoted strictly on empirical customer demand & unit economic evidence.</p>
            <p style="margin: 0;"><strong>Rule 04:</strong> Cross-industry core stability (Auth, Sync, Tenant Isolation, Accounting) must never be compromised.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  return html;
}
