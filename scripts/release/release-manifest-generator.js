import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
export function generateReleaseManifest(options) {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const version = options?.version || pkg.version || "2.2.0";
    const gitSha = options?.gitSha || process.env.GITHUB_SHA || "88c0662e2a8132f5fd6097f43d557c0c1086d067";
    const buildId = options?.buildId || `build-${Date.now()}`;
    const manifestContent = JSON.stringify({ product: "KwakoPos", version, gitSha, buildId });
    const artifactDigest = `sha256:${createHash("sha256").update(manifestContent).digest("hex")}`;
    const manifest = {
        product: "KwakoPos SaaS",
        version,
        gitSha,
        buildId,
        artifactDigest,
        schemaVersion: "2.2.0",
        sbomReference: `artifacts/releases/${version}/sbom.spdx.json`,
        provenanceReference: `artifacts/releases/${version}/provenance.json`,
        releaseRisk: options?.releaseRisk || "LOW",
        deploymentStrategy: "CANARY",
        createdAt: new Date().toISOString(),
        builderIdentity: "github-actions[bot]",
        targetEnvironment: "production",
    };
    const targetDir = path.resolve(process.cwd(), `artifacts/releases/${version}`);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    const manifestPath = path.join(targetDir, "release-manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    console.log(` ✓ [PASS] Release Manifest generated: ${manifestPath}`);
    return manifest;
}
if (process.argv[1]?.endsWith("release-manifest-generator.ts")) {
    generateReleaseManifest();
}
//# sourceMappingURL=release-manifest-generator.js.map