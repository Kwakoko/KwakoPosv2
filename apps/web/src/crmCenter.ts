// ============================================================
// Phase 38 — KwakoPos CRM Command Center UI (KCRML v1.0.0)
// ============================================================

export interface CrmUiCardProps {
  tenantId: string;
  totalCustomersCount: number;
  activeLeadsCount: number;
  weightedPipelineValue: number;
  winRatePct: number;
  openCasesCount: number;
  avgHealthScore: number;
  atRiskCustomersCount: number;
}

export function renderCrmCommandCenter(props: CrmUiCardProps): string {
  const formattedPipelineValue = new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(props.weightedPipelineValue);

  return `
<div class="kcrml-command-center" style="background: #0f172a; color: #f8fafc; font-family: Inter, system-ui, sans-serif; padding: 24px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">

  <!-- 1. Lifecycle Progress Banner -->
  <div class="kcrml-banner" style="background: linear-gradient(90deg, #1e293b 0%, #0f172a 100%); border: 1px solid #334155; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h2 style="margin: 0; font-size: 1.25rem; color: #ec4899; font-weight: 700; display: flex; align-items: center; gap: 8px;">
        <span style="background: #db2777; color: #ffffff; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px;">KCRML v1.0.0</span>
        Customer Relationship Operating Layer & Command Center
      </h2>
      <span style="font-size: 0.85rem; color: #94a3b8;">Tenant ID: <strong style="color: #cbd5e1;">${props.tenantId}</strong></span>
    </div>
    <div style="display: flex; gap: 4px; font-size: 0.7rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; overflow-x: auto; padding-bottom: 4px;">
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #db2777; color: #f472b6;">Leads</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Prospects</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Customers</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Contacts</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Opportunities</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Activities</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Comms</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Sales</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Service</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #334155;">Retention</span> →
      <span style="background: #1e293b; padding: 4px 8px; border-radius: 4px; border: 1px solid #f472b6; color: #f472b6;">AI & Success</span>
    </div>
  </div>

  <!-- 2. Executive KPI Strip -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
    <div style="background: #1e293b; border-left: 4px solid #f472b6; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Total Customers</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 4px;">${props.totalCustomersCount}</div>
      <div style="font-size: 0.7rem; color: #34d399; margin-top: 2px;">● Single Customer ID Truth</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #38bdf8; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Active Leads</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #38bdf8; margin-top: 4px;">${props.activeLeadsCount}</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Qualification Pipeline Active</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #34d399; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Weighted Pipeline</div>
      <div style="font-size: 1.25rem; font-weight: 700; color: #34d399; margin-top: 4px;">${formattedPipelineValue}</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Win Rate: ${props.winRatePct}%</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #fbbf24; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Open Cases</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #fbbf24; margin-top: 4px;">${props.openCasesCount}</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">SLA Engine Monitored</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Avg Health Score</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #a855f7; margin-top: 4px;">${props.avgHealthScore}/100</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Explainable Scoring</div>
    </div>
    <div style="background: #1e293b; border-left: 4px solid #f43f5e; padding: 16px; border-radius: 8px;">
      <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">At-Risk Customers</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f43f5e; margin-top: 4px;">${props.atRiskCustomersCount}</div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Retention Workflow Triggered</div>
    </div>
  </div>

  <!-- 3. Operational Grid Panels -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">

    <!-- Panel A: Customer 360 & Sales Pipeline -->
    <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px;">
      <h3 style="margin: 0 0 12px 0; font-size: 1rem; color: #f8fafc; display: flex; justify-content: space-between; align-items: center;">
        <span>💼 Sales Pipeline & Opportunity Matrix</span>
        <button style="background: #db2777; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">+ New Opportunity</button>
      </h3>
      <div style="background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 12px; font-size: 0.8rem;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 6px; margin-bottom: 6px; color: #94a3b8; font-weight: 600;">
          <span>Title</span><span>Customer</span><span>Value</span><span>Stage</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #cbd5e1;">
          <span>POS Expansion</span><span>Arusha Pharmacy</span><span>TZS 12.5M</span><span style="color: #38bdf8; font-weight: 600;">PROPOSAL</span>
        </div>
        <div style="display: flex; justify-content: space-between; color: #cbd5e1;">
          <span>Fleet Tracking</span><span>Safari Logistics</span><span>TZS 45.0M</span><span style="color: #fbbf24; font-weight: 600;">NEGOTIATION</span>
        </div>
      </div>
      <div style="margin-top: 10px; background: #064e3b; border: 1px solid #059669; color: #a7f3d0; padding: 8px; border-radius: 6px; font-size: 0.75rem;">
        ✓ Identity Resolution: 0 unverified duplicate customer candidates detected.
      </div>
    </div>

    <!-- Panel B: AI CRM Advisor & Churn Intelligence -->
    <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px;">
      <h3 style="margin: 0 0 12px 0; font-size: 1rem; color: #f8fafc; display: flex; justify-content: space-between; align-items: center;">
        <span>🤖 AI CRM Intelligence & Retention Advisor</span>
        <span style="background: #7c3aed; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px;">Human Approval Gate</span>
      </h3>
      <div style="background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 12px; font-size: 0.8rem; color: #cbd5e1;">
        <div style="margin-bottom: 6px;"><strong style="color: #f472b6;">Next-Best Action:</strong> Follow up on Safari Logistics proposal (Open 12 days)</div>
        <div style="margin-bottom: 6px;"><strong style="color: #f472b6;">Churn Risk Signal:</strong> Customer #CUST-99 health score dropped to 35/100</div>
        <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 8px;">Evidence: 2 unresolved support cases + reduced order frequency.</div>
        <div style="display: flex; gap: 8px;">
          <button style="background: #059669; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">Execute Retention Action</button>
          <button style="background: #475569; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">View Customer 360</button>
        </div>
      </div>
      <div style="margin-top: 10px; background: #451a03; border: 1px solid #d97706; color: #fef3c7; padding: 8px; border-radius: 6px; font-size: 0.75rem;">
        ⚠️ Domain Authority Guardrail: CRM displays invoices and balances, but Finance owns financial truth.
      </div>
    </div>

  </div>

</div>
  `;
}
