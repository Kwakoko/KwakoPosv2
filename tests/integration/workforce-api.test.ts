import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import { generateAccessToken } from "@kwakopos2/auth";
import type { FastifyInstance } from "fastify";

describe("Workforce Fastify REST API Integration", () => {
  let app: FastifyInstance;
  let authToken: string;

  const tenantId = "11111111-1111-1111-1111-111111111111";
  const branchId = "22222222-2222-2222-2222-222222222222";
  const userId = "33333333-3333-3333-3333-333333333333";

  beforeAll(async () => {
    app = buildServer();
    await app.ready();

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
  });

  it("POST /api/v1/workforce/departments creates a department", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/workforce/departments",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        name: "Technical Services",
        code: "TECH",
        description: "Hardware & Garage maintenance",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.code).toBe("TECH");
  });

  it("POST /api/v1/workforce/employees creates an employee profile", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/workforce/employees",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        firstName: "Juma",
        lastName: "Shabani",
        phone: "+255788990011",
        email: "juma@kwakopos.com",
        workType: "FULL_TIME",
        baseSalary: 2000000,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.employee.firstName).toBe("Juma");
    expect(body.data.employee.employeeNumber).toMatch(/^EMP-/);
  });

  it("POST /api/v1/workforce/attendance/clock-in records attendance", async () => {
    // First create an employee
    const empRes = await app.inject({
      method: "POST",
      url: "/api/v1/workforce/employees",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        firstName: "Alice",
        lastName: "Komba",
      },
    });
    const employeeId = JSON.parse(empRes.body).data.employee.id;

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/workforce/attendance/clock-in",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        employeeId,
        idempotencyKey: `clock-in-${Date.now()}`,
        method: "STANDARD",
      },
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
