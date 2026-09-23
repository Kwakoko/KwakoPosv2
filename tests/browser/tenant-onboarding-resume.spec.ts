import { test, expect } from "@playwright/test";

const BASE_URL = process.env.KWAKOPOS_TEST_BASE_URL || "http://127.0.0.1:3000";
const DRAFT_KEY = "kwakopos:v2:tenant-onboarding:draft";
const SESSION_KEY = "kwakopos:v2:session";

function makeUnexpiredJwt(): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "none", typ: "JWT" }),
    encode({ sub: "resume-test-user", exp: Math.floor(Date.now() / 1000) + 3600 }),
    "resume-test-signature",
  ].join(".");
}

test.describe("Tenant onboarding draft/resume", () => {
  test("restores wizard state after browser refresh without persisting owner password", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);

    await page.route("**/api/legal/acceptance/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { isCompliant: true, requiredDocuments: [] },
        }),
      });
    });

    await page.evaluate(({ sessionKey, draftKey, accessToken }) => {
      localStorage.setItem(sessionKey, JSON.stringify({
        sessionId: "resume-test-session",
        accessToken,
        user: {
          id: "resume-test-user",
          tenantId: "resume-test-tenant",
          branchId: "resume-test-branch",
          email: "admin@resume-test.example",
          name: "Resume Super Admin",
          role: "SUPER_ADMIN",
        },
      }));

      localStorage.setItem(draftKey, JSON.stringify({
        version: 1,
        step: 4,
        form: {
          businessName: "Resume Test Business",
          slug: "resume-test-business",
          country: "TZ",
          currency: "TZS",
          timezone: "Africa/Dar_es_Salaam",
          locale: "en-TZ",
          industry: "Retail",
          modules: ["Retail"],
          branchName: "Main Branch",
          branchCode: "RESUME-MAIN",
          ownerName: "Resume Owner",
          ownerEmail: "resume@example.test",
        },
        idempotencyKey: "resume-test-idempotency-1234",
        branchCodeManuallyEdited: true,
        savedAt: new Date().toISOString(),
      }));
    }, {
      sessionKey: SESSION_KEY,
      draftKey: DRAFT_KEY,
      accessToken: makeUnexpiredJwt(),
    });

    await page.goto(`${BASE_URL}/tenant-onboarding`);
    await page.reload();

    await expect(page.getByRole("heading", { name: "Business Tenant Provisioning" })).toBeVisible();
    await expect(page.getByText("Owner Account")).toBeVisible();
    await expect(page.getByLabel("Owner email")).toHaveValue("resume@example.test");
    await expect(page.getByLabel("Owner password")).toHaveValue("");

    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByLabel("Business name")).toHaveValue("Resume Test Business");

    const draft = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), DRAFT_KEY);
    expect(draft.form.ownerPassword).toBeUndefined();
    expect(draft.idempotencyKey).toBe("resume-test-idempotency-1234");
  });
});
