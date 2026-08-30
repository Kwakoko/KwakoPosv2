#!/usr/bin/env node
import {
  inspectLocalRepository,
  fetchLatestGitHubRelease,
  detectVersionDrift,
  synchronizeLocalVersionFolder,
  readSyncMetadata,
  detectActiveProcesses,
  getCanonicalFolderName,
} from "../release/localVersionFolderSyncEngine.js";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "status";

  const isForce = args.includes("--force");
  const isDryRun = args.includes("--dry-run");
  const isJson = args.includes("--json");
  const modeArgIndex = args.indexOf("--mode");
  const mode = modeArgIndex !== -1 && args[modeArgIndex + 1] === "B" ? "MODE_B" : "MODE_A";

  const cwd = process.cwd();
  const localRepo = inspectLocalRepository(cwd);

  switch (command) {
    case "current": {
      if (isJson) {
        console.log(JSON.stringify({ folder: localRepo.folderName, version: localRepo.packageVersion, gitTag: localRepo.gitTag, commit: localRepo.commitSha }));
      } else {
        console.log(`Current Local Folder:  ${localRepo.folderName}`);
        console.log(`Package Version:       ${localRepo.packageVersion}`);
        console.log(`Git Tag:               ${localRepo.gitTag || "None"}`);
        console.log(`Git Commit:            ${localRepo.commitSha}`);
        console.log(`Working Tree:          ${localRepo.isDirty ? "DIRTY" : "CLEAN"}`);
      }
      break;
    }

    case "status":
    case "check": {
      const remoteRelease = await fetchLatestGitHubRelease();
      const drift = detectVersionDrift(localRepo, remoteRelease);

      if (isJson) {
        console.log(
          JSON.stringify(
            {
              localFolder: localRepo.folderName,
              localVersion: drift.folderVersion,
              remoteVersion: remoteRelease.version,
              remoteTag: remoteRelease.tag,
              status: drift.status,
              reason: drift.reason,
              isDirty: localRepo.isDirty,
            },
            null,
            2
          )
        );
      } else {
        console.log("========================================================================");
        console.log(" KWAKOPOS LOCAL SEMANTIC VERSION FOLDER SYNCHRONIZATION STATUS           ");
        console.log("========================================================================");
        console.log(`Local Folder:      ${localRepo.folderName}`);
        console.log(`Local Version:     v${drift.folderVersion}`);
        console.log(`GitHub Version:    v${remoteRelease.version} (${remoteRelease.tag})`);
        console.log(`Working Tree:      ${localRepo.isDirty ? "DIRTY (Uncommitted changes)" : "CLEAN"}`);
        console.log(`Drift Status:      ${drift.status}`);
        console.log(`Details:           ${drift.reason}`);
        console.log("========================================================================");
      }
      break;
    }

    case "verify": {
      const remoteRelease = await fetchLatestGitHubRelease();
      const drift = detectVersionDrift(localRepo, remoteRelease);
      const processCheck = detectActiveProcesses(cwd);

      const isValid = drift.status === "SYNCHRONIZED" && !localRepo.isDirty;

      if (isJson) {
        console.log(
          JSON.stringify({
            verified: isValid,
            status: drift.status,
            activeProcessesCount: processCheck.processes.length,
            isDirty: localRepo.isDirty,
          })
        );
      } else {
        console.log("=== Release & Folder Verification ===");
        console.log(`Verified Status:   ${isValid ? "PASS (SYNCHRONIZED)" : "FAIL (" + drift.status + ")"}`);
        console.log(`Active Processes:  ${processCheck.processes.length} detected`);
        console.log(`Working Tree:      ${localRepo.isDirty ? "DIRTY" : "CLEAN"}`);
      }

      if (!isValid && !isForce) {
        process.exit(1);
      }
      break;
    }

    case "rollback": {
      const metadata = readSyncMetadata(cwd);
      if (!metadata || !metadata.previous_folder) {
        console.error("No previous synchronization metadata found to perform rollback.");
        process.exit(1);
      }
      console.log(`Previous Folder Metadata: ${metadata.previous_folder} (Synced at ${metadata.synced_at})`);
      console.log("Rollback target verified.");
      break;
    }

    case "sync": {
      console.log("Triggering Local Semantic Version Folder Synchronization Engine...");
      const result = await synchronizeLocalVersionFolder({
        cwd,
        force: isForce,
        dryRun: isDryRun,
        mode,
      });

      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\nSynchronization Result: ${result.success ? "SUCCESS" : "FAILED"}`);
        console.log(`Status:               ${result.status}`);
        console.log(`Action:               ${result.actionTaken}`);
        if (result.error) {
          console.error(`Error:                ${result.error}`);
        }
      }

      if (!result.success) {
        process.exit(1);
      }
      break;
    }

    default: {
      console.log("Usage: kwakopos-version <status|check|sync|verify|current|rollback> [--force] [--dry-run] [--mode A|B] [--json]");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("CLI Execution Error:", err);
  process.exit(1);
});
