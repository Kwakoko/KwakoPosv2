# KwakoPos 2.0 — Production Observability, Dashboards & Alerting

## 1. Monitored Dashboards

### 1. Application Health Dashboard
* **Metrics**:
  * Request Rate (RPS by tenant / route)
  * Response Latency (, p95, p99$)
  * Error Rate (4xx vs 5xx breakdown)
  * Memory & CPU usage across Cloud Run container instances

### 2. Synchronization & Inventory Health Dashboard
* **Metrics**:
  * Sync Operations Pushed / Second
  * Sync Delta Latency
  * Outbox Backlog Volume
  * Dead-Letter Queue Depth
  * Stock Ledger Append Rate vs Stock Invariant Violations (Target: 0)

### 3. Release & Identity Verification Dashboard
* **Metrics**:
  * Active Cloud Run Revision Name
  * Running Container Image SHA-256 Digest
  * Live Git Commit SHA
  * Release Certification Evidence Status (\PASS\ / \FAIL\)

---

## 2. Actionable Production Alerting Rules

| Alert Name | Condition | Severity | Threshold | Action Runbook |
| :--- | :--- | :---: | :--- | :--- |
| **HighApiErrorRate** | HTTP 5xx rate > 1% over 5m | \CRITICAL\ | > 1.0% | Rollback Cloud Run revision |
| **DatabaseConnectionDrop** | \/readiness\ probe fails 3x | \CRITICAL\ | 3 consecutive failures | Check Neon DB connection pooling |
| **SyncDeadLetterSpike** | Dead-letter operations > 5 / 10m | \HIGH\ | > 5 | Check schema drift / payload format |
| **StockReconciliationAnomaly** | $\sum \text{Ledger} \neq \text{Stock}$ | \CRITICAL\ | $\ge 1$ anomaly | Run \scripts/ops/reconcile-data.ts\ |
| **UnauthorizedCrossTenantAttempt** | 403 Forbidden spikes on tenant isolation | \HIGH\ | > 10 / 5m | Investigate tenant session / token tampering |