#!/usr/bin/env python3
"""Normalize and validate Google Workload Identity Provider resource names.

Prints a GitHub Actions output line (provider=<resource>) only after strict
validation. Input values are never printed when validation fails.
"""
from __future__ import annotations

import re
import sys
import unicodedata


IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$")
RESOURCE_LAYOUT = re.compile(
    r"^projects/([^/]+)/locations/global/workloadIdentityPools/([^/]+)/providers/([^/]+)$"
)


def _strip_boundary_format_marks(value: str) -> str:
    """Strip Unicode format marks only at an input/keyword boundary."""
    start = 0
    end = len(value)
    wrappers = " \t\r\n\"'"
    while start < end and (unicodedata.category(value[start]) == "Cf" or value[start] in wrappers):
        start += 1
    while end > start and (unicodedata.category(value[end - 1]) == "Cf" or value[end - 1] in wrappers):
        end -= 1
    return value[start:end]


def _canonicalize_resource_keyword(value: str, expected: str) -> str:
    candidate = _strip_boundary_format_marks(value)
    return expected if candidate.casefold() == expected.casefold() else value


def normalize(value: str) -> str:
    # Editor exports can prepend or append a UTF-8 BOM. Remove that marker
    # only at the whole-value boundary; never rewrite characters inside IDs.
    provider = _strip_boundary_format_marks(value.strip().strip("\ufeff"))

    # A secret copied through an editor may contain line-wraps. Remove only
    # CR/LF boundaries and adjacent horizontal indentation; all other content
    # remains subject to the strict resource-shape check below.
    # Accept line-wraps only next to path separators. Do not join arbitrary
    # lines, which could silently change an identifier.
    provider = re.sub(r"/[ \t]*(?:\r\n|\r|\n)[ \t]*", "/", provider)
    provider = re.sub(r"[ \t]*(?:\r\n|\r|\n)[ \t]*/", "/", provider)

    if len(provider) >= 2 and provider[0] == provider[-1] and provider[0] in {"'", '"'}:
        provider = provider[1:-1].strip()
    provider = _strip_boundary_format_marks(provider)

    # Accept canonical resource names and equivalent IAM URL/API-version forms.
    provider = re.sub(r"^https?://iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = re.sub(r"^//iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = re.sub(r"^iam\.googleapis\.com/", "", provider, flags=re.IGNORECASE)
    provider = provider.split("#", 1)[0].split("?", 1)[0].strip()
    provider = provider.lstrip("/")
    provider = re.sub(r"^(?:v1beta1?|v1)/", "", provider, flags=re.IGNORECASE)
    provider = provider.rstrip("/").strip()

    # The configured legacy resource has the expected eight path segments and
    # required marker order, but its first resource-type keyword is not lower
    # case. Canonicalize only resource-type keywords at their fixed positions;
    # never case-fold the project number, pool ID, or provider ID.
    segments = provider.split("/")
    if len(segments) == 8:
        # Normalize resource-type keywords at their fixed path positions.
        # Strip only boundary format/quote marks from those keyword segments;
        # project number, pool ID, and provider ID bytes remain untouched.
        expected_keywords = {
            0: "projects",
            2: "locations",
            3: "global",
            4: "workloadIdentityPools",
            6: "providers",
        }
        for position, expected in expected_keywords.items():
            segments[position] = _canonicalize_resource_keyword(segments[position], expected)

        if (
            segments[0] == "projects"
            and segments[2] == "locations"
            and segments[3] == "global"
            and segments[4] == "workloadIdentityPools"
            and segments[6] == "providers"
        ):
            provider = "/".join(segments)
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
        first_segment = segments[0] if segments else ""
        first_candidate = _strip_boundary_format_marks(first_segment)
        first_has_project_word = "projects" in first_segment.casefold()
        first_has_non_ascii = any(ord(character) > 127 for character in first_segment)
        first_has_control = any(unicodedata.category(character).startswith("C") for character in first_segment)
        first_has_colon = ":" in first_segment
        first_has_equals = "=" in first_segment
        first_has_jsonish_prefix = bool(re.match(r"^\s*[\{\[]", first_segment))
        first_has_key_value_prefix = bool(re.match(r"^\s*[\w\"']+\s*[:=]", first_segment))
        first_segment_category = (
            "projects-with-wrapper" if first_has_project_word and first_candidate.casefold() != "projects"
            else "canonical-projects" if first_candidate.casefold() == "projects"
            else "jsonish-prefix" if first_has_jsonish_prefix
            else "key-value-prefix" if first_has_key_value_prefix
            else "non-ascii-or-control" if first_has_non_ascii or first_has_control
            else "punctuation-prefix" if first_has_colon or first_has_equals
            else "other"
        )
        keyword_positions = {
            "projects": [i for i, segment in enumerate(segments) if _strip_boundary_format_marks(segment).casefold() == "projects"],
            "locations": [i for i, segment in enumerate(segments) if _strip_boundary_format_marks(segment).casefold() == "locations"],
            "global": [i for i, segment in enumerate(segments) if _strip_boundary_format_marks(segment).casefold() == "global"],
            "workloadIdentityPools": [i for i, segment in enumerate(segments) if _strip_boundary_format_marks(segment).casefold() == "workloadidentitypools"],
            "providers": [i for i, segment in enumerate(segments) if _strip_boundary_format_marks(segment).casefold() == "providers"],
        }
        position_summary = ";".join(
            f"{keyword}={'/'.join(str(i) for i in positions) if positions else 'none'}"
            for keyword, positions in keyword_positions.items()
        )
        safe_shape = (
            f"first_segment_category={first_segment_category}, "
            f"first_segment_length={len(first_segment)}, "
            f"first_segment_non_ascii={str(first_has_non_ascii).lower()}, "
            f"first_segment_control={str(first_has_control).lower()}, "
            f"keyword_positions={position_summary}"
        )
        raise ValueError(
            "provider path must use projects/<project-number>/locations/global/"
            "workloadIdentityPools/<pool-id>/providers/<provider-id>; "
            f"safe_shape_diagnostic: segments={len(segments)}, {shape}, {safe_shape}; provider value omitted"
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
