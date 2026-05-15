#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/.env.local"
WORKSPACE_ROOT="$(cd "$ROOT/../.." && pwd)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

source "$ENV_FILE"

wait_url() {
  local url="$1"
  local attempts="${2:-20}"
  local i
  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

echo "==> searxng health"
wait_url "http://127.0.0.1:${SEARXNG_PORT}/search?q=openclaw&format=json&language=en-US" 25
python3 - <<PY
import json, urllib.request
url = 'http://127.0.0.1:%s/search?q=openclaw&format=json&language=en-US' % '${SEARXNG_PORT}'
with urllib.request.urlopen(url, timeout=20) as response:
    payload = json.loads(response.read().decode('utf-8'))
print('results=', len(payload.get('results', [])))
print('unresponsive_engines=', len(payload.get('unresponsive_engines', [])))
PY

echo
echo "==> ntfy health"
wait_url "http://127.0.0.1:${NTFY_PORT}/v1/health" 20
curl -fsS "http://127.0.0.1:${NTFY_PORT}/v1/health"

echo
echo "==> local-searcher plugin unit tests"
node --test "$WORKSPACE_ROOT/.openclaw/extensions/local-searcher/index.test.mjs"

echo
echo "==> local-searcher rollout contract"
node "$ROOT/scripts/validate-local-searcher-rollout.mjs"
