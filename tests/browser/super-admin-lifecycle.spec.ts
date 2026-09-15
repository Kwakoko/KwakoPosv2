import { test, expect } from "@playwright/test";

const enabled = process.env.RUN_SUPER_ADMIN_E2E === "1";

test.describe("Super Admin First-Login & Lifecycle E2E", () => {
  test.skip(!enabled, "Set RUN_SUPER_ADMIN_E2E=1 to execute browser lifecycle test");

  test("enforces first-login password rotation and TOTP enrollment wizard", async ({ page }) => {
    const baseUrl = process.env.KWAKOPOS_BASE_URL || "http://localhost:5173";
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || "admin@kwakoko.co.tz";
    const initialPassword = process.env.SUPER_ADMIN_INITIAL_PASSWORD || "Argon2id2@";

    await page.goto(`${baseUrl}/login`);
    await expect(page.getByLabel(/email/i)).toBeVisible();

    // Attempt initial login with bootstrap credential
    await page.getByLabel(/email/i).fill(superAdminEmail);
    await page.locator("input#password").fill(initialPassword);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Mandatory Security Initialization Modal must appear (due to HTTP 428)
    await expect(page.getByText(/Mandatory Security Initialization/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Step 1: Set New Super Admin Master Password/i)).toBeVisible();
    await expect(page.getByText(/Step 2: Bind Multi-Factor Authenticator/i)).toBeVisible();

    // Verify copy secret button is available
    await expect(page.getByRole("button", { name: /Copy Key/i })).toBeVisible();

    // Filling weak password should keep activation button disabled
    const newPassInput = page.getByPlaceholder(/Enter strong password/i);
    const confirmPassInput = page.getByPlaceholder(/Re-enter new password/i);

    await newPassInput.fill("weak");
    await confirmPassInput.fill("weak");

    const submitBtn = page.getByRole("button", { name: /Complete Activation/i });
    await expect(submitBtn).toBeDisabled();
  });
});
