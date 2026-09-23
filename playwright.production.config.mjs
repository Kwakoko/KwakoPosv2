export default {
  testDir: "./tests/browser",
  testMatch: /.*\.spec\.ts/,
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  use: {
    headless: true,
    ignoreHTTPSErrors: false,
    ...(process.env.KWAKOPOS_USE_SYSTEM_CHROME === "1" ? { channel: "chrome" } : {}),
  },
};
