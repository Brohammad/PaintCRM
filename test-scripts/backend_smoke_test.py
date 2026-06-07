#!/usr/bin/env python3
"""Configurable backend smoke tests.

Usage:
  BACKEND_BASE_URL=http://localhost:3000 \
  python3 test-scripts/backend_smoke_test.py \
    --config test-scripts/backend_endpoints.example.json

Config JSON format: array of objects
  {
    "name": "Health",
    "method": "GET",
    "path": "/health",
    "expected_status": 200,
    "headers": {"Authorization": "Bearer ..."},
    "body": {"key": "value"},
    "contains": "ok"
  }
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


def load_cases(config_path: str | None) -> list[dict[str, Any]]:
    if not config_path:
        return [
            {
                "name": "Root",
                "method": "GET",
                "path": "/",
                "expected_status": 200,
            },
            {
                "name": "Health",
                "method": "GET",
                "path": "/health",
                "expected_status": 200,
            },
            {
                "name": "API Health",
                "method": "GET",
                "path": "/api/health",
                "expected_status": 200,
            },
        ]

    with open(config_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("Config must be a JSON array")
    return data


def run_case(base_url: str, case: dict[str, Any], timeout: float) -> tuple[bool, str]:
    name = str(case.get("name", "Unnamed"))
    method = str(case.get("method", "GET")).upper()
    path = str(case.get("path", "/"))
    expected_status = int(case.get("expected_status", 200))
    headers = dict(case.get("headers", {}))
    contains = case.get("contains")

    url = f"{base_url.rstrip('/')}{path}"

    payload = None
    if "body" in case:
        payload = json.dumps(case["body"]).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")

    req = urllib.request.Request(url=url, data=payload, method=method)
    for k, v in headers.items():
        req.add_header(k, str(v))

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status = response.getcode()
            body = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode("utf-8", errors="replace")
    except Exception as e:  # noqa: BLE001
        return False, f"{name}: request failed ({e})"

    if status != expected_status:
        return False, f"{name}: expected {expected_status}, got {status} ({url})"

    if contains is not None and str(contains) not in body:
        return False, f"{name}: response did not contain expected text: {contains!r}"

    return True, f"{name}: PASS ({status})"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run backend smoke tests")
    parser.add_argument("--base-url", default=os.environ.get("BACKEND_BASE_URL", "http://localhost:3000"))
    parser.add_argument("--config", default=os.environ.get("BACKEND_ENDPOINTS_JSON"))
    parser.add_argument("--timeout", type=float, default=10.0)
    args = parser.parse_args()

    try:
        cases = load_cases(args.config)
    except Exception as e:  # noqa: BLE001
        print(f"Failed to load config: {e}", file=sys.stderr)
        return 2

    print(f"Running {len(cases)} backend checks against {args.base_url}")
    failures = 0

    for case in cases:
        ok, message = run_case(args.base_url, case, args.timeout)
        print(message)
        if not ok:
            failures += 1

    if failures:
        print(f"Backend smoke test FAILED: {failures} failing check(s)")
        return 1

    print("Backend smoke test PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
