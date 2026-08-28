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

## [2.1.0] - 2026-08-28

### ✨ New Features
- **release**: implement SLSA Level 3 supply chain, SBOM generator, Risk Score engine, DORA metrics, and Progressive Delivery platform
- **release**: implement enterprise automated release management, versioning, quality gates, and CI/CD pipeline
- **saas**: Implement Phase 6 SaaS Monetization & Revenue Management with central plans, entitlements, billing, payments, and invariants M001-M015
- **telecom**: Implement Phase 5 Telecom & Technical Services Vertical with KML/KMZ, microwave engineering, RAN, and Invariants T001-T015
- **finance**: Implement and certify Phase 2 Dedicated Acceptance Suite Finance-001 to Finance-018
- **phase-4**: Implement KwakoPos Phase 4 Industry Plugin Expansion with Invariants P001-P010 and Synthetic Monitoring
- **release**: Add workspace version synchronization tool for monorepo consistency
- **cert**: add Phase 2 and Phase 3 invariant suites to unified certification runner
- **release**: enable automatic SemVer bump workflow
- **workforce**: implement KwakoPos Phase 3 Workforce Management and Operational Workforce Control
- **finance**: implement KwakoPos Phase 2 Finance and Operational Control
- **commercial**: synchronize database schema in CI before deploying candidate
- **commercial**: synchronize prisma sync delta response with commercial models
- **commercial**: implement Phase 1 Commercial Core Stabilization
- **ops**: implement continuous production operations, canary governance, safe rollback controller, and platform health evaluator
- **release**: implement automated SemVer release control, version consistency gate, and GitHub release automation for v2.1.0
- **release**: implement semantic versioning and automated release management system
- **observability**: implement production Observability, RUM, continuous synthetic monitoring & release gate

### ⚡ Improvements & Enhancements
- **cert**: Issue fresh 10-criteria production release certificate for v1.5.1 covering Phases 1-10
- **release**: Production release evidence for Phase 6 SaaS Monetization on SHA 5355563 (Cloud Run revision 00122-hov)
- **release**: Authoritative multi-device convergence production evidence for SHA dc1709c on Cloud Run revision 00120-wiz
- **browser**: Add complete catalog brand persistence lifecycle test and multi-device state convergence
- **release**: Production release evidence for SHA 2ee2745 on Cloud Run revision 00118-mis
- **release**: Release certification evidence for Catalog Brand Persistence on Cloud Run revision 00116-zek (SHA 212b860)
- **release**: Integrated Phase 1-4 production certification evidence for SHA 20ad38d on Cloud Run (00114-hup)
- **certification**: Add dedicated Phase 1-4 acceptance suites P1-001..P1-010, P2-001..P2-015, P3-001..P3-010, P4-001..P4-012
- **release**: Authoritative production certificate evidence for Phase 5 Telecom HEAD afd6d5e on Cloud Run (00112-jid)
- **release**: v2.4.0
- **release**: v2.3.1
- **release**: Authoritative production certificate evidence for HEAD d82c288 on Cloud Run (00107-yod)
- **release**: Production certificate evidence for HEAD 743f65d on Cloud Run (00102-nof)
- **release**: v2.3.0
- **workspaces**: Sync workspace dependencies to wildcard and update package-lock
- **workflows**: Enable full production certification pipeline on all main commits and PRs
- **release**: Certify Phase 2 Finance-001-018 on Cloud Run revision 00098-gow
- **release**: Synchronize workspace versions to 2.2.0 and enhance release pipeline
- **release**: Synchronize workspace versions to 2.2.0 and enhance release pipeline
- **release**: Update production release evidence for Phase 4 (00094-jev)
- **core**: update certification evidence for live revision 00092-mux (Phase 3 full pass)
- **core**: update production release evidence for live revision 00090-yiy
- **core**: document production certification release evidence and green verification
- **release**: v2.2.0
- **release**: reuse existing container image in Artifact Registry if present
- **finance**: strengthen idempotent bridge regression coverage
- **finance**: cover Phase 2 hardening guards and bridge wiring
- **finance**: refine Phase 2 financial executive metrics and multi-currency engine
- **commercial**: replace hardcoded dashboard stubs with real derived data
- **browser**: update verified Playwright browser certification evidence
- **ops**: update verified live health and reconciliation reports
- **ops**: archive final inventory reconciliation report
- **ops**: archive verified live health evidence for Run #73 revision 00046-qid
- **ci**: ignore test-results directory
- **ops**: update verified health and reconciliation evidence
- **ops**: archive production operations health and reconciliation reports
- **release**: archive SemVer 2.1.0 live release evidence for revision 00036-qux
- **release**: update test expectations for SemVer 2.1.0
- **release**: archive SemVer release evidence and manifest for v2.0.0 revision 00032-niq
- **release**: archive evidence for live Cloud Run revision 00028-kuf
- **observability**: refine tenant-level telemetry, incident search/resolution, and auto-flush RUM hooks
- **observability**: update release evidence for live Cloud Run revision 00024-fir
- **core**: add workspace build and vitest alias for @kwakopos2/observability

### 🐛 Bug Fixes
- **schema**: Map brandId to brand_id in Prisma Product model
- **build**: Add src to Dockerfile and standalone productService implementation in apps/api
- **catalog**: Implement Catalog Brand Persistence with brandId and brand_id path in src/services/productService.ts
- **release**: dispatch exact SHA production certification from SemVer automation
- **release**: add exact-SHA production certification workflow
- **release**: gate production certification on generated release commits
- **release**: restore package lock and preserve semver automation
- **release**: synchronize lockfile authoritative version
- **release**: derive runtime version from authoritative package version
- **release**: make SemVer preparation automatically bump from latest tag
- **release**: prioritize newly deployed revision over cached tagged traffic entry
- **finance**: fix accounts lookup in Prisma getTrialBalance
- **tests**: resolve product creation in finance hardening test
- **finance**: harmonize Prisma finance and atomic production routes
- **finance**: enforce production finance wiring in release build
- **finance**: route prisma trial balance through reporting engine
- **finance**: restore database index and preserve new production exports
- **finance**: make production finance source patch idempotent
- **finance**: apply production finance hardening before API build
- **finance**: wire Prisma and atomic production paths during build
- **finance**: export atomic commercial finance service
- **finance**: atomically persist commercial and financial writes
- **finance**: export durable finance repository
- **finance**: add PostgreSQL authoritative finance repository
- **test**: use mutable TenantContext in finance hardening tests
- **finance**: make automatic bridge operations idempotent
- **finance**: enable Phase 2 hardening guards and automated bridges
- **finance**: harden Phase 2 commercial bridge and financial controls
- **api**: accept BuildServerOptions in buildServer; tighten startup guard; add afterAll close in integration tests

### 👥 Contributors
Credit to: Kwakoko, github-actions[bot], nkala91186
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


## [2.3.0] - 2026-08-28

### ✨ New Features
- **security**: implement Phase 12 Security & Compliance Certification Platform
- **certification**: implement 11.1 Full-System Certification & Continuous Assurance Platform
- **cert**: implement Section 11.1 Full-System Certification Campaign runner
- **cert**: incorporate Phases 7-10 into production certification runner
- **release**: implement KwakoPos Release Engineering Platform v2

### ⚡ Improvements & Enhancements
- **release**: v2.4.0
- **pillars**: lock mandatory rule - refine, verify, test, certify after every feature implementation
- **cert**: update production certification evidence record for v2.2.0
- **release**: synchronize workspace package versions to 2.2.0

### 🐛 Bug Fixes
- **workflows**: split multi-line run step into separate single-line steps in auto-semver.yml
- **ci**: update check-github-runs.ts logging helper
- **tsc**: resolve all TypeScript type errors and ESM import extensions across scripts
- **release**: replace external glob dependency with zero-dependency workspace scanner in sync-workspace-versions.ts
- **ci**: run npm run build before tsc --noEmit in ci.yml
- **workflows**: ensure db:generate and build run before quality gates and type checks across all GitHub Action workflows
- **ci**: handle GCP auth gracefully when secrets are unconfigured and fix test import paths
- **package**: add missing root db:generate, db:push, and production release script commands
- **ci**: update package-lock.json and add Phase 1-12 full-system & security certification gates to GitHub Workflows

### 👥 Contributors
Credit to: Kwakoko, github-actions[bot]