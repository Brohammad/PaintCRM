#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/paint-preview-app"
APP_URL="${APP_URL:-http://localhost:8080}"
BACKEND_BASE_URL="${BACKEND_BASE_URL:-http://localhost:3000}"
BACKEND_CONFIG="${BACKEND_ENDPOINTS_JSON:-}"
SKIP_BACKEND="${SKIP_BACKEND:-0}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[1/4] Installing Python dependencies"
python3 -m pip install -r "$ROOT_DIR/test-scripts/requirements.txt"

echo "[2/4] Installing Playwright Chromium"
python3 -m playwright install chromium

echo "[3/4] Starting frontend app server at $APP_URL"
(
  cd "$APP_DIR"
  python3 -m http.server 8080 >/tmp/paint_preview_server.log 2>&1
) &
SERVER_PID=$!
sleep 1

if [[ "$SKIP_BACKEND" != "1" ]]; then
  echo "[4/4] Running backend smoke tests against $BACKEND_BASE_URL"
  if [[ -n "$BACKEND_CONFIG" ]]; then
    BACKEND_BASE_URL="$BACKEND_BASE_URL" python3 "$ROOT_DIR/test-scripts/backend_smoke_test.py" --config "$BACKEND_CONFIG"
  else
    BACKEND_BASE_URL="$BACKEND_BASE_URL" python3 "$ROOT_DIR/test-scripts/backend_smoke_test.py"
  fi
else
  echo "[4/4] Skipping backend smoke tests (SKIP_BACKEND=1)"
fi

echo "[final] Running frontend E2E tests"
python3 "$ROOT_DIR/test-scripts/frontend_e2e_playwright.py" --app-url "$APP_URL"

echo "All selected tests passed"
