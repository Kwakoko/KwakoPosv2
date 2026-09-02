import { test, expect } from "@playwright/test";

const enabled = process.env.RUN_TENANT_ONBOARDING_E2E === "1";
test.describe("Production Tenant Onboarding", () => {
  test.skip(!enabled, "Set RUN_TENANT_ONBOARDING_E2E=1 for an isolated staging environment");

  test("creates tenant, completes onboarding and enters workspace", async ({ page }) => {
    const baseUrl = process.env.KWAKOPOS_TENANT_ONBOARDING_BASE_URL;
    const storageState = process.env.KWAKOPOS_TENANT_ONBOARDING_STORAGE_STATE;
    if (!baseUrl || !storageState) throw new Error("Tenant onboarding E2E requires KWAKOPOS_TENANT_ONBOARDING_BASE_URL and KWAKOPOS_TENANT_ONBOARDING_STORAGE_STATE");
    test.skip(/production/i.test(baseUrl), "Tenant onboarding E2E must not run against production");

    await page.context().addCookies([]);
    await page.goto(`${baseUrl}/tenant-onboarding`);
    await expect(page.getByRole("heading", { name: /Tenant Onboarding & Provisioning/i })).toBeVisible();
    await page.getByPlaceholder("Business name").fill(`E2E Tenant ${Date.now()}`);
    await page.getByPlaceholder("Tenant slug (optional)").fill(`e2e-tenant-${Date.now()}`);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByPlaceholder("Main branch name").fill("Main Branch");
    await page.getByRole("button", { name: "Continue" }).click();
    const ownerEmail = `owner-${Date.now()}@example.invalid`;
    await page.getByPlaceholder("Owner name").fill("E2E Owner");
    await page.getByPlaceholder("Owner email").fill(ownerEmail);
    await page.getByPlaceholder("Password (12+ characters)").fill("production-e2e-password");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Provision Tenant" }).click();
    await expect(page.getByText(/Tenant provisioned, completed and owner authenticated/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Open Workspace" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
