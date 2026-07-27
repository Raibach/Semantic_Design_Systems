#!/bin/bash
# restore-db.sh — Restore a PostgreSQL dump into the local database
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$SCRIPT_DIR/prompt-composer-console/backend"
BACKUP_DIR="$SCRIPT_DIR/db-backups"

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

# Parse DATABASE_URL
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*@.*|\1|p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

# Find latest backup
LATEST_BACKUP=$(ls -1t "$BACKUP_DIR"/database-backup-*.sql 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "❌ No backup files found in $BACKUP_DIR/"
    echo "   Run ./backup-db.sh first to create a backup."
    exit 1
fi

echo "⚠️  WARNING: This will overwrite the database '$DB_NAME' on $DB_HOST:$DB_PORT"
echo "   Backup file: $LATEST_BACKUP"
echo ""
read -rp "   Type 'yes' to proceed: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Aborted."
    exit 1
fi

# Find psql (Homebrew keg-only path)
PSQL="psql"
if ! command -v psql &>/dev/null; then
    if [ -x "/opt/homebrew/opt/postgresql@15/bin/psql" ]; then
        PSQL="/opt/homebrew/opt/postgresql@15/bin/psql"
    elif [ -x "/usr/local/opt/postgresql@15/bin/psql" ]; then
        PSQL="/usr/local/opt/postgresql@15/bin/psql"
    else
        echo "❌ psql not found. Install PostgreSQL client tools or add them to PATH."
        exit 1
    fi
fi

echo "🔄 Restoring $LATEST_BACKUP → $DB_HOST:$DB_PORT/$DB_NAME ..."
PGPASSWORD="$DB_PASS" "$PSQL" \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$LATEST_BACKUP"

echo "✅ Restore complete."