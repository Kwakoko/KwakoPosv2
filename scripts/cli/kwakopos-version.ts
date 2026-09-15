#!/usr/bin/env node
import {
  inspectLocalRepository,
  fetchLatestGitHubRelease,
  detectVersionDrift,
  synchronizeLocalVersionFolder,
  readSyncMetadata,
  detectActiveProcesses,
  performRollback,
  generateSyncEvidenceBundle,
} from "../release/localVersionFolderSyncEngine.js";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "status";

  const isForce = args.includes("--force");
  const isDryRun = args.includes("--dry-run");
  const isJson = args.includes("--json");
  const isEvidence = args.includes("--evidence");
  const isSkipProcessCheck = isForce || args.includes("--skip-process-check");
  const modeArgIndex = args.indexOf("--mode");
  const mode = modeArgIndex !== -1 && args[modeArgIndex + 1] === "B" ? "MODE_B_RELEASE_PROMOTION" : "MODE_A";

  const cwd = process.cwd();
  const localRepo = inspectLocalRepository(cwd);

  switch (command) {
    case "current": {
      if (isJson) console.log(JSON.stringify({ folder: localRepo.folderName, version: localRepo.packageVersion, gitTag: localRepo.gitTag, commit: localRepo.commitSha }));
      else {
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
      const remoteRelease = await fetchLatestGitHubRelease("Kwakoko/KwakoPosv2", { allowOfflineMock: true });
      const drift = detectVersionDrift(localRepo, remoteRelease);
      if (isJson) console.log(JSON.stringify({ localFolder: localRepo.folderName, localVersion: drift.folderVersion, remoteVersion: remoteRelease.version, remoteTag: remoteRelease.tag, status: drift.status, reason: drift.reason, isDirty: localRepo.isDirty }, null, 2));
      else {
        console.log("========================================================================");
        console.log(" KWAKOKO BOS LOCAL VERSION FOLDER SYNCHRONIZATION STATUS                ");
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
      const remoteRelease = await fetchLatestGitHubRelease("Kwakoko/KwakoPosv2", { allowOfflineMock: true });
      const drift = detectVersionDrift(localRepo, remoteRelease);
      const processCheck = detectActiveProcesses(cwd);
      const isValid = drift.status === "SYNCHRONIZED" && !localRepo.isDirty;
      if (isJson) console.log(JSON.stringify({ verified: isValid, status: drift.status, activeProcessesCount: processCheck.processes.length, isDirty: localRepo.isDirty }));
      else {
        console.log("=== Release & Folder Verification ===");
        console.log(`Verified Status:   ${isValid ? "PASS (SYNCHRONIZED)" : "FAIL (" + drift.status + ")"}`);
        console.log(`Active Processes:  ${processCheck.processes.length} detected`);
        console.log(`Working Tree:      ${localRepo.isDirty ? "DIRTY" : "CLEAN"}`);
      }
      if (!isValid && !isForce) process.exit(1);
      break;
    }
    case "rollback": {
      console.log("Executing atomic folder sync rollback...");
      try {
        const rollbackResult = await performRollback(cwd);
        if (isJson) console.log(JSON.stringify(rollbackResult, null, 2));
        else console.log(`🎉 Rollback SUCCESS: Restored folder to "${rollbackResult.rolledBackTo}"`);
      } catch (err: any) {
        console.error(`[ERROR] Rollback failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }
    case "sync": {
      console.log("Triggering Local Semantic Version Folder Synchronization Engine...");
      const result = await synchronizeLocalVersionFolder({
        cwd,
        force: isForce,
        dryRun: isDryRun,
        skipProcessCheck: isSkipProcessCheck,
        mode,
        allowOfflineMock: true,
      });

      if (isEvidence && result.success && (!result.evidencePath || !result.evidenceSha256)) {
        const metadata = readSyncMetadata(result.targetPath) || {
          project: localRepo.projectName,
          repository: "Kwakoko/KwakoPosv2",
          release: result.targetVersion,
          commit: localRepo.commitSha,
          folder: localRepo.folderName,
          previous_folder: localRepo.folderName,
          synced_at: new Date().toISOString(),
          status: "SYNCHRONIZED" as const,
          machine: "local",
          mode,
          transactionPhase: "COMPLETED" as const,
        };
        const targetSha = result.certifiedSha || result.localHeadSha || localRepo.commitSha;
        const evidence = generateSyncEvidenceBundle(
          metadata,
          {
            githubReleaseTag: `v${result.targetVersion}`,
            githubResolvedCommitSha: result.githubResolvedCommitSha || targetSha,
            localHeadSha: result.localHeadSha || targetSha,
            certificationSha: targetSha,
            containerSourceSha: result.containerSourceSha || targetSha,
          },
          result.targetPath
        );
        result.evidencePath = evidence.evidencePath;
        result.evidenceSha256 = evidence.evidenceSha256;
      }
      if (isJson) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`\nSynchronization Result: ${result.success ? "SUCCESS" : "FAILED"}`);
        console.log(`Status:               ${result.status}`);
        console.log(`Action:               ${result.actionTaken}`);
        if (result.evidencePath) console.log(`Evidence Bundle:      ${result.evidencePath}`);
        if (result.evidenceSha256) console.log(`Evidence SHA-256:     ${result.evidenceSha256}`);
        if (result.error) console.error(`Error:                ${result.error}`);
      }
      if (!result.success) process.exit(1);
      break;
    }
    default: {
      console.log("Usage: kwakopos-version <status|check|sync|verify|current|rollback> [--force] [--dry-run] [--mode A|B] [--evidence] [--json]");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("CLI Execution Error:", err);
  process.exit(1);
});
