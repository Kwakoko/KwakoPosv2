# Kwakoko Live Production Evidence Governance v1.0

Step 26 converts release certification into real-world production evidence.

## Authority

`packages/config/src/liveProductionEvidenceGovernance.ts`

## Lifecycle

PRECHECK → DEPLOY_ZERO → VERIFY_LIVE → CANARY → OBSERVE → PROMOTE → RECONCILE → COMPLETE

## Evidence rule

Only `PRODUCTION` or `DEPLOYED` evidence may support a production PASS.
`CONTROLLED`, `SIMULATED`, and `CLAIMED` evidence can never become production proof.

## Mandatory evidence

Release identity, immutable container digest, Cloud Run revision, live HTTPS health,
readiness, live identity, browser runtime, sync convergence, database reconciliation,
tenant isolation, observability, traffic allocation, rollback readiness, and post-release reconciliation.

## Fail-closed behavior

Missing or failed live evidence blocks production success. Controlled evidence is HOLD,
not PASS. Simulation is BLOCK in production-certification mode.

## Scope boundary

The repository can verify the authority and deterministic decision behavior without
claiming a real production deployment. A production PASS requires externally observed,
revision-bound evidence from the live environment.
