import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../../apps/api/src/server.js";
import { generateAccessToken } from "@kwakopos2/auth";
import { prisma } from "@kwakopos2/database";
import type { FastifyInstance } from "fastify";

describe("Workforce Fastify REST API Integration", () => {
  let app: FastifyInstance;
  let prodApp: FastifyInstance;
  let authToken: string;
  let prodAuthToken: string;

  const tenantId = "11111111-1111-1111-1111-111111111111";
  const branchId = "22222222-2222-2222-2222-222222222222";
  const userId = "33333333-3333-3333-3333-333333333333";
  const prodTenantId = randomUUID();
  const prodBranchId = randomUUID();

  beforeAll(async () => {
    app = buildServer();
    await app.ready();

    await prisma.tenant.create({
      data: { id: prodTenantId, name: "Employee P0 P1 Test Tenant", slug: `employee-p0-p1-${prodTenantId.slice(0, 8)}`, status: "ACTIVE" },
    });
    await prisma.branch.create({
      data: { id: prodBranchId, tenantId: prodTenantId, name: "Main", code: "MAIN", isMain: true },
    });

    prodApp = buildServer({ productionPersistence: true });
    await prodApp.ready();

    prodAuthToken = generateAccessToken({
      userId,
      tenantId: prodTenantId,
      branchId: prodBranchId,
      roles: ["ADMIN"],
      permissions: ["EMPLOYEE_VIEW", "EMPLOYEE_CREATE", "EMPLOYEE_EDIT", "EMPLOYEE_ARCHIVE"],
    });

    authToken = generateAccessToken({
      userId,
      tenantId,
      branchId,
      roles: ["SUPER_ADMIN"],
      permissions: [
        "WORKFORCE_VIEW",
        "EMPLOYEE_CREATE",
        "EMPLOYEE_EDIT",
        "ATTENDANCE_RECORD",
        "ATTENDANCE_APPROVE",
        "SCHEDULE_CREATE",
        "LEAVE_REQUEST",
        "LEAVE_APPROVE",
        "TASK_CREATE",
        "WORK_ORDER_CREATE",
        "PAYROLL_INPUT_APPROVE",
      ],
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prodApp) await prodApp.close();
    await prisma.tenant.delete({ where: { id: prodTenantId } }).catch(() => undefined);
  });

  it("POST /api/v1/workforce/departments creates a department", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/workforce/departments",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { name: "Technical Services", code: "TECH", description: "Hardware & Garage maintenance" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.code).toBe("TECH");
  });

  it("denies Workforce administration without workforce permission", async () => {
    const cashierToken = generateAccessToken({
      userId,
      tenantId: prodTenantId,
      branchId: prodBranchId,
      roles: ["CASHIER"],
      permissions: ["SALE_VIEW"],
    });
    const res = await prodApp.inject({
      method: "POST",
      url: "/api/v1/workforce/departments",
      headers: { authorization: "Bearer " + cashierToken },
      payload: { name: "Forbidden", code: "FORBID" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("persists a staff expense against an Employee", async () => {
    const employeeRes = await prodApp.inject({
      method: "POST",
      url: "/api/v1/workforce/employees",
      headers: { authorization: "Bearer " + prodAuthToken },
      payload: { firstName: "Staff", lastName: "Expense" },
    });
    expect(employeeRes.statusCode).toBe(201);
    const employeeId = JSON.parse(employeeRes.body).data.employee.id;

    const expenseRes = await prodApp.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers: { authorization: "Bearer " + prodAuthToken },
      payload: {
        category: "STAFF_TRANSPORT",
        amount: 45000,
        reason: "Branch visit",
        description: "Staff transport",
        payee: "Staff Expense",
        employeeId,
        paymentMethod: "CASH",
        status: "PENDING",
        idempotencyKey: "staff-expense-" + employeeId,
      },
    });
    expect(expenseRes.statusCode).toBe(201);
    const expense = JSON.parse(expenseRes.body).data;
    expect(expense.employeeId).toBe(employeeId);
  });

  it("POST /api/v1/workforce/employees creates a sanitized employee profile and persists pay", async () => {
    const res = await prodApp.inject({
      method: "POST",
      url: "/api/v1/workforce/employees",
      headers: { authorization: `Bearer ${prodAuthToken}` },
      payload: {
        firstName: "Juma",
        lastName: "Shabani",
        phone: "+255788990011",
        email: "juma@kwakopos.com",
        workType: "FULL_TIME",
        baseSalary: 2000000,
        hourlyRate: 3500,
        commissionRate: 2.5,
        pinCode: "1234",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.employee.firstName).toBe("Juma");
    expect(body.data.employee.employeeNumber).toMatch(/^EMP-/);
    expect(body.data.employee.baseSalary).toBe(2000000);
    expect(body.data.employee.hourlyRate).toBe(3500);
    expect(body.data.employee.commissionRate).toBe(2.5);
    expect(body.data.employee.pinCodeHash).toBeUndefined();
  });

  it("rejects Employee API access without employee permissions", async () => {
    const cashierToken = generateAccessToken({
      userId,
      tenantId: prodTenantId,
      branchId: prodBranchId,
      roles: ["CASHIER"],
      permissions: ["SALE_VIEW"],
    });
    const res = await prodApp.inject({
      method: "GET",
      url: "/api/v1/workforce/employees",
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).success).toBe(false);
  });

  it("enforces Employee branch ownership and quarantines the legacy in-memory Employee API", async () => {
    const invalidBranch = randomUUID();
    const boundaryRes = await prodApp.inject({
      method: "POST",
      url: "/api/v1/workforce/employees",
      headers: { authorization: `Bearer ${prodAuthToken}` },
      payload: { firstName: "Boundary", lastName: "Check", branchId: invalidBranch },
    });
    expect(boundaryRes.statusCode).toBe(400);

    const legacyRes = await prodApp.inject({
      method: "GET",
      url: "/api/v1/workforce-ops/employees",
      headers: { authorization: `Bearer ${prodAuthToken}` },
    });
    expect(legacyRes.statusCode).toBe(410);
    expect(JSON.parse(legacyRes.body).error.code).toBe("LEGACY_EMPLOYEE_API_DISABLED");
  });

  it("archives an Employee with a durable termination date and lifecycle history", async () => {
    const createRes = await prodApp.inject({
      method: "POST",
      url: "/api/v1/workforce/employees",
      headers: { authorization: `Bearer ${prodAuthToken}` },
      payload: { firstName: "Archive", lastName: "Candidate" },
    });
    expect(createRes.statusCode).toBe(201);
    const employeeId = JSON.parse(createRes.body).data.employee.id;

    const archiveRes = await prodApp.inject({
      method: "POST",
      url: `/api/v1/workforce/employees/${employeeId}/archive`,
      headers: { authorization: `Bearer ${prodAuthToken}` },
      payload: { reason: "Employment record closed for audit certification" },
    });
    expect(archiveRes.statusCode).toBe(200);
    const archived = JSON.parse(archiveRes.body).data;
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.terminationDate).toBeTruthy();

    const historyRes = await prodApp.inject({
      method: "GET",
      url: `/api/v1/workforce/employees/${employeeId}/employment-history`,
      headers: { authorization: `Bearer ${prodAuthToken}` },
    });
    expect(historyRes.statusCode).toBe(200);
    const history = JSON.parse(historyRes.body).data;
    expect(history.at(-1).changeType).toBe("STATUS_CHANGE");
  });

  it("POST /api/v1/workforce/attendance/clock-in records attendance", async () => {
    const empRes = await app.inject({
      method: "POST",
      url: "/api/v1/workforce/employees",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { firstName: "Alice", lastName: "Komba" },
    });
    const employeeId = JSON.parse(empRes.body).data.employee.id;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/workforce/attendance/clock-in",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { employeeId, idempotencyKey: `clock-in-${Date.now()}`, method: "STANDARD" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.employeeId).toBe(employeeId);
  });

  it("GET /api/v1/workforce/dashboard returns workforce operations summary", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/workforce/dashboard",
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalEmployees).toBeGreaterThanOrEqual(1);
    expect(["GREEN", "YELLOW", "RED"]).toContain(body.data.workforceHealth);
  });
});
