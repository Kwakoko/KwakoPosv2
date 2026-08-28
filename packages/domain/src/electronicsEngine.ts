import { randomUUID } from "crypto";
import type {
  TenantContext,
  ElectronicsModuleManifest,
  ElectronicsSettings,
  SerializedDevice,
  SerializedDeviceState,
  ElectronicsRepairJob,
  ElectronicsAiRecommendation,
} from "@kwakopos2/contracts";

export class ElectronicsOperatingEngine {
  getModuleManifest(): ElectronicsModuleManifest {
    return {
      moduleId: "electronics_operating_system",
      name: "KwakoPos Enterprise Advanced Electronics & Device Lifecycle Operating System",
      version: "2.2.0",
      status: "ACTIVE",
      supportedCategories: ["SMARTPHONES", "LAPTOPS", "TVS_AUDIO", "ROUTERS_NETWORKING", "ACCESSORIES", "SPARE_PARTS"],
      permissions: [
        "ELECTRONICS_PRODUCT_VIEW",
        "ELECTRONICS_PRODUCT_MANAGE",
        "ELECTRONICS_SERIAL_MANAGE",
        "ELECTRONICS_IMEI_MANAGE",
        "ELECTRONICS_POS_SELL",
        "ELECTRONICS_WARRANTY_MANAGE",
        "ELECTRONICS_REPAIR_INTAKE",
        "ELECTRONICS_REPAIR_DIAGNOSE",
        "ELECTRONICS_TRADE_IN_MANAGE",
        "ELECTRONICS_AI_ANALYTICS_VIEW",
      ],
      navigationRoutes: [
        "/electronics/products",
        "/electronics/serialized-devices",
        "/electronics/pos",
        "/electronics/warranties",
        "/electronics/repairs",
        "/electronics/trade-ins",
        "/electronics/refurbished",
        "/electronics/ai-insights",
      ],
      dashboardWidgetIds: [
        "widget_total_serialized_devices",
        "widget_available_devices_value",
        "widget_open_repair_tickets",
        "widget_warranty_claims_month",
        "widget_repair_revenue_month",
      ],
    };
  }

  getDefaultSettings(tenantId: string, branchId: string): ElectronicsSettings {
    return {
      tenantId,
      branchId,
      currency: "TZS",
      enforceUniqueImeiRegistration: true,
      defaultWarrantyMonths: 12,
      autoAlertOnAgingDeviceDays: 90,
    };
  }

  transitionDeviceState(
    device: SerializedDevice,
    targetState: SerializedDeviceState
  ): SerializedDevice {
    const currentState = device.state;

    // Allowed transition map
    const allowedTransitions: Record<SerializedDeviceState, SerializedDeviceState[]> = {
      ORDERED: ["RECEIVED", "RETIRED"],
      RECEIVED: ["INSPECTION", "QUARANTINE"],
      INSPECTION: ["AVAILABLE", "QUARANTINE"],
      AVAILABLE: ["RESERVED", "SOLD", "QUARANTINE", "RETIRED"],
      RESERVED: ["AVAILABLE", "SOLD"],
      SOLD: ["CUSTOMER_OWNED"],
      CUSTOMER_OWNED: ["WARRANTY_CLAIM", "REPAIR_INTAKE", "RETURNED"],
      WARRANTY_CLAIM: ["REPAIR_INTAKE", "REFURBISHMENT", "RETIRED"],
      REPAIR_INTAKE: ["RESERVED_PARTS", "CUSTOMER_OWNED", "REFURBISHMENT"],
      RETURNED: ["QUARANTINE", "REFURBISHMENT", "AVAILABLE"],
      QUARANTINE: ["AVAILABLE", "REFURBISHMENT", "RETIRED"],
      REFURBISHMENT: ["AVAILABLE", "RETIRED"],
      RESERVED_PARTS: ["CUSTOMER_OWNED", "REFURBISHMENT"],
      RETIRED: [],
    };

    const validTargets = allowedTransitions[currentState] || [];
    if (!validTargets.includes(targetState) && currentState !== targetState) {
      throw new Error(
        `Invalid Serialized Device State Transition! Cannot transition device '${device.serialNumber}' from '${currentState}' to '${targetState}'.`
      );
    }

    return {
      ...device,
      state: targetState,
    };
  }

  verifyWarrantyValidity(
    saleDateStr: string,
    warrantyMonths: number,
    claimDate: Date = new Date()
  ): {
    isValid: boolean;
    expiryDate: Date;
    daysRemaining: number;
  } {
    const saleDate = new Date(saleDateStr);
    const expiryDate = new Date(saleDate);
    expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);

    const diffMs = expiryDate.getTime() - claimDate.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return {
      isValid: daysRemaining >= 0,
      expiryDate,
      daysRemaining,
    };
  }

  calculateRepairBill(
    partsCostTzs: number,
    laborChargeTzs: number
  ): {
    totalRepairCostTzs: number;
    laborRatioPct: number;
  } {
    const totalRepairCostTzs = partsCostTzs + laborChargeTzs;
    const laborRatioPct = totalRepairCostTzs > 0 ? (laborChargeTzs / totalRepairCostTzs) * 100 : 0;

    return {
      totalRepairCostTzs: Math.round(totalRepairCostTzs),
      laborRatioPct: parseFloat(laborRatioPct.toFixed(2)),
    };
  }

  generateExplainableAiRecommendations(
    ctx: TenantContext,
    devices: SerializedDevice[],
    repairs: ElectronicsRepairJob[]
  ): ElectronicsAiRecommendation[] {
    const recs: ElectronicsAiRecommendation[] = [];
    const now = new Date().toISOString();

    // 1. Serial Anomaly Warning
    const duplicateSerials = devices.filter((d, i, arr) => arr.findIndex((x) => x.serialNumber === d.serialNumber) !== i);
    if (duplicateSerials.length > 0) {
      recs.push({
        id: `REC-ELEC-SERIAL-${randomUUID().slice(0, 6)}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        category: "SERIAL_ANOMALY_WARNING",
        observation: `Duplicate serial number detected in serialized device inventory.`,
        evidence: `Serial number '${duplicateSerials[0].serialNumber}' is registered in multiple device records.`,
        recommendation: "Conduct immediate warehouse audit & verify physical barcode tags.",
        expectedImpact: "Prevents fraudulent warranty claims & inventory ledger corruption.",
        confidenceScore: 98,
        createdAt: now,
      });
    }

    return recs;
  }
}

export const globalElectronicsOperatingEngine = new ElectronicsOperatingEngine();
export const globalElectronicsEngine = globalElectronicsOperatingEngine;
export { ElectronicsOperatingEngine as ElectronicsEngine };
