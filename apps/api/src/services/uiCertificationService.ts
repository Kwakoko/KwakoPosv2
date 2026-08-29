import { globalUiCertificationEngine } from "@kwakopos2/domain";

export class UiCertificationService {
  public generateEvidence(releaseVersion: string, gitSha: string) {
    return globalUiCertificationEngine.generateMachineReadableEvidence(releaseVersion, gitSha);
  }

  public triggerRevalidation(certId: string, reason: string) {
    return globalUiCertificationEngine.triggerRevalidation(certId, reason);
  }

  public getDashboardMetrics() {
    return globalUiCertificationEngine.getHealthSummary();
  }
}

export const globalUiCertificationService = new UiCertificationService();
