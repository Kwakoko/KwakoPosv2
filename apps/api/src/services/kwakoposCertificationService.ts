import {
  CertificationCategory,
  CertificationLevel,
  CertificationRecord,
  CertificationEvidenceItem,
  CertificationImpactAnalysis,
  CertificationBadge,
  CertificationCommandCenterSummary,
} from "@kwakopos2/contracts";
import { globalKwakoPosCertificationEngine } from "@kwakopos2/domain";

export class KwakoPosCertificationService {
  public issueCertification(input: {
    category: CertificationCategory;
    level: CertificationLevel;
    subjectName: string;
    subjectVersion: string;
    scopeDescription: string;
    gitSha?: string;
    artifactDigest?: string;
    evidenceSet: CertificationEvidenceItem[];
    approvedBy: string;
  }): CertificationRecord {
    return globalKwakoPosCertificationEngine.issueCertification(input);
  }

  public analyzeImpact(input: {
    changedComponent: string;
    changeRiskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  }): CertificationImpactAnalysis {
    return globalKwakoPosCertificationEngine.analyzeImpact(input);
  }

  public revokeOrSuspend(certId: string, reason: string, action: "SUSPEND" | "REVOKE" | "REINSTATE"): CertificationRecord {
    return globalKwakoPosCertificationEngine.revokeOrSuspend(certId, reason, action);
  }

  public getBadge(certId: string): CertificationBadge {
    return globalKwakoPosCertificationEngine.generateBadge(certId);
  }

  public getDashboardMetrics(): CertificationCommandCenterSummary {
    return globalKwakoPosCertificationEngine.getCommandCenterSummary();
  }

  public getRegistry(): CertificationRecord[] {
    return globalKwakoPosCertificationEngine.getRegistry();
  }
}

export const globalKwakoPosCertificationService = new KwakoPosCertificationService();
