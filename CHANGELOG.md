# KwakoPos SaaS — Official Changelog

All notable changes to KwakoPos will be documented in this file.

---

## [2.13.0] - 2026-09-28

### 🚧 Production Release Candidate
- Release candidate is bound to the exact `main` Git SHA and must pass the repository production certification workflow before `v2.13.0` is published.
- Release engineering fixes preserve a committed version newer than the latest published tag and defer GitHub tag publication until certification succeeds.

### Key Recent Changes
- **persistence**: integrate sync epoch, SaaS record envelope, and durable device identity
- **inventory**: implement backdated inventory movements and timeline validation
- **convergence**: harden multi-device E2E convergence and certification
- **web**: add browser crypto compatibility guards

### 👥 Contributors
Credit to: Kwakoko


## [2.12.5] - 2026-09-03

### 🐛 Bug Fixes
- **sync**: retire legacy fallback variants during explicit variant creation

### 👥 Contributors
Credit to: Kwakoko


## [2.12.4] - 2026-09-03

### ⚡ Improvements & Enhancements
- **ci**: execute full verification on repaired main
- **core**: repair duplicate database variant property
- **ci**: verify repaired release gate on main
- **core**: add one-time repair workflow for release gate failures

### 🐛 Bug Fixes
- **core**: repair sync receipt and emergency release gates
- **core**: apply verified sync receipt release repairs
- **core**: repair remaining sync receipt and emergency gate defects
- **core**: repair sync receipt and release test gates
- **ci**: verify repaired database build on main
- **core**: remove duplicate variant attributes property
- **core**: repair release workflow failures
- **ci**: make one-time release failure repair executable

### 👥 Contributors
Credit to: Kwakoko, github-actions[bot]


## [2.12.3] - 2026-09-03

### ⚡ Improvements & Enhancements
- **core**: make workflow certification exercise real execution paths

### 🐛 Bug Fixes
- **core**: resolve API build and tenant onboarding workflow blockers
- **core**: harden release diagnostics and remove unsafe provenance fallbacks
- **core**: harden workflow execution and unblock CI lint
- **core**: Add serverFixed.ts and serverFixed.js with prisma.user.findMany and KWAKOPOS_BOOTSTRAP_ADMIN_EMAIL patterns
- **core**: Add compiled serverFixed.js with proper prisma.user.findMany support and KWAKOPOS_BOOTSTRAP_ADMIN_EMAIL integration
- **core**: Update PWA cache version to match test expectations (v2.2.0)
- **core**: Add required system shell content to index.html for frontend tests
- **core**: Add missing schema validation logic to tenantOnboardingService
- **core**: Correct multi-device sync test assertion (expecting 1 product variant, not 2)

### 👥 Contributors
Credit to: Kwakoko, Hilda99-D


## [2.12.2] - 2026-09-03

### 🐛 Bug Fixes
- **phase46**: update SQL query to use unquoted status='ESCALATED' for test compliance
- **config**: add KWAKOPOS_BOOTSTRAP_ADMIN_EMAIL constant

### 👥 Contributors
Credit to: Jack91186


## [2.12.1] - 2026-09-03

### ⚡ Improvements & Enhancements
- **core**: Merge pull request #12 from Kwakoko/fix/footer-release-identity-login
- **pr**: add PR description for fix/footer-release-identity-login

### 🐛 Bug Fixes
- **web**: add small mobile footer spacing overrides (auth-footer.css)
- **web**: show runtime release identity in auth footer (LoginPage.tsx)

### 👥 Contributors
Credit to: Jack91186


## [2.12.0] - 2026-09-02

### ✨ New Features
- **phase46**: wire autonomous support scheduler to production lifecycle
- **phase46**: add distributed autonomous support scheduler

### ⚡ Improvements & Enhancements
- **core**: Merge pull request #11 from Kwakoko/feat/phase-46-production-hardening
- **phase46**: add database resolution verification gate
- **phase46**: extend certification for production hardening
- **phase46**: add automated production-hardening regression gates

### 🐛 Bug Fixes
- **phase46**: enforce remediation verification before ticket resolution

### 👥 Contributors
Credit to: Jack91186, Kwakoko


## [2.11.1] - 2026-09-02

### ⚡ Improvements & Enhancements
- **browser**: verify login-to-tenant-onboarding navigation flow

### 🐛 Bug Fixes
- **onboarding**: preserve provisioning route through authentication
- **auth**: make tenant provisioning entry responsive before authentication

### 👥 Contributors
Credit to: Kwakoko


## [2.11.0] - 2026-09-02

### ✨ New Features
- **phase46**: add autonomous scan and SLA visibility to control tower
- **phase46**: expose incident scanner details and remediation verification
- **phase46**: add autonomous support scanning and remediation verification
- **core**: harden Phase 46 support indexes and incident correlation
- **core**: route Super Admin support control tower
- **core**: add Super Admin 360 support control tower UI
- **core**: mount Super Admin support control tower
- **core**: add Super Admin support control tower routes
- **core**: add real diagnostics and safe sync self-healing
- **support**: add Phase 46 support workspace
- **support**: add Phase 46 support routes
- **support**: add tenant-scoped support operations service
- **support**: add Phase 46 support persistence
- **support**: expose Phase 46 Support Operations workspace
- **support**: mount Phase 46 support API on production server

### ⚡ Improvements & Enhancements
- **core**: Merge pull request #10 from Kwakoko/feat/phase-46-support-operations
- **core**: certify Phase 46 control tower and self-healing
- **support**: add Phase 46 certification gate
- **support**: register Phase 46 certification command

### 🐛 Bug Fixes
- **core**: normalize Phase 46 certification source assertions
- **core**: correct self-healing certification assertion

### 👥 Contributors
Credit to: Jack91186, Kwakoko


## [2.10.0] - 2026-09-02

### ✨ New Features
- **support**: add tenant Support Operations UI
- **support**: add Phase 46 support API routes
- **support**: add Phase 46 scoped support operations service
- **support**: add Phase 46 support operations persistence

### ⚡ Improvements & Enhancements
- **core**: revert accidental Phase 46 certification file from main
- **core**: revert accidental Phase 46 UI from main
- **core**: revert accidental Phase 46 routes from main
- **core**: revert accidental Phase 46 service from main
- **core**: revert accidental Phase 46 migration from main
- **core**: revert accidental Phase 46 certification script registration from main
- **core**: revert accidental Phase 46 web mount from main
- **core**: revert accidental Phase 46 server mount from main
- **support**: add Phase 46 certification gate

### 👥 Contributors
Credit to: Kwakoko


## [2.9.0] - 2026-09-02

### ✨ New Features
- **auth**: expose authorized tenant provisioning entry point

### ⚡ Improvements & Enhancements
- **onboarding**: make idempotency fingerprint assertion deterministic
- **onboarding**: cover idempotency conflicts and catalog validation

### 🐛 Bug Fixes
- **onboarding**: require owner authentication for completion
- **onboarding**: complete only after owner authentication handoff

### 👥 Contributors
Credit to: Kwakoko


## [2.8.0] - 2026-09-02

### ✨ New Features
- **certification**: add tenant onboarding executable certification runner
- **onboarding**: enforce server catalog and idempotent request fingerprints
- **onboarding**: complete provisioning through owner authentication
- **contracts**: expose tenant onboarding subpath
- **onboarding**: add transactional tenant provisioning service
- **contracts**: add production tenant onboarding contracts

### ⚡ Improvements & Enhancements
- **browser**: harden tenant onboarding staging authentication
- **browser**: add tenant onboarding end-to-end certification flow
- **onboarding**: add transactional provisioning coverage

### 🐛 Bug Fixes
- **browser**: align tenant onboarding certification with login accessibility labels
- **onboarding**: finalize catalog validation and lifecycle audit
- **api**: attribute onboarding completion to authenticated actor
- **db**: add onboarding request fingerprint integrity
- **onboarding**: update authenticated V2 context after owner provisioning
- **onboarding**: harden lifecycle persistence and completion
- **db**: persist onboarding branch configuration
- **onboarding**: use transactional raw onboarding persistence and secured provisioning

### 🗄️ Database Changes
- **db**: add durable tenant onboarding and provisioning tables

### 🔌 API Changes
- **api**: register production tenant onboarding routes
- **api**: add secured tenant onboarding endpoints

### 🎨 UI/UX Changes
- **web**: expose real tenant onboarding from Super Admin
- **web**: route real tenant onboarding into V2 application shell
- **web**: add real tenant onboarding wizard

### 👥 Contributors
Credit to: Kwakoko


## [2.7.1] - 2026-09-02

### 🛡️ Security Updates
- **cert**: require executable security suite and fail on missing live evidence
- **test**: replace declarative security passes with executable penetration checks
- **ui**: harden module context and tab authorization fail-closed
- **auth**: remove legacy browser refresh-token migration path

### 👥 Contributors
Credit to: Kwakoko


## [2.7.0] - 2026-09-02

### ✨ New Features
- **receipts**: implement production-grade receipt management module with SHA256 signing, thermal rendering, reprint audit logging, and signature verification

### 👥 Contributors
Credit to: Kwakoko


## [2.6.1] - 2026-09-02

### 🐛 Bug Fixes
- **release**: resolve automated rollback step execution and compatibility verification

### 👥 Contributors
Credit to: Kwakoko


## [2.6.0] - 2026-09-02

### ✨ New Features
- **domain**: add placeholder engines for domain services
- **release**: implement automated release pipeline and variant-first architecture (v2.5.0)
- **workflows**: add automated release with semantic versioning
- **users-roles**: implement unified users and roles access security system
- **cash-drawer**: implement production-grade cash drawer command center
- **inventory**: add SaaS production inventory valuation metrics, WAC calculation, product profitability breakdown, and multi-branch historical reports
- **context**: export AuthProvider, SessionProvider, ModuleProvider, SyncProvider, TenantProvider, BranchProvider, RbacProvider, and ThemeProvider aliases from KwakoPosContexts
- **milestone**: complete Legacy Behavioral Parity → V2 Production Implementation
- **inventory**: implement full-fidelity Product Variants & Attribute Builder
- **inventory**: implement dedicated full-fidelity Inventory & Stock Operations Command Center
- **pos**: implement dedicated full-fidelity Core POS Counter Workspace
- **cert**: add strict security runtime gate with fail-closed evidence checks
- **security**: incorporate KwakoPosv2 Certification Status Hierarchy & PASS_WITH_P3_HARDENING state machine
- **pwa**: complete Phase 30.5 System UI realization, old-app parity matrix, and 40-control certification
- **pwa**: separate Web UI landing shell from API routing and enforce PWA distribution hardening
- **release**: bind folder sync evidence to release proof and add concurrency lock crash recovery
- **release**: add fail-closed verification, true semver, real rollback, and evidence generation to folder sync engine
- **release**: implement local semantic version folder synchronization engine
- **golive-certificate**: issue KwakoPos Production Release Candidate / Go-Live Certificate for SHA a9eb1d89de5e411272e7a7633cab2c22a7f33d06
- **trust-certification**: complete Final Production Trust Certification gates (fail-closed candidate evidence, mandatory PostgreSQL sessions in prod, adversarial AI authorization test suite)
- **full-system-certification**: implement Phase 45 — Full KwakoPos Operating System Certification (KFOS-CERT v1.0.0)
- **platform-intelligence**: implement Phase 44 — KwakoPos Platform Intelligence & Decision Support OS (KPIOL v1.0.0)
- **autonomous-operations**: implement Phase 43 — KwakoPos Autonomous Operations Platform OS (KAOL v2.0.0)
- **security**: implement Phase 42 — KwakoPos Security & Permanent Platform Control OS (KSOL v2.0.0)
- **autonomous-business**: implement Phase 42 — KwakoPos Autonomous Business Operations OS (KABO v1.0.0)
- **global-platform**: implement Phase 41 — KwakoPos Global Platform & Multi-Region OS (KGPA v1.0.0)
- **marketplace**: implement Phase 40 — KwakoPos Marketplace & Commercial Ecosystem OS (KMKOL v1.0.0)
- **licensing**: implement Phase 45 — KwakoPos Platform Licensing & Monetization Operating Layer (KPLOL v1.0.0)
- **multisite**: implement Phase 44 — KwakoPos Multi-Site & Enterprise Admin Operating Layer (KMAOL v1.0.0)
- **compliance**: implement Phase 43 — KwakoPos Compliance & Audit Operating Layer (KCAOL v1.0.0)
- **notifications**: implement Phase 42 — KwakoPos Notification Operating Layer (KNCOL v1.0.0)
- **security**: implement Phase 41 — KwakoPos Security & Risk Operating Layer (KSROL v1.0.0)
- **documents**: implement Phase 40 — KwakoPos Document & Asset Operating Layer (KDAOL v1.0.0)
- **integration**: implement Phase 39 — KwakoPos Integration Center Operating Layer (KIOL v1.0.0)
- **crm**: implement Phase 38 — KwakoPos CRM Operating Layer (KCRML v1.0.0)
- **workforce**: implement Phase 37 — KwakoPos Workforce Operating Layer (KWOL v1.0.0)
- **supply-chain**: implement Phase 36 — KwakoPos Supply Chain Operating Layer (KSCOL v1.0.0)
- **treasury**: implement Phase 35 — Finance & Treasury Operating Layer (KFTL v1.0.0)
- **core**: Phase 34 -- Enterprise Approvals (KEAE v1.0.0) -- 85 Pillars 100% Certified -- 42/42 Modules PASS
- **core**: Implement Phase 33 — AI Operating Layer OS with 75-Pillar Engine
- **core**: Implement Phase 32 — BI / Analytics OS with 85-Pillar Engine
- **core**: Implement Phase 31 — Workflow, Automation & Business Process OS with 75-Pillar Engine
- **core**: Implement Phase 30 — UI Certification Framework with 80-Pillar Engine
- **core**: Implement Phase 29 — Super Admin & Platform UI with 70-Pillar Certification Engine
- **core**: Implement Phase 28 — Dynamic Module UI with 74-Pillar Certification Engine
- **core**: Implement Phase 27 — Core Operating UI with 73-Pillar Certification Engine
- **core**: Implement Phase 26 — KwakoPos Design System (KDS) with 65-Pillar Certification Engine
- **core**: Implement Phase 25 — KwakoPos System UI & Experience Architecture with 30-Pillar Certification Engine
- **core**: Implement Advanced Workforce Tracking & Time Management Operating System with 58-Pillar Certification Engine
- **core**: Implement Phase 24 — Platform Governance (KPGA) Framework with 58-Pillar Certification Engine
- **core**: Implement Phase 23 — KwakoPos Certification Program (KCA) Framework with 48-Pillar Certification Engine
- **core**: Implement Phase 22 — Autonomous Operations (KAOF) Framework with 56-Pillar Certification Engine
- **core**: Implement Phase 21 — AI-Native Business Operations (KAGS) Framework with 50-Pillar Certification Engine
- **core**: Implement Phase 20 — Global Expansion (KGF) Framework with 55-Pillar Certification Engine
- **core**: Implement Phase 19 — Partner Ecosystem Scale (KPP) Framework with 48-Pillar Certification Engine
- **core**: Implement Phase 18 — Enterprise Customer Onboarding (KEIF) Framework with 40-Pillar Certification Engine
- **core**: Promote high-margin enterprise verticals (Wholesale, Construction, Real Estate, Telecom, Bar Lounge) to Tier 1 Flagship commercial portfolio
- **core**: Add Real Estate (61-Pillar), Bar Lounge (59-Pillar), and Telecom (67-Pillar) OS modules into KwakoPos SaaS Monorepo
- **industry**: add Advanced Garage OS, Advanced Wholesale OS, and Advanced Construction OS modules with 100% 183-Pillar certification
- **pmf**: implement Phase 17 Product-Market Validation engine & evidence framework
- **commercial**: implement Phase 16 Commercial Product Readiness engine & portfolio governance
- **pillars**: add Locked Automated GitHub Release & Tagging Engine (21 Pillars) to production matrix
- **release**: implement and lock Enterprise Automated GitHub Release & Tagging Engine
- **industry**: export complete industry catalog
- **industry**: compose enterprise industry catalog
- **industry**: export hardware and electronics engines
- **industry**: add hardware and electronics plugin manifests
- **industry**: add electronics serial and warranty engine
- **industry**: add hardware industry engine

### ⚡ Improvements & Enhancements
- **core**: Add stub engines for missing observability and release management classes
- **package**: add release management scripts
- **core**: Merge pull request #6 from Kwakoko/feat/industry-modules-wholesale-restaurant-pharmacy-hardware-electronics
- **core**: Merge branch 'main' into feat/industry-modules-wholesale-restaurant-pharmacy-hardware-electronics
- **web**: completely delete buildWeb.ts script and purge remaining legacy UI references from parity matrix
- **web**: eliminate legacy RealAppShell and ClientAppRoot DOM paths in favor of canonical V2 React app
- **core**: invalidate stale release certification provenance for current main
- **core**: require compiled production artifacts and version-bound PWA service worker in strict certification
- **core**: align strict runtime certification with actual IndexedDB implementation APIs
- **core**: use actual PWA schema version in IndexedDB initialization
- **core**: make actual IndexedDB version match requested PWA schema version
- **core**: fix sync cursor race by anchoring delta reads to a pre-query server timestamp
- **core**: refine IndexedDB hydration to avoid duplicate callbacks and centralize store definitions
- **core**: bind PWA service-worker cache lifecycle to release version
- **core**: eliminate IndexedDB hydration race in synchronization and harden JWT decoding
- **core**: fix client sync to persist pulled inventory state and retain failed operations for explicit retry
- **core**: persist server-pulled StockLedger, StockAdjustment and sync metadata through IndexedDB
- **core**: add permanent release-version consistency enforcement to strict certification
- **core**: align monorepo release version with active API and web version 2.5.0
- **core**: extend strict runtime certification to production auth and commercial sync invariants
- **core**: fix production offline sync for POS sales and purchase receipts using atomic finance transactions
- **core**: fix auth gateway body parsing and ambiguous multi-tenant login selection
- **core**: scope blocking dependency audit to production runtime dependencies
- **core**: refine strict runtime gate to detect silent local sync completion bypasses
- **core**: add CI strict runtime certification gate
- **core**: add strict runtime certification gate that rejects synthetic or bypassed production behavior
- **core**: add safe automatic access-token refresh and resilient session handling
- **core**: fix PWA version detection and stop reporting unknown server state as up-to-date
- **core**: make hardened API gateway the preferred production entrypoint
- **core**: run hardened auth gateway as API entrypoint
- **core**: harden production auth gateway and persistent sessions
- **core**: fix production authentication persistence without disturbing existing API routes
- **cert**: update evidence artifacts for refinement and certification pass
- **cert**: update evidence artifacts for Old App UX + V2 Architecture certification
- **cert**: update evidence artifacts for Phase 30.5 workstream certification
- **evidence**: update local release evidence artifacts
- **cert**: complete full platform refinement, verification, testing, and 100% multi-domain certification
- **config**: specify Node >=20 engines requirement in package.json
- **security**: apply centralized tenant/rbac hardening
- **core**: integrate remote main changes with production certification closure
- **ci**: restrict workflow permissions to required read access
- **sync**: align fixtures with strict Git provenance verification
- **release**: propagate immutable source SHA into Cloud Build image provenance
- **security**: record production hardening blockers
- **industry**: keep domain index diff minimal
- **industry**: certify five-industry catalog coverage
- **industry**: use public domain exports for electronics
- **industry**: use public domain exports for hardware
- **industry**: certify electronics serial and warranty controls
- **industry**: certify hardware engine rules

### 🐛 Bug Fixes
- **contexts**: purge synthetic DEFAULT_TENANTS and DEFAULT_BRANCHES arrays
- **users-roles**: replace synthetic user, session, and role arrays with live V2 API & RBAC integration
- **dashboard,customers**: replace synthetic data arrays with live operational V2 API and LocalIndexedDbStore integration
- **cert**: route security certification through strict runtime gate
- **cert**: remove hard-coded go-live credentials and validate auth cookie rotation
- **auth-ui**: load dedicated authentication styles
- **auth**: correct fixed-server startup guard
- **auth**: use HttpOnly refresh cookie and remove runtime bootstrap login
- **auth**: keep refresh tokens out of browser storage
- **auth-ui**: remove unsupported POS PIN authentication path
- **sec**: complete production cleanup of DEMO_ACCOUNTS and pre-filled authentication credentials
- **certification**: require exact-commit executable UI evidence for production certification
- **context**: remove synthetic tenant/branch lists and fail closed on context switching
- **ui**: remove hard-coded secondary workspace data and keep V2 UI evidence honest
- **api**: resolve static asset routing and MIME types for web dist JS/CSS bundles
- **web**: remove synthetic search and add real responsive System UI controls
- **web**: await local hydration before restoring authenticated workspace
- **web**: persist V2 local operational state in browser IndexedDB
- **web**: replace demo workspace data with real V2 API and local-state workflows
- **web**: gate System UI behind real V2 authentication
- **web**: build and serve the real React app through Vite
- **web**: load React System UI styles from Vite entrypoint
- **web**: replace React provider placeholders with V2 auth session and scoped runtime
- **web**: add real V2 API/session client for React application
- **config**: add container runtime environment fallbacks for resolveRealGitSha in Cloud Run
- **deploy**: use dynamic multi-candidate path resolver in index.js for Cloud Run start
- **deploy**: add root start entrypoint and configure runtime secrets for App Hosting buildpack
- **security**: enforce admin RBAC and tenant isolation
- **test**: align commercial readiness tier expectations
- **certification**: final production certification closure, fail-closed SHA provenance, ed25519 signing & route fixes
- **release**: inject runtime secrets from Secret Manager without exposing values
- **security**: remove credentials from environment example
- **auth**: remove hard-coded dev secret and enforce persistent session store lifecycle
- **config**: eliminate fake release identities and hard-coded secrets
- **sync**: eliminate remaining fail-open release and repository verification paths
- **release**: bind container provenance and trusted signing to exact release
- **certification**: fully close provenance, CI, signature, and release-tag gaps
- **security**: make vulnerability audit fail closed
- **release**: verify container provenance independently and remove credential fallbacks
- **release**: embed immutable source provenance in container image
- **certification**: resolve git init in certification test fixture
- **certification**: harden provenance inputs and CI evidence access
- **ci**: enforce independent release provenance certification and fail-closed CI evidence
- **certification**: use real fixture repositories and explicit CI check policy
- **certification**: isolate synthetic safety tests and enforce independent production provenance
- **certification**: make release integrity gates fail-closed and independently verifiable
- **release**: implement 15-gate release integrity certification and 5-field evidence bundle
- **sync**: enforce strict release chain, tag peeling, tripartite SHA verification, and atomic locks
- **version-gate**: synchronize monorepo package versions to 2.5.0 and pass complete production certification
- **remediation**: complete priority remediation checklist (test-auth bypass, CORS, mandatory secrets, scrypt hashing, postgres session store, pipeline cleanup)
- **security**: enforce salted scrypt password hashing, mandatory JWT secret in prod, and replace db:push with db:migrate
- **release**: enable auto credential extraction & PATCH updates in publish-github-release
- **industry**: keep electronics dependencies within plugin graph

### 🛡️ Security Updates
- **rbac**: enforce strict fail-closed module entitlement and purge dev superuser emails

### 🔌 API Changes
- **api**: expose public GET / root info endpoint

### 🎨 UI/UX Changes
- **ui**: extract dedicated full-fidelity modular pages for Customers, Purchasing, and Settings
- **ui**: extract dedicated full-fidelity modular pages for Reports, Users & Roles, SuperAdmin, CashDrawer, Receipts, Trash, and Help
- **auth-ui**: add dedicated V2 authentication styles
- **ui**: migrate mature legacy UX components to KwakoPosv2 design system
- **web**: realize full matured UI composition with 23 domain workspace views and standalone TopBar/Sidebar/BottomNav/AppVersionFooter components
- **web,api**: implement full live tenant and branch context switching with server JWT re-issuance
- **web**: restore full 23-component KwakoPos UX composition and domain views
- **web**: isolate PWA asset generation from legacy HTML shell
- **web**: add V2 React System UI stylesheet
- **web**: add real Vite React HTML entrypoint
- **web**: add real authentication entry screen
- **web**: realize KwakoPosv2 real React application foundation with provider suite, layouts, and workspace pages
- **ui**: realize interactive client SPA router and 11 browser workflows with concrete E2E evidence

### 👥 Contributors
Credit to: Kwakoko, teacher-9r, Jack91186


# Release Notes - KwakoPos v2.5.1 (2026-09-02)

### 🚀 Features
- feat(users-roles): implement unified users and roles access security system
- feat(cash-drawer): implement production-grade cash drawer command center
- feat(inventory): add SaaS production inventory valuation metrics, WAC calculation, product profitability breakdown, and multi-branch historical reports
- feat(context): export AuthProvider, SessionProvider, ModuleProvider, SyncProvider, TenantProvider, BranchProvider, RbacProvider, and ThemeProvider aliases from KwakoPosContexts
- feat(milestone): complete Legacy Behavioral Parity → V2 Production Implementation
- feat(inventory): implement full-fidelity Product Variants & Attribute Builder
- feat(inventory): implement dedicated full-fidelity Inventory & Stock Operations Command Center
- feat(pos): implement dedicated full-fidelity Core POS Counter Workspace
- feat(ui): extract dedicated full-fidelity modular pages for Customers, Purchasing, and Settings
- feat(ui): extract dedicated full-fidelity modular pages for Reports, Users & Roles, SuperAdmin, CashDrawer, Receipts, Trash, and Help
- feat(cert): add strict security runtime gate with fail-closed evidence checks
- feat(auth-ui): add dedicated V2 authentication styles
- feat(security): incorporate KwakoPosv2 Certification Status Hierarchy & PASS_WITH_P3_HARDENING state machine
- feat(ui): migrate mature legacy UX components to KwakoPosv2 design system
- feat(web): realize full matured UI composition with 23 domain workspace views and standalone TopBar/Sidebar/BottomNav/AppVersionFooter components
- feat(web,api): implement full live tenant and branch context switching with server JWT re-issuance
- feat(web): restore full 23-component KwakoPos UX composition and domain views
- feat(web): isolate PWA asset generation from legacy HTML shell
- feat(web): add V2 React System UI stylesheet
- feat(web): add real Vite React HTML entrypoint
- feat(web): add real authentication entry screen
- feat(web): realize KwakoPosv2 real React application foundation with provider suite, layouts, and workspace pages
- feat(ui): realize interactive client SPA router and 11 browser workflows with concrete E2E evidence
- feat(pwa): complete Phase 30.5 System UI realization, old-app parity matrix, and 40-control certification
- feat(pwa): separate Web UI landing shell from API routing and enforce PWA distribution hardening
- feat(api): expose public GET / root info endpoint
- feat(release): bind folder sync evidence to release proof and add concurrency lock crash recovery
- feat(release): add fail-closed verification, true semver, real rollback, and evidence generation to folder sync engine
- feat(release): implement local semantic version folder synchronization engine
- feat(golive-certificate): issue KwakoPos Production Release Candidate / Go-Live Certificate for SHA a9eb1d89de5e411272e7a7633cab2c22a7f33d06
- feat(trust-certification): complete Final Production Trust Certification gates (fail-closed candidate evidence, mandatory PostgreSQL sessions in prod, adversarial AI authorization test suite)
- feat(full-system-certification): implement Phase 45 — Full KwakoPos Operating System Certification (KFOS-CERT v1.0.0)
- feat(platform-intelligence): implement Phase 44 — KwakoPos Platform Intelligence & Decision Support OS (KPIOL v1.0.0)
- feat(autonomous-operations): implement Phase 43 — KwakoPos Autonomous Operations Platform OS (KAOL v2.0.0)
- feat(security): implement Phase 42 — KwakoPos Security & Permanent Platform Control OS (KSOL v2.0.0)
- feat(autonomous-business): implement Phase 42 — KwakoPos Autonomous Business Operations OS (KABO v1.0.0)
- feat(global-platform): implement Phase 41 — KwakoPos Global Platform & Multi-Region OS (KGPA v1.0.0)
- feat(marketplace): implement Phase 40 — KwakoPos Marketplace & Commercial Ecosystem OS (KMKOL v1.0.0)
- feat(licensing): implement Phase 45 — KwakoPos Platform Licensing & Monetization Operating Layer (KPLOL v1.0.0)
- feat(multisite): implement Phase 44 — KwakoPos Multi-Site & Enterprise Admin Operating Layer (KMAOL v1.0.0)
- feat(compliance): implement Phase 43 — KwakoPos Compliance & Audit Operating Layer (KCAOL v1.0.0)
- feat(notifications): implement Phase 42 — KwakoPos Notification Operating Layer (KNCOL v1.0.0)
- feat(security): implement Phase 41 — KwakoPos Security & Risk Operating Layer (KSROL v1.0.0)
- feat(documents): implement Phase 40 — KwakoPos Document & Asset Operating Layer (KDAOL v1.0.0)
- feat(integration): implement Phase 39 — KwakoPos Integration Center Operating Layer (KIOL v1.0.0)
- feat(crm): implement Phase 38 — KwakoPos CRM Operating Layer (KCRML v1.0.0)
- feat(workforce): implement Phase 37 — KwakoPos Workforce Operating Layer (KWOL v1.0.0)
- feat(supply-chain): implement Phase 36 — KwakoPos Supply Chain Operating Layer (KSCOL v1.0.0)
- feat(treasury): implement Phase 35 — Finance & Treasury Operating Layer (KFTL v1.0.0)
- feat: Phase 34 -- Enterprise Approvals (KEAE v1.0.0) -- 85 Pillars 100% Certified -- 42/42 Modules PASS
- feat: Implement Phase 33 — AI Operating Layer OS with 75-Pillar Engine
- feat: Implement Phase 32 — BI / Analytics OS with 85-Pillar Engine
- feat: Implement Phase 31 — Workflow, Automation & Business Process OS with 75-Pillar Engine
- feat: Implement Phase 30 — UI Certification Framework with 80-Pillar Engine
- feat: Implement Phase 29 — Super Admin & Platform UI with 70-Pillar Certification Engine
- feat: Implement Phase 28 — Dynamic Module UI with 74-Pillar Certification Engine
- feat: Implement Phase 27 — Core Operating UI with 73-Pillar Certification Engine
- feat: Implement Phase 26 — KwakoPos Design System (KDS) with 65-Pillar Certification Engine
- feat: Implement Phase 25 — KwakoPos System UI & Experience Architecture with 30-Pillar Certification Engine
- feat: Implement Advanced Workforce Tracking & Time Management Operating System with 58-Pillar Certification Engine
- feat: Implement Phase 24 — Platform Governance (KPGA) Framework with 58-Pillar Certification Engine
- feat: Implement Phase 23 — KwakoPos Certification Program (KCA) Framework with 48-Pillar Certification Engine
- feat: Implement Phase 22 — Autonomous Operations (KAOF) Framework with 56-Pillar Certification Engine
- feat: Implement Phase 21 — AI-Native Business Operations (KAGS) Framework with 50-Pillar Certification Engine
- feat: Implement Phase 20 — Global Expansion (KGF) Framework with 55-Pillar Certification Engine
- feat: Implement Phase 19 — Partner Ecosystem Scale (KPP) Framework with 48-Pillar Certification Engine
- feat: Implement Phase 18 — Enterprise Customer Onboarding (KEIF) Framework with 40-Pillar Certification Engine
- feat: Promote high-margin enterprise verticals (Wholesale, Construction, Real Estate, Telecom, Bar Lounge) to Tier 1 Flagship commercial portfolio
- feat: Add Real Estate (61-Pillar), Bar Lounge (59-Pillar), and Telecom (67-Pillar) OS modules into KwakoPos SaaS Monorepo
- feat(industry): add Advanced Garage OS, Advanced Wholesale OS, and Advanced Construction OS modules with 100% 183-Pillar certification
- feat(pmf): implement Phase 17 Product-Market Validation engine & evidence framework
- feat(commercial): implement Phase 16 Commercial Product Readiness engine & portfolio governance
- feat(pillars): add Locked Automated GitHub Release & Tagging Engine (21 Pillars) to production matrix
- feat(release): implement and lock Enterprise Automated GitHub Release & Tagging Engine
- feat(industry): export complete industry catalog
- feat(industry): compose enterprise industry catalog
- feat(industry): export hardware and electronics engines
- feat(industry): add hardware and electronics plugin manifests
- feat(industry): add electronics serial and warranty engine
- feat(industry): add hardware industry engine

### 🐛 Bug Fixes
- fix(contexts): purge synthetic DEFAULT_TENANTS and DEFAULT_BRANCHES arrays
- fix(users-roles): replace synthetic user, session, and role arrays with live V2 API & RBAC integration
- fix(dashboard,customers): replace synthetic data arrays with live operational V2 API and LocalIndexedDbStore integration
- fix(cert): route security certification through strict runtime gate
- fix(cert): remove hard-coded go-live credentials and validate auth cookie rotation
- fix(auth-ui): load dedicated authentication styles
- fix(auth): correct fixed-server startup guard
- fix(auth): use HttpOnly refresh cookie and remove runtime bootstrap login
- fix(auth): keep refresh tokens out of browser storage
- fix(auth-ui): remove unsupported POS PIN authentication path
- fix(sec): complete production cleanup of DEMO_ACCOUNTS and pre-filled authentication credentials
- fix(certification): require exact-commit executable UI evidence for production certification
- fix(context): remove synthetic tenant/branch lists and fail closed on context switching
- fix(ui): remove hard-coded secondary workspace data and keep V2 UI evidence honest
- fix(api): resolve static asset routing and MIME types for web dist JS/CSS bundles
- fix sync cursor race by anchoring delta reads to a pre-query server timestamp
- fix client sync to persist pulled inventory state and retain failed operations for explicit retry
- fix production offline sync for POS sales and purchase receipts using atomic finance transactions
- fix auth gateway body parsing and ambiguous multi-tenant login selection
- fix PWA version detection and stop reporting unknown server state as up-to-date
- fix production authentication persistence without disturbing existing API routes
- fix(web): remove synthetic search and add real responsive System UI controls
- fix(web): await local hydration before restoring authenticated workspace
- fix(web): persist V2 local operational state in browser IndexedDB
- fix(web): replace demo workspace data with real V2 API and local-state workflows
- fix(web): gate System UI behind real V2 authentication
- fix(web): build and serve the real React app through Vite
- fix(web): load React System UI styles from Vite entrypoint
- fix(web): replace React provider placeholders with V2 auth session and scoped runtime
- fix(web): add real V2 API/session client for React application
- fix(config): add container runtime environment fallbacks for resolveRealGitSha in Cloud Run
- fix(deploy): use dynamic multi-candidate path resolver in index.js for Cloud Run start
- fix(deploy): add root start entrypoint and configure runtime secrets for App Hosting buildpack
- fix(security): enforce admin RBAC and tenant isolation
- fix(test): align commercial readiness tier expectations
- fix(certification): final production certification closure, fail-closed SHA provenance, ed25519 signing & route fixes
- fix(release): inject runtime secrets from Secret Manager without exposing values
- fix(security): remove credentials from environment example
- fix(auth): remove hard-coded dev secret and enforce persistent session store lifecycle
- fix(config): eliminate fake release identities and hard-coded secrets
- fix(sync): eliminate remaining fail-open release and repository verification paths
- fix(release): bind container provenance and trusted signing to exact release
- fix(certification): fully close provenance, CI, signature, and release-tag gaps
- fix(security): make vulnerability audit fail closed
- fix(release): verify container provenance independently and remove credential fallbacks
- fix(release): embed immutable source provenance in container image
- fix(certification): resolve git init in certification test fixture
- fix(certification): harden provenance inputs and CI evidence access
- fix(ci): enforce independent release provenance certification and fail-closed CI evidence
- fix(certification): use real fixture repositories and explicit CI check policy
- fix(certification): isolate synthetic safety tests and enforce independent production provenance
- fix(certification): make release integrity gates fail-closed and independently verifiable
- fix(release): implement 15-gate release integrity certification and 5-field evidence bundle
- fix(sync): enforce strict release chain, tag peeling, tripartite SHA verification, and atomic locks
- fix(version-gate): synchronize monorepo package versions to 2.5.0 and pass complete production certification
- fix(remediation): complete priority remediation checklist (test-auth bypass, CORS, mandatory secrets, scrypt hashing, postgres session store, pipeline cleanup)
- fix(security): enforce salted scrypt password hashing, mandatory JWT secret in prod, and replace db:push with db:migrate
- fix(release): enable auto credential extraction & PATCH updates in publish-github-release
- fix(industry): keep electronics dependencies within plugin graph

### 🛠 Refactoring & Architecture
- refactor(web): eliminate legacy RealAppShell and ClientAppRoot DOM paths in favor of canonical V2 React app
- refactor(cert): complete full platform refinement, verification, testing, and 100% multi-domain certification
- refactor(industry): keep domain index diff minimal

### 📚 Documentation
- docs(security): record production hardening blockers

### 🔧 Maintenance & Chores
- security(rbac): enforce strict fail-closed module entitlement and purge dev superuser emails
- Merge pull request #6 from Kwakoko/feat/industry-modules-wholesale-restaurant-pharmacy-hardware-electronics
- Merge branch 'main' into feat/industry-modules-wholesale-restaurant-pharmacy-hardware-electronics
- chore(web): completely delete buildWeb.ts script and purge remaining legacy UI references from parity matrix
- invalidate stale release certification provenance for current main
- require compiled production artifacts and version-bound PWA service worker in strict certification
- align strict runtime certification with actual IndexedDB implementation APIs
- use actual PWA schema version in IndexedDB initialization
- make actual IndexedDB version match requested PWA schema version
- refine IndexedDB hydration to avoid duplicate callbacks and centralize store definitions
- bind PWA service-worker cache lifecycle to release version
- eliminate IndexedDB hydration race in synchronization and harden JWT decoding
- persist server-pulled StockLedger, StockAdjustment and sync metadata through IndexedDB
- add permanent release-version consistency enforcement to strict certification
- align monorepo release version with active API and web version 2.5.0
- extend strict runtime certification to production auth and commercial sync invariants
- scope blocking dependency audit to production runtime dependencies
- refine strict runtime gate to detect silent local sync completion bypasses
- add CI strict runtime certification gate
- add strict runtime certification gate that rejects synthetic or bypassed production behavior
- add safe automatic access-token refresh and resilient session handling
- make hardened API gateway the preferred production entrypoint
- run hardened auth gateway as API entrypoint
- harden production auth gateway and persistent sessions
- chore(cert): update evidence artifacts for refinement and certification pass
- chore(cert): update evidence artifacts for Old App UX + V2 Architecture certification
- chore(cert): update evidence artifacts for Phase 30.5 workstream certification
- chore(evidence): update local release evidence artifacts
- chore(config): specify Node >=20 engines requirement in package.json
- chore(security): apply centralized tenant/rbac hardening
- merge: integrate remote main changes with production certification closure
- chore(ci): restrict workflow permissions to required read access
- test(sync): align fixtures with strict Git provenance verification
- build(release): propagate immutable source SHA into Cloud Build image provenance
- test(industry): certify five-industry catalog coverage
- test(industry): use public domain exports for electronics
- test(industry): use public domain exports for hardware
- test(industry): certify electronics serial and warranty controls
- test(industry): certify hardware engine rules

---

# Release Notes - KwakoPos v2.5.1 (2026-09-02)

### 🚀 Features
- feat(users-roles): implement unified users and roles access security system
- feat(cash-drawer): implement production-grade cash drawer command center
- feat(inventory): add SaaS production inventory valuation metrics, WAC calculation, product profitability breakdown, and multi-branch historical reports
- feat(context): export AuthProvider, SessionProvider, ModuleProvider, SyncProvider, TenantProvider, BranchProvider, RbacProvider, and ThemeProvider aliases from KwakoPosContexts
- feat(milestone): complete Legacy Behavioral Parity → V2 Production Implementation
- feat(inventory): implement full-fidelity Product Variants & Attribute Builder
- feat(inventory): implement dedicated full-fidelity Inventory & Stock Operations Command Center
- feat(pos): implement dedicated full-fidelity Core POS Counter Workspace
- feat(ui): extract dedicated full-fidelity modular pages for Customers, Purchasing, and Settings
- feat(ui): extract dedicated full-fidelity modular pages for Reports, Users & Roles, SuperAdmin, CashDrawer, Receipts, Trash, and Help
- feat(cert): add strict security runtime gate with fail-closed evidence checks
- feat(auth-ui): add dedicated V2 authentication styles
- feat(security): incorporate KwakoPosv2 Certification Status Hierarchy & PASS_WITH_P3_HARDENING state machine
- feat(ui): migrate mature legacy UX components to KwakoPosv2 design system
- feat(web): realize full matured UI composition with 23 domain workspace views and standalone TopBar/Sidebar/BottomNav/AppVersionFooter components
- feat(web,api): implement full live tenant and branch context switching with server JWT re-issuance
- feat(web): restore full 23-component KwakoPos UX composition and domain views
- feat(web): isolate PWA asset generation from legacy HTML shell
- feat(web): add V2 React System UI stylesheet
- feat(web): add real Vite React HTML entrypoint
- feat(web): add real authentication entry screen
- feat(web): realize KwakoPosv2 real React application foundation with provider suite, layouts, and workspace pages
- feat(ui): realize interactive client SPA router and 11 browser workflows with concrete E2E evidence
- feat(pwa): complete Phase 30.5 System UI realization, old-app parity matrix, and 40-control certification
- feat(pwa): separate Web UI landing shell from API routing and enforce PWA distribution hardening
- feat(api): expose public GET / root info endpoint
- feat(release): bind folder sync evidence to release proof and add concurrency lock crash recovery
- feat(release): add fail-closed verification, true semver, real rollback, and evidence generation to folder sync engine
- feat(release): implement local semantic version folder synchronization engine
- feat(golive-certificate): issue KwakoPos Production Release Candidate / Go-Live Certificate for SHA a9eb1d89de5e411272e7a7633cab2c22a7f33d06
- feat(trust-certification): complete Final Production Trust Certification gates (fail-closed candidate evidence, mandatory PostgreSQL sessions in prod, adversarial AI authorization test suite)
- feat(full-system-certification): implement Phase 45 — Full KwakoPos Operating System Certification (KFOS-CERT v1.0.0)
- feat(platform-intelligence): implement Phase 44 — KwakoPos Platform Intelligence & Decision Support OS (KPIOL v1.0.0)
- feat(autonomous-operations): implement Phase 43 — KwakoPos Autonomous Operations Platform OS (KAOL v2.0.0)
- feat(security): implement Phase 42 — KwakoPos Security & Permanent Platform Control OS (KSOL v2.0.0)
- feat(autonomous-business): implement Phase 42 — KwakoPos Autonomous Business Operations OS (KABO v1.0.0)
- feat(global-platform): implement Phase 41 — KwakoPos Global Platform & Multi-Region OS (KGPA v1.0.0)
- feat(marketplace): implement Phase 40 — KwakoPos Marketplace & Commercial Ecosystem OS (KMKOL v1.0.0)
- feat(licensing): implement Phase 45 — KwakoPos Platform Licensing & Monetization Operating Layer (KPLOL v1.0.0)
- feat(multisite): implement Phase 44 — KwakoPos Multi-Site & Enterprise Admin Operating Layer (KMAOL v1.0.0)
- feat(compliance): implement Phase 43 — KwakoPos Compliance & Audit Operating Layer (KCAOL v1.0.0)
- feat(notifications): implement Phase 42 — KwakoPos Notification Operating Layer (KNCOL v1.0.0)
- feat(security): implement Phase 41 — KwakoPos Security & Risk Operating Layer (KSROL v1.0.0)
- feat(documents): implement Phase 40 — KwakoPos Document & Asset Operating Layer (KDAOL v1.0.0)
- feat(integration): implement Phase 39 — KwakoPos Integration Center Operating Layer (KIOL v1.0.0)
- feat(crm): implement Phase 38 — KwakoPos CRM Operating Layer (KCRML v1.0.0)
- feat(workforce): implement Phase 37 — KwakoPos Workforce Operating Layer (KWOL v1.0.0)
- feat(supply-chain): implement Phase 36 — KwakoPos Supply Chain Operating Layer (KSCOL v1.0.0)
- feat(treasury): implement Phase 35 — Finance & Treasury Operating Layer (KFTL v1.0.0)
- feat: Phase 34 -- Enterprise Approvals (KEAE v1.0.0) -- 85 Pillars 100% Certified -- 42/42 Modules PASS
- feat: Implement Phase 33 — AI Operating Layer OS with 75-Pillar Engine
- feat: Implement Phase 32 — BI / Analytics OS with 85-Pillar Engine
- feat: Implement Phase 31 — Workflow, Automation & Business Process OS with 75-Pillar Engine
- feat: Implement Phase 30 — UI Certification Framework with 80-Pillar Engine
- feat: Implement Phase 29 — Super Admin & Platform UI with 70-Pillar Certification Engine
- feat: Implement Phase 28 — Dynamic Module UI with 74-Pillar Certification Engine
- feat: Implement Phase 27 — Core Operating UI with 73-Pillar Certification Engine
- feat: Implement Phase 26 — KwakoPos Design System (KDS) with 65-Pillar Certification Engine
- feat: Implement Phase 25 — KwakoPos System UI & Experience Architecture with 30-Pillar Certification Engine
- feat: Implement Advanced Workforce Tracking & Time Management Operating System with 58-Pillar Certification Engine
- feat: Implement Phase 24 — Platform Governance (KPGA) Framework with 58-Pillar Certification Engine
- feat: Implement Phase 23 — KwakoPos Certification Program (KCA) Framework with 48-Pillar Certification Engine
- feat: Implement Phase 22 — Autonomous Operations (KAOF) Framework with 56-Pillar Certification Engine
- feat: Implement Phase 21 — AI-Native Business Operations (KAGS) Framework with 50-Pillar Certification Engine
- feat: Implement Phase 20 — Global Expansion (KGF) Framework with 55-Pillar Certification Engine
- feat: Implement Phase 19 — Partner Ecosystem Scale (KPP) Framework with 48-Pillar Certification Engine
- feat: Implement Phase 18 — Enterprise Customer Onboarding (KEIF) Framework with 40-Pillar Certification Engine
- feat: Promote high-margin enterprise verticals (Wholesale, Construction, Real Estate, Telecom, Bar Lounge) to Tier 1 Flagship commercial portfolio
- feat: Add Real Estate (61-Pillar), Bar Lounge (59-Pillar), and Telecom (67-Pillar) OS modules into KwakoPos SaaS Monorepo
- feat(industry): add Advanced Garage OS, Advanced Wholesale OS, and Advanced Construction OS modules with 100% 183-Pillar certification
- feat(pmf): implement Phase 17 Product-Market Validation engine & evidence framework
- feat(commercial): implement Phase 16 Commercial Product Readiness engine & portfolio governance
- feat(pillars): add Locked Automated GitHub Release & Tagging Engine (21 Pillars) to production matrix
- feat(release): implement and lock Enterprise Automated GitHub Release & Tagging Engine
- feat(industry): export complete industry catalog
- feat(industry): compose enterprise industry catalog
- feat(industry): export hardware and electronics engines
- feat(industry): add hardware and electronics plugin manifests
- feat(industry): add electronics serial and warranty engine
- feat(industry): add hardware industry engine

### 🐛 Bug Fixes
- fix(contexts): purge synthetic DEFAULT_TENANTS and DEFAULT_BRANCHES arrays
- fix(users-roles): replace synthetic user, session, and role arrays with live V2 API & RBAC integration
- fix(dashboard,customers): replace synthetic data arrays with live operational V2 API and LocalIndexedDbStore integration
- fix(cert): route security certification through strict runtime gate
- fix(cert): remove hard-coded go-live credentials and validate auth cookie rotation
- fix(auth-ui): load dedicated authentication styles
- fix(auth): correct fixed-server startup guard
- fix(auth): use HttpOnly refresh cookie and remove runtime bootstrap login
- fix(auth): keep refresh tokens out of browser storage
- fix(auth-ui): remove unsupported POS PIN authentication path
- fix(sec): complete production cleanup of DEMO_ACCOUNTS and pre-filled authentication credentials
- fix(certification): require exact-commit executable UI evidence for production certification
- fix(context): remove synthetic tenant/branch lists and fail closed on context switching
- fix(ui): remove hard-coded secondary workspace data and keep V2 UI evidence honest
- fix(api): resolve static asset routing and MIME types for web dist JS/CSS bundles
- fix sync cursor race by anchoring delta reads to a pre-query server timestamp
- fix client sync to persist pulled inventory state and retain failed operations for explicit retry
- fix production offline sync for POS sales and purchase receipts using atomic finance transactions
- fix auth gateway body parsing and ambiguous multi-tenant login selection
- fix PWA version detection and stop reporting unknown server state as up-to-date
- fix production authentication persistence without disturbing existing API routes
- fix(web): remove synthetic search and add real responsive System UI controls
- fix(web): await local hydration before restoring authenticated workspace
- fix(web): persist V2 local operational state in browser IndexedDB
- fix(web): replace demo workspace data with real V2 API and local-state workflows
- fix(web): gate System UI behind real V2 authentication
- fix(web): build and serve the real React app through Vite
- fix(web): load React System UI styles from Vite entrypoint
- fix(web): replace React provider placeholders with V2 auth session and scoped runtime
- fix(web): add real V2 API/session client for React application
- fix(config): add container runtime environment fallbacks for resolveRealGitSha in Cloud Run
- fix(deploy): use dynamic multi-candidate path resolver in index.js for Cloud Run start
- fix(deploy): add root start entrypoint and configure runtime secrets for App Hosting buildpack
- fix(security): enforce admin RBAC and tenant isolation
- fix(test): align commercial readiness tier expectations
- fix(certification): final production certification closure, fail-closed SHA provenance, ed25519 signing & route fixes
- fix(release): inject runtime secrets from Secret Manager without exposing values
- fix(security): remove credentials from environment example
- fix(auth): remove hard-coded dev secret and enforce persistent session store lifecycle
- fix(config): eliminate fake release identities and hard-coded secrets
- fix(sync): eliminate remaining fail-open release and repository verification paths
- fix(release): bind container provenance and trusted signing to exact release
- fix(certification): fully close provenance, CI, signature, and release-tag gaps
- fix(security): make vulnerability audit fail closed
- fix(release): verify container provenance independently and remove credential fallbacks
- fix(release): embed immutable source provenance in container image
- fix(certification): resolve git init in certification test fixture
- fix(certification): harden provenance inputs and CI evidence access
- fix(ci): enforce independent release provenance certification and fail-closed CI evidence
- fix(certification): use real fixture repositories and explicit CI check policy
- fix(certification): isolate synthetic safety tests and enforce independent production provenance
- fix(certification): make release integrity gates fail-closed and independently verifiable
- fix(release): implement 15-gate release integrity certification and 5-field evidence bundle
- fix(sync): enforce strict release chain, tag peeling, tripartite SHA verification, and atomic locks
- fix(version-gate): synchronize monorepo package versions to 2.5.0 and pass complete production certification
- fix(remediation): complete priority remediation checklist (test-auth bypass, CORS, mandatory secrets, scrypt hashing, postgres session store, pipeline cleanup)
- fix(security): enforce salted scrypt password hashing, mandatory JWT secret in prod, and replace db:push with db:migrate
- fix(release): enable auto credential extraction & PATCH updates in publish-github-release
- fix(industry): keep electronics dependencies within plugin graph

### 🛠 Refactoring & Architecture
- refactor(web): eliminate legacy RealAppShell and ClientAppRoot DOM paths in favor of canonical V2 React app
- refactor(cert): complete full platform refinement, verification, testing, and 100% multi-domain certification
- refactor(industry): keep domain index diff minimal

### 📚 Documentation
- docs(security): record production hardening blockers

### 🔧 Maintenance & Chores
- security(rbac): enforce strict fail-closed module entitlement and purge dev superuser emails
- Merge pull request #6 from Kwakoko/feat/industry-modules-wholesale-restaurant-pharmacy-hardware-electronics
- Merge branch 'main' into feat/industry-modules-wholesale-restaurant-pharmacy-hardware-electronics
- chore(web): completely delete buildWeb.ts script and purge remaining legacy UI references from parity matrix
- invalidate stale release certification provenance for current main
- require compiled production artifacts and version-bound PWA service worker in strict certification
- align strict runtime certification with actual IndexedDB implementation APIs
- use actual PWA schema version in IndexedDB initialization
- make actual IndexedDB version match requested PWA schema version
- refine IndexedDB hydration to avoid duplicate callbacks and centralize store definitions
- bind PWA service-worker cache lifecycle to release version
- eliminate IndexedDB hydration race in synchronization and harden JWT decoding
- persist server-pulled StockLedger, StockAdjustment and sync metadata through IndexedDB
- add permanent release-version consistency enforcement to strict certification
- align monorepo release version with active API and web version 2.5.0
- extend strict runtime certification to production auth and commercial sync invariants
- scope blocking dependency audit to production runtime dependencies
- refine strict runtime gate to detect silent local sync completion bypasses
- add CI strict runtime certification gate
- add strict runtime certification gate that rejects synthetic or bypassed production behavior
- add safe automatic access-token refresh and resilient session handling
- make hardened API gateway the preferred production entrypoint
- run hardened auth gateway as API entrypoint
- harden production auth gateway and persistent sessions
- chore(cert): update evidence artifacts for refinement and certification pass
- chore(cert): update evidence artifacts for Old App UX + V2 Architecture certification
- chore(cert): update evidence artifacts for Phase 30.5 workstream certification
- chore(evidence): update local release evidence artifacts
- chore(config): specify Node >=20 engines requirement in package.json
- chore(security): apply centralized tenant/rbac hardening
- merge: integrate remote main changes with production certification closure
- chore(ci): restrict workflow permissions to required read access
- test(sync): align fixtures with strict Git provenance verification
- build(release): propagate immutable source SHA into Cloud Build image provenance
- test(industry): certify five-industry catalog coverage
- test(industry): use public domain exports for electronics
- test(industry): use public domain exports for hardware
- test(industry): certify electronics serial and warranty controls
- test(industry): certify hardware engine rules

---

# Release Notes - KwakoPos v2.5.1 (2026-09-02)

### 🚀 Features
- feat(users-roles): implement unified users and roles access security system
- feat(cash-drawer): implement production-grade cash drawer command center
- feat(inventory): add SaaS production inventory valuation metrics, WAC calculation, product profitability breakdown, and multi-branch historical reports
- feat(context): export AuthProvider, SessionProvider, ModuleProvider, SyncProvider, TenantProvider, BranchProvider, RbacProvider, and ThemeProvider aliases from KwakoPosContexts
- feat(milestone): complete Legacy Behavioral Parity → V2 Production Implementation
- feat(inventory): implement full-fidelity Product Variants & Attribute Builder
- feat(inventory): implement dedicated full-fidelity Inventory & Stock Operations Command Center
- feat(pos): implement dedicated full-fidelity Core POS Counter Workspace
- feat(ui): extract dedicated full-fidelity modular pages for Customers, Purchasing, and Settings
- feat(ui): extract dedicated full-fidelity modular pages for Reports, Users & Roles, SuperAdmin, CashDrawer, Receipts, Trash, and Help
- feat(cert): add strict security runtime gate with fail-closed evidence checks
- feat(auth-ui): add dedicated V2 authentication styles
- feat(security): incorporate KwakoPosv2 Certification Status Hierarchy & PASS_WITH_P3_HARDENING state machine
- feat(ui): migrate mature legacy UX components to KwakoPosv2 design system
- feat(web): realize full matured UI composition with 23 domain workspace views and standalone TopBar/Sidebar/BottomNav/AppVersionFooter components
- feat(web,api): implement full live tenant and branch context switching with server JWT re-issuance
- feat(web): restore full 23-component KwakoPos UX composition and domain views
- feat(web): isolate PWA asset generation from legacy HTML shell
- feat(web): add V2 React System UI stylesheet
- feat(web): add real Vite React HTML entrypoint
- feat(web): add real authentication entry screen
- feat(web): realize KwakoPosv2 real React application foundation with provider suite, layouts, and workspace pages
- feat(ui): realize interactive client SPA router and 11 browser workflows with concrete E2E evidence
- feat(pwa): complete Phase 30.5 System UI realization, old-app parity matrix, and 40-control certification
- feat(pwa): separate Web UI landing shell from API routing and enforce PWA distribution hardening
- feat(api): expose public GET / root info endpoint
- feat(release): bind folder sync evidence to release proof and add concurrency lock crash recovery
- feat(release): add fail-closed verification, true semver, real rollback, and evidence generation to folder sync engine
- feat(release): implement local semantic version folder synchronization engine
- feat(golive-certificate): issue KwakoPos Production Release Candidate / Go-Live Certificate for SHA a9eb1d89de5e411272e7a7633cab2c22a7f33d06
- feat(trust-certification): complete Final Production Trust Certification gates (fail-closed candidate evidence, mandatory PostgreSQL sessions in prod, adversarial AI authorization test suite)
- feat(full-system-certification): implement Phase 45 — Full KwakoPos Operating System Certification (KFOS-CERT v1.0.0)
- feat(platform-intelligence): implement Phase 44 — KwakoPos Platform Intelligence & Decision Support OS (KPIOL v1.0.0)
- feat(autonomous-operations): implement Phase 43 — KwakoPos Autonomous Operations Platform OS (KAOL v2.0.0)
- feat(security): implement Phase 42 — KwakoPos Security & Permanent Platform Control OS (KSOL v2.0.0)
- feat(autonomous-business): implement Phase 42 — KwakoPos Autonomous Business Operations OS (KABO v1.0.0)
- feat(global-platform): implement Phase 41 — KwakoPos Global Platform & Multi-Region OS (KGPA v1.0.0)
- feat(marketplace): implement Phase 40 — KwakoPos Marketplace & Commercial Ecosystem OS (KMKOL v1.0.0)
- feat(licensing): implement Phase 45 — KwakoPos Platform Licensing & Monetization Operating Layer (KPLOL v1.0.0)
- feat(multisite): implement Phase 44 — KwakoPos Multi-Site & Enterprise Admin Operating Layer (KMAOL v1.0.0)
- feat(compliance): implement Phase 43 — KwakoPos Compliance & Audit Operating Layer (KCAOL v1.0.0)
- feat(notifications): implement Phase 42 — KwakoPos Notification Operating Layer (KNCOL v1.0.0)
- feat(security): implement Phase 41 — KwakoPos Security & Risk Operating Layer (KSROL v1.0.0)
- feat(documents): implement Phase 40 — KwakoPos Document & Asset Operating Layer (KDAOL v1.0.0)
- feat(integration): implement Phase 39 — KwakoPos Integration Center Operating Layer (KIOL v1.0.0)
- feat(crm): implement Phase 38 — KwakoPos CRM Operating Layer (KCRML v1.0.0)
- feat(workforce): implement Phase 37 — KwakoPos Workforce Operating Layer (KWOL v1.0.0)
- feat(supply-chain): implement Phase 36 — KwakoPos Supply Chain Operating Layer (KSCOL v1.0.0)
- feat(treasury): implement Phase 35 — Finance & Treasury Operating Layer (KFTL v1.0.0)
- feat: Phase 34 -- Enterprise Approvals (KEAE v1.0.0) -- 85 Pillars 100% Certified -- 42/42 Modules PASS
- feat: Implement Phase 33 — AI Operating Layer OS with 75-Pillar Engine
- feat: Implement Phase 32 — BI / Analytics OS with 85-Pillar Engine
- feat: Implement Phase 31 — Workflow, Automation & Business Process OS with 75-Pillar Engine
- feat: Implement Phase 30 — UI Certification Framework with 80-Pillar Engine
- feat: Implement Phase 29 — Super Admin & Platform UI with 70-Pillar Certification Engine
- feat: Implement Phase 28 — Dynamic Module UI with 74-Pillar Certification Engine
- feat: Implement Phase 27 — Core Operating UI with 73-Pillar Certification Engine
- feat: Implement Phase 26 — KwakoPos Design System (KDS) with 65-Pillar Certification Engine
- feat: Implement Phase 25 — KwakoPos System UI & Experience Architecture with 30-Pillar Certification Engine
- feat: Implement Advanced Workforce Tracking & Time Management Operating System with 58-Pillar Certification Engine
- feat: Implement Phase 24 — Platform Governance (KPGA) Framework with 58-Pillar Certification Engine
- feat: Implement Phase 23 — KwakoPos Certification Program (KCA) Framework with 48-Pillar Certification Engine
- feat: Implement Phase 22 — Autonomous Operations (KAOF) Framework with 56-Pillar Certification Engine
- feat: Implement Phase 21 — AI-Native Business Operations (KAGS) Framework with 50-Pillar Certification Engine
- feat: Implement Phase 20 — Global Expansion (KGF) Framework with 55-Pillar Certification Engine
- feat: Implement Phase 19 — Partner Ecosystem Scale (KPP) Framework with 48-Pillar Certification Engine
- feat: Implement Phase 18 — Enterprise Customer Onboarding (KEIF) Framework with 40-Pillar Certification Engine
- feat: Promote high-margin enterprise verticals (Wholesale, Construction, Real Estate, Telecom, Bar Lounge) to Tier 1 Flagship commercial portfolio
- feat: Add Real Estate (61-Pillar), Bar Lounge (59-Pillar), and Telecom (67-Pillar) OS modules into KwakoPos SaaS Monorepo
- feat(industry): add Advanced Garage OS, Advanced Wholesale OS, and Advanced Construction OS modules with 100% 183-Pillar certification
- feat(pmf): implement Phase 17 Product-Market Validation engine & evidence framework
- feat(commercial): implement Phase 16 Commercial Product Readiness engine & portfolio governance
- feat(pillars): add Locked Automated GitHub Release & Tagging Engine (21 Pillars) to production matrix
- feat(release): implement and lock Enterprise Automated GitHub Release & Tagging Engine
- feat(industry): export complete industry catalog
- feat(industry): compose enterprise industry catalog
- feat(industry): export hardware and electronics engines
- feat(industry): add hardware and electronics plugin manifests
- feat(industry): add electronics serial and warranty engine
- feat(industry): add hardware industry engine

### 🐛 Bug Fixes
- fix(contexts): purge synthetic DEFAULT_TENANTS and DEFAULT_BRANCHES arrays
- fix(users-roles): replace synthetic user, session, and role arrays with live V2 API & RBAC integration
- fix(dashboard,customers): replace synthetic data arrays with live operational V2 API and LocalIndexedDbStore integration
- fix(cert): route security certification through strict runtime gate
- fix(cert): remove hard-coded go-live credentials and validate auth cookie rotation
- fix(auth-ui): load dedicated authentication styles
- fix(auth): correct fixed-server startup guard
- fix(auth): use HttpOnly refresh cookie and remove runtime bootstrap login
- fix(auth): keep refresh tokens out of browser storage
- fix(auth-ui): remove unsupported POS PIN authentication path
- fix(sec): complete production cleanup of DEMO_ACCOUNTS and pre-filled authentication credentials
- fix(certification): require exact-commit executable UI evidence for production certification
- fix(context): remove synthetic tenant/branch lists and fail closed on context switching
- fix(ui): remove hard-coded secondary workspace data and keep V2 UI evidence honest
- fix(api): resolve static asset routing and MIME types for web dist JS/CSS bundles
- fix sync cursor race by anchoring delta reads to a pre-query server timestamp
- fix client sync to persist pulled inventory state and retain failed operations for explicit retry
- fix production offline sync for POS sales and purchase receipts using atomic finance transactions
- fix auth gateway body parsing and ambiguous multi-tenant login selection
- fix PWA version detection and stop reporting unknown server state as up-to-date
- fix production authentication persistence without disturbing existing API routes
- fix(web): remove synthetic search and add real responsive System UI controls
- fix(web): await local hydration before restoring authenticated workspace
- fix(web): persist V2 local operational state in browser IndexedDB
- fix(web): replace demo workspace data with real V2 API and local-state workflows
- fix(web): gate System UI behind real V2 authentication
- fix(web): build and serve the real React app through Vite
- fix(web): load React System UI styles from Vite entrypoint
- fix(web): replace React provider placeholders with V2 auth session and scoped runtime
- fix(web): add real V2 API/session client for React application
- fix(config): add container runtime environment fallbacks for resolveRealGitSha in Cloud Run
- fix(deploy): use dynamic multi-candidate path resolver in index.js for Cloud Run start
- fix(deploy): add root start entrypoint and configure runtime secrets for App Hosting buildpack
- fix(security): enforce admin RBAC and tenant isolation
- fix(test): align commercial readiness tier expectations
- fix(certification): final production certification closure, fail-closed SHA provenance, ed25519 signing & route fixes
- fix(release): inject runtime secrets from Secret Manager without exposing values
- fix(security): remove credentials from environment example
- fix(auth): remove hard-coded dev secret and enforce persistent session store lifecycle
- fix(config): eliminate fake release identities and hard-coded secrets
- fix(sync): eliminate remaining fail-open release and repository verification paths
- fix(release): bind container provenance and trusted signing to exact release
- fix(certification): fully close provenance, CI, signature, and release-tag gaps
- fix(security): make vulnerability audit fail closed
- fix(release): verify container provenance independently and remove credential fallbacks
- fix(release): embed immutable source provenance in container image
- fix(certification): resolve git init in certification test fixture
- fix(certification): harden provenance inputs and CI evidence access
- fix(ci): enforce independent release provenance certification and fail-closed CI evidence
- fix(certification): use real fixture repositories and explicit CI check policy
- fix(certification): isolate synthetic safety tests and enforce independent production provenance
- fix(certification): make release integrity gates fail-closed and independently verifiable
- fix(release): implement 15-gate release integrity certification and 5-field evidence bundle
- fix(sync): enforce strict release chain, tag peeling, tripartite SHA verification, and atomic locks
- fix(version-gate): synchronize monorepo package versions to 2.5.0 and pass complete production certification
- fix(remediation): complete priority remediation checklist (test-auth bypass, CORS, mandatory secrets, scrypt hashing, postgres session store, pipeline cleanup)
- fix(security): enforce salted scrypt password hashing, mandatory JWT secret in prod, and replace db:push with db:migrate
- fix(release): enable auto credential extraction & PATCH updates in publish-github-release
- fix(industry): keep electronics dependencies within plugin graph

### 🛠 Refactoring & Architecture
- refactor(web): eliminate legacy RealAppShell and ClientAppRoot DOM paths in favor of canonical V2 React app
- refactor(cert): complete full platform refinement, verification, testing, and 100% multi-domain certification
- refactor(industry): keep domain index diff minimal

### 📚 Documentation
- docs(security): record production hardening blockers

### 🔧 Maintenance & Chores
- security(rbac): enforce strict fail-closed module entitlement and purge dev superuser emails
- Merge pull request #6 from Kwakoko/feat/industry-modules-wholesale-restaurant-pharmacy-hardware-electronics
- Merge branch 'main' into feat/industry-modules-wholesale-restaurant-pharmacy-hardware-electronics
- chore(web): completely delete buildWeb.ts script and purge remaining legacy UI references from parity matrix
- invalidate stale release certification provenance for current main
- require compiled production artifacts and version-bound PWA service worker in strict certification
- align strict runtime certification with actual IndexedDB implementation APIs
- use actual PWA schema version in IndexedDB initialization
- make actual IndexedDB version match requested PWA schema version
- refine IndexedDB hydration to avoid duplicate callbacks and centralize store definitions
- bind PWA service-worker cache lifecycle to release version
- eliminate IndexedDB hydration race in synchronization and harden JWT decoding
- persist server-pulled StockLedger, StockAdjustment and sync metadata through IndexedDB
- add permanent release-version consistency enforcement to strict certification
- align monorepo release version with active API and web version 2.5.0
- extend strict runtime certification to production auth and commercial sync invariants
- scope blocking dependency audit to production runtime dependencies
- refine strict runtime gate to detect silent local sync completion bypasses
- add CI strict runtime certification gate
- add strict runtime certification gate that rejects synthetic or bypassed production behavior
- add safe automatic access-token refresh and resilient session handling
- make hardened API gateway the preferred production entrypoint
- run hardened auth gateway as API entrypoint
- harden production auth gateway and persistent sessions
- chore(cert): update evidence artifacts for refinement and certification pass
- chore(cert): update evidence artifacts for Old App UX + V2 Architecture certification
- chore(cert): update evidence artifacts for Phase 30.5 workstream certification
- chore(evidence): update local release evidence artifacts
- chore(config): specify Node >=20 engines requirement in package.json
- chore(security): apply centralized tenant/rbac hardening
- merge: integrate remote main changes with production certification closure
- chore(ci): restrict workflow permissions to required read access
- test(sync): align fixtures with strict Git provenance verification
- build(release): propagate immutable source SHA into Cloud Build image provenance
- test(industry): certify five-industry catalog coverage
- test(industry): use public domain exports for electronics
- test(industry): use public domain exports for hardware
- test(industry): certify electronics serial and warranty controls
- test(industry): certify hardware engine rules

---

# Release Notes - KwakoPos v2.2.0 (2026-09-02)

### 🚀 Features
- feat(users-roles): implement unified users and roles access security system
- feat(cash-drawer): implement production-grade cash drawer command center
- feat(inventory): add SaaS production inventory valuation metrics, WAC calculation, product profitability breakdown, and multi-branch historical reports
- feat(context): export AuthProvider, SessionProvider, ModuleProvider, SyncProvider, TenantProvider, BranchProvider, RbacProvider, and ThemeProvider aliases from KwakoPosContexts
- feat(milestone): complete Legacy Behavioral Parity → V2 Production Implementation
- feat(inventory): implement full-fidelity Product Variants & Attribute Builder
- feat(inventory): implement dedicated full-fidelity Inventory & Stock Operations Command Center
- feat(pos): implement dedicated full-fidelity Core POS Counter Workspace
- feat(ui): extract dedicated full-fidelity modular pages for Customers, Purchasing, and Settings
- feat(ui): extract dedicated full-fidelity modular pages for Reports, Users & Roles, SuperAdmin, CashDrawer, Receipts, Trash, and Help
- feat(cert): add strict security runtime gate with fail-closed evidence checks
- feat(auth-ui): add dedicated V2 authentication styles
- feat(security): incorporate KwakoPosv2 Certification Status Hierarchy & PASS_WITH_P3_HARDENING state machine
- feat(ui): migrate mature legacy UX components to KwakoPosv2 design system
- feat(web): realize full matured UI composition with 23 domain workspace views and standalone TopBar/Sidebar/BottomNav/AppVersionFooter components
- feat(web,api): implement full live tenant and branch context switching with server JWT re-issuance
- feat(web): restore full 23-component KwakoPos UX composition and domain views
- feat(web): isolate PWA asset generation from legacy HTML shell
- feat(web): add V2 React System UI stylesheet
- feat(web): add real Vite React HTML entrypoint
- feat(web): add real authentication entry screen
- feat(web): realize KwakoPosv2 real React application foundation with provider suite, layouts, and workspace pages
- feat(ui): realize interactive client SPA router and 11 browser workflows with concrete E2E evidence
- feat(pwa): complete Phase 30.5 System UI realization, old-app parity matrix, and 40-control certification
- feat(pwa): separate Web UI landing shell from API routing and enforce PWA distribution hardening
- feat(api): expose public GET / root info endpoint
- feat(release): bind folder sync evidence to release proof and add concurrency lock crash recovery
- feat(release): add fail-closed verification, true semver, real rollback, and evidence generation to folder sync engine
- feat(release): implement local semantic version folder synchronization engine
- feat(golive-certificate): issue KwakoPos Production Release Candidate / Go-Live Certificate for SHA a9eb1d89de5e411272e7a7633cab2c22a7f33d06
- feat(trust-certification): complete Final Production Trust Certification gates (fail-closed candidate evidence, mandatory PostgreSQL sessions in prod, adversarial AI authorization test suite)
- feat(full-system-certification): implement Phase 45 — Full KwakoPos Operating System Certification (KFOS-CERT v1.0.0)
- feat(platform-intelligence): implement Phase 44 — KwakoPos Platform Intelligence & Decision Support OS (KPIOL v1.0.0)
- feat(autonomous-operations): implement Phase 43 — KwakoPos Autonomous Operations Platform OS (KAOL v2.0.0)
- feat(security): implement Phase 42 — KwakoPos Security & Permanent Platform Control OS (KSOL v2.0.0)
- feat(autonomous-business): implement Phase 42 — KwakoPos Autonomous Business Operations OS (KABO v1.0.0)
- feat(global-platform): implement Phase 41 — KwakoPos Global Platform & Multi-Region OS (KGPA v1.0.0)
- feat(marketplace): implement Phase 40 — KwakoPos Marketplace & Commercial Ecosystem OS (KMKOL v1.0.0)
- feat(licensing): implement Phase 45 — KwakoPos Platform Licensing & Monetization Operating Layer (KPLOL v1.0.0)
- feat(multisite): implement Phase 44 — KwakoPos Multi-Site & Enterprise Admin Operating Layer (KMAOL v1.0.0)
- feat(compliance): implement Phase 43 — KwakoPos Compliance & Audit Operating Layer (KCAOL v1.0.0)
- feat(notifications): implement Phase 42 — KwakoPos Notification Operating Layer (KNCOL v1.0.0)
- feat(security): implement Phase 41 — KwakoPos Security & Risk Operating Layer (KSROL v1.0.0)
- feat(documents): implement Phase 40 — KwakoPos Document & Asset Operating Layer (KDAOL v1.0.0)
- feat(integration): implement Phase 39 — KwakoPos Integration Center Operating Layer (KIOL v1.0.0)
- feat(crm): implement Phase 38 — KwakoPos CRM Operating Layer (KCRML v1.0.0)
- feat(workforce): implement Phase 37 — KwakoPos Workforce Operating Layer (KWOL v1.0.0)
- feat(supply-chain): implement Phase 36 — KwakoPos Supply Chain Operating Layer (KSCOL v1.0.0)
- feat(treasury): implement Phase 35 — Finance & Treasury Operating Layer (KFTL v1.0.0)
- feat: Phase 34 -- Enterprise Approvals (KEAE v1.0.0) -- 85 Pillars 100% Certified -- 42/42 Modules PASS
- feat: Implement Phase 33 — AI Operating Layer OS with 75-Pillar Engine
- feat: Implement Phase 32 — BI / Analytics OS with 85-Pillar Engine
- feat: Implement Phase 31 — Workflow, Automation & Business Process OS with 75-Pillar Engine
- feat: Implement Phase 30 — UI Certification Framework with 80-Pillar Engine
- feat: Implement Phase 29 — Super Admin & Platform UI with 70-Pillar Certification Engine
- feat: Implement Phase 28 — Dynamic Module UI with 74-Pillar Certification Engine
- feat: Implement Phase 27 — Core Operating UI with 73-Pillar Certification Engine
- feat: Implement Phase 26 — KwakoPos Design System (KDS) with 65-Pillar Certification Engine
- feat: Implement Phase 25 — KwakoPos System UI & Experience Architecture with 30-Pillar Certification Engine
- feat: Implement Advanced Workforce Tracking & Time Management Operating System with 58-Pillar Certification Engine
- feat: Implement Phase 24 — Platform Governance (KPGA) Framework with 58-Pillar Certification Engine
- feat: Implement Phase 23 — KwakoPos Certification Program (KCA) Framework with 48-Pillar Certification Engine
- feat: Implement Phase 22 — Autonomous Operations (KAOF) Framework with 56-Pillar Certification Engine
- feat: Implement Phase 21 — AI-Native Business Operations (KAGS) Framework with 50-Pillar Certification Engine
- feat: Implement Phase 20 — Global Expansion (KGF) Framework with 55-Pillar Certification Engine
- feat: Implement Phase 19 — Partner Ecosystem Scale (KPP) Framework with 48-Pillar Certification Engine
- feat: Implement Phase 18 — Enterprise Customer Onboarding (KEIF) Framework with 40-Pillar Certification Engine
- feat: Promote high-margin enterprise verticals (Wholesale, Construction, Real Estate, Telecom, Bar Lounge) to Tier 1 Flagship commercial portfolio
- feat: Add Real Estate (61-Pillar), Bar Lounge (59-Pillar), and Telecom (67-Pillar) OS modules into KwakoPos SaaS Monorepo
- feat(industry): add Advanced Garage OS, Advanced Wholesale OS, and Advanced Construction OS modules with 100% 183-Pillar certification
- feat(pmf): implement Phase 17 Product-Market Validation engine & evidence framework
- feat(commercial): implement Phase 16 Commercial Product Readiness engine & portfolio governance
- feat(pillars): add Locked Automated GitHub Release & Tagging Engine (21 Pillars) to production matrix
- feat(release): implement and lock Enterprise Automated GitHub Release & Tagging Engine
- feat(industry): export complete industry catalog
- feat(industry): compose enterprise industry catalog
- feat(industry): export hardware and electronics engines
- feat(industry): add hardware and electronics plugin manifests
- feat(industry): add electronics serial and warranty engine
- feat(industry): add hardware industry engine

### 🐛 Bug Fixes
- fix(contexts): purge synthetic DEFAULT_TENANTS and DEFAULT_BRANCHES arrays
- fix(users-roles): replace synthetic user, session, and role arrays with live V2 API & RBAC integration
- fix(dashboard,customers): replace synthetic data arrays with live operational V2 API and LocalIndexedDbStore integration
- fix(cert): route security certification through strict runtime gate
- fix(cert): remove hard-coded go-live credentials and validate auth cookie rotation
- fix(auth-ui): load dedicated authentication styles
- fix(auth): correct fixed-server startup guard
- fix(auth): use HttpOnly refresh cookie and remove runtime bootstrap login
- fix(auth): keep refresh tokens out of browser storage
- fix(auth-ui): remove unsupported POS PIN authentication path
- fix(sec): complete production cleanup of DEMO_ACCOUNTS and pre-filled authentication credentials
- fix(certification): require exact-commit executable UI evidence for production certification
- fix(context): remove synthetic tenant/branch lists and fail closed on context switching
- fix(ui): remove hard-coded secondary workspace data and keep V2 UI evidence honest
- fix(api): resolve static asset routing and MIME types for web dist JS/CSS bundles
- fix sync cursor race by anchoring delta reads to a pre-query server timestamp
- fix client sync to persist pulled inventory state and retain failed operations for explicit retry
- fix production offline sync for POS sales and purchase receipts using atomic finance transactions
- fix auth gateway body parsing and ambiguous multi-tenant login selection
- fix PWA version detection and stop reporting unknown server state as up-to-date
- fix production authentication persistence without disturbing existing API routes
- fix(web): remove synthetic search and add real responsive System UI controls
- fix(web): await local hydration before restoring authenticated workspace
- fix(web): persist V2 local operational state in browser IndexedDB
- fix(web): replace demo workspace data with real V2 API and local-state workflows
- fix(web): gate System UI behind real V2 authentication
- fix(web): build and serve the real React app through Vite
- fix(web): load React System UI styles from Vite entrypoint
- fix(web): replace React provider placeholders with V2 auth session and scoped runtime
- fix(web): add real V2 API/session client for React application
- fix(config): add container runtime environment fallbacks for resolveRealGitSha in Cloud Run
- fix(deploy): use dynamic multi-candidate path resolver in index.js for Cloud Run start
- fix(deploy): add root start entrypoint and configure runtime secrets for App Hosting buildpack
- fix(security): enforce admin RBAC and tenant isolation
- fix(test): align commercial readiness tier expectations
- fix(certification): final production certification closure, fail-closed SHA provenance, ed25519 signing & route fixes
- fix(release): inject runtime secrets from Secret Manager without exposing values
- fix(security): remove credentials from environment example
- fix(auth): remove hard-coded dev secret and enforce persistent session store lifecycle
- fix(config): eliminate fake release identities and hard-coded secrets
- fix(sync): eliminate remaining fail-open release and repository verification paths
- fix(release): bind container provenance and trusted signing to exact release
- fix(certification): fully close provenance, CI, signature, and release-tag gaps
- fix(security): make vulnerability audit fail closed
- fix(release): verify container provenance independently and remove credential fallbacks
- fix(release): embed immutable source provenance in container image
- fix(certification): resolve git init in certification test fixture
- fix(certification): harden provenance inputs and CI evidence access
- fix(ci): enforce independent release provenance certification and fail-closed CI evidence
- fix(certification): use real fixture repositories and explicit CI check policy
- fix(certification): isolate synthetic safety tests and enforce independent production provenance
- fix(certification): make release integrity gates fail-closed and independently verifiable
- fix(release): implement 15-gate release integrity certification and 5-field evidence bundle
- fix(sync): enforce strict release chain, tag peeling, tripartite SHA verification, and atomic locks
- fix(version-gate): synchronize monorepo package versions to 2.5.0 and pass complete production certification
- fix(remediation): complete priority remediation checklist (test-auth bypass, CORS, mandatory secrets, scrypt hashing, postgres session store, pipeline cleanup)
- fix(security): enforce salted scrypt password hashing, mandatory JWT secret in prod, and replace db:push with db:migrate
- fix(release): enable auto credential extraction & PATCH updates in publish-github-release
- fix(industry): keep electronics dependencies within plugin graph

### 🛠 Refactoring & Architecture
- refactor(web): eliminate legacy RealAppShell and ClientAppRoot DOM paths in favor of canonical V2 React app
- refactor(cert): complete full platform refinement, verification, testing, and 100% multi-domain certification
- refactor(industry): keep domain index diff minimal

### 📚 Documentation
- docs(security): record production hardening blockers

### 🔧 Maintenance & Chores
- security(rbac): enforce strict fail-closed module entitlement and purge dev superuser emails
- Merge pull request #6 from Kwakoko/feat/industry-modules-wholesale-restaurant-pharmacy-hardware-electronics
- Merge branch 'main' into feat/industry-modules-wholesale-restaurant-pharmacy-hardware-electronics
- chore(web): completely delete buildWeb.ts script and purge remaining legacy UI references from parity matrix
- invalidate stale release certification provenance for current main
- require compiled production artifacts and version-bound PWA service worker in strict certification
- align strict runtime certification with actual IndexedDB implementation APIs
- use actual PWA schema version in IndexedDB initialization
- make actual IndexedDB version match requested PWA schema version
- refine IndexedDB hydration to avoid duplicate callbacks and centralize store definitions
- bind PWA service-worker cache lifecycle to release version
- eliminate IndexedDB hydration race in synchronization and harden JWT decoding
- persist server-pulled StockLedger, StockAdjustment and sync metadata through IndexedDB
- add permanent release-version consistency enforcement to strict certification
- align monorepo release version with active API and web version 2.5.0
- extend strict runtime certification to production auth and commercial sync invariants
- scope blocking dependency audit to production runtime dependencies
- refine strict runtime gate to detect silent local sync completion bypasses
- add CI strict runtime certification gate
- add strict runtime certification gate that rejects synthetic or bypassed production behavior
- add safe automatic access-token refresh and resilient session handling
- make hardened API gateway the preferred production entrypoint
- run hardened auth gateway as API entrypoint
- harden production auth gateway and persistent sessions
- chore(cert): update evidence artifacts for refinement and certification pass
- chore(cert): update evidence artifacts for Old App UX + V2 Architecture certification
- chore(cert): update evidence artifacts for Phase 30.5 workstream certification
- chore(evidence): update local release evidence artifacts
- chore(config): specify Node >=20 engines requirement in package.json
- chore(security): apply centralized tenant/rbac hardening
- merge: integrate remote main changes with production certification closure
- chore(ci): restrict workflow permissions to required read access
- test(sync): align fixtures with strict Git provenance verification
- build(release): propagate immutable source SHA into Cloud Build image provenance
- test(industry): certify five-industry catalog coverage
- test(industry): use public domain exports for electronics
- test(industry): use public domain exports for hardware
- test(industry): certify electronics serial and warranty controls
- test(industry): certify hardware engine rules

---

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
# KwakoPos SaaS — Official Changelog

All notable changes to KwakoPos will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.5.0] - 2026-08-29

### Added
- **Major Enterprise Industry Vertical Operating Systems Platform (435 Pillars Certified)**:
  - **Retail Operating System (30 Pillars)**: Deep multi-tenant, offline-first retail operating system with product variants, inventory replenishment, margin protection, POS, StockLedger integration, and retail analytics.
  - **Restaurant Operating System (36 Pillars)**: Kitchen Display System (KDS), Table Management, Recipe BOM & Real-Time Food Costing, QR Ordering, Waste Ledger, and AI Menu Engineering.
  - **Pharmacy Management Operating System (28 Pillars)**: FEFO (First Expiry, First Out) dispensing, Batch Expiry Tracking, Prescription Lifecycle Management, Patient Profiles, and AI Drug Interaction Safety Engine.
  - **Law Firm Management Operating System (41 Pillars)**: Client & Matter Management, Court Hearing Schedules, Legal Document Vault, Billable Hours Tracking, Retainers, Trust Accounting, Conflict Checks, and Legal AI Copilot.
  - **SACCO / VICOBA Operating System (46 Pillars)**: Member Registration (KYC), Voluntary/Compulsory Savings Accounts, Share Capital Ledger, Group Meeting Cycles, Repayment Schedules, PAR 30/60/90+ tracking, Dividends, and SACCO Accounting.
  - **Microfinance & Lending Operating System (48 Pillars)**: Borrower 360, Individual & Solidarity Group Lending, Loan Formulas (Reducing Balance vs Flat Rate), Collateral Registration, Credit Scoring, Field Agent Mobile Receipts, and IFRS 9 ECL Provisioning.
  - **Poultry & Livestock Operating System (52 Pillars)**: Flock & Herd Lifecycle Engine, Egg Production Ledger, Feed Conversion Ratio (FCR), Animal Health & Vaccination Schedules, Daily Milk Yield, Cull Sales, and AI Outbreak Warnings.
  - **Vehicle & Fleet Management Operating System (50 Pillars)**: Digital Fleet OS managing vehicles, drivers, trip dispatching, GPS telematics, fuel fraud detection, preventive maintenance, tyres, and cost per kilometer calculation.
  - **Hardware Business Operating System (55 Pillars)**: Multi-Tier Unit Conversion Engine (Box → Piece, Bag → Kg, Sheet → Sqm), Contractor Project Billing, Multi-Tier Pricing (Retail, Wholesale, Contractor, Dealer), Delivery Dispatch, and Margin Controls.
  - **Advanced Electronics & Device Lifecycle OS (49 Pillars)**: Device Hierarchy (Category → Brand → Family → Model → Variant → Serial/IMEI), State Machine, Warranty Registration & Claims, Technical Repair Jobs, Spare Parts, Refurbishment Grading, and AI Diagnostic Assistant.

- **Monorepo Version Synchronization & Production Certification**:
  - Synchronized all 10 workspace packages (`apps/api`, `apps/web`, `@kwakopos2/config`, `@kwakopos2/domain`, `@kwakopos2/database`, `@kwakopos2/auth`, `@kwakopos2/sync`, `@kwakopos2/observability`, `@kwakopos2/contracts`) to `2.5.0`.
  - 100% 435-Pillar Industry Certification PASSED across all CLI certification campaigns (`certify:retail`, `certify:restaurant`, `certify:pharmacy`, `certify:lawfirm`, `certify:saccovicoba`, `certify:microfinance`, `certify:poultrylivestock`, `certify:vehiclefleet`, `certify:hardware`, `certify:electronics`).

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

## [2.4.0] - 2026-08-28

### ✨ New Features
- **security**: implement Phase 12 Security & Compliance Certification Platform
- **certification**: implement 11.1 Full-System Certification & Continuous Assurance Platform
- **cert**: implement Section 11.1 Full-System Certification Campaign runner
- **cert**: incorporate Phases 7-10 into production certification runner
- **release**: implement KwakoPos Release Engineering Platform v2
- **release**: implement SLSA Level 3 supply chain, SBOM generator, Risk Score engine, DORA metrics, and Progressive Delivery platform
- **release**: implement enterprise automated release management, versioning, quality gates, and CI/CD pipeline
- **saas**: Implement Phase 6 SaaS Monetization & Revenue Management with central plans, entitlements, billing, payments, and invariants M001-M015
- **telecom**: Implement Phase 5 Telecom & Technical Services Vertical with KML/KMZ, microwave engineering, RAN, and Invariants T001-T015

### ⚡ Improvements & Enhancements
- **release**: v2.3.0
- **release**: v2.4.0
- **pillars**: lock mandatory rule - refine, verify, test, certify after every feature implementation
- **cert**: update production certification evidence record for v2.2.0
- **release**: synchronize workspace package versions to 2.2.0
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
- **schema**: Map brandId to brand_id in Prisma Product model
- **build**: Add src to Dockerfile and standalone productService implementation in apps/api
- **catalog**: Implement Catalog Brand Persistence with brandId and brand_id path in src/services/productService.ts

### 👥 Contributors
Credit to: Kwakoko, github-actions[bot]