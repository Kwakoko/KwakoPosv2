import { PlatformEmergencyKillSwitch } from "@kwakopos2/contracts";
import { globalSuperAdminPlatformEngine } from "@kwakopos2/domain";

export class SuperAdminPlatformService {
  public getOperatingPlane(adminId: string, email: string, role: any) {
    return globalSuperAdminPlatformEngine.getOperatingPlane(adminId, email, role);
  }

  public initiateContextSwitch(adminId: string, tenantId: string, reason: string, timeLimitMinutes?: number) {
    return globalSuperAdminPlatformEngine.executeTenantContextSwitch(adminId, tenantId, reason, timeLimitMinutes);
  }

  public exitContextSwitch(switchId: string) {
    return globalSuperAdminPlatformEngine.exitTenantContextSwitch(switchId);
  }

  public triggerEmergencyKillSwitch(target: PlatformEmergencyKillSwitch["target"], reason: string, adminId: string) {
    return globalSuperAdminPlatformEngine.triggerEmergencyKillSwitch(target, reason, adminId);
  }

  public evaluateFeatureFlag(flagKey: string, context: { global?: boolean; country?: boolean; tenant?: boolean; branch?: boolean }) {
    return globalSuperAdminPlatformEngine.evaluateFeatureFlag(flagKey, context);
  }

  public getDashboardMetrics() {
    return globalSuperAdminPlatformEngine.getHealthSummary();
  }
}

export const globalSuperAdminPlatformService = new SuperAdminPlatformService();
