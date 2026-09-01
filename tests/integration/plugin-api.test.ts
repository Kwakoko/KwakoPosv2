import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import { generateAccessToken } from "@kwakopos2/auth";
import type { FastifyInstance } from "fastify";

describe("Industry Plugin Fastify REST API Integration", () => {
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
      permissions: ["*"],
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("GET /api/v1/plugins returns plugin catalog and tenant activations", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/plugins",
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.catalog.length).toBeGreaterThanOrEqual(6);
  });

  it("POST /api/v1/plugins/:pluginId/activate activates plugin for tenant", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/plugins/restaurant/activate",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { initialConfig: { defaultGratuityPct: 10 } },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.pluginId).toBe("restaurant");
    expect(body.data.state).toBe("ACTIVE");
  });

  it("GET /api/v1/plugins/navigation returns dynamic routes for active plugins", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/plugins/navigation",
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.some((n: any) => n.pluginId === "restaurant")).toBe(true);
  });

  it("POST /api/v1/plugins/:pluginId/config sets hierarchical config", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/plugins/restaurant/config",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        scope: "BRANCH",
        key: "maxTableCapacity",
        value: 12,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.value).toBe(12);
  });

  it("POST /api/v1/plugins/restaurant/tables creates a restaurant table", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/plugins/restaurant/tables",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        branchId,
        tableNumber: "T-01",
        capacity: 4,
        status: "AVAILABLE",
        floorArea: "MAIN_DINING",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.tableNumber).toBe("T-01");
  });

  it("POST /api/v1/plugins/pharmacy/prescriptions creates a pharmacy prescription", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/plugins/pharmacy/prescriptions",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        branchId,
        prescriptionNumber: "RX-9001",
        patientName: "Alice Walker",
        doctorName: "Dr. Kelly",
        doctorLicenseNumber: "LIC-7788",
        status: "PENDING",
        items: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            medicineName: "Paracetamol 500mg",
            activeIngredient: "Paracetamol",
            dosage: "500mg",
            frequency: "2x daily",
            durationDays: 5,
            quantity: 10,
            batchNumber: "B-2026-PAR",
            expiryDate: "2027-01-01",
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.prescriptionNumber).toBe("RX-9001");
  });

  it("POST /api/v1/plugins/telecom/links/calculate calculates microwave physics", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/plugins/telecom/links/calculate",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        distanceKm: 15,
        frequencyGhz: 18,
        txPowerDbm: 20,
        antennaGainDbi: 38,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.freeSpacePathLossDb).toBeGreaterThan(130);
    expect(body.data.fresnelZoneRadiusMeters).toBeGreaterThan(0);
  });
});
