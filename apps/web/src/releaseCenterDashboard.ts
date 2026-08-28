export function renderReleaseCenterDashboard(): string {
  return `
  <div class="release-center-container" style="font-family: Inter, system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; border-radius: 12px; max-width: 1400px; margin: 0 auto;">
    
    <!-- Top Header Banner -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 1.5rem; margin-bottom: 2rem;">
      <div>
        <h1 style="margin: 0; font-size: 1.8rem; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 0.5rem;">
          ⚡ KwakoPos Enterprise Release Engineering & Delivery Platform
        </h1>
        <p style="margin: 0.5rem 0 0 0; color: #94a3b8; font-size: 0.95rem;">
          SLSA Level 3 Attestations • SPDX/CycloneDX SBOM • Policy-as-Code • Tenant-Aware Progressive Delivery
        </p>
      </div>
      <div style="text-align: right;">
        <span style="background: #0284c7; color: white; padding: 0.35rem 0.85rem; border-radius: 20px; font-weight: 600; font-size: 0.9rem;">
          ACTIVE VERSION: v2.2.0
        </span>
        <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #64748b;">SHA: 88c0662e2a8...</div>
      </div>
    </div>

    <!-- Release State Machine Stepper -->
    <div style="background: #1e293b; padding: 1.25rem; border-radius: 10px; margin-bottom: 2rem; border: 1px solid #334155;">
      <h3 style="margin-top: 0; font-size: 1rem; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.05em;">
        🔄 RELEASE STATE MACHINE STAGE (RELEASED)
      </h3>
      <div style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem;">
        <span class="step-badge" style="background: #059669; color: white; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem;">1. DRAFT ✓</span>
        <span class="step-badge" style="background: #059669; color: white; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem;">2. VALIDATING ✓</span>
        <span class="step-badge" style="background: #059669; color: white; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem;">3. QUALITY_PASSED ✓</span>
        <span class="step-badge" style="background: #059669; color: white; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem;">4. SECURITY_PASSED ✓</span>
        <span class="step-badge" style="background: #059669; color: white; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem;">5. BUILT ✓</span>
        <span class="step-badge" style="background: #059669; color: white; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem;">6. ATTESTED ✓</span>
        <span class="step-badge" style="background: #059669; color: white; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem;">7. STAGING ✓</span>
        <span class="step-badge" style="background: #059669; color: white; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem;">8. PRODUCTION_READY ✓</span>
        <span class="step-badge" style="background: #059669; color: white; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem;">9. CANARY ✓</span>
        <span class="step-badge" style="background: #2563eb; color: white; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">10. RELEASED ★</span>
      </div>
    </div>

    <!-- DORA Metrics Scorecard Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 2rem;">
      <div style="background: #1e293b; padding: 1.25rem; border-radius: 10px; border-left: 4px solid #38bdf8;">
        <div style="font-size: 0.85rem; color: #94a3b8;">DEPLOYMENT FREQUENCY</div>
        <div style="font-size: 1.8rem; font-weight: 700; color: #f8fafc; margin: 0.25rem 0;">4.2 / week</div>
        <div style="font-size: 0.75rem; color: #34d399;">High DORA Performance Tier</div>
      </div>
      <div style="background: #1e293b; padding: 1.25rem; border-radius: 10px; border-left: 4px solid #818cf8;">
        <div style="font-size: 0.85rem; color: #94a3b8;">CHANGE LEAD TIME</div>
        <div style="font-size: 1.8rem; font-weight: 700; color: #f8fafc; margin: 0.25rem 0;">1.5 hours</div>
        <div style="font-size: 0.75rem; color: #94a3b8;">PR Commit → Production</div>
      </div>
      <div style="background: #1e293b; padding: 1.25rem; border-radius: 10px; border-left: 4px solid #34d399;">
        <div style="font-size: 0.85rem; color: #94a3b8;">MEAN TIME TO RECOVERY (MTTR)</div>
        <div style="font-size: 1.8rem; font-weight: 700; color: #34d399; margin: 0.25rem 0;">4.0 minutes</div>
        <div style="font-size: 0.75rem; color: #34d399;">Automated Rollback & Recovery</div>
      </div>
      <div style="background: #1e293b; padding: 1.25rem; border-radius: 10px; border-left: 4px solid #f43f5e;">
        <div style="font-size: 0.85rem; color: #94a3b8;">CHANGE FAIL RATE</div>
        <div style="font-size: 1.8rem; font-weight: 700; color: #f8fafc; margin: 0.25rem 0;">0.00 %</div>
        <div style="font-size: 0.75rem; color: #34d399;">Zero Production Outages</div>
      </div>
    </div>

    <!-- Middle Section: Supply Chain & Progressive Delivery -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
      
      <!-- Software Supply Chain & Attestation Panel -->
      <div style="background: #1e293b; padding: 1.5rem; border-radius: 10px; border: 1px solid #334155;">
        <h3 style="margin-top: 0; color: #38bdf8; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
          🛡️ Software Supply Chain & SLSA Attestations
        </h3>
        <div style="font-size: 0.85rem; space-y: 0.75rem;">
          <p><strong>SLSA Level:</strong> <span style="color: #34d399;">Build Level 3 Aligned</span></p>
          <p><strong>Artifact SHA-256 Digest:</strong> <code style="background: #0f172a; padding: 0.2rem 0.4rem; border-radius: 4px; color: #fb7185;">sha256:e3b0c44298fc1c14...</code></p>
          <p><strong>SBOM Standard:</strong> SPDX 2.3 & CycloneDX 1.4 JSON (Generated & Signed)</p>
          <p><strong>Provenance Verification:</strong> <span style="background: #065f46; color: #a7f3d0; padding: 0.2rem 0.5rem; border-radius: 4px;">VERIFIED BY GITHUB OIDC</span></p>
        </div>
      </div>

      <!-- Progressive Delivery & Tenant Rollout Controls -->
      <div style="background: #1e293b; padding: 1.5rem; border-radius: 10px; border: 1px solid #334155;">
        <h3 style="margin-top: 0; color: #a78bfa; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
          🎛️ Tenant-Aware Progressive Delivery
        </h3>
        <div style="margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.5rem;">
            <span>Canary Traffic Allocation:</span>
            <strong style="color: #a78bfa;">100% (Full Production)</strong>
          </div>
          <div style="background: #0f172a; height: 10px; border-radius: 5px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #818cf8, #c084fc); width: 100%; height: 100%;"></div>
          </div>
        </div>
        <div style="display: flex; gap: 0.75rem; margin-top: 1.25rem;">
          <button onclick="fetch('/api/admin/releases/progressive/promote', {method: 'POST'}).then(r => r.json()).then(d => alert('Promoted: ' + JSON.stringify(d)))" style="background: #6d28d9; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;">
            Promote Next Stage
          </button>
          <button onclick="fetch('/api/admin/releases/progressive/halt', {method: 'POST'}).then(r => r.json()).then(d => alert('Rollout Halted: ' + JSON.stringify(d)))" style="background: #be123c; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;">
            Emergency Halt Rollout
          </button>
        </div>
      </div>

    </div>

    <!-- Bottom Actions Panel -->
    <div style="background: #1e293b; padding: 1.5rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #334155;">
      <div>
        <h4 style="margin: 0; color: #f8fafc;">Automated Release Operations</h4>
        <p style="margin: 0.25rem 0 0 0; color: #94a3b8; font-size: 0.85rem;">Trigger 15-Point Quality Gates or Execute One-Click Emergency Rollback</p>
      </div>
      <div style="display: flex; gap: 1rem;">
        <button onclick="fetch('/api/admin/releases/trigger', {method: 'POST'}).then(r => r.json()).then(d => alert('Release Triggered: ' + JSON.stringify(d)))" style="background: #0284c7; color: white; border: none; padding: 0.65rem 1.25rem; border-radius: 6px; cursor: pointer; font-weight: 600;">
          ▶ Trigger Release Pipeline
        </button>
        <button onclick="fetch('/api/admin/releases/rollback', {method: 'POST'}).then(r => r.json()).then(d => alert('Rollback Initiated: ' + JSON.stringify(d)))" style="background: #e11d48; color: white; border: none; padding: 0.65rem 1.25rem; border-radius: 6px; cursor: pointer; font-weight: 600;">
          ↺ Execute Emergency Rollback
        </button>
      </div>
    </div>

  </div>
  `;
}
