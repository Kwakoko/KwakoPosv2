# KwakoPosv2 Security Hardening Blockers

This file records the mandatory production-release controls for the authentication, tenant boundary, database migration, secrets, and fail-closed release pipeline.

## Mandatory production controls

1. Production authentication requires a valid Bearer token; test header identity must never authorize production requests.
2. Refresh sessions are persisted in PostgreSQL/Prisma, not process memory.
3. Production secrets have no source-controlled fallback values.
4. Production migrations use versioned migrations, never `db:push`.
5. Release-critical GitHub Actions steps fail closed; no `continue-on-error` on certification, migration, deployment, promotion, or governance gates.
6. Database credentials are supplied only through protected GitHub/GCP secret mechanisms and must be rotated if exposed.
7. AI privileged actions derive actor, tenant, role, and permissions exclusively from authenticated server-side context.

## Release rule

**Any critical security, migration, certification, deployment, tenant-isolation, or governance failure blocks promotion.**
