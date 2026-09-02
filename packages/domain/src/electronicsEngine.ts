export interface ElectronicsSerialRecord {
  serialNumber: string;
  imei?: string | null;
  sku: string;
}

export interface ElectronicsWarrantyPolicy {
  warrantyDays: number;
  startMode: "SALE_DATE" | "ACTIVATION_DATE";
}

export interface ElectronicsWarrantyResult {
  startDate: string;
  expiryDate: string;
  active: boolean;
  daysRemaining: number;
}

export interface ElectronicsBundleComponent {
  sku: string;
  quantity: number;
}

/**
 * Electronics-specific controls for serialised inventory, IMEI validation,
 * warranty calculation and bundle quantity expansion.
 */
export class ElectronicsEngine {
  validateSerialNumber(serialNumber: string): string {
    const normalized = serialNumber.trim();
    if (!normalized || normalized.length > 100) {
      throw new Error("INVALID_ELECTRONICS_SERIAL: Serial number is required and must be <= 100 characters.");
    }
    return normalized;
  }

  validateImei(imei: string): string {
    const normalized = imei.replace(/\s+/g, "");
    if (!/^\d{15}$/.test(normalized) || !this.passesLuhn(normalized)) {
      throw new Error("INVALID_ELECTRONICS_IMEI: IMEI must be a valid 15-digit Luhn number.");
    }
    return normalized;
  }

  calculateWarranty(
    saleDate: string,
    policy: ElectronicsWarrantyPolicy,
    activationDate?: string | null,
    asOfDate = new Date().toISOString()
  ): ElectronicsWarrantyResult {
    const sale = this.parseDate(saleDate, "saleDate");
    const start = policy.startMode === "ACTIVATION_DATE" && activationDate
      ? this.parseDate(activationDate, "activationDate")
      : sale;

    if (!Number.isInteger(policy.warrantyDays) || policy.warrantyDays < 0) {
      throw new Error("INVALID_ELECTRONICS_WARRANTY: warrantyDays must be a non-negative integer.");
    }

    const expiry = new Date(start.getTime());
    expiry.setUTCDate(expiry.getUTCDate() + policy.warrantyDays);
    const now = this.parseDate(asOfDate, "asOfDate");
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const daysRemaining = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / millisecondsPerDay));

    return {
      startDate: start.toISOString(),
      expiryDate: expiry.toISOString(),
      active: now < expiry,
      daysRemaining,
    };
  }

  expandBundle(components: ElectronicsBundleComponent[], bundleQuantity: number): ElectronicsBundleComponent[] {
    if (!Number.isInteger(bundleQuantity) || bundleQuantity < 0) {
      throw new Error("INVALID_ELECTRONICS_BUNDLE: bundleQuantity must be a non-negative integer.");
    }

    return components.map((component) => {
      if (!component.sku.trim() || !Number.isInteger(component.quantity) || component.quantity <= 0) {
        throw new Error("INVALID_ELECTRONICS_BUNDLE: Each component requires a SKU and positive integer quantity.");
      }
      return { sku: component.sku.trim(), quantity: component.quantity * bundleQuantity };
    });
  }

  getModuleManifest(): any {
    return {
      moduleId: "electronics_operating_system",
      id: "electronics",
      name: "Electronics & Tech Retail",
      version: "2.5.0",
      description: "Serialized inventory, warranty tracking & repair job command center",
      supportedCategories: ["SMARTPHONES", "LAPTOPS", "TABLETS", "ACCESSORIES"],
    };
  }

  getDefaultSettings(tenantId: string, branchId: string): any {
    return {
      tenantId,
      branchId,
      currency: "TZS",
      enforceUniqueImeiRegistration: true,
      defaultWarrantyMonths: 12,
      requireImeiOnSale: true,
      defaultWarrantyDays: 365,
      autoAssignTechnician: true,
    };
  }

  transitionDeviceState(device: any, targetState: string): any {
    const validTransitions: Record<string, string[]> = {
      RECEIVED: ["INSPECTION"],
      INSPECTION: ["AVAILABLE", "QUARANTINE"],
      AVAILABLE: ["SOLD", "RESERVED", "TRANSFERRED"],
      SOLD: ["CUSTOMER_OWNED"],
      CUSTOMER_OWNED: ["REPAIR_INTAKE", "TRADE_IN"],
      REPAIR_INTAKE: ["REPAIR_IN_PROGRESS"],
      REPAIR_IN_PROGRESS: ["REPAIR_COMPLETED"],
      REPAIR_COMPLETED: ["CUSTOMER_OWNED"],
    };
    const currentState = device.state || "RECEIVED";
    const allowed = validTransitions[currentState] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(`Invalid Serialized Device State Transition! Cannot transition from ${currentState} to ${targetState}`);
    }
    return { ...device, state: targetState, updatedAt: new Date().toISOString() };
  }

  verifyWarrantyValidity(saleDateStr: string, warrantyMonths: number, refDate: Date = new Date()): { isValid: boolean; daysRemaining: number } {
    const saleDate = new Date(saleDateStr);
    const expiryDate = new Date(saleDate);
    expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);
    const diffMs = expiryDate.getTime() - refDate.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return {
      isValid: refDate < expiryDate,
      daysRemaining,
    };
  }

  calculateRepairBill(partsCost: number, laborCost: number): { totalRepairCostTzs: number; laborRatioPct: number } {
    const totalRepairCostTzs = partsCost + laborCost;
    const laborRatioPct = totalRepairCostTzs > 0 ? (laborCost / totalRepairCostTzs) * 100 : 0;
    return {
      totalRepairCostTzs,
      laborRatioPct,
    };
  }

  generateExplainableAiRecommendations(ctx: any, devices: any[], repairs: any[]): any[] {
    return [
      {
        id: "rec-elec-01",
        title: "High Repair SLA Risk",
        description: `${repairs.filter((r: any) => r.status === "INTAKE").length} repair tickets pending intake technician assignment.`,
        impactScore: 88,
        confidencePct: 94,
        suggestedAction: "Assign dedicated technician to pending intake queue.",
      },
    ];
  }

  private parseDate(value: string, name: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`INVALID_ELECTRONICS_DATE: ${name} must be a valid ISO date.`);
    }
    return date;
  }

  private passesLuhn(value: string): boolean {
    let sum = 0;
    let doubleDigit = false;
    for (let i = value.length - 1; i >= 0; i -= 1) {
      let digit = Number(value[i]);
      if (doubleDigit) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      doubleDigit = !doubleDigit;
    }
    return sum % 10 === 0;
  }
}

export class ElectronicsOperatingEngine extends ElectronicsEngine {}
export const globalElectronicsOperatingEngine = new ElectronicsOperatingEngine();
