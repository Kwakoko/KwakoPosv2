# KwakoPos v2 Convergence Contract

**Platform Invariant & Determinism Specification**  
**Document Revision:** 2.0.0  
**Status:** AUTHORITATIVE & BINDING  

---

## 1. Scope & Objective

This Convergence Contract defines the immutable rules, mathematical invariants, and domain policies that govern the state of the KwakoPos v2 platform across all physical nodes, clients, network boundaries, and storage layers.

Any code change, optimization, migration, or refactoring that violates any invariant defined herein is rejected as a defect by the platform certification gates.

---

## 2. Platform Invariants

### C-001 — Single Authority
* **Rule:** PostgreSQL/backend is the authoritative source of truth for all shared multi-user business state.
* **Invariant:** IndexedDB is an operational cache and offline replica. IndexedDB must never silently diverge into an independent competing source of truth. In any conflict between uncommitted local state and authoritative server commits, server authority governs according to deterministic domain policies.

### C-002 — Deterministic State
* **Rule:** Given the same set of authoritative operations and deterministic ordering rules, every replica client and backend instance must derive the exact same valid state.
* **Invariant:** 
  $$\forall S_1, S_2 \in \text{Clients}, \quad \text{Eval}(S_1, \mathcal{O}) \equiv \text{Eval}(S_2, \mathcal{O})$$
  where $\mathcal{O}$ is the ordered operation sequence.

### C-003 — Event/Operation Identity
* **Rule:** Every synchronizable mutation must possess a globally unique, client-generated operation UUID (`operationId`) and an idempotent delivery token (`idempotencyKey`).
* **Invariant:** No operation may depend solely on auto-incrementing integers, database sequence IDs, or timestamps for identity or deduplication.

### C-004 — Idempotency
* **Rule:** Replaying an already accepted operation must produce no additional business effect.
* **Invariant:** 
  $$\mathcal{M}(\mathcal{M}(S, op)) \equiv \mathcal{M}(S, op)$$
  Repeated delivery of operation $op$ returns `ALREADY_PROCESSED` and retains the original logical result.

### C-005 — Durable Outbox
* **Rule:** All offline mutations must enter a durable local Outbox before or atomically with local state mutation.
* **Invariant:** Outbox records must survive page reloads, browser restarts, PWA upgrades, service-worker lifecycle changes, power failures, and application crashes. An Outbox operation must never be pruned or deleted until the authoritative server durably acknowledges receipt (`SUCCESS` or `ALREADY_PROCESSED`).

### C-006 — No Silent Data Loss
* **Rule:** Failed synchronization operations must remain visible, logged, and recoverable.
* **Invariant:** Under no circumstance may sales, stock movements, purchase receipts, expenses, customers, suppliers, product variants, or financial transactions be silently discarded.

### C-007 — Conflict Determinism
* **Rule:** Concurrent mutations must have explicit, deterministic resolution policies.
* **Invariant:** Universal "Last Write Wins" (LWW) is strictly forbidden for financial, accounting, and inventory mutations. Domain-specific policies (Additive Stock Movements, Base-Timestamp Precondition Verification, Field-Level Safe Merge) govern all mutations.

### C-008 — Tenant Isolation
* **Rule:** Absolute multi-tenant data segregation.
* **Invariant:** No synchronization payload, outbox dispatch, bootstrap snapshot, delta query, or local cache lookup may permit data from Tenant $A$ to be observed or modified by Tenant $B$. Server identity derivation supersedes client-claimed tenant IDs.

### C-009 — Branch Isolation
* **Rule:** Branch-scoped operational boundaries.
* **Invariant:** Branch mutations and inventory allocations must adhere to authenticated branch authorization rules and organizational access boundaries.

### C-010 — Version Compatibility
* **Rule:** Formal semantic version and schema compatibility.
* **Invariant:** Client version, IndexedDB schema version, API contract version, Service Worker runtime version, and backend migration level must satisfy compatibility matrices defined in `release-manifest.json`. Outdated clients must be gracefully notified, never silently corrupted.

### C-011 — Recovery Convergence
* **Rule:** Deterministic return to authoritative state after anomalous interruption.
* **Invariant:** Following network disconnects, server restarts, client crashes, interrupted bootstrap, or PWA updates, the system must deterministically reconcile back into a valid, verified state without orphaned records or stock drift.

### C-012 — Release Convergence
* **Rule:** Cryptographic and operational runtime lineage.
* **Invariant:** The running production binary must trace with 100% cryptographic fidelity to:
  $$\text{Git SHA} \longleftrightarrow \text{Build Artifact} \longleftrightarrow \text{Container Digest} \longleftrightarrow \text{Cloud Run Revision} \longleftrightarrow \text{HTTPS Response}$$

---

## 3. Enforcement & Governance

All invariants are continuously verified by the **KwakoPos Convergence Certification Runner** (`scripts/release/convergence-certification-runner.ts`). A failure in any invariant results in an immediate `FAIL` gate status and prevents deployment promotion.
