# Platform Services Production Lock v1

**Lock ID:** `KWAKOPOS-PLATFORM-SERVICES-PRODUCTION-LOCK-v1`  
**Certificate:** `KWAKOKO-PLATFORM-SERVICES-PRODUCTION-LOCK-CERTIFICATE-v1.0`  
**Status:** Mandatory, fail-closed  
**Scope:** C01-C11 Platform Services

## Locked services

| ID | Platform Service |
|---|---|
| C01 | Tenant Onboarding |
| C02 | Subscription / Billing |
| C03 | Workforce |
| C04 | Notifications |
| C05 | Documents |
| C06 | Integrations |
| C07 | AI |
| C08 | BI / Analytics |
| C09 | Workflow / Automation |
| C10 | Compliance |
| C11 | Super Admin |

## Production contract

Every service must have executable authority evidence covering its contracts/domain/service/UI surfaces where applicable, certification authority, and regression tests. Missing files or contract markers are release-blocking.

Dedicated service locks remain authoritative where they already exist: C03 Workforce, C04 Notifications, and C11 Super Admin.

The platform lock is the umbrella release authority for all eleven services. It does not replace service-specific locks; it closes the release-chain gap by requiring C01-C11 coverage as one fail-closed control.

## Release enforcement

The lock is required in Continuous Integration, Production Candidate Certification, and Exact-Main Production Certification, and is part of the Foundation Production Lock gate set.

A production release is blocked when any C01-C11 authority file is missing, required implementation/certification/test markers are missing, an existing dedicated lock fails, the lock script/package command is missing, release wiring is missing, or a service authority surface contains a prohibited demo/stub marker.

## Evidence boundary

This lock certifies repository implementation and release-governance integrity. It does not claim that a live external staging E2E was executed for C01 Tenant Onboarding or that an external provider is currently healthy. Those remain deployment-specific evidence gates.

<!-- Closed-loop gate refresh: C01-C11 umbrella lock is release-blocking. -->
