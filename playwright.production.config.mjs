export default {
  testDir: "./tests/browser",
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  use: {
    headless: true,
    ignoreHTTPSErrors: false,
  },
};
