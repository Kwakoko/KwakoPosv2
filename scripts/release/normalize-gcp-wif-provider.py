#!/usr/bin/env python3
"""Normalize and validate a Google Workload Identity Provider resource name.

Prints a GitHub Actions output line (provider=<resource>) only after strict
validation. The normalized value cannot contain newlines or output delimiters.
"""
from __future__ import annotations

import re
import sys


RESOURCE_PATTERN = re.compile(
    r"^projects/[0-9]+/locations/global/workloadIdentityPools/[^/\s=]+/providers/[^/\s=]+$"
)


def normalize(value: str) -> str:
    provider = value.strip()

    # Environment/secret values are sometimes copied with surrounding quotes.
    if len(provider) >= 2 and provider[0] == provider[-1] and provider[0] in {"'", '"'}:
        provider = provider[1:-1].strip()

    # Accept canonical resource names and the equivalent IAM HTTPS URL forms.
    provider = re.sub(r"^https?://iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = re.sub(r"^//iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = re.sub(r"^iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = provider.rstrip("/").strip()

    if not RESOURCE_PATTERN.fullmatch(provider):
        raise ValueError(
            "GCP_WORKLOAD_IDENTITY_PROVIDER must be a full "
            "projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider> "
            "resource name or its iam.googleapis.com URL form"
        )

    return provider


def main() -> int:
    if len(sys.argv) != 2:
        print("RELEASE_BLOCKED: expected exactly one Workload Identity Provider argument", file=sys.stderr)
        return 2

    try:
        provider = normalize(sys.argv[1])
    except ValueError as exc:
        print(f"RELEASE_BLOCKED: {exc}", file=sys.stderr)
        return 1

    # The regex excludes newlines and '=' so this is safe for GITHUB_OUTPUT.
    print(f"provider={provider}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
