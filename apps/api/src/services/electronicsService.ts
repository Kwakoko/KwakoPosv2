import { randomUUID } from "crypto";
import type {
  TenantContext,
  ElectronicsModuleManifest,
  ElectronicsSettings,
  SerializedDevice,
  ElectronicsRepairJob,
  ElectronicsAiRecommendation,
} from "@kwakopos2/contracts";
import {
  globalElectronicsOperatingEngine,
  ElectronicsOperatingEngine,
} from "@kwakopos2/domain";
import {
  globalInMemoryStore,
  InMemoryStore,
} from "@kwakopos2/database";

export class ElectronicsService {
  private engine: ElectronicsOperatingEngine;
  private store: InMemoryStore;

  private deviceMap: Map<string, SerializedDevice> = new Map();
  private repairMap: Map<string, ElectronicsRepairJob> = new Map();

  constructor(engine?: ElectronicsOperatingEngine, store?: InMemoryStore) {
    this.engine = engine || globalElectronicsOperatingEngine;
    this.store = store || globalInMemoryStore;
  }

  getManifest(): ElectronicsModuleManifest {
    return this.engine.getModuleManifest();
  }

  getSettings(ctx: TenantContext): ElectronicsSettings {
    return this.engine.getDefaultSettings(ctx.tenantId, ctx.branchId);
  }

  registerSerializedDevice(
    ctx: TenantContext,
    deviceData: Omit<SerializedDevice, "id" | "tenantId" | "branchId" | "state">
  ): SerializedDevice {
    const id = randomUUID();
    const device: SerializedDevice = {
      ...deviceData,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      state: "RECEIVED",
    };
    this.deviceMap.set(id, device);
    return device;
  }

  getSerializedDevices(ctx: TenantContext): SerializedDevice[] {
    return Array.from(this.deviceMap.values()).filter(
      (d) => d.tenantId === ctx.tenantId && d.branchId === ctx.branchId
    );
  }

  createRepairJob(
    ctx: TenantContext,
    jobData: Omit<SerializedDevice, "id" | "tenantId" | "branchId" | "state"> & {
      serializedDeviceId: string;
      customerId: string;
      reportedIssue: string;
      assignedTechnicianUserId: string;
    }
  ): ElectronicsRepairJob {
    const device = this.deviceMap.get(jobData.serializedDeviceId);
    if (!device) throw new Error(`Serialized Device with ID '${jobData.serializedDeviceId}' not found.`);

    // Transition device to REPAIR_INTAKE
    const updatedDevice = this.engine.transitionDeviceState(device, "REPAIR_INTAKE");
    this.deviceMap.set(device.id, updatedDevice);

    const id = randomUUID();
    const repairTicketNumber = `REP-${Math.floor(10000 + Math.random() * 90000)}`;
    const repairJob: ElectronicsRepairJob = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      repairTicketNumber,
      serializedDeviceId: device.id,
      customerId: jobData.customerId,
      reportedIssue: jobData.reportedIssue,
      assignedTechnicianUserId: jobData.assignedTechnicianUserId,
      partsUsedCostTzs: 0,
      laborChargeTzs: 0,
      totalRepairCostTzs: 0,
      status: "INTAKE",
      intakeDate: new Date().toISOString(),
    };

    this.repairMap.set(id, repairJob);
    return repairJob;
  }

  getRepairJobs(ctx: TenantContext): ElectronicsRepairJob[] {
    return Array.from(this.repairMap.values()).filter(
      (r) => r.tenantId === ctx.tenantId && r.branchId === ctx.branchId
    );
  }

  getAiRecommendations(ctx: TenantContext): ElectronicsAiRecommendation[] {
    const devices = this.getSerializedDevices(ctx);
    const repairs = this.getRepairJobs(ctx);
    return this.engine.generateExplainableAiRecommendations(ctx, devices, repairs);
  }
}

export const globalElectronicsService = new ElectronicsService();
