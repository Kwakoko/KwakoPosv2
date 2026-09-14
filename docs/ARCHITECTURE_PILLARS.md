# KwakoPos Core Architecture & Engineering Pillars

## Non-Negotiable Core Engineering Rules

> [!IMPORTANT]
> **MANDATORY LIFECYCLE RULE — REFINE → VERIFY → TEST → CERTIFY → COMMIT → PUSH:**
> **After EVERY feature or module implementation, you MUST execute the mandatory 6-step engineering loop:**
> 1. **REFINE**: Review code, ensure clean architecture, eliminate redundant logic, and harden error handling.
> 2. **VERIFY**: Check environment contracts, schema integrity, API compatibility, and multi-tenant boundary safety.
> 3. **TEST**: Run full unit, integration, and sync test suites (`npm run test:unit`, `npm run test:integration`, `npm run test:sync`).
> 4. **CERTIFY**: Execute the production certification runner (`npm run certify`) and ensure 100% of platform invariants pass.
> 5. **COMMIT**: `git add -A && git commit -m "<type>(<scope>): <description>"` — one atomic commit per logical change. **No accumulating changes across sessions without committing.**
> 6. **PUSH**: `git push origin <branch>` — immediately after every commit. **Never end a working session without pushing.**

> [!CAUTION]
> **ZERO-UNCOMMITTED-SESSION RULE (DEV-GIT-01):**
> It is **FORBIDDEN** to work on the codebase for more than **4 hours** without a `git commit + git push`.
> Working a full day without committing = production risk. If a machine dies, a disk corrupts, or a session ends, any uncommitted work is **permanently lost**.
> Rollback is only possible if the state exists on the remote. **Commit early. Commit often. Push always.**

---

## KwakoPos Platform Pillars

### Pillar 1: Policy-Driven Release & Software Supply-Chain Security
- Zero manual versioning.
- Declarative Policy-as-Code evaluating 15 release policies.
- SLSA Build Level 3 in-toto provenance statements.
- SPDX 2.3 & CycloneDX 1.4 JSON Software Bill of Materials (SBOM).
- SHA-256 artifact digest verification across build, staging, and production.

### Pillar 2: Mandatory Post-Implementation Verification & Certification Loop
- **Refine**: Code quality, modular design, type safety.
- **Verify**: Backward compatibility, DB migration safety (5-phase Expand/Contract).
- **Test**: 100% test suite execution across unit, integration, and sync suites.
- **Certify**: Machine-readable invariant certification across all 15 KwakoPos core modules.

### Pillar 3: Offline-First & Algebraic Ledger Integrity
- IndexedDB outbox queue persistence for offline operations.
- State convergence (`Browser A → Server → Browser B`).
- Immutable append-only Stock Ledger and double-entry financial journals.

### Pillar 4: Strict Multi-Tenant & Branch Boundary Isolation
- Zero data leakage across tenants or branches.
- Scope enforcement at API, Service, Database, Cache, and Search layers.

### Pillar 5: Progressive Delivery & Automated Emergency Recovery
- Tenant-aware canary rollouts (`Internal` → `Canary Tenant` → `5%` → `25%` → `50%` → `100%`).
- Automated SLO health monitoring and instant 4-minute rollback recovery.

### Pillar 6: Atomic Commit & Push Discipline (DEV-GIT-01)

Every logical change — no matter how small — **must** be committed and pushed before ending the working session.

| Rule | Constraint |
|---|---|
| **Max uncommitted window** | 4 hours |
| **Max unpushed commits** | 0 (push immediately after every commit) |
| **Commit granularity** | One logical change per commit (not batching days of work) |
| **Commit message format** | `<type>(<scope>): <description>` — e.g. `feat(pos): add discount modal` |
| **Branch push target** | Current active feature branch, immediately |
| **End-of-day gate** | Zero uncommitted or unpushed changes before logging off |

**Why this matters for KwakoPos:**
- Rollback is only possible if the state **exists on the remote**. A local-only commit still dies with the machine.
- Sparse commits (e.g. 3 commits across 4 days as seen Sept 11–13, 2026) make rollback imprecise — you may have to revert hours of unrelated work to undo one bug.
- Atomic commits make `git bisect`, cherry-pick, and hotfix branching practical.
- Dense commit history is the primary **insurance policy** for the codebase.

**Enforcement:**
- This pillar is enforced by a local Git `post-commit` hook (`.git/hooks/post-commit`) that prints a push reminder after every commit.
- Any AI agent or developer working on this codebase MUST commit and push after every feature, fix, or refactor — without exception.
