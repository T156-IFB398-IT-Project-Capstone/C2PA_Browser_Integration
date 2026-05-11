#!/usr/bin/env bash
# scripts/smoke-test.sh
#
# Hits the local Rust service end-to-end without the browser in the loop.
# Useful for verifying Sprint 2 progress from the terminal.
#
# Usage:
#   ./scripts/smoke-test.sh path/to/image.jpg

set -euo pipefail

IMAGE="${1:-}"
if [[ -z "$IMAGE" ]]; then
  echo "Usage: $0 <path-to-image.jpg|png>" >&2
  exit 1
fi
if [[ ! -f "$IMAGE" ]]; then
  echo "File not found: $IMAGE" >&2
  exit 1
fi

CONFIG="${CONFIG:-rust-service/config.toml}"
PORT="${C2PA_SERVICE_PORT:-8901}"
BASE="http://127.0.0.1:${PORT}"

if [[ ! -f "$CONFIG" ]]; then
  echo "Config not found at $CONFIG — start the Rust service once to generate it." >&2
  exit 1
fi

SECRET=$(grep '^shared_secret' "$CONFIG" | sed -E 's/.*"([^"]+)".*/\1/')
if [[ -z "$SECRET" ]]; then
  echo "Could not extract shared_secret from $CONFIG" >&2
  exit 1
fi

# 1. Health
echo "→ GET /api/v1/health"
curl -fsS "${BASE}/api/v1/health" && echo

# 2. Verify
case "$IMAGE" in
  *.png|*.PNG)          MIME="image/png"  ;;
  *.jpg|*.JPG|*.jpeg|*.JPEG) MIME="image/jpeg" ;;
  *) echo "Unsupported extension"; exit 1 ;;
esac

# Portable base64 (GNU or BSD)
if base64 --help 2>&1 | grep -q -- '-w'; then
  B64=$(base64 -w0 "$IMAGE")
else
  B64=$(base64 "$IMAGE" | tr -d '\n')
fi

echo "→ POST /api/v1/verify  ($MIME, $(wc -c < "$IMAGE") bytes)"
curl -fsS -X POST "${BASE}/api/v1/verify" \
  -H "Content-Type: application/json" \
  -H "X-C2PA-Token: ${SECRET}" \
  -d "{\"source_url\":\"smoke-test://${IMAGE##*/}\",\"media_type\":\"${MIME}\",\"data_base64\":\"${B64}\"}" \
  | python3 -m json.tool
