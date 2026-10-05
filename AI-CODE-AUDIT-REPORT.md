# KwakoPOS v2 — P0/P1/P2 Closed-Loop Audit

**Audit state:** REMEDIATION IN PROGRESS — release gated until CI is green  
**Target branch:** `audit/close-p0-p1-p2-2026-10-05`  
**Base:** `main` @ `20a6854523a00d9ab7a6dedf5d3129ed56783d76`

## Closure contract

Every P0/P1/P2 finding must have one of these outcomes before release:

1. Fixed in production code and covered by a regression test.
2. Removed from the production/release surface.
3. Converted from a fabricated/static control into a real evidence-producing control.

No finding is considered closed merely because a document says it is fixed.

## Remediations in this loop

### Security
- Removed client-controlled `x-admin-id`, `x-admin-email`, and `x-admin-role` authority from the Super Admin operating-plane route.
- Removed implicit JWT permission fallback to `["*"]`.
- Removed wildcard authorization from privileged database, support, production, and legal governance checks.
- WebAuthn verification now fails closed until a standards-compliant cryptographic verifier is wired in; the previous mock verifier is no longer accepted.
- TOTP verification is limited to the current/adjacent time window and successful counters are durably consumed to prevent replay.
- Step-up JWTs are pinned to HS256 with issuer/audience validation and exact action matching; wildcard step-up actions are rejected.
- Rollback execution and emergency rollback now require an authenticated step-up token bound to the requesting actor.
- Cookie-authenticated unsafe requests require an allowed Origin/Referer boundary in production.
- The setup UI no longer receives or auto-fills a live TOTP code.

### Data integrity / schema
- Security and support shadow tables are represented in Prisma schema models.
- TOTP replay state is durable in PostgreSQL.
- Production finance build hardening no longer rewrites source code; the former build script is now verification-only.
- API build no longer invokes source mutation.

### Performance
- Stock availability uses PostgreSQL aggregation instead of loading the complete ledger into Node memory.
- World-standard sync delta filtering is pushed into PostgreSQL rather than loading whole product/ledger histories.
- Static asset delivery uses asynchronous file reads.
- Runtime config no longer spawns synchronous Git subprocesses.

### Certification integrity
- Removed dead stub observability engines from the production tree.
- Construction certification now executes real ConstructionEngine/ConstructionService invariants.
- Garage certification now executes real GarageEngine/GarageService invariants.
- Removed fabricated 61/58-pillar marketing claims from the certification UI.
- Certification tests now assert actual check counts and passed evidence rather than vanity pillar counters.

## Release gate

The repository CI workflow is configured to run on pull requests to `main` and includes build, migration, lint, unit, integration, sync, strict-runtime, and production-release authority gates.

**Final closure requires those gates to pass on the remediation head.**
