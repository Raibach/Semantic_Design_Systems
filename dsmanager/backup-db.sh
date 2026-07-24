#!/bin/bash
# backup-db.sh — Dump local PostgreSQL to a timestamped SQL file
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$SCRIPT_DIR/prompt-composer-console/backend"
BACKUP_DIR="$SCRIPT_DIR/db-backups"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/database-backup-$TIMESTAMP.sql"

# Load DATABASE_URL from .env
if [ ! -f "$BACKEND/.env" ]; then
    echo "❌ .env not found at $BACKEND/.env"
    exit 1
fi
set -a
# shellcheck disable=SC2046
export $(grep -v '^#' "$BACKEND/.env" | grep -v '^\s*$' | xargs)
set +a

if [ -z "${DATABASE_URL:-}" ]; then
    echo "❌ DATABASE_URL not found in .env"
    exit 1
fi

# Parse DATABASE_URL for pg_dump
# Format: postgresql://user:pass@host:port/dbname
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*@.*|\1|p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

mkdir -p "$BACKUP_DIR"

# Find pg_dump (Homebrew keg-only path)
PG_DUMP="pg_dump"
if ! command -v pg_dump &>/dev/null; then
    if [ -x "/opt/homebrew/opt/postgresql@15/bin/pg_dump" ]; then
        PG_DUMP="/opt/homebrew/opt/postgresql@15/bin/pg_dump"
    elif [ -x "/usr/local/opt/postgresql@15/bin/pg_dump" ]; then
        PG_DUMP="/usr/local/opt/postgresql@15/bin/pg_dump"
    else
        echo "❌ pg_dump not found. Install PostgreSQL client tools or add them to PATH."
        exit 1
    fi
fi

echo "📦 Dumping database: $DB_NAME @ $DB_HOST:$DB_PORT → $BACKUP_FILE"
PGPASSWORD="$DB_PASS" "$PG_DUMP" \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-owner \
    --no-acl \
    --inserts \
    --clean \
    --if-exists \
    > "$BACKUP_FILE"

SIZE=$(wc -c < "$BACKUP_FILE" | tr -d ' ')
echo "✅ Backup complete: $BACKUP_FILE ($SIZE bytes)"

# Keep only the 10 most recent backups
ls -1t "$BACKUP_DIR"/database-backup-*.sql 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
echo "🧹 Cleaned old backups (keeping last 10)"