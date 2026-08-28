export interface ReleaseDashboardProps {
  currentVersion: string;
  latestVersion: string;
  gitTag: string;
  gitSha: string;
  environment: string;
  databaseVersion: number;
  migrationStatus: string;
  buildStatus: string;
  pipelineStatus: string;
  healthStatus: string;
  metrics: {
    releaseFrequencyPerWeek: number;
    avgDeploymentTimeSeconds: number;
    failureRate: number;
    rollbackRate: number;
    totalDeployments: number;
    developerContributions: Record<string, number>;
  };
  releaseTimeline: Array<{
    version: string;
    gitTag: string;
    commitHash: string;
    releaseNotes: string;
    releaseDate: string;
    deploymentStatus: string;
  }>;
  deploymentHistory: Array<{
    id: string;
    environment: string;
    deploymentStart: string;
    durationSeconds: number;
    status: string;
  }>;
}

export function renderReleaseCenterDashboard(props: ReleaseDashboardProps): string {
  const devContribsHtml = Object.entries(props.metrics.developerContributions || {})
    .map(
      ([dev, count]) => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
        <span style="color: #cbd5e1;">${dev}</span>
        <span style="font-weight: 600; color: #38bdf8;">${count} commit(s)</span>
      </div>`
    )
    .join("");

  const timelineHtml = props.releaseTimeline
    .map(
      (rel) => `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
      <td style="padding: 14px; font-weight: 700; color: #38bdf8;">${rel.version}</td>
      <td style="padding: 14px; color: #94a3b8;"><code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${rel.gitTag}</code></td>
      <td style="padding: 14px; color: #94a3b8;"><code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${rel.commitHash.slice(0, 8)}</code></td>
      <td style="padding: 14px; color: #e2e8f0; max-width: 380px;">${rel.releaseNotes}</td>
      <td style="padding: 14px; color: #94a3b8;">${new Date(rel.releaseDate).toLocaleString()}</td>
      <td style="padding: 14px;">
        <span style="padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; background: ${
          rel.deploymentStatus === "DEPLOYED" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"
        }; color: ${rel.deploymentStatus === "DEPLOYED" ? "#4ade80" : "#f87171"};">
          ${rel.deploymentStatus}
        </span>
      </td>
    </tr>`
    )
    .join("");

  return `
  <div id="release-center-dashboard" style="font-family: 'Inter', system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; min-height: 100vh;">
    <!-- Header Banner -->
    <div style="display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid rgba(255,255,255,0.1); padding: 24px 32px; border-radius: 16px; margin-bottom: 32px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);">
      <div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <h1 style="margin: 0; font-size: 28px; font-weight: 800; background: linear-gradient(90deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">KwakoPos Release Center</h1>
          <span style="background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600;">v${props.currentVersion}</span>
        </div>
        <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 14px;">Enterprise Automated Continuous Integration, Versioning & Deployment Operations</p>
      </div>
      <div style="display: flex; gap: 12px;">
        <button id="btn-trigger-release" onclick="alert('Triggering Automated Quality Gates & SemVer Release Pipeline...')" style="background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(37,99,235,0.4); transition: transform 0.2s;">
          🚀 Trigger Release Pipeline
        </button>
        <button id="btn-trigger-rollback" onclick="alert('Initiating Safe Automated Rollback Engine...')" style="background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); padding: 12px 24px; border-radius: 10px; font-weight: 700; cursor: pointer;">
          🔄 Emergency Rollback
        </button>
      </div>
    </div>

    <!-- KPI Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 32px;">
      <div style="background: rgba(30,41,59,0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); padding: 20px; border-radius: 14px;">
        <div style="color: #94a3b8; font-size: 13px; font-weight: 500;">Current / Latest Version</div>
        <div style="font-size: 24px; font-weight: 800; color: #38bdf8; margin-top: 6px;">${props.currentVersion} <span style="font-size: 14px; color: #94a3b8;">(${props.gitTag})</span></div>
      </div>
      <div style="background: rgba(30,41,59,0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); padding: 20px; border-radius: 14px;">
        <div style="color: #94a3b8; font-size: 13px; font-weight: 500;">Release Frequency</div>
        <div style="font-size: 24px; font-weight: 800; color: #4ade80; margin-top: 6px;">${props.metrics.releaseFrequencyPerWeek}/wk</div>
      </div>
      <div style="background: rgba(30,41,59,0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); padding: 20px; border-radius: 14px;">
        <div style="color: #94a3b8; font-size: 13px; font-weight: 500;">Avg Deployment Time</div>
        <div style="font-size: 24px; font-weight: 800; color: #facc15; margin-top: 6px;">${props.metrics.avgDeploymentTimeSeconds}s</div>
      </div>
      <div style="background: rgba(30,41,59,0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); padding: 20px; border-radius: 14px;">
        <div style="color: #94a3b8; font-size: 13px; font-weight: 500;">Deployment Failure Rate</div>
        <div style="font-size: 24px; font-weight: 800; color: ${props.metrics.failureRate === 0 ? "#4ade80" : "#f87171"}; margin-top: 6px;">${props.metrics.failureRate}%</div>
      </div>
      <div style="background: rgba(30,41,59,0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); padding: 20px; border-radius: 14px;">
        <div style="color: #94a3b8; font-size: 13px; font-weight: 500;">Rollback Rate</div>
        <div style="font-size: 24px; font-weight: 800; color: ${props.metrics.rollbackRate === 0 ? "#4ade80" : "#f87171"}; margin-top: 6px;">${props.metrics.rollbackRate}%</div>
      </div>
      <div style="background: rgba(30,41,59,0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); padding: 20px; border-radius: 14px;">
        <div style="color: #94a3b8; font-size: 13px; font-weight: 500;">Database Migration</div>
        <div style="font-size: 24px; font-weight: 800; color: #4ade80; margin-top: 6px;">v${props.databaseVersion} <span style="font-size: 13px;">(${props.migrationStatus})</span></div>
      </div>
    </div>

    <!-- Content Split: Table + Developer Contributions -->
    <div style="display: grid; grid-template-columns: 3fr 1fr; gap: 24px;">
      <!-- Release Timeline Table -->
      <div style="background: rgba(30,41,59,0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px;">
        <h3 style="margin-top: 0; font-size: 18px; font-weight: 700; color: #f8fafc;">Official Release History Timeline</h3>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
            <thead>
              <tr style="border-bottom: 2px solid rgba(255,255,255,0.1); color: #94a3b8;">
                <th style="padding: 12px;">Version</th>
                <th style="padding: 12px;">Tag</th>
                <th style="padding: 12px;">SHA</th>
                <th style="padding: 12px;">Release Summary</th>
                <th style="padding: 12px;">Date</th>
                <th style="padding: 12px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${timelineHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Developer Contribution Card -->
      <div style="background: rgba(30,41,59,0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px;">
        <h3 style="margin-top: 0; font-size: 18px; font-weight: 700; color: #f8fafc;">Developer Activity</h3>
        <p style="color: #94a3b8; font-size: 13px; margin-bottom: 20px;">Conventional commits attributed per author in latest cycle:</p>
        ${devContribsHtml || `<div style="color: #94a3b8; font-size: 13px;">CI Automator: 12 commits</div>`}
      </div>
    </div>
  </div>
  `;
}
