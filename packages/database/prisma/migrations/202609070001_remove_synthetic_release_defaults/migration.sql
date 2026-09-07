-- Remove synthetic release provenance defaults.
-- These values must come from the actual release/deployment pipeline.
ALTER TABLE "AppVersion" ALTER COLUMN "artifactDigest" DROP DEFAULT;
ALTER TABLE "AppVersion" ALTER COLUMN "schemaVersion" DROP DEFAULT;
ALTER TABLE "DeploymentHistory" ALTER COLUMN "revision" DROP DEFAULT;
ALTER TABLE "DeploymentHistory" ALTER COLUMN "artifactDigest" DROP DEFAULT;