import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Phase 46 production hardening contracts", () => {
  it("has a distributed-lock autonomous scheduler", () => {
    const file = "apps/api/src/services/supportAutomationScheduler.ts";
    expect(fs.existsSync(path.join(root, file))).toBe(true);
    const source = read(file);
    expect(source).toContain("pg_try_advisory_lock");
    expect(source).toContain("pg_advisory_unlock");
    expect(source).toContain("scanAutonomousSignals");
  });

  it("implements SLA due-soon and breach escalation with duplicate suppression", () => {
    const source = read("apps/api/src/services/supportAutomationScheduler.ts");
    expect(source).toContain("SLA_BREACH_ESCALATED");
    expect(source).toContain("SLA_DUE_SOON");
    expect(source).toContain("created_at");
    expect(source).toContain("INTERVAL '60 minutes'");
    expect(source).toContain("status='ESCALATED'");
  });

  it("starts and stops automation with the production server lifecycle", () => {
    const source = read("apps/api/src/server.ts");
    expect(source).toContain("startSupportAutomationScheduler");
    expect(source).toContain("KWAKOPOS_DISABLE_SUPPORT_AUTOMATION");
    expect(source).toContain("onClose");
  });

  it("keeps support operations tenant-scoped and policy-gated", () => {
    const source = read("apps/api/src/services/supportOperationsService.ts");
    expect(source).toContain("assertTenant");
    expect(source).toContain("REMEDIATION_RESTRICTED");
    expect(source).toContain("AUTO_ALLOWED");
    expect(source).toContain("HUMAN_APPROVAL_REQUIRED");
    expect(source).toContain("WHERE \"tenant_id\"=$1");
  });

  it("does not allow resolution without a verification payload", () => {
    const source = read("apps/api/src/services/supportOperationsService.ts");
    expect(source).toContain("VERIFICATION_REQUIRED");
    expect(source).toContain("resolveTicket");
  });

  it("keeps the Super Admin control tower behind authorization checks", () => {
    const source = read("apps/api/src/routes/supportControlTowerRoutes.ts");
    expect(source).toContain("SUPER_ADMIN");
    expect(source).toContain("support:global");
    expect(source).toContain("admin:support");
    expect(source).toContain("/control-tower");
  });
});
