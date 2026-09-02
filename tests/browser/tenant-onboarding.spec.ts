import { test, expect } from "@playwright/test";

const enabled = process.env.RUN_TENANT_ONBOARDING_E2E === "1";
test.describe("Production Tenant Onboarding", () => {
  test.skip(!enabled, "Set RUN_TENANT_ONBOARDING_E2E=1 for an isolated staging environment");

  test("creates tenant, completes onboarding and enters workspace", async ({ page }) => {
    const baseUrl = process.env.KWAKOPOS_TENANT_ONBOARDING_BASE_URL;
    const adminEmail = process.env.KWAKOPOS_TENANT_ONBOARDING_ADMIN_EMAIL;
    const adminPassword = process.env.KWAKOPOS_TENANT_ONBOARDING_ADMIN_PASSWORD;
    if (!baseUrl || !adminEmail || !adminPassword) throw new Error("Tenant onboarding E2E requires isolated staging URL and admin credentials via environment variables");
    test.skip(/production/i.test(baseUrl), "Tenant onboarding E2E must not run against production");

    await page.goto(`${baseUrl}/login`);
    await page.getByPlaceholder(/email/i).fill(adminEmail);
    await page.getByPlaceholder(/password/i).fill(adminPassword);
    await page.getByRole("button", { name: /sign in|login/i }).click();
    await page.goto(`${baseUrl}/tenant-onboarding`);
    await expect(page.getByRole("heading", { name: /Tenant Onboarding & Provisioning/i })).toBeVisible();

    const suffix = Date.now();
    await page.getByPlaceholder("Business name").fill(`E2E Tenant ${suffix}`);
    await page.getByPlaceholder("Tenant slug (optional)").fill(`e2e-tenant-${suffix}`);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByPlaceholder("Main branch name").fill("Main Branch");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByPlaceholder("Owner name").fill("E2E Owner");
    await page.getByPlaceholder("Owner email").fill(`owner-${suffix}@example.invalid`);
    await page.getByPlaceholder("Password (12+ characters)").fill(`e2e-production-password-${suffix}`);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Provision Tenant" }).click();
    await expect(page.getByText(/Tenant provisioned, completed and owner authenticated/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Open Workspace" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
