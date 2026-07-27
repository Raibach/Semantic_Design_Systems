#!/usr/bin/env python3
"""
Isolated Database Connection Diagnostic

Run this independently to test PostgreSQL reachability, credential validity,
and connection pool health.  No FastAPI, no uvicorn — just raw psycopg2.

Usage:
    cd backend
    python3 db_diagnostic.py

Environment:
    DATABASE_URL must be set (reads from .env if present in parent dir).
"""

import os
import sys
import time
import traceback
from urllib.parse import urlparse, parse_qs

# ── Load .env if present ─────────────────────────────────────────────────────
ENV_FILE = os.path.join(os.path.dirname(__file__), "..", "api", ".env")
if os.path.exists(ENV_FILE):
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key not in os.environ:
                    os.environ[key] = val

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    print("❌ DATABASE_URL not set in environment or .env file.")
    sys.exit(1)

# ── Parse connection details ─────────────────────────────────────────────────
parsed = urlparse(DATABASE_URL)
HOST = parsed.hostname or "localhost"
PORT = parsed.port or 5432
DB_NAME = parsed.path.lstrip("/")
USER = parsed.username or ""
PASSWORD = parsed.password or ""
QUERY = parse_qs(parsed.query)
SSLMODE = QUERY.get("sslmode", ["prefer"])[0]

# ── Sanitized display ────────────────────────────────────────────────────────
def mask(s: str, show: int = 4) -> str:
    if len(s) <= show:
        return "*" * len(s)
    return s[:show] + "*" * (len(s) - show)


print("═══ PostgreSQL Connection Diagnostic ═══")
print(f"  Host:      {HOST}")
print(f"  Port:      {PORT}")
print(f"  Database:  {DB_NAME}")
print(f"  User:      {USER}")
print(f"  Password:  {mask(PASSWORD)}")
print(f"  SSL mode:  {SSLMODE}")
print()

# ── Stage 1: Network reachability (TCP) ──────────────────────────────────────
print("── Stage 1: TCP reachability ──")
import socket

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(5)
start = time.time()
try:
    sock.connect((HOST, PORT))
    elapsed = (time.time() - start) * 1000
    print(f"  ✅ TCP connection established in {elapsed:.1f}ms")
except socket.timeout:
    print(f"  ❌ TCP connection TIMED OUT after 5s — host {HOST}:{PORT} is unreachable")
    sys.exit(2)
except ConnectionRefusedError:
    print(f"  ❌ TCP connection REFUSED — nothing listening on {HOST}:{PORT}")
    sys.exit(2)
except Exception as e:
    print(f"  ❌ TCP error: {e}")
    traceback.print_exc()
    sys.exit(2)
finally:
    sock.close()

# ── Stage 2: psycopg2 connection ─────────────────────────────────────────────
print()
print("── Stage 2: psycopg2 connection ──")
try:
    import psycopg2
    from psycopg2 import OperationalError, InterfaceError
except ImportError:
    print("  ❌ psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(3)

conn = None
start = time.time()
try:
    conn = psycopg2.connect(
        host=HOST,
        port=PORT,
        dbname=DB_NAME,
        user=USER,
        password=PASSWORD,
        sslmode=SSLMODE,
        connect_timeout=10,
    )
    elapsed = (time.time() - start) * 1000
    print(f"  ✅ psycopg2 connected in {elapsed:.1f}ms")
    print(f"  Server version: {conn.server_version}")
    print(f"  Protocol: {conn.protocol_version}")
    print(f"  Encoding: {conn.encoding}")
except OperationalError as e:
    elapsed = (time.time() - start) * 1000
    print(f"  ❌ psycopg2 OperationalError after {elapsed:.1f}ms:")
    print(f"     {e}")
    # Show the FULL stack trace — no masking
    print()
    print("  ── Full traceback ──")
    traceback.print_exc()
    sys.exit(4)
except Exception as e:
    elapsed = (time.time() - start) * 1000
    print(f"  ❌ psycopg2 error after {elapsed:.1f}ms:")
    traceback.print_exc()
    sys.exit(5)

# ── Stage 3: Basic query test ────────────────────────────────────────────────
print()
print("── Stage 3: Query test ──")
try:
    cur = conn.cursor()
    start = time.time()
    cur.execute("SELECT 1 AS test, current_timestamp AS server_time, version() AS pg_version")
    row = cur.fetchone()
    elapsed = (time.time() - start) * 1000
    print(f"  ✅ Query executed in {elapsed:.1f}ms")
    print(f"  Server time: {row[1]}")
    print(f"  PG version:  {row[2][:80]}")
    cur.close()
except Exception as e:
    print(f"  ❌ Query failed:")
    traceback.print_exc()
    sys.exit(6)

# ── Stage 4: Table enumeration ────────────────────────────────────────────────
print()
print("── Stage 4: Table scan ──")
try:
    cur = conn.cursor()
    cur.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' ORDER BY table_name"
    )
    tables = [row[0] for row in cur.fetchall()]
    cur.close()
    print(f"  ✅ Found {len(tables)} tables: {', '.join(tables[:10])}")
    if len(tables) > 10:
        print(f"     ... and {len(tables) - 10} more")
except Exception as e:
    print(f"  ❌ Table scan failed:")
    traceback.print_exc()

# ── Stage 5: Connection pool stats (if DatabasePoolManager is importable) ────
print()
print("── Stage 5: Connection pool check ──")
try:
    sys.path.insert(0, os.path.dirname(__file__))
    from database_pool import DatabasePoolManager

    pool = DatabasePoolManager(DATABASE_URL)
    stats = pool.pool_stats
    print(f"  Pool initialized: {pool.pool is not None}")
    print(f"  Pool stats: {stats}")
    if pool.pool:
        print(f"  Pool min/max: {pool.min_conn}/{pool.max_conn}")
except Exception as e:
    print(f"  ⚠️  Pool check skipped: {e}")

# ── Cleanup ──────────────────────────────────────────────────────────────────
if conn:
    conn.close()
    print()
    print("═══ Diagnostic complete — connection healthy ═══")
else:
    print()
    print("═══ Diagnostic FAILED — see errors above ═══")
    sys.exit(1)
