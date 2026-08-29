import { describe, it, expect } from "vitest";
import { SystemUiEngine } from "@kwakopos2/domain";
import { runSystemUiCertification } from "../../scripts/certification/system-ui-certification-engine.js";

describe("Phase 25 — KwakoPos System UI & Experience Test Suite", () => {
  const engine = new SystemUiEngine();

  it("should render universal application shell state with connectivity and sync visibility", () => {
    const shell = engine.renderAppShellState("TNT-TZ-100", "BR-DSM-01", true);
    expect(shell.shellId.startsWith("SHELL-")).toBe(true);
    expect(shell.connectivityStatus).toBe("ONLINE");
    expect(shell.syncQueuePendingCount).toBe(0);

    const offlineShell = engine.renderAppShellState("TNT-TZ-100", "BR-DSM-01", false);
    expect(offlineShell.connectivityStatus).toBe("OFFLINE");
    expect(offlineShell.syncQueuePendingCount).toBeGreaterThan(0);
  });

  it("should generate permission-filtered dynamic navigation tree", () => {
    const fullNav = engine.generateNavigation(["*"]);
    expect(fullNav.length).toBeGreaterThanOrEqual(3);

    const restrictedNav = engine.generateNavigation(["pos.access"]);
    expect(restrictedNav.length).toBe(1);
    expect(restrictedNav[0].activeModule).toBe("core-retail");
  });

  it("should execute instant global search with tenant and branch isolation", () => {
    const searchRes = engine.executeGlobalSearch("Cement", "TNT-TZ-100", "BR-DSM-01");
    expect(searchRes.totalMatches).toBeGreaterThan(0);
    expect(searchRes.matches[0].tenantId).toBe("TNT-TZ-100");
  });

  it("should execute command palette actions and enforce permission checks", () => {
    const validCmd = engine.executeCommand("CMD-CREATE-SALE", ["pos.access"]);
    expect(validCmd.success).toBe(true);
    expect(validCmd.targetPath).toBe("/pos");

    const invalidCmd = engine.executeCommand("CMD-CREATE-SALE", ["inventory.read"]);
    expect(invalidCmd.success).toBe(false);
    expect(invalidCmd.error).toContain("Unauthorized action");
  });

  it("should pass 100% of the 30-Pillar System UI certification campaign", () => {
    const cert = runSystemUiCertification();
    expect(cert.totalPillars).toBe(30);
    expect(cert.passedPillars).toBe(30);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
