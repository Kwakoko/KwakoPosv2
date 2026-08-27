import type {
  PluginDashboardDefinition,
  TenantContext,
} from "@kwakopos2/contracts";

export interface DashboardMetricResult {
  widgetId: string;
  title: string;
  type: string;
  value: number | string | Record<string, unknown>;
  changePct?: number;
  status?: "GOOD" | "WARNING" | "CRITICAL";
}

export class PluginDashboardEngine {
  aggregateDashboardMetrics(
    definition: PluginDashboardDefinition,
    dataSources: Record<string, unknown>
  ): DashboardMetricResult[] {
    return definition.widgets.map((widget) => {
      const rawValue = dataSources[widget.queryKey] ?? 0;
      return {
        widgetId: widget.widgetId,
        title: widget.title,
        type: widget.type,
        value: typeof rawValue === "number" ? rawValue : String(rawValue),
        status: "GOOD",
      };
    });
  }
}
