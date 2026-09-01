import {
  KdsThemeConfig,
  KdsAiInteractionPattern,
  KdsHealthMetricsSummary,
} from "@kwakopos2/contracts";
import { globalKwakoPosDesignSystemEngine } from "@kwakopos2/domain";

export class KwakoPosDesignSystemService {
  public getTheme(mode: "LIGHT" | "DARK" | "HIGH_CONTRAST" | "SYSTEM"): KdsThemeConfig {
    return globalKwakoPosDesignSystemEngine.resolveTheme(mode);
  }

  public validateAiPattern(pattern: KdsAiInteractionPattern) {
    return globalKwakoPosDesignSystemEngine.evaluateAiInteractionPattern(pattern);
  }

  public getDashboardMetrics(): KdsHealthMetricsSummary {
    return globalKwakoPosDesignSystemEngine.getHealthSummary();
  }
}

export const globalKwakoPosDesignSystemService = new KwakoPosDesignSystemService();
