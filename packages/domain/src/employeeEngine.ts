import type {
  Employee,
  EmploymentRecord,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  TenantContext,
} from "@kwakopos2/contracts";
import { assertEmployeeTenantOwnership } from "./workforceInvariants.js";
import { randomUUID } from "crypto";
import { Algorithm, hashSync as argon2HashSync, verifySync as argon2VerifySync } from "@node-rs/argon2";

export class EmployeeEngine {
  /**
   * Hashes a 4-6 digit employee PIN using Argon2id with a unique random salt.
   * Legacy SHA-256/MD5 PIN hashes are intentionally not generated or accepted.
   */
  static hashPin(pin: string): string {
    if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN must contain 4-6 digits.");
    return argon2HashSync(pin, {
      algorithm: Algorithm.Argon2id,
      memoryCost: Number(process.env.KWAKOPOS_PIN_ARGON2_MEMORY_COST || 19456),
      timeCost: Number(process.env.KWAKOPOS_PIN_ARGON2_TIME_COST || 2),
      parallelism: Number(process.env.KWAKOPOS_PIN_ARGON2_PARALLELISM || 1),
      outputLen: 32,
    });
  }

  /**
   * Verifies an employee PIN. Only Argon2id hashes are accepted; legacy hashes
   * fail closed and therefore cannot be used as an offline authorization fallback.
   */
  static verifyPin(pin: string, storedHash?: string | null): boolean {
    if (!/^\d{4,6}$/.test(pin) || !storedHash || !storedHash.startsWith("$argon2id$")) return false;
    try {
      return argon2VerifySync(storedHash, pin);
    } catch {
      return false;
    }
  }

  /**
   * Generates next sequential employee number: EMP-0001, EMP-0002...
   */
  static formatEmployeeNumber(sequenceNumber: number): string {
    return `EMP-${String(sequenceNumber).padStart(4, "0")}`;
  }

  /**
   * Creates an Employee entity and an initial HIRE EmploymentRecord.
   */
  static createEmployee(
    ctx: TenantContext,
    req: CreateEmployeeRequest,
    sequence: number
  ): { employee: Employee; initialRecord: EmploymentRecord } {
    const employeeId = req.id || randomUUID();
    const now = new Date().toISOString();
    const employeeNumber = req.employeeNumber || this.formatEmployeeNumber(sequence);

    const employee: Employee = {
      id: employeeId,
      tenantId: ctx.tenantId,
      branchId: req.branchId || ctx.branchId,
      userId: req.userId || null,
      employeeNumber,
      firstName: req.firstName,
      lastName: req.lastName,
      preferredName: req.preferredName || null,
      phone: req.phone || null,
      email: req.email || null,
      address: req.address || null,
      emergencyContact: req.emergencyContact || null,
      dateOfBirth: req.dateOfBirth || null,
      status: "ACTIVE",
      hireDate: req.hireDate || now,
      terminationDate: null,
      departmentId: req.departmentId || null,
      positionId: req.positionId || null,
      managerId: req.managerId || null,
      workType: req.workType || "FULL_TIME",
      contractType: req.contractType || "PERMANENT",
      baseSalary: req.baseSalary || 0,
      hourlyRate: req.hourlyRate || 0,
      commissionRate: req.commissionRate || 0,
      pinCodeHash: req.pinCode ? this.hashPin(req.pinCode) : null,
      profilePhotoUrl: null,
      createdAt: now,
      updatedAt: now,
    };

    const initialRecord: EmploymentRecord = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      employeeId,
      effectiveDate: employee.hireDate,
      endDate: null,
      changeType: "HIRE",
      departmentId: employee.departmentId,
      positionId: employee.positionId,
      branchId: employee.branchId,
      managerId: employee.managerId,
      contractType: employee.contractType,
      payRate: employee.baseSalary || employee.hourlyRate,
      reason: "Initial Employment",
      createdById: ctx.userId,
      createdAt: now,
    };

    return { employee, initialRecord };
  }

  /**
   * Applies updates to an employee profile and generates an audited EmploymentRecord if position, department, branch, or pay changed.
   */
  static updateEmployee(
    ctx: TenantContext,
    existing: Employee,
    req: UpdateEmployeeRequest,
    reason?: string
  ): { updatedEmployee: Employee; historyRecord?: EmploymentRecord } {
    assertEmployeeTenantOwnership(ctx, existing);

    const now = new Date().toISOString();
    const hasPositionChange = req.positionId !== undefined && req.positionId !== existing.positionId;
    const hasDepartmentChange = req.departmentId !== undefined && req.departmentId !== existing.departmentId;
    const hasBranchChange = req.branchId !== undefined && req.branchId !== existing.branchId;
    const hasPayChange =
      (req.baseSalary !== undefined && req.baseSalary !== existing.baseSalary) ||
      (req.hourlyRate !== undefined && req.hourlyRate !== existing.hourlyRate);
    const hasStatusChange = req.status !== undefined && req.status !== existing.status;

    const updatedEmployee: Employee = {
      ...existing,
      firstName: req.firstName || existing.firstName,
      lastName: req.lastName || existing.lastName,
      preferredName: req.preferredName !== undefined ? req.preferredName : existing.preferredName,
      phone: req.phone !== undefined ? req.phone : existing.phone,
      email: req.email !== undefined ? req.email : existing.email,
      address: req.address !== undefined ? req.address : existing.address,
      emergencyContact: req.emergencyContact !== undefined ? req.emergencyContact : existing.emergencyContact,
      departmentId: req.departmentId !== undefined ? req.departmentId : existing.departmentId,
      positionId: req.positionId !== undefined ? req.positionId : existing.positionId,
      branchId: req.branchId !== undefined ? req.branchId : existing.branchId,
      managerId: req.managerId !== undefined ? req.managerId : existing.managerId,
      status: req.status || existing.status,
      workType: req.workType || existing.workType,
      contractType: req.contractType || existing.contractType,
      baseSalary: req.baseSalary !== undefined ? req.baseSalary : existing.baseSalary,
      hourlyRate: req.hourlyRate !== undefined ? req.hourlyRate : existing.hourlyRate,
      commissionRate: req.commissionRate !== undefined ? req.commissionRate : existing.commissionRate,
      updatedAt: now,
    };

    let historyRecord: EmploymentRecord | undefined;
    if (hasPositionChange || hasDepartmentChange || hasBranchChange || hasPayChange || hasStatusChange) {
      let changeType: EmploymentRecord["changeType"] = "STATUS_CHANGE";
      if (hasPositionChange) changeType = "PROMOTION";
      else if (hasBranchChange || hasDepartmentChange) changeType = "TRANSFER";
      else if (hasPayChange) changeType = "PAY_ADJUSTMENT";
      else if (req.status === "TERMINATED") changeType = "TERMINATION";

      historyRecord = {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        employeeId: existing.id,
        effectiveDate: now,
        endDate: null,
        changeType,
        departmentId: updatedEmployee.departmentId,
        positionId: updatedEmployee.positionId,
        branchId: updatedEmployee.branchId,
        managerId: updatedEmployee.managerId,
        contractType: updatedEmployee.contractType,
        payRate: updatedEmployee.baseSalary || updatedEmployee.hourlyRate,
        reason: reason || `Updated via ${changeType}`,
        createdById: ctx.userId,
        createdAt: now,
      };
    }

    return { updatedEmployee, historyRecord };
  }
}
