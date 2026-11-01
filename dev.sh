#!/usr/bin/env bash
#
# Start the whole product for development: the FastAPI simulator and the Vite
# web interface. Both run in the foreground of this script and are stopped again
# together when the script is interrupted.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

cd "$ROOT/backend"
if ! "$PYTHON" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo "Backend-Abhängigkeiten fehlen. Zuerst ausführen: cd backend && $PYTHON -m pip install -r requirements.txt" >&2
  exit 1
fi

cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  echo "Frontend-Abhängigkeiten werden installiert ..."
  npm ci
fi

cd "$ROOT/backend"
SMARTHOME_DB_PATH="${SMARTHOME_DB_PATH:-smarthome.db}" \
SMARTHOME_TICK_SECONDS="${SMARTHOME_TICK_SECONDS:-1.0}" \
SMARTHOME_CORS_ORIGINS="${SMARTHOME_CORS_ORIGINS:-http://localhost:$WEB_PORT}" \
  "$PYTHON" -m uvicorn app.main:app \
    --host 127.0.0.1 \
    --port "$API_PORT" \
    --no-access-log \
    --log-level warning &
API_PID=$!

cd "$ROOT/frontend"
VITE_API_BASE="${VITE_API_BASE:-http://localhost:$API_PORT}" \
  npm run dev -- --host 127.0.0.1 --port "$WEB_PORT" &
WEB_PID=$!

cleanup() {
  trap - EXIT INT TERM
  kill "$WEB_PID" "$API_PID" 2>/dev/null || true
  wait "$WEB_PID" "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "SmartHomeCenter läuft: Oberfläche http://localhost:$WEB_PORT · API http://localhost:$API_PORT"
wait
