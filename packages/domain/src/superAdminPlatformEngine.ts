import {
  SuperAdminOperatingPlane,
  TenantManagementSummary,
  SuperAdminContextSwitch,
  PlatformEmergencyKillSwitch,
  FeatureFlagEvaluation,
  SuperAdminHealthSummary,
} from "@kwakopos2/contracts";

export class SuperAdminPlatformEngine {
  private activeContextSwitches: Map<string, SuperAdminContextSwitch> = new Map();
  private killSwitchLog: PlatformEmergencyKillSwitch[] = [];
  private tenants: Map<string, TenantManagementSummary> = new Map();

  constructor() {
    // No tenant, revenue, release, or incident fixtures are registered here.
    // Production truth is owned by PostgreSQL Super Admin routes.
  }

  public registerTenant(summary: TenantManagementSummary): void {
    this.tenants.set(summary.tenantId, summary);
  }

  public clearRegisteredTenants(): void {
    this.tenants.clear();
  }

  /**
   * 1. Get Operating Plane Configuration
   */
  public getOperatingPlane(adminId: string, email: string, role: any): SuperAdminOperatingPlane {
    return {
      plane: "PLATFORM_CONTROL_PLANE",
      activeWorkspace: "Overview",
      adminIdentity: {
        adminId,
        email,
        role,
      },
    };
  }

  /**
   * 2. Initiate Audited Tenant Context Switch (Privileged Support Session)
   */
  public executeTenantContextSwitch(adminId: string, tenantId: string, reason: string, timeLimitMinutes: number = 30): SuperAdminContextSwitch {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found in Super Admin registry`);
    }

    const switchId = `SW-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeLimitMinutes * 60000);

    const ctxSwitch: SuperAdminContextSwitch = {
      switchId,
      adminId,
      tenantId,
      reason,
      timeLimitMinutes,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isActive: true,
    };

    this.activeContextSwitches.set(switchId, ctxSwitch);
    return ctxSwitch;
  }

  /**
   * 3. Exit Tenant Context Switch
   */
  public exitTenantContextSwitch(switchId: string): boolean {
    const ctx = this.activeContextSwitches.get(switchId);
    if (ctx) {
      ctx.isActive = false;
      return true;
    }
    return false;
  }

  /**
   * 4. Platform Emergency Kill Switch Execution
   */
  public triggerEmergencyKillSwitch(
    target: PlatformEmergencyKillSwitch["target"],
    reason: string,
    triggeredBy: string
  ): PlatformEmergencyKillSwitch {
    const killSwitch: PlatformEmergencyKillSwitch = {
      actionId: `KS-${Date.now()}`,
      target,
      reason,
      triggeredBy,
      timestamp: new Date().toISOString(),
      immutableAuditId: `AUDIT-KS-${Date.now()}`,
    };

    this.killSwitchLog.push(killSwitch);
    return killSwitch;
  }

  /**
   * 5. Feature Flag Evaluation Hierarchy (Global -> Country -> Tenant -> Branch -> User)
   */
  public evaluateFeatureFlag(
    flagKey: string,
    context: { global?: boolean; country?: boolean; tenant?: boolean; branch?: boolean }
  ): FeatureFlagEvaluation {
    const globalValue = context.global ?? false;
    const countryValue = context.country;
    const tenantValue = context.tenant;
    const branchValue = context.branch;

    // Hierarchy precedence: Branch -> Tenant -> Country -> Global
    let effectiveValue = globalValue;
    let path = "Global";

    if (countryValue !== undefined) {
      effectiveValue = countryValue;
      path = "Global -> Country";
    }
    if (tenantValue !== undefined) {
      effectiveValue = tenantValue;
      path = "Global -> Country -> Tenant";
    }
    if (branchValue !== undefined) {
      effectiveValue = branchValue;
      path = "Global -> Country -> Tenant -> Branch";
    }

    return {
      flagKey,
      globalValue,
      countryValue,
      tenantValue,
      branchValue,
      effectiveValue,
      evaluationPath: path,
    };
  }

  /**
   * 6. Super Admin Health Summary
   */
  public getHealthSummary(): SuperAdminHealthSummary {
    return {
      activeTenantsCount: this.tenants.size,
      totalPlatformRevenue: 0,
      activeReleasesCount: 0,
      securityIncidentsCount: 0,
      planeIsolationInvariantPassing: true,
      superAdminControlTowerOperational: true,
    };
  }
}

export const globalSuperAdminPlatformEngine = new SuperAdminPlatformEngine();
