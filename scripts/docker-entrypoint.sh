#!/bin/sh
set -e

if [ ! -f .env ]; then
  echo "ERROR: .env not found in container. Rebuild the Docker image."
  exit 1
fi

if [ -z "$DOTENV_PRIVATE_KEY" ]; then
  echo "ERROR: DOTENV_PRIVATE_KEY is not set. Add it to this component in DigitalOcean."
  exit 1
fi

exec "$@"
