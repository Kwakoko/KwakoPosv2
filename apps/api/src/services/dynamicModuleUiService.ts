import {
  DynamicModuleUiManifest,
  DynamicModuleLifecycleState,
  DynamicModuleUiHealthSummary,
} from "@kwakopos2/contracts";
import { globalDynamicModuleUiEngine } from "@kwakopos2/domain";

export class DynamicModuleUiService {
  public registerModule(manifest: DynamicModuleUiManifest) {
    return globalDynamicModuleUiEngine.registerDynamicModule(manifest);
  }

  public composeNavigation(userPermissions: string[], activeModuleIds?: string[]) {
    return globalDynamicModuleUiEngine.composeNavigation(userPermissions, activeModuleIds);
  }

  public setStatus(moduleId: string, status: DynamicModuleLifecycleState["status"], message?: string) {
    return globalDynamicModuleUiEngine.setModuleStatus(moduleId, status, message);
  }

  public isolateFailure(moduleId: string, reason: string) {
    return globalDynamicModuleUiEngine.isolateModuleFailure(moduleId, reason);
  }

  public getDashboardMetrics(): DynamicModuleUiHealthSummary {
    return globalDynamicModuleUiEngine.getHealthSummary();
  }
}

export const globalDynamicModuleUiService = new DynamicModuleUiService();
