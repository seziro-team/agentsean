#!/bin/sh
set -eu
# Refuse to start a container without a strong token. Binding 0.0.0.0
# inside the container is only for port-forwarding; compose publishes
# 127.0.0.1:7777:7777. Short tokens were the OpenClaw/Bitsight 2026 failure.
TOKEN="${SEAN_AUTH_TOKEN:-}"
if [ ${#TOKEN} -lt 32 ]; then
  echo "SEAN_AUTH_TOKEN must be set to at least 32 characters. Refusing to start." >&2
  echo "Example: SEAN_AUTH_TOKEN=\$(openssl rand -base64 32) docker compose up" >&2
  exit 1
fi
uniq=$(printf '%s' "$TOKEN" | sed 's/\(.\)/\1\n/g' | grep -v '^$' | sort -u | wc -l | tr -d ' ')
if [ "$uniq" -lt 8 ]; then
  echo "SEAN_AUTH_TOKEN does not have enough distinct characters." >&2
  exit 1
fi
export SEAN_HOME="${SEAN_HOME:-/data}"
HOST="${SEAN_HOST:-0.0.0.0}"
PORT="${SEAN_PORT:-7777}"
exec node /app/packages/cli/dist/bin.js start --foreground --host "$HOST" --port "$PORT" --home "$SEAN_HOME"
