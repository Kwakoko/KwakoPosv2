import {
  WorkerProfile,
  ShiftDefinition,
  RosterAssignment,
  ClockEvent,
  TimesheetRecord,
  ProjectLaborCosting,
  WorkforceCommandCenterSummary,
} from "@kwakopos2/contracts";
import { globalWorkforceTrackingEngine } from "@kwakopos2/domain";

export class WorkforceTrackingService {
  public createWorker(profileInput: {
    employeeNumber: string;
    name: string;
    email: string;
    department: string;
    team: string;
    role: string;
    workerType: "PERMANENT" | "TEMPORARY" | "CASUAL" | "CONTRACTOR" | "FIELD_TECHNICIAN" | "DRIVER";
    skills: string[];
    certifications: { name: string; issuedDate: string; expiryDate: string }[];
    costRateTzs: number;
    billingRateTzs: number;
  }): WorkerProfile {
    return globalWorkforceTrackingEngine.createWorker(profileInput);
  }

  public verifyTaskAssignment(workerId: string, requiredCertification: string): { allowed: boolean; reason?: string } {
    return globalWorkforceTrackingEngine.verifyTaskAssignment(workerId, requiredCertification);
  }

  public createShift(shiftInput: {
    name: string;
    startTime: string;
    endTime: string;
    breakDurationMinutes: number;
    requiredStaffing: number;
    location: string;
  }): ShiftDefinition {
    return globalWorkforceTrackingEngine.createShift(shiftInput);
  }

  public assignRoster(rosterInput: { workerId: string; shiftId: string; date: string }): RosterAssignment {
    return globalWorkforceTrackingEngine.assignRoster(rosterInput);
  }

  public recordClockEvent(eventInput: {
    workerId: string;
    shiftId: string;
    eventType: "CLOCK_IN" | "BREAK_IN" | "BREAK_OUT" | "CLOCK_OUT";
    deviceId: string;
    locationMetadata?: { latitude?: number; longitude?: number; siteId?: string };
  }): { event: ClockEvent; success: boolean; errorMessage?: string } {
    return globalWorkforceTrackingEngine.recordClockEvent(eventInput);
  }

  public generateTimesheet(workerId: string, regularHours: number, overtimeHours: number): TimesheetRecord {
    return globalWorkforceTrackingEngine.generateTimesheet(workerId, regularHours, overtimeHours);
  }

  public calculateProjectLaborCost(
    projectId: string,
    taskId: string,
    workerId: string,
    approvedHours: number
  ): ProjectLaborCosting {
    return globalWorkforceTrackingEngine.calculateProjectLaborCost(projectId, taskId, workerId, approvedHours);
  }

  public getDashboardMetrics(): WorkforceCommandCenterSummary {
    return globalWorkforceTrackingEngine.getCommandCenterSummary();
  }

  public getWorkers(): WorkerProfile[] {
    return globalWorkforceTrackingEngine.getWorkers();
  }
}

export const globalWorkforceTrackingService = new WorkforceTrackingService();
