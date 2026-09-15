import { randomUUID } from "crypto";
import type {
  TenantContext,
  PharmacyModuleManifest,
  PharmacySettings,
  MedicineMaster,
  BatchRecord,
  Prescription,
  DispensingRecord,
  PatientProfile,
  QuarantineRecord,
  RecallRecord,
  PharmacySafetyAlert,
} from "@kwakopos2/contracts";
import {
  globalPharmacyOperatingEngine,
  PharmacyOperatingEngine,
  StockLedgerEngine,
  InventoryEngine,
} from "@kwakopos2/domain";
import {
  globalInMemoryStore,
  InMemoryStore,
} from "@kwakopos2/database";

export class PharmacyService {
  private engine: PharmacyOperatingEngine;
  private store: InMemoryStore;

  private medicineMap: Map<string, MedicineMaster> = new Map();
  private batchMap: Map<string, BatchRecord> = new Map();
  private prescriptionMap: Map<string, Prescription> = new Map();
  private dispensingMap: Map<string, DispensingRecord> = new Map();
  private patientMap: Map<string, PatientProfile> = new Map();
  private quarantineMap: Map<string, QuarantineRecord> = new Map();
  private recallMap: Map<string, RecallRecord> = new Map();
  private stockLedger: StockLedgerEngine;

  constructor(engine?: PharmacyOperatingEngine, store?: InMemoryStore, stockLedger?: StockLedgerEngine) {
    this.engine = engine || globalPharmacyOperatingEngine;
    this.store = store || globalInMemoryStore;
    this.stockLedger = stockLedger || StockLedgerEngine.getInstance();
  }


  getManifest(): PharmacyModuleManifest {
    return this.engine.getModuleManifest();
  }

  getSettings(ctx: TenantContext): PharmacySettings {
    return this.engine.getDefaultSettings(ctx.tenantId, ctx.branchId);
  }

  createMedicine(ctx: TenantContext, medicine: Omit<MedicineMaster, "id" | "tenantId" | "branchId">): MedicineMaster {
    const id = randomUUID();
    const fullMed: MedicineMaster = {
      ...medicine,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
    };
    this.medicineMap.set(id, fullMed);
    return fullMed;
  }

  getMedicines(ctx: TenantContext): MedicineMaster[] {
    return Array.from(this.medicineMap.values()).filter(
      (m) => m.tenantId === ctx.tenantId && m.branchId === ctx.branchId
    );
  }

  receiveBatch(ctx: TenantContext, batch: Omit<BatchRecord, "id" | "tenantId" | "branchId" | "currentQuantity" | "status">): BatchRecord {
    const id = randomUUID();
    const expiryStatus = this.engine.classifyExpiryStatus(
      typeof batch.expiryDate === "string" ? batch.expiryDate : batch.expiryDate.toISOString(),
      90
    );
    let status: BatchRecord["status"] = "AVAILABLE";
    if (expiryStatus === "EXPIRED") status = "EXPIRED";
    else if (expiryStatus === "APPROACHING_EXPIRY" || expiryStatus === "CRITICAL") status = "NEAR_EXPIRY";

    const fullBatch: BatchRecord = {
      ...batch,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      currentQuantity: batch.initialQuantity,
      status,
    };
    this.batchMap.set(id, fullBatch);

    // Synchronize intake with Core Stock Ledger & Inventory Engine
    try {
      this.stockLedger.recordMovement(ctx, {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        movementType: "PURCHASE_RECEIPT",
        productId: batch.medicineId,
        batchId: id,
        batchNumber: batch.batchNumber,
        quantityDelta: batch.initialQuantity,
        unitCost: batch.unitCost || 0,
        referenceType: "PURCHASE",
        referenceId: id,
        actorId: ctx.userId || "system",
        notes: `Pharmacy batch intake: ${batch.batchNumber}`,
      });

      InventoryEngine.getInstance().registerBatch(ctx, {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        productId: batch.medicineId,
        batchNumber: batch.batchNumber,
        expiryDate: typeof batch.expiryDate === "string" ? batch.expiryDate : batch.expiryDate.toISOString(),
        quantity: batch.initialQuantity,
        unitCost: batch.unitCost || 0,
      });
    } catch {
      // In-memory fallback
    }

    return fullBatch;
  }

  dispenseMedicineFEFO(
    ctx: TenantContext,
    req: { medicineId: string; quantityRequired: number; patientId?: string; prescriptionId?: string }
  ): {
    dispensingRecords: DispensingRecord[];
    safetyAlerts: PharmacySafetyAlert[];
    fulfilled: boolean;
  } {
    const medicine = this.medicineMap.get(req.medicineId);
    if (!medicine) throw new Error(`Medicine ${req.medicineId} not found`);

    const patient = req.patientId ? this.patientMap.get(req.patientId) : undefined;
    const safetyAlerts = this.engine.evaluateDrugSafety(ctx, medicine, patient);

    const medicineBatches = Array.from(this.batchMap.values()).filter(
      (b) => b.tenantId === ctx.tenantId && b.branchId === ctx.branchId && b.medicineId === req.medicineId
    );

    const fefoResult = this.engine.selectBatchFEFO(medicineBatches, req.quantityRequired);
    const dispensingRecords: DispensingRecord[] = [];

    if (fefoResult.fulfilled) {
      for (const sel of fefoResult.selectedBatches) {
        const batch = this.batchMap.get(sel.batchId)!;
        batch.currentQuantity -= sel.quantityToTake;

        const dispRecord: DispensingRecord = {
          id: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          dispensingNumber: `DISP-${Math.floor(1000 + Math.random() * 9000)}`,
          prescriptionId: req.prescriptionId,
          patientId: req.patientId,
          medicineId: req.medicineId,
          batchId: sel.batchId,
          batchNumber: sel.batchNumber,
          quantityDispensed: sel.quantityToTake,
          unitPrice: medicine.sellingPrice,
          totalPrice: sel.quantityToTake * medicine.sellingPrice,
          dispensedByUserId: ctx.userId,
          dispensedAt: new Date().toISOString(),
        };
        this.dispensingMap.set(dispRecord.id, dispRecord);
        dispensingRecords.push(dispRecord);

        // Authoritative stock deduction in Core Stock Ledger
        try {
          this.stockLedger.recordMovement(ctx, {
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            movementType: "SALE",
            productId: req.medicineId,
            batchId: sel.batchId,
            batchNumber: sel.batchNumber,
            quantityDelta: -sel.quantityToTake,
            unitCost: batch.unitCost || 0,
            referenceType: "PLUGIN_DISPENSE",
            referenceId: dispRecord.id,
            actorId: ctx.userId || "system",
            allowNegativeStock: true,
            notes: `Pharmacy dispense FEFO for ${dispRecord.dispensingNumber}`,
          });
        } catch {
          // In-memory fallback
        }
      }
    }

    return {
      dispensingRecords,
      safetyAlerts,
      fulfilled: fefoResult.fulfilled,
    };
  }

  initiateBatchRecall(ctx: TenantContext, recall: Omit<RecallRecord, "id" | "tenantId" | "branchId" | "initiatedAt">): RecallRecord {
    const id = randomUUID();
    const fullRecall: RecallRecord = {
      ...recall,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      initiatedAt: new Date().toISOString(),
    };
    this.recallMap.set(id, fullRecall);

    // Update affected batches status to RECALLED
    for (const b of this.batchMap.values()) {
      if (b.tenantId === ctx.tenantId && b.batchNumber === recall.batchNumber) {
        b.status = "RECALLED";
      }
    }

    return fullRecall;
  }
}

export const globalPharmacyService = new PharmacyService();
