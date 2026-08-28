# KwakoPos Core Architecture & Engineering Pillars

## Non-Negotiable Core Engineering Rule

> [!IMPORTANT]
> **MANDATORY LIFECYCLE RULE:**
> **After EVERY feature or module implementation, you MUST execute the mandatory 4-step engineering verification loop:**
> 1. **REFINE**: Review code, ensure clean architecture, eliminate redundant logic, and harden error handling.
> 2. **VERIFY**: Check environment contracts, schema integrity, API compatibility, and multi-tenant boundary safety.
> 3. **TEST**: Run full unit, integration, and sync test suites (`npm run test:unit`, `npm run test:integration`, `npm run test:sync`).
> 4. **CERTIFY**: Execute the production certification runner (`npm run certify`) and ensure 100% of platform invariants pass.

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
