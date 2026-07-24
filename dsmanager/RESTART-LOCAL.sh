#!/bin/bash
# RESTART-LOCAL.sh — Local dev restart. DO NOT DELETE. DO NOT BYPASS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/prompt-composer-console/backend"
PORT=5173

# --- 1. Check .env ---
if [ ! -f "$BACKEND/.env" ]; then
    echo "❌ Error: .env file not found at $BACKEND/.env"
    exit 1
fi

# --- 2. Check .venv ---
if [ ! -f "$BACKEND/.venv/bin/uvicorn" ]; then
    echo "❌ Error: .venv not found at $BACKEND/.venv"
    echo "   Run: cd $BACKEND && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
    exit 1
fi

# --- 3. Check PostgreSQL ---
echo "🔍 Checking PostgreSQL..."
if command -v pg_isready &>/dev/null; then
    if ! pg_isready -q 2>/dev/null; then
        echo "⚠️  PostgreSQL is not running. Attempting to start via brew services..."
        if command -v brew &>/dev/null; then
            brew services start postgresql@15 2>/dev/null || brew services start postgresql 2>/dev/null || true
            sleep 2
            if ! pg_isready -q 2>/dev/null; then
                echo "❌ Error: PostgreSQL could not be started. Start it manually and re-run."
                exit 1
            fi
        else
            echo "❌ Error: PostgreSQL not running and Homebrew not found. Start PostgreSQL manually."
            exit 1
        fi
    fi
    echo "✅ PostgreSQL is accepting connections"
else
    # pg_isready not in PATH — try Homebrew path
    PG_ISREADY="/opt/homebrew/opt/postgresql@15/bin/pg_isready"
    if [ -x "$PG_ISREADY" ]; then
        if ! "$PG_ISREADY" -q 2>/dev/null; then
            echo "⚠️  PostgreSQL is not running. Attempting to start via brew services..."
            brew services start postgresql@15 2>/dev/null || true
            sleep 2
            if ! "$PG_ISREADY" -q 2>/dev/null; then
                echo "❌ Error: PostgreSQL could not be started. Start it manually and re-run."
                exit 1
            fi
        fi
        echo "✅ PostgreSQL is accepting connections"
    else
        echo "⚠️  pg_isready not found — skipping PostgreSQL check (ensure it's running)"
    fi
fi

# --- 4. Test DB credentials ---
echo "🔍 Verifying database credentials..."
DB_URL=$(grep -E '^DATABASE_URL=' "$BACKEND/.env" | head -1 | cut -d= -f2-)
if [ -z "$DB_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in .env"
    exit 1
fi
# Quick connectivity test via Python
if ! cd "$BACKEND" && .venv/bin/python -c "
import os, sys
os.environ['DATABASE_URL'] = '$DB_URL'
from database_pool import DatabasePoolManager
try:
    mgr = DatabasePoolManager.get_instance()
    print('OK')
except Exception as e:
    print(f'FAIL: {e}', file=sys.stderr)
    sys.exit(1)
" 2>&1 | grep -q "OK"; then
    echo "❌ Error: Cannot connect to PostgreSQL with DATABASE_URL=$DB_URL"
    exit 1
fi
echo "✅ Database credentials verified"

# --- 5. Kill old processes ---
echo "🔄 RESTART-LOCAL — killing old processes on port $PORT..."
PIDS=$(lsof -ti :$PORT 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    kill $PIDS 2>/dev/null || true
    sleep 1
    # Verify they're gone
    if lsof -ti :$PORT 2>/dev/null | grep -q .; then
        echo "⚠️  Force-killing stubborn processes..."
        lsof -ti :$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    echo "✅ Killed process(es) on port $PORT"
else
    echo "ℹ️  No process found on port $PORT"
fi

# --- 6. Load environment ---
echo "📦 Loading environment..."
set -a
# shellcheck disable=SC2046
export $(grep -v '^#' "$BACKEND/.env" | grep -v '^\s*$' | xargs)
set +a

# --- 7. Start server ---
echo "🚀 Starting on port $PORT..."
cd "$BACKEND"
.venv/bin/uvicorn main:app --host 0.0.0.0 --port $PORT &
UVICORN_PID=$!
sleep 2

# --- 8. Verify server is running ---
if ! kill -0 $UVICORN_PID 2>/dev/null; then
    echo "❌ Error: Server failed to start. Check logs above."
    exit 1
fi

# Verify it responds
if curl -sf http://localhost:$PORT/ > /dev/null 2>&1; then
    echo "✅ http://localhost:$PORT — API + Frontend + AI live (PID $UVICORN_PID)"
else
    echo "⚠️  Server started (PID $UVICORN_PID) but may not be responding yet. Check http://localhost:$PORT"
fi
