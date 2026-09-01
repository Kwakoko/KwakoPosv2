import {
  NavigationItem,
  GlobalSearchResult,
  SystemUiCommandCenterSummary,
} from "@kwakopos2/contracts";
import { globalSystemUiEngine } from "@kwakopos2/domain";

export class SystemUiService {
  public generateNavigation(userPermissions: string[]): NavigationItem[] {
    return globalSystemUiEngine.generateNavigation(userPermissions);
  }

  public executeGlobalSearch(query: string, tenantId: string, branchId: string): GlobalSearchResult {
    return globalSystemUiEngine.executeGlobalSearch(query, tenantId, branchId);
  }

  public executeCommand(actionId: string, userPermissions: string[]): { success: boolean; targetPath?: string; error?: string } {
    return globalSystemUiEngine.executeCommand(actionId, userPermissions);
  }

  public getAppShellState(tenantId: string, branchId: string, isOnline: boolean) {
    return globalSystemUiEngine.renderAppShellState(tenantId, branchId, isOnline);
  }

  public getDashboardMetrics(): SystemUiCommandCenterSummary {
    return globalSystemUiEngine.getCommandCenterSummary();
  }
}

export const globalSystemUiService = new SystemUiService();
