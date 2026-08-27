# KwakoPos SaaS — Official Changelog

All notable changes to KwakoPos will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.2.0] - 2026-08-27

### Added
- **Enhanced Release Pipeline & Lifecycle Management**:
  - Workspace version synchronization tool (`scripts/release/sync-workspace-versions.ts`) ensuring monorepo consistency.
  - Automated SemVer calculation from conventional commits with zero manual version bumping.
  - Canonical `ReleaseIdentity` with Git SHA, container digest, and Cloud Run revision binding.
  - Version Consistency Enforcement Gate blocking releases with version drift across `package.json`, `release-manifest.json`, and runtime config.
  - Automated GitHub Release publishing with changelog extraction and production acceptance evidence.
  - Safe runtime version endpoints: `GET /api/system/version` and `GET /admin/releases/history`.
  - PWA version tracker displaying `KwakoPos © 2026 • Version 2.2.0` with durable offline outbox upgrade protection.
  - Workspace package alignment: all `@kwakopos2/*` packages synchronized to `2.2.0`.

- **Monorepo Architecture & Workspace Governance**:
  - Unified version numbering across root, apps (`@kwakopos2/api`, `@kwakopos2/web`), and packages (`@kwakopos2/config`, `@kwakopos2/domain`, `@kwakopos2/database`, `@kwakopos2/auth`, `@kwakopos2/sync`, `@kwakopos2/observability`, `@kwakopos2/contracts`).
  - Dependency version pinning enforced at build time.
  - Release scripts refactored for explicit workspace package management.

### Changed
- Promoted workspace versions from `2.0.0` → `2.2.0` for alignment with root package version.
- Updated all `@kwakopos2/*` internal dependencies to point to `2.2.0`.
- Enhanced `prepare-release.ts` to automatically sync workspace versions before generating release manifest.
- Improved `version-consistency-gate.ts` to validate workspace package versions in addition to root version.
- Updated npm scripts for explicit release lifecycle control: `release:sync-versions`, `release:prepare`, `release:validate-version`.

### Fixed
- Resolved version drift between monorepo root (`2.2.0`) and internal workspace packages (`2.0.0`).
- Corrected `package-lock.json` synchronization to include all workspace package versions.
- Added glob-based workspace discovery preventing hard-coded package list maintenance.

---

## [2.1.0] - 2026-08-26

### Added
- **Semantic Versioning & Automated Release Management**:
  - Conventional commit parser and automated SemVer calculation (`calculateNextVersion`).
  - Canonical `ReleaseIdentity` and machine-readable `release-manifest.json`.
  - Version Consistency Enforcement Gate (`scripts/release/version-consistency-gate.ts`).
  - Automated Git tagging (`v2.1.0`) and official GitHub Release publishing (`scripts/release/publish-github-release.ts`).
  - Safe runtime version endpoints: `GET /api/system/version` and `GET /admin/releases/history`.
  - PWA version tracker displaying `KwakoPos © 2026 • Version 2.1.0` with durable offline outbox upgrade protection.
- **Production Observability & Real-User Monitoring (RUM)**:
  - `@kwakopos2/observability` package with distributed tracing (`x-trace-id`, `x-span-id`, `x-correlation-id`).
  - Frontend RUM Collector capturing Web Vitals (FCP, LCP, INP, CLS, TTI), API request durations, and unhandled errors.
  - Continuous inventory reconciler enforcing ${{\text{Available Stock}} \equiv \sum \text{StockLedger movements}}$.
  - Tenant Reliability scoring ($0-100$) and incident lifecycle engine.
  - Automated continuous synthetic production suite (Tests A through F).
  - Super Admin Observability Center (`/admin/observability/*`).

### Changed
- Promoted platform release version to `2.1.0`.

---

## [2.0.0] - 2026-08-26

### Added
- **Production Observability & Real-User Monitoring (RUM)**:
  - Distributed tracing with correlation ID context (`x-trace-id`, `x-span-id`, `x-correlation-id`).
  - Frontend RUM Collector capturing Web Vitals (FCP, LCP, INP, CLS, TTI), API latencies, and JS errors.
  - Automated continuous inventory reconciler (${{\text{Available Stock}} \equiv \sum \text{StockLedger}}$).
  - Tenant Reliability scoring (0–100) and Incident Lifecycle management.
  - Continuous synthetic monitoring suite (Tests A through F).
  - Super Admin Observability Center (`/admin/observability/*`).
- **Authentication & Multi-Device Session Hardening**:
  - 15-minute JWT access tokens and cryptographically rotated refresh tokens (`POST /auth/refresh`).
  - Single-use refresh token protection and session revocation.
- **Fail-Closed Multi-Tenant Isolation**:
  - Repository-level tenant and branch validation blocking cross-tenant data access.
- **PWA & IndexedDB Schema Migration Safety**:
  - Versioned migration engine in `LocalIndexedDbStore` guaranteeing zero data loss of pending outbox mutations and catalog state.
- **Automated Production Release Gate & Verification**:
  - Zero-traffic candidate staging on Google Cloud Run with real Chromium Browser A $\to$ Cloud Run $\to$ Browser B ($200 - 12 = 188$) numerical convergence certification prior to 100% promotion.

### Certified Baseline
- **Application Version**: `2.0.0`
- **Git Release Tag**: `v2.0.0`
- **Container Digest**: `sha256:c1ba0a02098b1dbe46121c2822e2897ab69816b501009380e0cce38532cd3924`
- **Active Cloud Run Revision**: `kwakopos-production-service-00028-kuf`
- **Production Status**: `CERTIFIED_AND_ACCEPTED`
