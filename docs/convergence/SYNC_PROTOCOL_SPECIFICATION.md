# KwakoPos v2 — Synchronization Protocol Specification

**Protocol Version:** 2.0.0  
**Transport:** HTTPS / JSON  
**Encoding:** UTF-8  

---

## 1. Protocol Concepts

### 1.1 Operation Identification
Every synchronizable mutation must provide:
- `operationId`: Globally unique UUIDv4 generated at mutation creation time.
- `idempotencyKey`: Unique client token formatted as `${deviceId}/${operationId}` or `${entityType}/${idempotencyUUID}`.
- `clientCreatedAt`: ISO 8601 UTC timestamp of client mutation creation.
- `entityType`: Canonical entity name (`Product`, `ProductVariant`, `StockAdjustment`, `StockLedger`, `Sale`, etc.).
- `operationType`: `CREATE`, `UPDATE`, or `DELETE`.
- `payload`: Domain data object with optional `_baseUpdatedAt` precondition check.

### 1.2 Cryptographic Fingerprinting
To prevent replay attacks with modified contents, the server computes a deterministic SHA-256 fingerprint:
$$\text{Fingerprint} = \text{SHA256}(\text{CanonicalJSON}(\{ \text{entityType}, \text{entityId}, \text{operationType}, \text{payload} \}))$$
If an incoming `operationId` matches an existing record but the fingerprints differ, the server returns `SYNC_IDEMPOTENCY_CONFLICT` (HTTP 409).

---

## 2. Endpoints

### 2.1 POST `/sync/push`
Transmits a batch of client mutations (maximum 500 items) to the authoritative server.

**Request Schema:**
```json
{
  "deviceId": "dev-register-01",
  "syncEpoch": 1000,
  "operations": [
    {
      "operationId": "09822a16-6fe3-4db0-a35c-897ea4d8c6b2",
      "entityType": "Product",
      "entityId": "prod-100",
      "operationType": "CREATE",
      "payload": { "name": "Espresso Roast", "sku": "ESP-001" },
      "clientCreatedAt": "2026-09-10T12:00:00.000Z",
      "idempotencyKey": "dev-register-01/09822a16-6fe3-4db0-a35c-897ea4d8c6b2"
    }
  ]
}
```

**Response Schema:**
```json
{
  "success": true,
  "data": {
    "processedCount": 1,
    "results": [
      {
        "operationId": "09822a16-6fe3-4db0-a35c-897ea4d8c6b2",
        "idempotencyKey": "dev-register-01/09822a16-6fe3-4db0-a35c-897ea4d8c6b2",
        "status": "SUCCESS"
      }
    ]
  }
}
```

Status Codes per Operation:
- `SUCCESS`: Operation applied to authoritative database.
- `ALREADY_PROCESSED`: Duplicate operation acknowledged with zero repeated effect.
- `FAILED`: Business validation failed or stale write conflict; detailed in `error`.

### 2.2 GET `/sync/delta`
Fetches all authoritative entities created or updated since the client's confirmed timestamp.

**Query Parameters:**
- `since`: ISO 8601 UTC timestamp (default: `1970-01-01T00:00:00.000Z`).
- `limit`: Maximum entities per type (default: 500).

**Response Schema:**
```json
{
  "success": true,
  "data": {
    "serverTimestamp": "2026-09-10T12:05:00.000Z",
    "products": [...],
    "variants": [...],
    "stockLedger": [...],
    "adjustments": [...],
    "customers": [...],
    "suppliers": [...]
  }
}
```

### 2.3 POST `/sync/bootstrap`
Restores a complete, consistent, tenant-scoped authoritative snapshot for cold starts or full client reconciliation.

**Request Schema:**
```json
{
  "deviceId": "dev-register-01",
  "clientVersion": "2.12.5",
  "schemaVersion": 4,
  "branchId": "branch-001"
}
```

**Response Schema:**
```json
{
  "success": true,
  "data": {
    "snapshotTimestamp": "2026-09-10T12:05:00.000Z",
    "integrityChecksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "entityCounts": {
      "products": 150,
      "variants": 320,
      "stockLedger": 1200,
      "customers": 45
    },
    "products": [...],
    "variants": [...],
    "stockLedger": [...],
    "adjustments": [...],
    "customers": [...],
    "suppliers": [...]
  }
}
```

### 2.4 POST `/sync/reconcile`
Compares a client's local store counts and checksums with authoritative database state and returns discrepancies.

**Response:**
```json
{
  "success": true,
  "data": {
    "inSync": true,
    "discrepancies": {
      "missingOnClient": [],
      "extraOnClient": [],
      "staleOnClient": [],
      "stockMismatches": [],
      "orphanedVariants": []
    }
  }
}
```
