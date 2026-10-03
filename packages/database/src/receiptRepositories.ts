import { TenantContext, ReceiptDTO, CreateReceiptRequest, ReceiptTemplateDTO, ReceiptVerificationDTO } from "@kwakopos2/contracts";
import { PrismaClient } from "@prisma/client";

export interface ReceiptSearchFilter {
  query?: string;
  status?: string;
  transactionType?: string;
  cashierId?: string;
  customerId?: string;
  branchId?: string;
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  limit?: number;
}

export interface ScopedReceiptRepository {
  createReceipt(ctx: TenantContext, req: CreateReceiptRequest & { receiptNumber: string; digitalSignature: string; qrCodePayload: string; barcodePayload: string; signatureTimestamp?: string }): Promise<ReceiptDTO>;
  getReceiptById(ctx: TenantContext, id: string): Promise<ReceiptDTO | null>;
  getReceiptByNumber(ctx: TenantContext, receiptNumber: string): Promise<ReceiptDTO | null>;
  searchReceipts(ctx: TenantContext, filter: ReceiptSearchFilter): Promise<{ receipts: ReceiptDTO[]; total: number; page: number; limit: number }>;
  recordReprint(ctx: TenantContext, receiptId: string, printedBy: string, reason?: string): Promise<{ success: boolean; reprintCount: number }>;
  recordShare(ctx: TenantContext, receiptId: string, channel: "EMAIL" | "SMS" | "WHATSAPP", recipient: string, sharedBy: string): Promise<boolean>;
  updateReceiptStatus(ctx: TenantContext, receiptId: string, status: string, reason?: string, actorId?: string): Promise<ReceiptDTO>;
  getReceiptTemplates(ctx: TenantContext): Promise<ReceiptTemplateDTO[]>;
  saveReceiptTemplate(ctx: TenantContext, template: Partial<ReceiptTemplateDTO>): Promise<ReceiptTemplateDTO>;
  getReceiptAnalytics(ctx: TenantContext): Promise<{
    todayCount: number;
    todayTotal: number;
    averageSale: number;
    largestReceipt: number;
    cancelledCount: number;
    refundedCount: number;
    totalRepoints: number;
    pendingSyncCount: number;
    byCashier: Array<{ cashierId: string; cashierName: string; count: number; total: number }>;
    byBranch: Array<{ branchId: string; count: number; total: number }>;
  }>;
}

export class InMemoryReceiptRepository implements ScopedReceiptRepository {
  private receipts: Map<string, ReceiptDTO> = new Map();
  private templates: Map<string, ReceiptTemplateDTO> = new Map();
  private auditLogs: Array<any> = [];
  private printLogs: Array<any> = [];
  private shareLogs: Array<any> = [];

  constructor() {
    // Default template
    const defaultTpl: ReceiptTemplateDTO = {
      id: "TPL-DEFAULT-001",
      tenantId: "TENANT-001",
      name: "Default Thermal 80mm",
      templateType: "THERMAL_80MM",
      isDefault: true,
      headerText: "Welcome to KwakoPos Enterprise POS",
      footerText: "Thank you for your business! Please come again.",
      primaryColor: "#1e293b",
      fontFamily: "Inter, sans-serif",
      showQrCode: true,
      showBarcode: true,
      showTaxBreakdown: true,
      showCustomerInfo: true,
      returnPolicyText: "Goods once sold can be returned within 7 days with valid receipt.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.templates.set(defaultTpl.id, defaultTpl);
  }

  async createReceipt(
    ctx: TenantContext,
    req: CreateReceiptRequest & { receiptNumber: string; digitalSignature: string; qrCodePayload: string; barcodePayload: string; signatureTimestamp?: string }
  ): Promise<ReceiptDTO> {
    const now = req.signatureTimestamp || new Date().toISOString();
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    const items = req.items.map((item, idx) => {
      const disc = item.discount || 0;
      const taxR = item.taxRate || 0;
      const itemSub = item.qty * item.unitPrice - disc;
      const taxAmt = itemSub * (taxR / 100);
      const lineTot = itemSub + taxAmt;

      subtotal += item.qty * item.unitPrice;
      discountTotal += disc;
      taxTotal += taxAmt;

      return {
        id: `RCPT-ITEM-${Date.now()}-${idx}`,
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        discount: disc,
        taxRate: taxR,
        taxAmount: taxAmt,
        lineTotal: lineTot,
      };
    });

    const grandTotal = subtotal - discountTotal + taxTotal;
    const changeAmount = Math.max(0, req.paidAmount - grandTotal);

    const receipt: ReceiptDTO = {
      id: `RCPT-ID-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      receiptNumber: req.receiptNumber,
      transactionId: req.transactionId,
      transactionType: req.transactionType,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      cashierId: req.cashierId,
      cashierName: req.cashierName || "Cashier",
      customerId: req.customerId,
      customerName: req.customerName,
      customerPhone: req.customerPhone,
      customerEmail: req.customerEmail,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      paidAmount: req.paidAmount,
      changeAmount,
      paymentMethod: req.paymentMethod,
      currency: req.currency || "TZS",
      exchangeRate: req.exchangeRate || 1,
      status: "COMPLETED",
      deviceId: req.deviceId || "POS-DEV-001",
      syncStatus: "SYNCED",
      digitalSignature: req.digitalSignature,
      qrCodePayload: req.qrCodePayload,
      barcodePayload: req.barcodePayload,
      reprintCount: 0,
      notes: req.notes,
      createdAt: now,
      updatedAt: now,
      items,
    };

    this.receipts.set(receipt.id, receipt);
    this.auditLogs.push({
      id: `AUDIT-${Date.now()}`,
      receiptId: receipt.id,
      action: "CREATED",
      actorId: ctx.userId,
      timestamp: now,
    });

    return receipt;
  }

  async getReceiptById(ctx: TenantContext, id: string): Promise<ReceiptDTO | null> {
    const rcpt = this.receipts.get(id);
    if (!rcpt || rcpt.tenantId !== ctx.tenantId) return null;
    return rcpt;
  }

  async getReceiptByNumber(ctx: TenantContext, receiptNumber: string): Promise<ReceiptDTO | null> {
    for (const r of this.receipts.values()) {
      if (r.tenantId === ctx.tenantId && r.receiptNumber.toLowerCase() === receiptNumber.toLowerCase()) {
        return r;
      }
    }
    return null;
  }

  async searchReceipts(ctx: TenantContext, filter: ReceiptSearchFilter): Promise<{ receipts: ReceiptDTO[]; total: number; page: number; limit: number }> {
    let list = Array.from(this.receipts.values()).filter((r) => r.tenantId === ctx.tenantId);

    if (filter.branchId) list = list.filter((r) => r.branchId === filter.branchId);
    if (filter.status) list = list.filter((r) => r.status === filter.status);
    if (filter.transactionType) list = list.filter((r) => r.transactionType === filter.transactionType);
    if (filter.cashierId) list = list.filter((r) => r.cashierId === filter.cashierId);
    if (filter.customerId) list = list.filter((r) => r.customerId === filter.customerId);
    if (filter.query) {
      const q = filter.query.toLowerCase();
      list = list.filter((r) =>
        r.receiptNumber.toLowerCase().includes(q) ||
        r.transactionId.toLowerCase().includes(q) ||
        (r.customerName && r.customerName.toLowerCase().includes(q)) ||
        (r.customerPhone && r.customerPhone.includes(q))
      );
    }

    const total = list.length;
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const paginated = list.slice((page - 1) * limit, page * limit);

    return { receipts: paginated, total, page, limit };
  }

  async recordReprint(ctx: TenantContext, receiptId: string, printedBy: string, reason?: string): Promise<{ success: boolean; reprintCount: number }> {
    const rcpt = await this.getReceiptById(ctx, receiptId);
    if (!rcpt) throw new Error("RECEIPT_NOT_FOUND");

    rcpt.reprintCount += 1;
    rcpt.lastReprintedAt = new Date().toISOString();
    rcpt.updatedAt = new Date().toISOString();
    this.receipts.set(rcpt.id, rcpt);

    this.printLogs.push({
      id: `PRINT-${Date.now()}`,
      receiptId: rcpt.id,
      printedBy,
      printType: "REPRINT",
      reason: reason || "Customer request reprint",
      timestamp: new Date().toISOString(),
    });

    this.auditLogs.push({
      id: `AUDIT-${Date.now()}`,
      receiptId: rcpt.id,
      action: "REPRINTED",
      actorId: ctx.userId,
      reason,
      timestamp: new Date().toISOString(),
    });

    return { success: true, reprintCount: rcpt.reprintCount };
  }

  async recordShare(ctx: TenantContext, receiptId: string, channel: "EMAIL" | "SMS" | "WHATSAPP", recipient: string, sharedBy: string): Promise<boolean> {
    const rcpt = await this.getReceiptById(ctx, receiptId);
    if (!rcpt) throw new Error("RECEIPT_NOT_FOUND");

    this.shareLogs.push({
      id: `SHARE-${Date.now()}`,
      receiptId: rcpt.id,
      channel,
      recipient,
      sharedBy,
      status: "SENT",
      timestamp: new Date().toISOString(),
    });

    this.auditLogs.push({
      id: `AUDIT-${Date.now()}`,
      receiptId: rcpt.id,
      action: `SHARED_${channel}`,
      actorId: ctx.userId,
      details: recipient,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  async updateReceiptStatus(ctx: TenantContext, receiptId: string, status: string, reason?: string, actorId?: string): Promise<ReceiptDTO> {
    const rcpt = await this.getReceiptById(ctx, receiptId);
    if (!rcpt) throw new Error("RECEIPT_NOT_FOUND");

    rcpt.status = status as any;
    rcpt.updatedAt = new Date().toISOString();
    this.receipts.set(rcpt.id, rcpt);

    this.auditLogs.push({
      id: `AUDIT-${Date.now()}`,
      receiptId: rcpt.id,
      action: `STATUS_UPDATED_${status}`,
      actorId: actorId || ctx.userId,
      reason,
      timestamp: new Date().toISOString(),
    });

    return rcpt;
  }

  async getReceiptTemplates(ctx: TenantContext): Promise<ReceiptTemplateDTO[]> {
    return Array.from(this.templates.values()).filter((t) => t.tenantId === ctx.tenantId || t.tenantId === "TENANT-001");
  }

  async saveReceiptTemplate(ctx: TenantContext, template: Partial<ReceiptTemplateDTO>): Promise<ReceiptTemplateDTO> {
    const now = new Date().toISOString();
    const id = template.id || `TPL-${Date.now()}`;
    const fullTpl: ReceiptTemplateDTO = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      name: template.name || "Custom Receipt Template",
      templateType: (template.templateType as any) || "THERMAL_80MM",
      isDefault: template.isDefault ?? false,
      headerText: template.headerText || "Welcome",
      footerText: template.footerText || "Thank you",
      logoUrl: template.logoUrl,
      primaryColor: template.primaryColor || "#1e293b",
      fontFamily: template.fontFamily || "Inter, sans-serif",
      showQrCode: template.showQrCode ?? true,
      showBarcode: template.showBarcode ?? true,
      showTaxBreakdown: template.showTaxBreakdown ?? true,
      showCustomerInfo: template.showCustomerInfo ?? true,
      returnPolicyText: template.returnPolicyText || "Return within 7 days",
      createdAt: template.createdAt || now,
      updatedAt: now,
    };

    this.templates.set(id, fullTpl);
    return fullTpl;
  }

  async getReceiptAnalytics(ctx: TenantContext): Promise<{
    todayCount: number;
    todayTotal: number;
    averageSale: number;
    largestReceipt: number;
    cancelledCount: number;
    refundedCount: number;
    totalRepoints: number;
    pendingSyncCount: number;
    byCashier: Array<{ cashierId: string; cashierName: string; count: number; total: number }>;
    byBranch: Array<{ branchId: string; count: number; total: number }>;
  }> {
    const list = Array.from(this.receipts.values()).filter((r) => r.tenantId === ctx.tenantId);
    let todayTotal = 0;
    let largestReceipt = 0;
    let cancelledCount = 0;
    let refundedCount = 0;
    let totalRepoints = 0;
    let pendingSyncCount = 0;

    const cashierMap = new Map<string, { cashierName: string; count: number; total: number }>();
    const branchMap = new Map<string, { count: number; total: number }>();

    for (const r of list) {
      if (r.status === "CANCELLED") cancelledCount++;
      if (r.status === "REFUNDED") refundedCount++;
      if (r.status === "PENDING_SYNC") pendingSyncCount++;
      totalRepoints += r.reprintCount;

      if (r.status === "COMPLETED") {
        todayTotal += r.grandTotal;
        if (r.grandTotal > largestReceipt) largestReceipt = r.grandTotal;

        const cId = r.cashierId;
        const cVal = cashierMap.get(cId) || { cashierName: r.cashierName || cId, count: 0, total: 0 };
        cVal.count++;
        cVal.total += r.grandTotal;
        cashierMap.set(cId, cVal);

        const bId = r.branchId;
        const bVal = branchMap.get(bId) || { count: 0, total: 0 };
        bVal.count++;
        bVal.total += r.grandTotal;
        branchMap.set(bId, bVal);
      }
    }

    const todayCount = list.filter((r) => r.status === "COMPLETED").length;
    const averageSale = todayCount > 0 ? todayTotal / todayCount : 0;

    return {
      todayCount,
      todayTotal,
      averageSale,
      largestReceipt,
      cancelledCount,
      refundedCount,
      totalRepoints,
      pendingSyncCount,
      byCashier: Array.from(cashierMap.entries()).map(([k, v]) => ({ cashierId: k, cashierName: v.cashierName, count: v.count, total: v.total })),
      byBranch: Array.from(branchMap.entries()).map(([k, v]) => ({ branchId: k, count: v.count, total: v.total })),
    };
  }
}

export class PrismaReceiptRepository implements ScopedReceiptRepository {
  private inMemory = new InMemoryReceiptRepository();

  constructor(private prisma: PrismaClient = new PrismaClient()) {}

  async createReceipt(
    ctx: TenantContext,
    req: CreateReceiptRequest & { receiptNumber: string; digitalSignature: string; qrCodePayload: string; barcodePayload: string; signatureTimestamp?: string }
  ): Promise<ReceiptDTO> {
    if (!this.prisma) return this.inMemory.createReceipt(ctx, req);
    try {
      let subtotal = 0;
      let taxTotal = 0;
      let discountTotal = 0;

      const preparedItems = req.items.map((item) => {
        const disc = item.discount || 0;
        const taxR = item.taxRate || 0;
        const itemSub = item.qty * item.unitPrice - disc;
        const taxAmt = itemSub * (taxR / 100);
        const lineTot = itemSub + taxAmt;

        subtotal += item.qty * item.unitPrice;
        discountTotal += disc;
        taxTotal += taxAmt;

        return {
          productId: item.productId,
          variantId: item.variantId,
          sku: item.sku,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: disc,
          taxRate: taxR,
          taxAmount: taxAmt,
          lineTotal: lineTot,
        };
      });

      const grandTotal = subtotal - discountTotal + taxTotal;
      const changeAmount = Math.max(0, req.paidAmount - grandTotal);

      const created = await this.prisma.receipt.create({
        data: {
          receiptNumber: req.receiptNumber,
          transactionId: req.transactionId,
          transactionType: req.transactionType,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          cashierId: req.cashierId,
          cashierName: req.cashierName,
          customerId: req.customerId,
          customerName: req.customerName,
          customerPhone: req.customerPhone,
          customerEmail: req.customerEmail,
          subtotal,
          discountTotal,
          taxTotal,
          grandTotal,
          paidAmount: req.paidAmount,
          changeAmount,
          paymentMethod: req.paymentMethod,
          currency: req.currency || "TZS",
          exchangeRate: req.exchangeRate || 1,
          status: "COMPLETED",
          deviceId: req.deviceId || "POS-DEV-001",
          syncStatus: "SYNCED",
          digitalSignature: req.digitalSignature,
          qrCodePayload: req.qrCodePayload,
          barcodePayload: req.barcodePayload,
          notes: req.notes,
          items: {
            create: preparedItems,
          },
          auditLogs: {
            create: {
              action: "CREATED",
              actorId: ctx.userId,
            },
          },
        },
        include: {
          items: true,
        },
      });

      return this.mapPrismaReceipt(created);
    } catch (error) {
      throw error;
    }
  }

  async getReceiptById(ctx: TenantContext, id: string): Promise<ReceiptDTO | null> {
    if (!this.prisma) return this.inMemory.getReceiptById(ctx, id);
    try {
      const found = await this.prisma.receipt.findFirst({
        where: { id, tenantId: ctx.tenantId },
        include: { items: true },
      });
      return found ? this.mapPrismaReceipt(found) : null;
    } catch (error) {
      throw error;
    }
  }

  async getReceiptByNumber(ctx: TenantContext, receiptNumber: string): Promise<ReceiptDTO | null> {
    if (!this.prisma) return this.inMemory.getReceiptByNumber(ctx, receiptNumber);
    try {
      const found = await this.prisma.receipt.findFirst({
        where: { receiptNumber, tenantId: ctx.tenantId },
        include: { items: true },
      });
      return found ? this.mapPrismaReceipt(found) : null;
    } catch (error) {
      throw error;
    }
  }

  async searchReceipts(ctx: TenantContext, filter: ReceiptSearchFilter): Promise<{ receipts: ReceiptDTO[]; total: number; page: number; limit: number }> {
    if (!this.prisma) return this.inMemory.searchReceipts(ctx, filter);
    try {
      const page = filter.page || 1;
      const limit = filter.limit || 50;
      const where: any = { tenantId: ctx.tenantId };

      if (filter.branchId) where.branchId = filter.branchId;
      if (filter.status) where.status = filter.status;
      if (filter.transactionType) where.transactionType = filter.transactionType;
      if (filter.cashierId) where.cashierId = filter.cashierId;
      if (filter.customerId) where.customerId = filter.customerId;
      if (filter.query) {
        where.OR = [
          { receiptNumber: { contains: filter.query, mode: "insensitive" } },
          { transactionId: { contains: filter.query, mode: "insensitive" } },
          { customerName: { contains: filter.query, mode: "insensitive" } },
          { customerPhone: { contains: filter.query, mode: "insensitive" } },
        ];
      }

      const [total, rows] = await Promise.all([
        this.prisma.receipt.count({ where }),
        this.prisma.receipt.findMany({
          where,
          include: { items: true },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);

      return {
        receipts: rows.map((r: any) => this.mapPrismaReceipt(r)),
        total,
        page,
        limit,
      };
    } catch (error) {
      throw error;
    }
  }

  async recordReprint(ctx: TenantContext, receiptId: string, printedBy: string, reason?: string): Promise<{ success: boolean; reprintCount: number }> {
    if (!this.prisma) return this.inMemory.recordReprint(ctx, receiptId, printedBy, reason);
    try {
      const updated = await this.prisma.receipt.update({
        where: { id: receiptId },
        data: {
          reprintCount: { increment: 1 },
          lastReprintedAt: new Date(),
          printLogs: {
            create: {
              printedBy,
              printType: "REPRINT",
              reason,
            },
          },
          auditLogs: {
            create: {
              action: "REPRINTED",
              actorId: ctx.userId,
              reason,
            },
          },
        },
      });
      return { success: true, reprintCount: updated.reprintCount };
    } catch (error) {
      throw error;
    }
  }

  async recordShare(ctx: TenantContext, receiptId: string, channel: "EMAIL" | "SMS" | "WHATSAPP", recipient: string, sharedBy: string): Promise<boolean> {
    if (!this.prisma) return this.inMemory.recordShare(ctx, receiptId, channel, recipient, sharedBy);
    try {
      await this.prisma.receipt.update({
        where: { id: receiptId },
        data: {
          shareLogs: {
            create: {
              channel,
              recipient,
              sharedBy,
              status: "SENT",
            },
          },
          auditLogs: {
            create: {
              action: `SHARED_${channel}`,
              actorId: ctx.userId,
              details: recipient,
            },
          },
        },
      });
      return true;
    } catch (error) {
      throw error;
    }
  }

  async updateReceiptStatus(ctx: TenantContext, receiptId: string, status: string, reason?: string, actorId?: string): Promise<ReceiptDTO> {
    if (!this.prisma) return this.inMemory.updateReceiptStatus(ctx, receiptId, status, reason, actorId);
    try {
      const updated = await this.prisma.receipt.update({
        where: { id: receiptId },
        data: {
          status,
          auditLogs: {
            create: {
              action: `STATUS_UPDATED_${status}`,
              actorId: actorId || ctx.userId,
              reason,
            },
          },
        },
        include: { items: true },
      });
      return this.mapPrismaReceipt(updated);
    } catch (error) {
      throw error;
    }
  }

  async getReceiptTemplates(ctx: TenantContext): Promise<ReceiptTemplateDTO[]> {
    if (!this.prisma) return this.inMemory.getReceiptTemplates(ctx);
    try {
      const rows = await this.prisma.receiptTemplate.findMany({
        where: { tenantId: ctx.tenantId },
      });
      return rows.map((t: any) => ({
        id: t.id,
        tenantId: t.tenantId,
        branchId: t.branchId || undefined,
        name: t.name,
        templateType: t.templateType as any,
        isDefault: t.isDefault,
        headerText: t.headerText || undefined,
        footerText: t.footerText || undefined,
        logoUrl: t.logoUrl || undefined,
        primaryColor: t.primaryColor,
        fontFamily: t.fontFamily,
        showQrCode: t.showQrCode,
        showBarcode: t.showBarcode,
        showTaxBreakdown: t.showTaxBreakdown,
        showCustomerInfo: t.showCustomerInfo,
        returnPolicyText: t.returnPolicyText || undefined,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }));
    } catch (error) {
      throw error;
    }
  }

  async saveReceiptTemplate(ctx: TenantContext, template: Partial<ReceiptTemplateDTO>): Promise<ReceiptTemplateDTO> {
    if (!this.prisma) return this.inMemory.saveReceiptTemplate(ctx, template);
    try {
      const data: any = {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        name: template.name || "Custom Template",
        templateType: template.templateType || "THERMAL_80MM",
        isDefault: template.isDefault ?? false,
        headerText: template.headerText,
        footerText: template.footerText,
        logoUrl: template.logoUrl,
        primaryColor: template.primaryColor || "#1e293b",
        fontFamily: template.fontFamily || "Inter, sans-serif",
        showQrCode: template.showQrCode ?? true,
        showBarcode: template.showBarcode ?? true,
        showTaxBreakdown: template.showTaxBreakdown ?? true,
        showCustomerInfo: template.showCustomerInfo ?? true,
        returnPolicyText: template.returnPolicyText,
      };

      const saved = template.id
        ? await this.prisma.receiptTemplate.update({ where: { id: template.id }, data })
        : await this.prisma.receiptTemplate.create({ data });

      return {
        id: saved.id,
        tenantId: saved.tenantId,
        branchId: saved.branchId || undefined,
        name: saved.name,
        templateType: saved.templateType as any,
        isDefault: saved.isDefault,
        headerText: saved.headerText || undefined,
        footerText: saved.footerText || undefined,
        logoUrl: saved.logoUrl || undefined,
        primaryColor: saved.primaryColor,
        fontFamily: saved.fontFamily,
        showQrCode: saved.showQrCode,
        showBarcode: saved.showBarcode,
        showTaxBreakdown: saved.showTaxBreakdown,
        showCustomerInfo: saved.showCustomerInfo,
        returnPolicyText: saved.returnPolicyText || undefined,
        createdAt: saved.createdAt.toISOString(),
        updatedAt: saved.updatedAt.toISOString(),
      };
    } catch (error) {
      throw error;
    }
  }

  async getReceiptAnalytics(ctx: TenantContext): Promise<{
    todayCount: number;
    todayTotal: number;
    averageSale: number;
    largestReceipt: number;
    cancelledCount: number;
    refundedCount: number;
    totalRepoints: number;
    pendingSyncCount: number;
    byCashier: Array<{ cashierId: string; cashierName: string; count: number; total: number }>;
    byBranch: Array<{ branchId: string; count: number; total: number }>;
  }> {
    if (!this.prisma) return this.inMemory.getReceiptAnalytics(ctx);
    try {
      const rows = await this.prisma.receipt.findMany({
        where: { tenantId: ctx.tenantId },
      });
      let todayTotal = 0;
      let largestReceipt = 0;
      let cancelledCount = 0;
      let refundedCount = 0;
      let totalRepoints = 0;
      let pendingSyncCount = 0;

      const cashierMap = new Map<string, { cashierName: string; count: number; total: number }>();
      const branchMap = new Map<string, { count: number; total: number }>();

      for (const r of rows as any[]) {
        if (r.status === "CANCELLED") cancelledCount++;
        if (r.status === "REFUNDED") refundedCount++;
        if (r.status === "PENDING_SYNC") pendingSyncCount++;
        totalRepoints += r.reprintCount;

        if (r.status === "COMPLETED") {
          todayTotal += r.grandTotal;
          if (r.grandTotal > largestReceipt) largestReceipt = r.grandTotal;

          const cId = r.cashierId;
          const cVal = cashierMap.get(cId) || { cashierName: r.cashierName || cId, count: 0, total: 0 };
          cVal.count++;
          cVal.total += r.grandTotal;
          cashierMap.set(cId, cVal);

          const bId = r.branchId;
          const bVal = branchMap.get(bId) || { count: 0, total: 0 };
          bVal.count++;
          bVal.total += r.grandTotal;
          branchMap.set(bId, bVal);
        }
      }

      const todayCount = rows.filter((r: any) => r.status === "COMPLETED").length;
      const averageSale = todayCount > 0 ? todayTotal / todayCount : 0;

      return {
        todayCount,
        todayTotal,
        averageSale,
        largestReceipt,
        cancelledCount,
        refundedCount,
        totalRepoints,
        pendingSyncCount,
        byCashier: Array.from(cashierMap.entries()).map(([k, v]) => ({ cashierId: k, cashierName: v.cashierName, count: v.count, total: v.total })),
        byBranch: Array.from(branchMap.entries()).map(([k, v]) => ({ branchId: k, count: v.count, total: v.total })),
      };
    } catch (error) {
      throw error;
    }
  }

  private mapPrismaReceipt(row: any): ReceiptDTO {
    return {
      id: row.id,
      receiptNumber: row.receiptNumber,
      transactionId: row.transactionId,
      transactionType: row.transactionType as any,
      tenantId: row.tenantId,
      branchId: row.branchId,
      cashierId: row.cashierId,
      cashierName: row.cashierName || undefined,
      customerId: row.customerId || undefined,
      customerName: row.customerName || undefined,
      customerPhone: row.customerPhone || undefined,
      customerEmail: row.customerEmail || undefined,
      subtotal: row.subtotal,
      discountTotal: row.discountTotal,
      taxTotal: row.taxTotal,
      grandTotal: row.grandTotal,
      paidAmount: row.paidAmount,
      changeAmount: row.changeAmount,
      paymentMethod: row.paymentMethod,
      currency: row.currency,
      exchangeRate: row.exchangeRate,
      status: row.status as any,
      deviceId: row.deviceId,
      syncStatus: row.syncStatus,
      digitalSignature: row.digitalSignature,
      qrCodePayload: row.qrCodePayload,
      barcodePayload: row.barcodePayload,
      reprintCount: row.reprintCount,
      lastReprintedAt: row.lastReprintedAt ? row.lastReprintedAt.toISOString() : undefined,
      notes: row.notes || undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items: (row.items || []).map((i: any) => ({
        id: i.id,
        productId: i.productId || undefined,
        variantId: i.variantId || undefined,
        sku: i.sku,
        name: i.name,
        qty: i.qty,
        unitPrice: i.unitPrice,
        discount: i.discount,
        taxRate: i.taxRate,
        taxAmount: i.taxAmount,
        lineTotal: i.lineTotal,
      })),
    };
  }
}

export const globalReceiptRepository: ScopedReceiptRepository = new PrismaReceiptRepository();
