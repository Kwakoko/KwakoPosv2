import { runVersionSyncCertification } from "./version-sync-certification-engine.js";

async function main() {
  const result = await runVersionSyncCertification();
  if (!result.passed) {
    console.error("CERTIFICATION_FAILED: Local Version Folder Synchronization Certification failed.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error in certification run:", err);
  process.exit(1);
});
