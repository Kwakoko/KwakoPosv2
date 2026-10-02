import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { extractTenantContext } from "./receiptRoutes.js";
import { getDashboardKpiSnapshot } from "../services/dashboardKpiService.js";

export function dashboardKpiRoutes(server: FastifyInstance) {
  server.get("/api/v1/dashboard/kpis", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const snapshot = await getDashboardKpiSnapshot(ctx);
      return reply.send({
        success: true,
        data: snapshot,
      });
    } catch (error: any) {
      const message = error?.message || "Unable to load authoritative dashboard KPIs";
      const status = /UNAUTHORIZED|tenant and branch/i.test(message) ? 401 : 500;
      return reply.status(status).send({
        success: false,
        error: { code: status === 401 ? "UNAUTHORIZED" : "DASHBOARD_KPI_FAILED", message },
      });
    }
  });
}
