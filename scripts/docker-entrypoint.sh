#!/bin/sh
set -e

ENV_FILE=".env.production"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found in container. Commit it to git and rebuild."
  exit 1
fi

if [ -z "$DOTENV_PRIVATE_KEY" ]; then
  echo "ERROR: DOTENV_PRIVATE_KEY is not set. Add it to this component's secrets in DigitalOcean."
  exit 1
fi

exec ./node_modules/.bin/dotenvx run -f "$ENV_FILE" -- "$@"
