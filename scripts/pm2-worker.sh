#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${DOTENV_PRIVATE_KEY:-}" ]; then
  echo "ERROR: DOTENV_PRIVATE_KEY is not set. Export it before starting PM2." >&2
  exit 1
fi

if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found." >&2
  exit 1
fi

exec node_modules/.bin/dotenvx run -f .env.production -- node dist/worker.js
