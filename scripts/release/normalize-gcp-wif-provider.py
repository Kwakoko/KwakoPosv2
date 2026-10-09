#!/usr/bin/env python3
"""Normalize and validate Google Workload Identity Provider resource names.

Prints a GitHub Actions output line (provider=<resource>) only after strict
validation. Input values are never printed when validation fails.
"""
from __future__ import annotations

import re
import sys


IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$")
RESOURCE_LAYOUT = re.compile(
    r"^projects/([^/]+)/locations/global/workloadIdentityPools/([^/]+)/providers/([^/]+)$"
)


def normalize(value: str) -> str:
    provider = value.strip()

    # A secret copied through an editor may contain line-wraps. Remove only
    # CR/LF boundaries and adjacent horizontal indentation; all other content
    # remains subject to the strict resource-shape check below.
    # Accept line-wraps only next to path separators. Do not join arbitrary
    # lines, which could silently change an identifier.
    provider = re.sub(r"/[ \t]*(?:\r\n|\r|\n)[ \t]*", "/", provider)
    provider = re.sub(r"[ \t]*(?:\r\n|\r|\n)[ \t]*/", "/", provider)

    if len(provider) >= 2 and provider[0] == provider[-1] and provider[0] in {"'", '"'}:
        provider = provider[1:-1].strip()

    # Accept canonical resource names and equivalent IAM URL/API-version forms.
    provider = re.sub(r"^https?://iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = re.sub(r"^//iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = re.sub(r"^iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = provider.split("#", 1)[0].split("?", 1)[0].strip()
    provider = provider.lstrip("/")
    provider = re.sub(r"^(?:v1beta1?|v1)/", "", provider, flags=re.IGNORECASE)
    provider = provider.rstrip("/").strip()

    match = RESOURCE_LAYOUT.fullmatch(provider)
    if match is None:
        # Only shape metadata is logged. Never echo secret contents or IDs.
        segments = [segment for segment in provider.split("/") if segment]
        markers = {
            "starts_projects": bool(segments and segments[0] == "projects"),
            "has_locations": "locations" in segments,
            "has_global_location": any(
                segments[i : i + 2] == ["locations", "global"]
                for i in range(len(segments) - 1)
            ),
            "has_workload_identity_pools": "workloadIdentityPools" in segments,
            "has_providers": "providers" in segments,
        }
        shape = ", ".join(f"{name}={str(present).lower()}" for name, present in markers.items())
        raise ValueError(
            "provider path must use projects/<project-number>/locations/global/"
            "workloadIdentityPools/<pool-id>/providers/<provider-id>; "
            f"safe_shape_diagnostic: segments={len(segments)}, {shape}; provider value omitted"
        )

    project_number, pool_id, provider_id = match.groups()
    if not project_number.isdecimal():
        raise ValueError(
            "project path segment must be a numeric Google Cloud project number, not a project ID"
        )

    for label, identifier in (("pool", pool_id), ("provider", provider_id)):
        if not IDENTIFIER.fullmatch(identifier):
            raise ValueError(
                f"{label} ID must be 4–32 lowercase letters, digits, or hyphens, "
                "and start/end with an alphanumeric"
            )
        if identifier.startswith("gcp-"):
            raise ValueError(f"{label} ID uses the gcp- prefix reserved by Google Cloud")

    return provider


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print(
            "RELEASE_BLOCKED: expected primary provider and optional legacy fallback",
            file=sys.stderr,
        )
        return 2

    candidates = [
        ("GCP_WIF_PROVIDER", sys.argv[1]),
    ]
    if len(sys.argv) == 3:
        candidates.append(("GCP_WORKLOAD_IDENTITY_PROVIDER", sys.argv[2]))

    errors = []
    configured = False
    for source_name, value in candidates:
        if not value.strip():
            continue
        configured = True
        try:
            provider = normalize(value)
        except ValueError as exc:
            errors.append((source_name, str(exc)))
            continue
        print(f"provider={provider}")
        return 0

    if not configured:
        print("RELEASE_BLOCKED: Google WIF provider configuration missing", file=sys.stderr)
        return 1

    for source_name, reason in errors:
        print(f"RELEASE_BLOCKED: {source_name} rejected: {reason}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
