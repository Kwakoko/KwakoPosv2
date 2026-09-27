import { randomUUID } from "crypto";
import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "./index.js";
import { PrismaAtomicCommercialFinanceService } from "./atomicCommercialFinance.js";
import { assertTenantIsolation } from "@kwakopos2/domain";

const db: any = prisma;

function normalize(value: any): any {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    if (typeof value.toNumber === "function") return value.toNumber();
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
}

function tenantWhere(ctx: TenantContext, branch = true) {
  return branch
    ? { tenantId: ctx.tenantId, branchId: ctx.branchId }
    : { tenantId: ctx.tenantId };
}

function assertRow(row: any, ctx: TenantContext, branch = true) {
  if (!row) return null;
  assertTenantIsolation(ctx, row.tenantId, branch ? row.branchId : undefined);
  return normalize(row);
}

async function findOne(model: string, id: string, ctx: TenantContext, branch = true) {
  const row = await db[model].findUnique({ where: { id } });
  return row && row.tenantId === ctx.tenantId && (!branch || row.branchId === ctx.branchId)
    ? normalize(row) : null;
}

function pick(input: any, keys: string[]) {
  const out: any = {};
  for (const key of keys) if (input[key] !== undefined) out[key] = input[key];
  return out;
}

export class PrismaCommercialRepository {
  constructor(private readonly atomic = new PrismaAtomicCommercialFinanceService()) {}

  async getCustomers(ctx: TenantContext) {
    return normalize(await db.customer.findMany({ where: tenantWhere(ctx), orderBy: { createdAt: "asc" } }));
  }

  async getCustomerById(ctx: TenantContext, id: string) {
    return findOne("customer", id, ctx);
  }

  async createCustomer(ctx: TenantContext, req: any) {
    const count = await db.customer.count({ where: tenantWhere(ctx) });
    const row = await db.customer.create({ data: {
      id: req.id || undefined, tenantId: ctx.tenantId, branchId: ctx.branchId,
      customerCode: req.customerCode || `CUST-${String(count + 1).padStart(4, "0")}`,
      name: req.name, phone: req.phone ?? null, email: req.email ?? null,
      address: req.address ?? null, creditLimit: req.creditLimit ?? 0,
      currentBalance: req.openingBalance ?? 0, openingBalance: req.openingBalance ?? 0,
      status: req.status || "ACTIVE",
    }});
    return normalize(row);
  }

  async updateCustomer(ctx: TenantContext, id: string, req: any) {
    await this.requireEntity("customer", ctx, id);
    return normalize(await db.customer.update({ where: { id }, data: pick(req, [
      "name","phone","email","address","creditLimit","status","currentBalance","openingBalance"
    ]) }));
  }

  async getSuppliers(ctx: TenantContext) {
    return normalize(await db.supplier.findMany({ where: tenantWhere(ctx), orderBy: { createdAt: "asc" } }));
  }

  async getSupplierById(ctx: TenantContext, id: string) { return findOne("supplier", id, ctx); }

  async createSupplier(ctx: TenantContext, req: any) {
    const count = await db.supplier.count({ where: tenantWhere(ctx) });
    return normalize(await db.supplier.create({ data: {
      id: req.id || undefined, tenantId: ctx.tenantId, branchId: ctx.branchId,
      supplierCode: req.supplierCode || `SUP-${String(count + 1).padStart(4, "0")}`,
      name: req.name, phone: req.phone ?? null, email: req.email ?? null,
      address: req.address ?? null, taxPin: req.taxPin ?? null,
      outstandingBalance: req.outstandingBalance ?? 0, status: req.status || "ACTIVE",
    }}));
  }

  async updateSupplier(ctx: TenantContext, id: string, req: any) {
    await this.requireEntity("supplier", ctx, id);
    return normalize(await db.supplier.update({ where: { id }, data: pick(req, [
      "name","phone","email","address","taxPin","outstandingBalance","status"
    ]) }));
  }

  async getPurchaseOrders(ctx: TenantContext) {
    return normalize(await db.purchaseOrder.findMany({ where: tenantWhere(ctx), include: { items: true }, orderBy: { createdAt: "desc" } }));
  }

  async createPurchaseOrder(ctx: TenantContext, req: any) {
    await this.requireEntity("supplier", ctx, req.supplierId);
    const count = await db.purchaseOrder.count({ where: tenantWhere(ctx) });
    const orderNumber = req.orderNumber || `PUR-MAIN-${String(count + 1).padStart(6, "0")}`;
    const items = (req.items || []).map((item: any) => ({
      id: item.id || randomUUID(), variantId: item.variantId,
      quantityOrdered: item.quantityOrdered, quantityReceived: item.quantityReceived || 0,
      unitCost: item.unitCost, totalCost: item.totalCost ?? item.quantityOrdered * item.unitCost,
    }));
    const totalAmount = items.reduce((sum: number, item: any) => sum + Number(item.totalCost || 0), 0);
    return normalize(await db.purchaseOrder.create({ data: {
      id: req.id || undefined, tenantId: ctx.tenantId, branchId: ctx.branchId,
      orderNumber, supplierId: req.supplierId, status: req.status || "APPROVED",
      totalAmount, notes: req.notes ?? null, createdById: ctx.userId, approvedById: ctx.userId,
      orderedAt: req.orderedAt ? new Date(req.orderedAt) : undefined, items: { create: items },
    }, include: { items: true } }));
  }

  async createPurchaseReceipt(ctx: TenantContext, req: any) {
    return normalize(await this.atomic.createPurchaseReceipt(ctx, req));
  }

  async getSales(ctx: TenantContext) {
    return normalize(await db.sale.findMany({ where: tenantWhere(ctx), include: { lines: true, payments: true }, orderBy: { soldAt: "desc" } }));
  }

  async getSaleById(ctx: TenantContext, id: string) {
    const row = await db.sale.findFirst({ where: { id, ...tenantWhere(ctx) }, include: { lines: true, payments: true } });
    if (!row) return null;
    return normalize(row);
  }

  async createPosSale(ctx: TenantContext, req: any) {
    return normalize(await this.atomic.createSale(ctx, req));
  }

  async createSaleReturn(ctx: TenantContext, req: any) {
    return normalize(await db.$transaction(async (tx: any) => {
      const original = req.originalSaleId ? await tx.sale.findFirst({ where: { id: req.originalSaleId, ...tenantWhere(ctx) }, include: { lines: true } }) : null;
      const count = await tx.return.count({ where: tenantWhere(ctx) });
      const returnNumber = req.returnNumber || `RET-MAIN-${String(count + 1).padStart(6, "0")}`;
      const lines = (req.items || req.lines || []).map((x: any) => ({
        id: x.id || randomUUID(), variantId: x.variantId, quantityReturned: Math.abs(x.quantityReturned ?? x.quantity ?? 0),
        refundUnitPrice: x.refundUnitPrice ?? x.unitPrice ?? 0,
        refundLineTotal: x.refundLineTotal ?? ((x.refundUnitPrice ?? x.unitPrice ?? 0) * Math.abs(x.quantityReturned ?? x.quantity ?? 0)),
        condition: x.condition || "GOOD",
      }));
      const total = lines.reduce((s: number, x: any) => s + Number(x.refundLineTotal || 0), 0);
      const record = await tx.return.create({ data: {
        id: req.id || undefined, tenantId: ctx.tenantId, branchId: ctx.branchId, returnNumber,
        originalSaleId: original?.id ?? req.originalSaleId ?? null, customerId: req.customerId ?? original?.customerId ?? null,
        reason: req.reason || "Customer return", refundType: req.refundType || "CASH",
        totalRefundAmount: req.totalRefundAmount ?? total, status: "COMPLETED",
        authorizedById: ctx.userId, lines: { create: lines },
      }, include: { lines: true } });
      for (const line of lines) {
        const variant = await tx.productVariant.findFirst({ where: { id: line.variantId, ...tenantWhere(ctx) } });
        if (!variant) throw new Error("RETURN_VARIANT_BOUNDARY_VIOLATION");
        const before = Number(variant.inventoryQuantity || 0);
        const after = before + Number(line.quantityReturned);
        await tx.productVariant.update({ where: { id: variant.id }, data: { inventoryQuantity: after } });
        await tx.stockLedger.create({ data: {
          tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: variant.id,
          movementType: "RETURN", quantityChange: Number(line.quantityReturned), quantity: Number(line.quantityReturned),
          quantityBefore: before, quantityAfter: after, unitCost: 0, totalCost: 0, referenceType: "RETURN",
          referenceId: record.id, occurredAt: new Date(), deviceId: req.deviceId || "web",
          operationId: req.operationId || record.id, idempotencyKey: `${req.idempotencyKey || record.id}-${variant.id}`,
        }});
      }
      return record;
    }));
  }

  async getReturns(ctx: TenantContext) {
    return normalize(await db.return.findMany({ where: tenantWhere(ctx), include: { lines: true }, orderBy: { createdAt: "desc" } }));
  }

  async openCashSession(ctx: TenantContext, req: any) {
    const existing = await db.cashSession.findFirst({ where: { ...tenantWhere(ctx), cashierId: req.cashierId || ctx.userId, status: { in: ["OPEN","ACTIVE","CLOSE_REQUESTED"] } } });
    if (existing) return normalize(existing);
    const count = await db.cashSession.count({ where: tenantWhere(ctx) });
    return normalize(await db.cashSession.create({ data: {
      id: req.id || undefined, tenantId: ctx.tenantId, branchId: ctx.branchId,
      sessionNumber: req.sessionNumber || `CS-MAIN-${String(count + 1).padStart(6, "0")}`,
      cashierId: req.cashierId || ctx.userId, openingCash: req.openingCash ?? 0, notes: req.notes ?? null,
      status: "OPEN",
    }}));
  }

  async getActiveCashSession(ctx: TenantContext) {
    const row = await db.cashSession.findFirst({ where: { ...tenantWhere(ctx), status: "OPEN" }, orderBy: { openedAt: "desc" } });
    return normalize(row);
  }

  async recordExpense(ctx: TenantContext, req: any) {
    return normalize(await this.atomic.recordExpense(ctx, req));
  }

  async closeCashSession(ctx: TenantContext, id: string, req: any) {
    const existing = await db.cashSession.findFirst({ where: { id, ...tenantWhere(ctx) } });
    if (!existing) throw new Error("Cash session not found");
    const closingCash = req.closingCash ?? req.actualCash ?? 0;
    const expectedCash = Number(existing.openingCash) + Number(existing.cashSalesTotal) - Number(existing.cashRefundsTotal) - Number(existing.cashExpensesTotal);
    return normalize(await db.cashSession.update({ where: { id }, data: {
      closingCash, actualCash: closingCash, expectedCash,
      variance: Number(closingCash) - expectedCash, closedAt: new Date(), status: "CLOSED", notes: req.notes ?? existing.notes,
    }}));
  }

  async getDashboardSummary(ctx: TenantContext) {
    const where = tenantWhere(ctx);
    const [sales, purchases, returns, expenses, customers, products] = await Promise.all([
      db.sale.aggregate({ where, _sum: { grandTotal: true } }),
      db.purchaseOrder.aggregate({ where, _sum: { totalAmount: true } }),
      db.return.aggregate({ where, _sum: { totalRefundAmount: true } }),
      db.expense.aggregate({ where, _sum: { amount: true } }),
      db.customer.count({ where }), db.product.count({ where }),
    ]);
    return { totalSales: Number(sales._sum.grandTotal || 0), totalPurchases: Number(purchases._sum.totalAmount || 0),
      totalReturns: Number(returns._sum.totalRefundAmount || 0), totalExpenses: Number(expenses._sum.amount || 0),
      customerCount: customers, productCount: products };
  }

  async requireEntity(model: string, ctx: TenantContext, id: string) {
    if (!id) throw new Error(`${model} id is required`);
    const row = await db[model].findUnique({ where: { id } });
    if (!row || row.tenantId !== ctx.tenantId || (row.branchId !== undefined && row.branchId !== null && row.branchId !== ctx.branchId)) {
      throw new Error(`${model.toUpperCase()}_BOUNDARY_VIOLATION`);
    }
    return row;
  }
}

export class PrismaWorkforceRepository {
  async getDepartments(ctx: TenantContext) { return normalize(await db.department.findMany({ where: tenantWhere(ctx), orderBy: { name: "asc" } })); }
  async createDepartment(ctx: TenantContext, req: any) { return normalize(await db.department.create({ data: { id:req.id||undefined, tenantId:ctx.tenantId, branchId:req.branchId||ctx.branchId, name:req.name, code:req.code.toUpperCase(), description:req.description??null, managerId:req.managerId??null } })); }
  async getJobPositions(ctx: TenantContext) { return normalize(await db.jobPosition.findMany({ where:{tenantId:ctx.tenantId}, orderBy:{title:"asc"} })); }
  async createJobPosition(ctx: TenantContext, req: any) { return normalize(await db.jobPosition.create({ data: { id:req.id||undefined, tenantId:ctx.tenantId, departmentId:req.departmentId??null, title:req.title, positionCode:req.positionCode.toUpperCase(), jobDescription:req.jobDescription??null, payClassification:req.payClassification||"SALARY", defaultSalary:req.defaultSalary??0, defaultHourlyRate:req.defaultHourlyRate??0, defaultCommissionRate:req.defaultCommissionRate??0, schedulePolicy:req.schedulePolicy??null } })); }

  async getEmployees(ctx: TenantContext) { return normalize(await db.employee.findMany({ where:tenantWhere(ctx,false), orderBy:{createdAt:"asc"} })); }
  async getEmployeeById(ctx: TenantContext, id: string) { return findOne("employee",id,ctx,false); }
  async createEmployee(ctx: TenantContext, req: any) {
    const number = req.employeeNumber || `EMP-${String((await db.employee.count({where:{tenantId:ctx.tenantId}}))+1).padStart(5,"0")}`;
    return normalize(await db.$transaction(async (tx:any)=>{
      const employee = await tx.employee.create({data:{ id:req.id||undefined, tenantId:ctx.tenantId, branchId:req.branchId||ctx.branchId, userId:req.userId??null,
        employeeNumber:number, firstName:req.firstName, lastName:req.lastName, preferredName:req.preferredName??null, phone:req.phone??null, email:req.email??null,
        address:req.address??null, emergencyContact:req.emergencyContact??null, dateOfBirth:req.dateOfBirth?new Date(req.dateOfBirth):null,
        hireDate:req.hireDate?new Date(req.hireDate):undefined, departmentId:req.departmentId??null, positionId:req.positionId??null, managerId:req.managerId??null,
        workType:req.workType||"FULL_TIME", contractType:req.contractType||"PERMANENT", pinCodeHash:null }});
      const initialRecord = await tx.employmentRecord.create({data:{ tenantId:ctx.tenantId, employeeId:employee.id, effectiveDate:employee.hireDate,
        changeType:"HIRE", departmentId:employee.departmentId, positionId:employee.positionId, branchId:employee.branchId, managerId:employee.managerId,
        contractType:employee.contractType, payRate:employee.baseSalary, createdById:ctx.userId }});
      return {employee,initialRecord};
    }));
  }

  async updateEmployee(ctx: TenantContext, id:string, req:any, reason?:string) {
    const existing = await this.requireEntity("employee",ctx,id,false);
    const data=pick(req,["firstName","lastName","preferredName","phone","email","address","emergencyContact","departmentId","positionId","branchId","managerId","status","workType","contractType","baseSalary","hourlyRate","commissionRate","profilePhotoUrl"]);
    const updated=await db.employee.update({where:{id},data});
    if(reason || data.departmentId || data.positionId || data.status || data.baseSalary || data.hourlyRate) {
      await db.employmentRecord.create({data:{tenantId:ctx.tenantId,employeeId:id,effectiveDate:new Date(),changeType:"STATUS_CHANGE",
        departmentId:updated.departmentId,positionId:updated.positionId,branchId:updated.branchId,managerId:updated.managerId,contractType:updated.contractType,
        payRate:updated.baseSalary||updated.hourlyRate||null,reason:reason||null,createdById:ctx.userId}});
    }
    return normalize(updated);
  }
  async getEmploymentHistory(ctx:TenantContext,id:string){await this.requireEntity("employee",ctx,id,false);return normalize(await db.employmentRecord.findMany({where:{tenantId:ctx.tenantId,employeeId:id},orderBy:{effectiveDate:"asc"}}));}

  async getShiftTemplates(ctx:TenantContext){return normalize(await db.shiftTemplate.findMany({where:tenantWhere(ctx),orderBy:{name:"asc"}}));}
  async createShiftTemplate(ctx:TenantContext,req:any){return normalize(await db.shiftTemplate.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:req.branchId||ctx.branchId,departmentId:req.departmentId??null,name:req.name,startTime:req.startTime,endTime:req.endTime,breakDurationMinutes:req.breakDurationMinutes??60,workdays:req.workdays||[],requiredHeadcount:req.requiredHeadcount??1}}));}
  async getSchedules(ctx:TenantContext){return normalize(await db.workforceSchedule.findMany({where:tenantWhere(ctx),orderBy:{date:"asc"}}));}
  async createSchedule(ctx:TenantContext,req:any){return normalize(await db.workforceSchedule.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,shiftTemplateId:req.shiftTemplateId??null,date:new Date(req.date),startTime:req.startTime,endTime:req.endTime,status:req.status||"PUBLISHED",notes:req.notes??null}}));}

  async getAttendanceRecords(ctx:TenantContext){return normalize(await db.attendanceRecord.findMany({where:tenantWhere(ctx),orderBy:{workDate:"desc"}}));}
  async clockIn(ctx:TenantContext,req:any){
    const existing=await db.attendanceRecord.findUnique({where:{tenantId_idempotencyKey:{tenantId:ctx.tenantId,idempotencyKey:req.idempotencyKey}}}).catch(()=>null);
    if(existing)return normalize(existing);
    return normalize(await db.attendanceRecord.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,scheduleId:req.scheduleId??null,workDate:req.workDate?new Date(req.workDate):new Date(),clockIn:req.clockIn?new Date(req.clockIn):new Date(),breakMinutes:req.breakMinutes??0,status:req.status||"PRESENT",method:req.method||"STANDARD",pinVerified:req.pinVerified||false,qrCode:req.qrCode??null,latitude:req.latitude??null,longitude:req.longitude??null,deviceId:req.deviceId??null,idempotencyKey:req.idempotencyKey,supervisorApproved:false}}));
  }
  async clockOut(ctx:TenantContext,id:string,req:any){
    const existing=await this.requireEntity("attendanceRecord",ctx,id);
    const out=req.clockOut?new Date(req.clockOut):new Date();
    const minutes=Math.max(0,Math.floor((out.getTime()-new Date(existing.clockIn).getTime())/60000));
    return normalize(await db.attendanceRecord.update({where:{id},data:{clockOut:out,regularMinutes:minutes,status:req.status||existing.status,breakMinutes:req.breakMinutes??existing.breakMinutes}}));
  }

  async getTimesheets(ctx:TenantContext){return normalize(await db.timesheet.findMany({where:tenantWhere(ctx),orderBy:{periodStart:"desc"}}));}
  async generateTimesheet(ctx:TenantContext,req:any){
    const attend=await db.attendanceRecord.findMany({where:{tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,workDate:{gte:new Date(req.periodStart),lte:new Date(req.periodEnd)}}});
    const total=attend.reduce((s:number,a:any)=>s+Number(a.regularMinutes||0)+Number(a.overtimeMinutes||0),0);
    return normalize(await db.timesheet.upsert({where:{tenantId_employeeId_periodStart_periodEnd:{tenantId:ctx.tenantId,employeeId:req.employeeId,periodStart:new Date(req.periodStart),periodEnd:new Date(req.periodEnd)}},
      create:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,periodStart:new Date(req.periodStart),periodEnd:new Date(req.periodEnd),totalWorkedMinutes:total,totalRegularMinutes:total,status:"DRAFT"},
      update:{totalWorkedMinutes:total,totalRegularMinutes:total,updatedAt:new Date()}}));
  }
  async approveTimesheet(ctx:TenantContext,id:string){await this.requireEntity("timesheet",ctx,id);return normalize(await db.timesheet.update({where:{id},data:{status:"APPROVED",approvedAt:new Date(),approvedById:ctx.userId}}));}

  async getLeaveTypes(ctx:TenantContext){return normalize(await db.leaveType.findMany({where:{tenantId:ctx.tenantId},orderBy:{name:"asc"}}));}
  async createLeaveType(ctx:TenantContext,req:any){return normalize(await db.leaveType.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,name:req.name,code:req.code,isPaid:req.isPaid??true,defaultAllowanceDays:req.defaultAllowanceDays??21,requiresProof:req.requiresProof??false}}));}
  async getLeaveRequests(ctx:TenantContext){return normalize(await db.leaveRequest.findMany({where:tenantWhere(ctx),orderBy:{startDate:"desc"}}));}
  async requestLeave(ctx:TenantContext,req:any){return normalize(await db.leaveRequest.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,leaveTypeId:req.leaveTypeId,startDate:new Date(req.startDate),endDate:new Date(req.endDate),totalDays:req.totalDays??0,partialDay:req.partialDay??null,reason:req.reason??null,status:"PENDING",documentUrl:req.documentUrl??null}}));}
  async approveLeave(ctx:TenantContext,id:string,approved:boolean,reason?:string){await this.requireEntity("leaveRequest",ctx,id);return normalize(await db.leaveRequest.update({where:{id},data:{status:approved?"APPROVED":"REJECTED",approvedById:approved?ctx.userId:null,approvedAt:approved?new Date():null,rejectionReason:approved?null:(reason||null)}}));}

  async getTasks(ctx:TenantContext){return normalize(await db.workforceTask.findMany({where:tenantWhere(ctx),orderBy:{createdAt:"desc"}}));}
  async createTask(ctx:TenantContext,req:any){return normalize(await db.workforceTask.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,title:req.title,description:req.description??null,taskType:req.taskType||"GENERAL",priority:req.priority||"MEDIUM",status:req.status||"BACKLOG",assignedEmployeeId:req.assignedEmployeeId??null,assignedTeam:req.assignedTeam??null,dueDate:req.dueDate?new Date(req.dueDate):null,checklist:req.checklist||[],attachments:req.attachments||[],relatedEntityType:req.relatedEntityType??null,relatedEntityId:req.relatedEntityId??null}}));}
  async updateTask(ctx:TenantContext,id:string,req:any){await this.requireEntity("workforceTask",ctx,id);return normalize(await db.workforceTask.update({where:{id},data:pick(req,["title","description","taskType","priority","status","assignedEmployeeId","assignedTeam","dueDate","checklist","attachments","relatedEntityType","relatedEntityId","completedAt","verifiedById","verifiedAt"])}));}
  async getWorkOrders(ctx:TenantContext){return normalize(await db.workOrder.findMany({where:tenantWhere(ctx),orderBy:{createdAt:"desc"}}));}
  async createWorkOrder(ctx:TenantContext,req:any){const c=await db.workOrder.count({where:tenantWhere(ctx)});return normalize(await db.workOrder.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,workOrderNumber:req.workOrderNumber||`WO-${String(c+1).padStart(6,"0")}`,customerId:req.customerId??null,projectId:req.projectId??null,title:req.title,description:req.description??null,priority:req.priority||"MEDIUM",status:req.status||"DRAFT",scheduledStart:req.scheduledStart?new Date(req.scheduledStart):null,scheduledEnd:req.scheduledEnd?new Date(req.scheduledEnd):null,assignedEmployeeId:req.assignedEmployeeId??null,laborHours:req.laborHours??0,laborRate:req.laborRate??0,laborCostTotal:req.laborCostTotal??0,materialsCostTotal:req.materialsCostTotal??0,grandTotal:req.grandTotal??0,notes:req.notes??null,approvedById:req.approvedById??null,approvedAt:req.approvedAt?new Date(req.approvedAt):null}}));}
  async updateWorkOrder(ctx:TenantContext,id:string,req:any){await this.requireEntity("workOrder",ctx,id);return normalize(await db.workOrder.update({where:{id},data:pick(req,["title","description","priority","status","scheduledStart","scheduledEnd","assignedEmployeeId","laborHours","laborRate","laborCostTotal","materialsCostTotal","grandTotal","notes","approvedById","approvedAt"])}));}

  async getSkills(ctx:TenantContext,id:string){await this.requireEntity("employee",ctx,id,false);return normalize(await db.employeeSkill.findMany({where:{tenantId:ctx.tenantId,employeeId:id}}));}
  async addSkill(ctx:TenantContext,id:string,req:any){await this.requireEntity("employee",ctx,id,false);return normalize(await db.employeeSkill.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,employeeId:id,skillName:req.skillName,proficiencyLevel:req.proficiencyLevel||"INTERMEDIATE",yearsExperience:req.yearsExperience??null}}));}
  async getCertifications(ctx:TenantContext,id?:string){return normalize(await db.employeeCertification.findMany({where:{tenantId:ctx.tenantId,...(id?{employeeId:id}:{})},orderBy:{expiryDate:"asc"}}));}
  async addCertification(ctx:TenantContext,id:string,req:any){await this.requireEntity("employee",ctx,id,false);return normalize(await db.employeeCertification.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,employeeId:id,certificationName:req.certificationName,issuingBody:req.issuingBody,certificateNumber:req.certificateNumber??null,issueDate:new Date(req.issueDate),expiryDate:req.expiryDate?new Date(req.expiryDate):null,isVerified:req.isVerified||false,verifiedById:req.verifiedById??null,verifiedAt:req.verifiedAt?new Date(req.verifiedAt):null,documentUrl:req.documentUrl??null}}));}
  async getPerformanceReviews(ctx:TenantContext,id?:string){return normalize(await db.performanceReview.findMany({where:{tenantId:ctx.tenantId,...(id?{employeeId:id}:{})},orderBy:{createdAt:"desc"}}));}
  async createPerformanceReview(ctx:TenantContext,req:any){return normalize(await db.performanceReview.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,reviewerId:req.reviewerId||ctx.userId,reviewPeriod:req.reviewPeriod,rating:req.rating,strengths:req.strengths??null,improvements:req.improvements??null,goals:req.goals||[],status:req.status||"COMPLETED",submittedAt:req.submittedAt?new Date(req.submittedAt):new Date(),acknowledgedAt:req.acknowledgedAt?new Date(req.acknowledgedAt):null}}));}
  async getCommissions(ctx:TenantContext){return normalize(await db.commissionRecord.findMany({where:tenantWhere(ctx),orderBy:{createdAt:"desc"}}));}
  async recordCommission(ctx:TenantContext,req:any){const amount=req.commissionAmount??(Number(req.salesAmount||0)*Number(req.commissionRate||0)/100);return normalize(await db.commissionRecord.create({data:{id:req.id||undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId:req.employeeId,saleId:req.saleId??null,workOrderId:req.workOrderId??null,period:req.period,salesAmount:req.salesAmount||0,commissionRate:req.commissionRate||0,commissionAmount:amount,status:"PENDING"}}));}
  async approveCommission(ctx:TenantContext,id:string){await this.requireEntity("commissionRecord",ctx,id);return normalize(await db.commissionRecord.update({where:{id},data:{status:"APPROVED",approvedById:ctx.userId,approvedAt:new Date()}}));}
  async getPayrollInputs(ctx:TenantContext){return normalize(await db.payrollInput.findMany({where:tenantWhere(ctx),orderBy:{periodStart:"desc"}}));}
  async generatePayrollInputFromTimesheet(ctx:TenantContext,employeeId:string,timesheetId:string){const ts=await db.timesheet.findFirst({where:{id:timesheetId,...tenantWhere(ctx)}});if(!ts||ts.employeeId!==employeeId)throw new Error("TIMESHEET_BOUNDARY_VIOLATION");const emp=await db.employee.findFirst({where:{id:employeeId,tenantId:ctx.tenantId}});const regularHours=Number(ts.totalRegularMinutes||0)/60;const overtimeHours=Number(ts.totalOvertimeMinutes||0)/60;const regularPay=regularHours*Number(emp?.hourlyRate||0);const overtimePay=overtimeHours*Number(emp?.hourlyRate||0)*1.5;return normalize(await db.payrollInput.upsert({where:{tenantId_employeeId_periodStart_periodEnd:{tenantId:ctx.tenantId,employeeId,periodStart:ts.periodStart,periodEnd:ts.periodEnd}},create:{id:undefined,tenantId:ctx.tenantId,branchId:ctx.branchId,employeeId,periodStart:ts.periodStart,periodEnd:ts.periodEnd,basicHours:regularHours,overtimeHours,regularPay,overtimePay,grossPay:regularPay+overtimePay,status:"CALCULATED"},update:{basicHours:regularHours,overtimeHours,regularPay,overtimePay,grossPay:regularPay+overtimePay}}));}
  async approvePayrollInput(ctx:TenantContext,id:string){await this.requireEntity("payrollInput",ctx,id);return normalize(await db.payrollInput.update({where:{id},data:{status:"APPROVED",approvedById:ctx.userId,approvedAt:new Date()}}));}
  async getDashboardSummary(ctx:TenantContext){const w=tenantWhere(ctx);const [employees,active,attendance,timesheets]=await Promise.all([db.employee.count({where:{tenantId:ctx.tenantId}}),db.employee.count({where:{tenantId:ctx.tenantId,status:"ACTIVE"}}),db.attendanceRecord.count({where:w}),db.timesheet.count({where:w})]);return {totalEmployees:employees,activeEmployees:active,attendanceRecords:attendance,timesheets};}
  async getAnalyticsReport(ctx:TenantContext,period="2026-08"){const commissions=await db.commissionRecord.aggregate({where:{...tenantWhere(ctx),period},_sum:{commissionAmount:true,salesAmount:true}});return {period,totalSales:Number(commissions._sum.salesAmount||0),totalCommission:Number(commissions._sum.commissionAmount||0)};}

  private async requireEntity(model:string,ctx:TenantContext,id:string,branch=true){const row=await db[model].findUnique({where:{id}});if(!row||row.tenantId!==ctx.tenantId||((branch&&row.branchId!=null)&&row.branchId!==ctx.branchId))throw new Error(`${model.toUpperCase()}_BOUNDARY_VIOLATION`);return row;}
}

export class PrismaPluginRepository {
  async activatePlugin(ctx:TenantContext,pluginId:string,pluginVersion:string,configuration:any={}) {
    return normalize(await db.pluginActivation.upsert({where:{tenantId_pluginId:{tenantId:ctx.tenantId,pluginId}},create:{id:randomUUID(),tenantId:ctx.tenantId,pluginId,pluginVersion,state:"ACTIVE",enabledAt:new Date(),configuration},update:{pluginVersion,state:"ACTIVE",enabledAt:new Date(),disabledAt:null,configuration}}));
  }
  async deactivatePlugin(ctx:TenantContext,pluginId:string){const row=await db.pluginActivation.findUnique({where:{tenantId_pluginId:{tenantId:ctx.tenantId,pluginId}}});if(!row)throw new Error("Plugin activation not found");return normalize(await db.pluginActivation.update({where:{id:row.id},data:{state:"DISABLED",disabledAt:new Date()}}));}
  async getTenantActivations(ctx:TenantContext){return normalize(await db.pluginActivation.findMany({where:{tenantId:ctx.tenantId},orderBy:{createdAt:"asc"}}));}
  async isPluginActive(ctx:TenantContext,pluginId:string){const row=await db.pluginActivation.findUnique({where:{tenantId_pluginId:{tenantId:ctx.tenantId,pluginId}}});return !!row&&["ACTIVE","ENABLED"].includes(row.state);}
  async setBranchPluginConfig(ctx:TenantContext,pluginId:string,config:any){return normalize(await db.branchPluginConfig.upsert({where:{tenantId_branchId_pluginId:{tenantId:ctx.tenantId,branchId:ctx.branchId,pluginId}},create:{id:randomUUID(),tenantId:ctx.tenantId,branchId:ctx.branchId,pluginId,isEnabled:config.isEnabled!==false,configuration:config.configuration||config},update:{isEnabled:config.isEnabled!==false,configuration:config.configuration||config}}));}
  async setConfigEntry(ctx:TenantContext,entry:any){const key=entry.key;const scope=entry.scope||"TENANT";const existing=await db.pluginConfigEntry.findFirst({where:{tenantId:ctx.tenantId,pluginId:entry.pluginId,scope,key}});return normalize(existing?await db.pluginConfigEntry.update({where:{id:existing.id},data:{value:entry.value,version:{increment:1}}}):await db.pluginConfigEntry.create({data:{id:entry.id||randomUUID(),tenantId:ctx.tenantId,branchId:ctx.branchId,userId:entry.userId??null,pluginId:entry.pluginId,scope,key,value:entry.value,version:1}}));}
  async getConfigEntries(ctx:TenantContext,pluginId:string){return normalize(await db.pluginConfigEntry.findMany({where:{pluginId,OR:[{tenantId:null},{tenantId:ctx.tenantId}],AND:[{OR:[{branchId:null},{branchId:ctx.branchId}]}]}}));}
  async logPluginEvent(ctx:TenantContext,event:any){return normalize(await db.pluginEventLog.create({data:{id:randomUUID(),tenantId:ctx.tenantId,branchId:ctx.branchId,pluginId:event.pluginId,eventType:event.eventType,entityType:event.entityType??null,entityId:event.entityId??null,operationId:event.operationId||randomUUID(),idempotencyKey:event.idempotencyKey||randomUUID(),payload:event.payload||{},actorId:event.actorId||ctx.userId}}));}
  async recordUsage(ctx:TenantContext,pluginId:string,metricName:string,quantity:number){return this.logPluginEvent(ctx,{pluginId,eventType:"USAGE_RECORDED",entityType:"PluginUsageRecord",payload:{metricName,quantity},actorId:ctx.userId});}
  async createSpecialized(ctx:TenantContext,model:string,payload:any){
    const { id: requestedId, tenantId: _tenantId, branchId: _branchId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = payload || {};
    return normalize(await db[model].create({ data: { id: requestedId || undefined, tenantId:ctx.tenantId, branchId:ctx.branchId, ...fields } }));
  }
  async createRestaurantTable(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"restaurantTableRecord",req);}
  async getRestaurantTables(ctx:TenantContext){return normalize(await db.restaurantTableRecord.findMany({where:tenantWhere(ctx),orderBy:{tableNumber:"asc"}}));}
  async createKitchenTicket(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"kitchenTicketRecord",req);}
  async createGarageVehicle(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"garageVehicleRecord",req);}
  async createGarageWorkOrder(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"garageWorkOrderRecord",req);}
  async createConstructionProject(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"constructionProjectRecord",req);}
  async createTelecomSite(ctx:TenantContext,req:any){return this.createSpecialized(ctx,"telecomSiteRecord",req);}
  async createPrescription(ctx:TenantContext,req:any){return this.logPluginEvent(ctx,{pluginId:"pharmacy",eventType:"PRESCRIPTION_CREATED",entityType:"PharmacyPrescription",entityId:req.id||randomUUID(),payload:req,actorId:ctx.userId});}
  async getPrescriptions(ctx:TenantContext){const rows=await db.pluginEventLog.findMany({where:{tenantId:ctx.tenantId,pluginId:"pharmacy",eventType:"PRESCRIPTION_CREATED"},orderBy:{timestamp:"desc"}});return rows.map((r:any)=>normalize(r.payload));}
  async setWholesaleTierRule(ctx:TenantContext,req:any){return this.logPluginEvent(ctx,{pluginId:"wholesale",eventType:"TIER_RULE_SET",entityType:"WholesaleProductTierRule",entityId:req.variantId||req.productId||req.id||randomUUID(),payload:req,actorId:ctx.userId});}
  async getWholesaleTierRule(ctx:TenantContext,variantId:string){const row=await db.pluginEventLog.findFirst({where:{tenantId:ctx.tenantId,pluginId:"wholesale",eventType:"TIER_RULE_SET",entityId:variantId},orderBy:{timestamp:"desc"}});return row?normalize(row.payload):null;}
}

export class PrismaTelecomRepository {
  private where(ctx:TenantContext){return {tenantId:ctx.tenantId};}
  private withBranch(ctx:TenantContext){return {tenantId:ctx.tenantId,branchId:ctx.branchId};}
  async create(model:string,ctx:TenantContext,input:any){
    const { id, tenantId: _tenantId, branchId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = input || {};
    return normalize(await db[model].create({
      data: { id: id || undefined, tenantId: ctx.tenantId, branchId: branchId ?? ctx.branchId, ...fields },
    }));
  }
  async createContract(ctx:TenantContext,input:any){return this.create("telecomCustomerContractRecord",ctx,input);}
  async getContracts(ctx:TenantContext){return normalize(await db.telecomCustomerContractRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async createProject(ctx:TenantContext,input:any){return this.create("telecomProjectRecord",ctx,input);}
  async getProjects(ctx:TenantContext){return normalize(await db.telecomProjectRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async getProjectById(ctx:TenantContext,id:string){return normalize(await db.telecomProjectRecord.findFirst({where:{id,tenantId:ctx.tenantId}}));}
  async createSite(ctx:TenantContext,input:any){return this.create("telecomSiteRecord",ctx,input);}
  async getSites(ctx:TenantContext){return normalize(await db.telecomSiteRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async getSiteById(ctx:TenantContext,id:string){return normalize(await db.telecomSiteRecord.findFirst({where:{id,tenantId:ctx.tenantId}}));}
  async searchSitesNear(ctx:TenantContext,lat:number,lon:number,radiusKm:number){const sites=await this.getSites(ctx);return sites.filter((s:any)=>{const dlat=(Number(s.latitude)-lat)*111;const dlon=(Number(s.longitude)-lon)*111*Math.cos(lat*Math.PI/180);return Math.sqrt(dlat*dlat+dlon*dlon)<=radiusKm;});}
  async createRanSector(ctx:TenantContext,input:any){return this.create("telecomRanSectorRecord",ctx,input);}
  async getRanSectorsBySite(ctx:TenantContext,siteId:string){return normalize(await db.telecomRanSectorRecord.findMany({where:{tenantId:ctx.tenantId,siteId},orderBy:{sectorIndex:"asc"}}));}
  async getRanSectors(ctx:TenantContext){return normalize(await db.telecomRanSectorRecord.findMany({where:{tenantId:ctx.tenantId},orderBy:{sectorIndex:"asc"}}));}
  async createMicrowaveLink(ctx:TenantContext,input:any){return this.create("telecomMicrowaveLinkRecord",ctx,input);}
  async getMicrowaveLinks(ctx:TenantContext){return normalize(await db.telecomMicrowaveLinkRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async createWorkOrder(ctx:TenantContext,input:any){return this.create("telecomWorkOrderRecord",ctx,input);}
  async getWorkOrders(ctx:TenantContext){return normalize(await db.telecomWorkOrderRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async completeWorkOrder(ctx:TenantContext,id:string,notes?:string){const row=await db.telecomWorkOrderRecord.findFirst({where:{id,tenantId:ctx.tenantId}});if(!row)throw new Error("Telecom work order not found");return normalize(await db.telecomWorkOrderRecord.update({where:{id},data:{status:"COMPLETED",completionNotes:notes||null,actualEndTime:new Date()}}));}
  async recordTest(ctx:TenantContext,input:any){return this.create("telecomTestRecordModel",ctx,input);}
  async createSiteAcceptance(ctx:TenantContext,input:any){return this.create("telecomAcceptanceRecordModel",ctx,input);}
  async createMaintenanceTicket(ctx:TenantContext,input:any){return this.create("telecomMaintenanceTicketRecord",ctx,input);}
  async getMaintenanceTickets(ctx:TenantContext){return normalize(await db.telecomMaintenanceTicketRecord.findMany({where:this.where(ctx),orderBy:{createdAt:"desc"}}));}
  async createKmlImport(ctx:TenantContext,input:any){return this.create("telecomKmlImportRecord",ctx,input);}
  async getKmlImport(ctx:TenantContext,id:string){return normalize(await db.telecomKmlImportRecord.findFirst({where:{id,tenantId:ctx.tenantId}}));}
}

export class PrismaMonetizationRepository {
  private scope(ctx?:TenantContext){return ctx?.tenantId||"GLOBAL";}
  private async get(ctx:TenantContext|undefined,type:string,key:string){const row=await db.saasDataRecord.findFirst({where:{scopeKey:this.scope(ctx),entityType:type,recordKey:key}});return row?normalize(row.payload):null;}
  private async put(ctx:TenantContext|undefined,type:string,key:string,payload:any){const scopeKey=this.scope(ctx);return normalize((await db.saasDataRecord.upsert({where:{scopeKey_entityType_recordKey:{scopeKey,entityType:type,recordKey:key}},create:{id:randomUUID(),scopeKey,entityType:type,recordKey:key,payload,status:String(payload.status||"ACTIVE")},update:{payload,status:String(payload.status||"ACTIVE"),updatedAt:new Date()}})).payload);}
  async getPlans(){const rows=await db.saasDataRecord.findMany({where:{scopeKey:"GLOBAL",entityType:"PLAN",status:"ACTIVE"},orderBy:{createdAt:"asc"}});return rows.map((r:any)=>normalize(r.payload));}
  async getPlanById(id:string){return this.get(undefined,"PLAN",id);}
  async createPlan(req:any){const id=req.id||randomUUID();return this.put(undefined,"PLAN",id,{...req,id,status:"ACTIVE",version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}
  async getSubscription(ctx:TenantContext){const rows=await db.saasDataRecord.findMany({where:{scopeKey:ctx.tenantId,entityType:"SUBSCRIPTION"},orderBy:{updatedAt:"desc"},take:1});return rows[0]?normalize(rows[0].payload):null;}
  async createSubscription(ctx:TenantContext,req:any){const plan=await this.getPlanById(req.planId);if(!plan)throw new Error("Plan not found");const now=new Date().toISOString();const id=randomUUID();return this.put(ctx,"SUBSCRIPTION",id,{...req,id,tenantId:ctx.tenantId,planId:plan.id,planCode:plan.code,planVersion:plan.version,status:req.startTrial&&plan.trialEligibility?"TRIAL":"ACTIVE",currency:req.currency||plan.currency,basePrice:plan.basePrice,currentPeriodPrice:plan.basePrice,startDate:now,currentPeriodStart:now,updatedAt:now,createdAt:now});}
  async changePlan(ctx:TenantContext,id:string,req:any){const sub=await this.get(ctx,"SUBSCRIPTION",id);if(!sub)throw new Error("Subscription not found");const plan=await this.getPlanById(req.planId);if(!plan)throw new Error("Plan not found");return this.put(ctx,"SUBSCRIPTION",id,{...sub,...req,planId:plan.id,planCode:plan.code,planVersion:plan.version,updatedAt:new Date().toISOString()});}
  async cancelSubscription(ctx:TenantContext,id:string,reason:string){const sub=await this.get(ctx,"SUBSCRIPTION",id);if(!sub)throw new Error("Subscription not found");return this.put(ctx,"SUBSCRIPTION",id,{...sub,status:"CANCELLED",cancelledAt:new Date().toISOString(),cancelReason:reason,updatedAt:new Date().toISOString()});}
  async checkEntitlement(ctx:TenantContext,featureKey:string,currentUsage?:number){const sub=await this.getSubscription(ctx);if(!sub)return {allowed:false,reason:"NO_ACTIVE_SUBSCRIPTION",featureKey};const plan=await this.getPlanById(sub.planId);const allowed=!!plan&&Array.isArray(plan.featureEntitlements)&&plan.featureEntitlements.includes(featureKey);return {allowed,featureKey,reason:allowed?"ENTITLED":"FEATURE_NOT_INCLUDED",currentUsage};}
  async recordUsage(ctx:TenantContext,req:any){return this.put(ctx,"METER_EVENT",req.id||randomUUID(),{...req,id:req.id||randomUUID(),tenantId:ctx.tenantId,recordedAt:new Date().toISOString()});}
  async getUsageAggregate(ctx:TenantContext,meterType:string){const rows=await db.saasDataRecord.findMany({where:{scopeKey:ctx.tenantId,entityType:"METER_EVENT"}});const vals=rows.map((r:any)=>normalize(r.payload)).filter((x:any)=>x.meterType===meterType);return {meterType,totalUsage:vals.reduce((s:number,x:any)=>s+Number(x.quantity||0),0),events:vals.length};}
  async createInvoice(ctx:TenantContext,subscriptionId:string,couponCode?:string){const sub=await this.get(ctx,"SUBSCRIPTION",subscriptionId);if(!sub)throw new Error("Subscription not found");const id=randomUUID();const now=new Date().toISOString();return this.put(ctx,"BILLING_INVOICE",id,{id,tenantId:ctx.tenantId,subscriptionId,total:Number(sub.currentPeriodPrice||sub.basePrice||0),currency:sub.currency||"TZS",status:"OPEN",couponCode:couponCode||null,issuedAt:now,dueAt:now,createdAt:now,updatedAt:now});}
  async getInvoices(ctx:TenantContext){const rows=await db.saasDataRecord.findMany({where:{scopeKey:ctx.tenantId,entityType:"BILLING_INVOICE"},orderBy:{createdAt:"desc"}});return rows.map((r:any)=>normalize(r.payload));}
  async getInvoiceById(ctx:TenantContext,id:string){return this.get(ctx,"BILLING_INVOICE",id);}
  async processPayment(ctx:TenantContext,req:any){const id=req.id||randomUUID();return this.put(ctx,"BILLING_PAYMENT",id,{...req,id,tenantId:ctx.tenantId,status:"COMPLETED",processedAt:new Date().toISOString()});}
  async getPayments(ctx:TenantContext){const rows=await db.saasDataRecord.findMany({where:{scopeKey:ctx.tenantId,entityType:"BILLING_PAYMENT"},orderBy:{createdAt:"desc"}});return rows.map((r:any)=>normalize(r.payload));}
  async getSaaSKpis(){const rows=await db.saasDataRecord.findMany({where:{entityType:"SUBSCRIPTION"}});const active=rows.filter((r:any)=>["ACTIVE","TRIAL"].includes(r.status)).length;return {activeSubscriptions:active,totalSubscriptions:rows.length};}
}
