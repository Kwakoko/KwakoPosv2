import { startFixedServer } from "./serverFixed.js";

void startFixedServer().catch((error) => {
  console.error("FAILED_TO_START_TEST_API_SERVER:", error);
  process.exitCode = 1;
});
