# KwakoPos v2 — Conflict Resolution Matrix

## 1. Conflict Classification & Resolution Rules

KwakoPos v2 strictly bans blind "Last Write Wins" (LWW). Every conflict is categorized into one of four deterministic classes:

```text
[Incoming Mutation vs Existing State]
                   |
     +-------------+-------------+-------------+
     |                           |             |
     v                           v             v
[Class 1: Safe Merge]  [Class 2: Sequential] [Class 3: Stale Write]
- Independent fields   - Stock movements     - Check _baseUpdatedAt
- Combined atomically  - Both apply to ledger- Stale write rejected
                                               - User review requested
```

### Class 1: Safe Merge (Independent Non-Overlapping Attributes)
- **Applies to:** Customer profiles, Supplier contact details, and Product metadata where the selected fields can be safely combined.
- **Resolution Rule:** Normal stale writes are rejected. An operator-selected MERGE combines the current authoritative server record with the explicit merged payload inside a single PostgreSQL transaction and publishes a new journal revision.
- **Example:** Device A updates customer phone number while Device B updates customer delivery address; an operator can merge both changes into one authoritative revision.

### Class 2: Sequential Business Operations (Additive / Ledger Mutations)
- **Applies to:** Sales, Stock Movements, Payments, Expenses, Returns.
- **Resolution Rule:** Both operations represent legitimate real-world occurrences and MUST apply sequentially.
- **Example:** Device A sells 2 units of SKU-1 while offline. Device B sells 3 units of SKU-1 while offline. Upon reconnection, both stock ledger movements (-2 and -3) are appended. The resultant available stock is decremented by 5.

### Class 3: Stale Write Precondition Conflicts (Exclusive Overwriting Mutations)
- **Applies to:** Product pricing, Product SKU, Variant structure, Account codes.
- **Resolution Rule:** Precondition validation using `_baseUpdatedAt`.
  - If `server.updatedAt > client._baseUpdatedAt`: The mutation is rejected with `STALE_WRITE_CONFLICT`.
  - The client retains its uncommitted mutation in the Outbox marked `FAILED`, flags a conflict in `syncMetadata`, and requests operator intervention.
  - Silent overwriting of updated pricing or catalog data is strictly prevented.

### Class 4: Structural & Referential Conflicts
- **Applies to:** Variant creation for an archived product, or stock adjustments for a deleted variant.
- **Resolution Rule:** Hard referential integrity validation. If parent entity is inactive or deleted, mutation fails closed with descriptive business error code.

## 2. Audit Trail
Conflict detection and resolution are recorded in the persistent PostgreSQL `audit_events` table with tenant, branch, actor/device, operation and conflict metadata. `ProductionAuditStream` remains operational in-process telemetry and is not the durable conflict authority.
