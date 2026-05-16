#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/.env.local"
COMPOSE=(docker compose --project-name openclaw-web-searcher --env-file "$ENV_FILE" -f "$ROOT/docker-compose.yml")

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ROOT/.env.example" ]]; then
    echo "No .env.local found. Copying from .env.example..."
    cp "$ROOT/.env.example" "$ENV_FILE"
  else
    echo "Missing $ENV_FILE"
    exit 1
  fi
fi

wait_for_searxng() {
  source "$ENV_FILE"
  local url="http://127.0.0.1:${SEARXNG_PORT}/search?q=openclaw&format=json&language=en-US"
  local attempts="${1:-20}"
  local i
  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "SearXNG ready"
      return 0
    fi
    sleep 1
  done
  echo "SearXNG not ready after ${attempts}s" >&2
  return 1
}

case "${1:-}" in
  up)
    "${COMPOSE[@]}" up -d --remove-orphans
    wait_for_searxng
    ;;
  down)
    "${COMPOSE[@]}" down --remove-orphans
    ;;
  restart)
    "${COMPOSE[@]}" down --remove-orphans
    "${COMPOSE[@]}" up -d --remove-orphans
    wait_for_searxng
    ;;
  ps|status)
    "${COMPOSE[@]}" ps
    ;;
  logs)
    shift || true
    "${COMPOSE[@]}" logs -f "${@:-}"
    ;;
  pull)
    "${COMPOSE[@]}" pull
    ;;
  test)
    "$ROOT/smoke-test.sh"
    ;;
  wait)
    wait_for_searxng
    ;;
  urls)
    source "$ENV_FILE"
    cat <<EOF
SearXNG : http://127.0.0.1:${SEARXNG_PORT}
ntfy    : http://127.0.0.1:${NTFY_PORT}
EOF
    ;;
  *)
    echo "Usage: $0 {up|down|restart|ps|status|logs|pull|test|wait|urls}"
    exit 1
    ;;
esac
