#!/usr/bin/env python3
"""Normalize and validate a Google Workload Identity Provider resource name.

Prints a GitHub Actions output line (provider=<resource>) only after strict
validation. The normalized value cannot contain newlines or output delimiters.
"""
from __future__ import annotations

import re
import sys


# Google Cloud resource IDs are 4–32 chars, use lowercase letters/digits/
# hyphens, and start/end with an alphanumeric. Digits are valid first chars.
IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$")
RESOURCE_LAYOUT = re.compile(
    r"^projects/([^/]+)/locations/global/workloadIdentityPools/([^/]+)/providers/([^/]+)$"
)


def normalize(value: str) -> str:
    provider = value.strip()

    # Copy/pasted GitHub secret values may have line-wraps inserted by an
    # editor. Remove only CR/LF boundaries and adjacent horizontal indentation.
    # Remaining characters are still subject to strict shape and ID validation.
    provider = re.sub(r"[ \t]*(?:\r\n|\r|\n)[ \t]*", "", provider)

    # Environment/secret values are sometimes copied with surrounding quotes.
    if len(provider) >= 2 and provider[0] == provider[-1] and provider[0] in {"'", '"'}:
        provider = provider[1:-1].strip()

    # Accept canonical resource names and the equivalent IAM HTTPS URL forms.
    provider = re.sub(r"^https?://iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = re.sub(r"^//iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = re.sub(r"^iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = provider.split("#", 1)[0].split("?", 1)[0].strip()
    provider = provider.lstrip("/")
    provider = re.sub(r"^(?:v1beta1?|v1)/", "", provider, flags=re.IGNORECASE)
    provider = provider.rstrip("/").strip()

    match = RESOURCE_LAYOUT.fullmatch(provider)
    if match is None:
        # Safe structure-only diagnostics. Never echo the provider string or
        # identifiers from the configured secret into GitHub Actions logs.
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
