# Kwakoko Production Release Authority v1.0

Step 25 establishes the fail-closed authority for production traffic.

## Lifecycle

CERTIFY → DEPLOY_ZERO → OBSERVE → PROMOTE → VERIFY → ROLLBACK_OR_COMPLETE

## Rules

A candidate must first pass the unified Step 24 certification authority.

Zero-traffic deployment must produce authenticated candidate evidence before traffic increases.

Every traffic increase requires health, synchronization, database-compatibility, observability, performance, rollback, kill-switch, identity, and audit evidence.

Production traffic cannot be authorized from `SIMULATED` or `CLAIMED` evidence.

A failed required gate produces `BLOCK`. Missing evidence is never treated as success.

Rollback requires a known stable release and an independently verifiable rollback path.

The existing progressive-delivery, candidate-deployment, promotion, health, rollback, and authoritative-release engines remain delegated authorities; Step 25 is the controlling release-traffic decision layer.

## Evidence boundary

A controlled verifier proves repository wiring and deterministic gate behavior. It does not prove that a real customer deployment, Cloud Run promotion, external provider, production SLO, or rollback has succeeded unless live evidence is independently captured.
