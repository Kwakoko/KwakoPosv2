# KwakoPos 2.0 — Production Operations Runbook

## 1. Release & Deployment Operations

### Normal Deployment Pipeline
1. Commits pushed to branch \main\ trigger the **Production Release Certification State Machine** on GitHub Actions.
2. The pipeline executes:
   - Dependency Vulnerability Scan (\
pm audit\)
   - Unit & Invariant Tests (\
pm run test:unit\)
   - Integration & Multi-Tenant Isolation Tests (\
pm run test:integration\)
   - Sync Convergence Tests (\
pm run test:sync\)
   - Immutable Container Build with SHA-256 Digest Extraction
   - Zero-Traffic Cloud Run Candidate Deployment (\--no-traffic --tag=rc-<sha>\)
   - HTTPS Live Candidate Identity & Health Certification
   - Real Playwright Chromium Certification (Browser A -> Candidate -> Browser B)
   - 100% Traffic Promotion to Certified Revision
   - Post-Promotion Live Readiness Verification
   - Release Evidence Persistence in \rtifacts/release-evidence/\

### Zero-Downtime Rollback Procedure
If a production incident occurs on the active revision:
1. Identify the last known certified revision:
   \\\ash
   gcloud run revisions list --service=kwakopos-production-service --region=us-central1 --project=kwakoposv2
   \\\
2. Instantly route 100% traffic to the target previous revision:
   \\\ash
   gcloud run services update-traffic kwakopos-production-service --to-revisions=<PREVIOUS_REVISION_NAME>=100 --region=us-central1 --project=kwakoposv2
   \\\
3. Verify production health:
   \\\ash
   curl -s https://kwakokov2--kwakoposv2.us-east4.hosted.app/health
   \\\

---

## 2. Synchronization & Outbox Incident Handling

### Stuck Client Outbox
- **Symptom**: Client transactions remain in \PENDING\ status without advancing server sync cursor.
- **Diagnostic**: Check \/sync/delta\ responses and verify if \sync_dead_letters\ table contains rejected operation payloads.
- **Resolution**:
  1. Inspect error code on client sync metadata store: \db.syncMetadata.get("error_<opId>")\.
  2. If the operation is rejected due to a non-recoverable invariant violation, acknowledge to dead-letter storage and notify administrative operator.
  3. Re-trigger client sync push: \clientSyncEngine.syncWithServer(...)\.

---

## 3. Database & Connection Pool Resilience

- **Connection Pool Tuning**: Neon PostgreSQL connection pooling is managed via Prisma with automated reconnection retries on transient connection timeouts (timeout: 5000ms).
- **Periodic Data Integrity Reconciliation**:
  Run the automated data integrity scanner:
  \\\ash
  npx tsx scripts/ops/reconcile-data.ts
  \\\
  The scanner asserts:
  \text{ReportedStock} \equiv \sum \text{StockLedgerQuantity}
  \text{Adjustments} \longleftrightarrow \text{LedgerEntries (1:1 Bijection)}