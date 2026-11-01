#!/bin/sh
set -e

echo "Starting OpenOman Audit Manager entrypoint script..."

# Railway injects the container hostname into HOSTNAME. The Next.js server
# must bind every interface so the platform proxy can reach it.
export HOSTNAME=0.0.0.0
export PORT="${PORT:-3000}"

mkdir -p /app/storage/uploads /app/prisma/data

# A Railway volume is the only disk that survives redeploys.
if [ -n "$RAILWAY_VOLUME_MOUNT_PATH" ]; then
  echo "Using Railway volume at $RAILWAY_VOLUME_MOUNT_PATH"
  mkdir -p "$RAILWAY_VOLUME_MOUNT_PATH/data" "$RAILWAY_VOLUME_MOUNT_PATH/uploads"

  case "${DATABASE_URL:-}" in
    ""|file:/app/prisma/data/dev.db|file:./prisma/data/dev.db|file:./dev.db)
      export DATABASE_URL="file:${RAILWAY_VOLUME_MOUNT_PATH}/data/dev.db"
      ;;
  esac
  echo "DATABASE_URL=$DATABASE_URL"

  if [ -d /app/storage/uploads ] && [ ! -L /app/storage/uploads ]; then
    cp -a /app/storage/uploads/. "$RAILWAY_VOLUME_MOUNT_PATH/uploads/" 2>/dev/null || true
    rm -rf /app/storage/uploads
  fi
  ln -sfn "$RAILWAY_VOLUME_MOUNT_PATH/uploads" /app/storage/uploads
else
  if [ -z "$DATABASE_URL" ]; then
    export DATABASE_URL="file:/app/prisma/data/dev.db"
  fi
  echo "Using DATABASE_URL: $DATABASE_URL"
  echo "No Railway volume is mounted. Database and uploads will be erased on the next deploy."
fi

DB_PATH=$(echo "$DATABASE_URL" | sed 's|file:||')
DB_DIR=$(dirname "$DB_PATH")
mkdir -p "$DB_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R nextjs:nodejs /app/storage /app/prisma/data "$DB_DIR"
  if [ -n "$RAILWAY_VOLUME_MOUNT_PATH" ]; then
    chown -R nextjs:nodejs "$RAILWAY_VOLUME_MOUNT_PATH"
  fi
fi

run_as_app() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u nextjs -- "$@"
  else
    "$@"
  fi
}

PRISMA_BIN="./node_modules/.bin/prisma"
if [ -f "$PRISMA_BIN" ]; then
  echo "Initializing database schema..."
  run_as_app "$PRISMA_BIN" db push --accept-data-loss
else
  echo "WARNING: Prisma binary not found at $PRISMA_BIN. Attempting to use npx prisma..."
  run_as_app npx prisma db push --accept-data-loss
fi

echo "Ensuring safe admin accounts..."
run_as_app node prisma/seed.mjs

echo "Starting OpenOman Audit Manager application on ${HOSTNAME}:${PORT}..."
if [ "$(id -u)" = "0" ]; then
  exec runuser -u nextjs -- node server.js
fi
exec node server.js
