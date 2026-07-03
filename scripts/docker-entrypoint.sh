#!/bin/sh
set -e

if [ -f .env.production ] && [ "${DOTENV_ENV:-production}" != "local" ]; then
  cp .env.production .env
fi

exec ./node_modules/.bin/dotenvx run -- "$@"
