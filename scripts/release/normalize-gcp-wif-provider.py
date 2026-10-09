#!/usr/bin/env python3
import re
import sys

value = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
for prefix in (
    "https://iam.googleapis.com/",
    "http://iam.googleapis.com/",
    "//iam.googleapis.com/",
    "iam.googleapis.com/",
):
    if value.startswith(prefix):
        value = value[len(prefix):]
        break
value = value.rstrip("/")

pattern = r"projects/[0-9]+/locations/global/workloadIdentityPools/[^/]+/providers/[^/]+"
if not re.fullmatch(pattern, value):
    raise SystemExit(
        "RELEASE_BLOCKED: GCP_WORKLOAD_IDENTITY_PROVIDER must be a full "
        "projects/<number>/locations/global/workloadIdentityPools/<pool>/"
        "providers/<provider> resource name after safe normalization"
    )

print(f"provider={value}")
