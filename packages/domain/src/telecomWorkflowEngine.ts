import { randomUUID } from "crypto";
import type {
  TenantContext,
  TelecomSite,
  TelecomSurvey,
  TelecomRanSector,
  TelecomWorkOrder,
  TelecomChecklistItem,
  TelecomTestRecord,
  TelecomAcceptanceRecord,
  TelecomMaintenanceTicket,
} from "@kwakopos2/contracts";

export class TelecomWorkflowEngine {
  /**
   * Generates default installation checklist items for a technical work order.
   */
  static generateDefaultChecklist(workType: TelecomWorkOrder["workType"]): TelecomChecklistItem[] {
    if (workType === "MICROWAVE_INSTALLATION") {
      return [
        { id: randomUUID(), title: "Tower safety harness & PPE inspected", category: "TOWER_SAFETY", isRequired: true, passed: false },
        { id: randomUUID(), title: "Dish antenna mounting & bracket torqued", category: "ANTENNA_MOUNTING", isRequired: true, passed: false },
        { id: randomUUID(), title: "Azimuth and elevation mechanical alignment", category: "ALIGNMENT", isRequired: true, passed: false },
        { id: randomUUID(), title: "ODU / Radio unit installation & grounding", category: "GROUNDING_POWER", isRequired: true, passed: false },
        { id: randomUUID(), title: "IF / Ethernet cable routing & weatherproof boot", category: "CABLE_ROUTING", isRequired: true, passed: false },
        { id: randomUUID(), title: "RSL measurement within design tolerance (+/- 3 dBm)", category: "TESTING", isRequired: true, passed: false },
      ];
    }

    if (workType === "RAN_INSTALLATION") {
      return [
        { id: randomUUID(), title: "Tower climbing safety briefing completed", category: "TOWER_SAFETY", isRequired: true, passed: false },
        { id: randomUUID(), title: "Sector antenna azimuth & mechanical tilt verified", category: "ANTENNA_MOUNTING", isRequired: true, passed: false },
        { id: randomUUID(), title: "RRU / AAU mounted and grounded", category: "RADIO_INSTALLATION", isRequired: true, passed: false },
        { id: randomUUID(), title: "CPRI optical fiber & DC power connected", category: "CABLE_ROUTING", isRequired: true, passed: false },
        { id: randomUUID(), title: "VSWR sweep test < 1.30 across all ports", category: "TESTING", isRequired: true, passed: false },
      ];
    }

    // Generic maintenance or survey
    return [
      { id: randomUUID(), title: "Site safety assessment", category: "TOWER_SAFETY", isRequired: true, passed: false },
      { id: randomUUID(), title: "Visual inspection of equipment & cabling", category: "HOUSEKEEPING", isRequired: true, passed: false },
      { id: randomUUID(), title: "Grounding resistance check (< 5 Ohms)", category: "GROUNDING_POWER", isRequired: true, passed: false },
      { id: randomUUID(), title: "Operational test verified", category: "TESTING", isRequired: true, passed: false },
    ];
  }

  /**
   * Validates whether all mandatory tests for site commissioning have passed.
   */
  static validateCommissioningTests(testRecords: TelecomTestRecord[]): {
    allPassed: boolean;
    passedTests: number;
    failedTests: number;
    failedItems: string[];
  } {
    let passedTests = 0;
    let failedTests = 0;
    const failedItems: string[] = [];

    for (const test of testRecords) {
      if (test.passed) {
        passedTests++;
      } else {
        failedTests++;
        failedItems.push(`${test.testType} (${test.parameterName}): Expected ${test.expectedValue}, Measured ${test.measuredValue} ${test.unit}`);
      }
    }

    return {
      allPassed: failedTests === 0 && passedTests > 0,
      passedTests,
      failedTests,
      failedItems,
    };
  }

  /**
   * Compiles an authoritative Handover Documentation Package for a site upon acceptance.
   */
  static compileHandoverPackage(
    site: TelecomSite,
    sectors: TelecomRanSector[],
    tests: TelecomTestRecord[],
    acceptance: TelecomAcceptanceRecord
  ): Record<string, any> {
    return {
      packageId: randomUUID(),
      generatedAt: new Date().toISOString(),
      siteCode: site.siteCode,
      siteName: site.name,
      siteType: site.siteType,
      coordinates: { latitude: site.latitude, longitude: site.longitude, elevationMeters: site.elevationMeters },
      towerHeightMeters: site.towerHeightMeters,
      ranSectorsCount: sectors.length,
      ranSectors: sectors.map((s) => ({
        sectorName: s.sectorName,
        technology: s.technology,
        azimuthDegrees: s.azimuthDegrees,
        mechanicalTilt: s.mechanicalTiltDegrees,
        electricalTilt: s.electricalTiltDegrees,
      })),
      testSummary: {
        totalTests: tests.length,
        passedCount: tests.filter((t) => t.passed).length,
        failedCount: tests.filter((t) => !t.passed).length,
      },
      acceptanceRecord: {
        satNumber: acceptance.satNumber,
        status: acceptance.status,
        customerRepresentative: acceptance.customerRepresentativeName,
        leadEngineerId: acceptance.leadEngineerId,
        acceptedAt: acceptance.acceptedAt,
      },
    };
  }

  /**
   * Checks SLA response and resolution breach status for maintenance tickets.
   */
  static evaluateTicketSla(ticket: TelecomMaintenanceTicket, asOfDate = new Date()): {
    isResponseBreached: boolean;
    isResolutionBreached: boolean;
  } {
    const asOfMs = asOfDate.getTime();
    const respDeadlineMs = ticket.slaResponseDeadline ? new Date(ticket.slaResponseDeadline).getTime() : Date.now();
    const resDeadlineMs = ticket.slaResolutionDeadline ? new Date(ticket.slaResolutionDeadline).getTime() : Date.now();


    const isResponseBreached = !ticket.respondedAt && asOfMs > respDeadlineMs;
    const isResolutionBreached = ticket.status !== "CLOSED" && ticket.status !== "RESOLVED" && asOfMs > resDeadlineMs;

    return {
      isResponseBreached,
      isResolutionBreached,
    };
  }
}
