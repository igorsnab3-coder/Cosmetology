#!/bin/sh
set -eu

ROOT="${JARVIS_ROOT:-/app}"
DATA_DIR="${JARVIS_DATA_DIR:-/app/data}"
SEED_DIR="${JARVIS_SEED_DIR:-/app/data-seed}"
ENV_FILE="${JARVIS_ENV_FILE:-/app/.env}"

mkdir -p "$DATA_DIR"

# Seed mutable data from image defaults when the volume is empty.
for name in products.json products.seed.json orders.json clinic.json jarvis-system.txt; do
  if [ ! -f "$DATA_DIR/$name" ] && [ -f "$SEED_DIR/$name" ]; then
    cp "$SEED_DIR/$name" "$DATA_DIR/$name"
  fi
done

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: secrets file not found: $ENV_FILE"
  echo "Set DOCKER_ENV_FILE to your secrets path (see .env.docker.example)."
  exit 1
fi

if [ -z "${JARVIS_INTERNAL_TOKEN:-}" ]; then
  JARVIS_INTERNAL_TOKEN="$(node - <<'NODE'
const fs = require("fs");
const crypto = require("crypto");
const file = process.env.JARVIS_ENV_FILE || "/app/.env";
let value = "";
try {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^JARVIS_INTERNAL_TOKEN=(.*)$/m);
  if (match) value = match[1].trim().replace(/^["']|["']$/g, "");
} catch {}
process.stdout.write(value || crypto.randomBytes(32).toString("hex"));
NODE
)"
  export JARVIS_INTERNAL_TOKEN
fi

export JARVIS_ROOT="$ROOT"
export JARVIS_DATA_DIR="$DATA_DIR"
export JARVIS_ENV_FILE="$ENV_FILE"
export JARVIS_DB_FILE="${JARVIS_DB_FILE:-$DATA_DIR/yana.sqlite}"
export JARVIS_DB_PORT="${JARVIS_DB_PORT:-5601}"
export JARVIS_AI_PORT="${JARVIS_AI_PORT:-5600}"
export JARVIS_PDF_PORT="${JARVIS_PDF_PORT:-5602}"
export JARVIS_HOST="${JARVIS_HOST:-127.0.0.1}"
export PORT="${PORT:-5500}"
export JARVIS_GATEWAY_HOST="${JARVIS_GATEWAY_HOST:-0.0.0.0}"
export JARVIS_STATIC_ROOT="${JARVIS_STATIC_ROOT:-$ROOT/dist}"

pids=""
shutting_down=0

cleanup() {
  if [ "$shutting_down" -eq 1 ]; then
    return
  fi
  shutting_down=1
  echo "Stopping services..."
  # Ask DB to flush mirrors before SIGTERM (best-effort).
  node -e "fetch('http://127.0.0.1:'+(process.env.JARVIS_DB_PORT||5601)+'/flush',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{})" >/dev/null 2>&1 || true
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
  # Give children time to exit cleanly (SQLite flush / Chromium close).
  i=0
  while [ "$i" -lt 20 ]; do
    alive=0
    for pid in $pids; do
      if kill -0 "$pid" 2>/dev/null; then
        alive=1
        break
      fi
    done
    if [ "$alive" -eq 0 ]; then
      break
    fi
    i=$((i + 1))
    sleep 0.25
  done
  for pid in $pids; do
    kill -9 "$pid" 2>/dev/null || true
  done
  wait || true
}
trap cleanup INT TERM EXIT

wait_http() {
  url="$1"
  tries="${2:-40}"
  i=0
  while [ "$i" -lt "$tries" ]; do
    if node -e "fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$url"; then
      return 0
    fi
    i=$((i + 1))
    sleep 0.25
  done
  return 1
}

echo "Starting DB on :$JARVIS_DB_PORT"
node "$ROOT/db/server.js" &
pids="$pids $!"

echo "Waiting for DB..."
if ! wait_http "http://127.0.0.1:${JARVIS_DB_PORT}/health" 50; then
  echo "FATAL: DB did not become ready"
  exit 1
fi

echo "Starting AI on :$JARVIS_AI_PORT"
node "$ROOT/ai/server.js" &
pids="$pids $!"

echo "Starting PDF on :$JARVIS_PDF_PORT"
node "$ROOT/pdf/server.js" &
pids="$pids $!"

echo "Waiting for AI..."
if ! wait_http "http://127.0.0.1:${JARVIS_AI_PORT}/health" 40; then
  echo "WARN: AI health not ready yet (gateway will still start; chat may be unavailable)"
fi

echo "Waiting for PDF..."
if ! wait_http "http://127.0.0.1:${JARVIS_PDF_PORT}/health" 40; then
  echo "WARN: PDF health not ready yet (PDF API may be unavailable)"
fi

echo "Starting gateway on :$PORT"
node "$ROOT/gateway/server.js" &
pids="$pids $!"

if ! wait_http "http://127.0.0.1:${PORT}/api/health" 40; then
  echo "FATAL: gateway did not become ready"
  exit 1
fi
echo "All services are up"

# Keep container alive while children run; exit if any child dies.
while true; do
  for pid in $pids; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Process $pid exited"
      exit 1
    fi
  done
  sleep 2
done
