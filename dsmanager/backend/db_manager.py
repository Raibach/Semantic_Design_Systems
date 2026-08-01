#!/usr/bin/env python3
"""
db_manager.py — Local Database Management Tool

Three commands:
  snapshot  — Read the live database schema and save it to schema/snapshot.json
  inspect   — Print a readable report of the live database right now
  diff      — Compare snapshot.json against the live database; show what changed

Design:
  - Read-only against the database. The only write is to snapshot.json on disk.
  - Local only. Reads DATABASE_URL from the environment (localhost by default).
  - Never connects to production. Never writes to the database.
  - Uses the existing DatabasePoolManager, not raw psycopg2.

Usage:
  cd backend
  .venv/bin/python db_manager.py snapshot
  .venv/bin/python db_manager.py inspect
  .venv/bin/python db_manager.py diff
"""

import os
import sys
import json
from datetime import datetime
from pathlib import Path

# Ensure we can import database_pool from the backend directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database_pool import DatabasePoolManager
import psycopg2.extras

# Where the snapshot file lives
SCHEMA_DIR = Path(__file__).parent / "schema"
SNAPSHOT_PATH = SCHEMA_DIR / "snapshot.json"


# ──────────────────────────────────────────────────────────────────────
# Schema reading — these functions query the live database (read-only)
# ──────────────────────────────────────────────────────────────────────

def read_tables(cur):
    """Return all base tables in the public schema, ordered by name."""
    cur.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)
    return [row["table_name"] for row in cur.fetchall()]


def read_columns(cur, table_name):
    """Return all columns for a table, ordered by position."""
    cur.execute("""
        SELECT column_name, data_type, character_maximum_length,
               is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
    """, (table_name,))
    columns = []
    for row in cur.fetchall():
        col = {
            "name": row["column_name"],
            "type": row["data_type"],
            "nullable": row["is_nullable"] == "YES",
            "default": row["column_default"],
        }
        if row["character_maximum_length"]:
            col["type"] += f"({row['character_maximum_length']})"
        columns.append(col)
    return columns


def read_indexes(cur, table_name):
    """Return all indexes for a table."""
    cur.execute("""
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = %s
        ORDER BY indexname
    """, (table_name,))
    return [
        {"name": row["indexname"], "definition": row["indexdef"]}
        for row in cur.fetchall()
    ]


def read_constraints(cur, table_name):
    """Return all constraints for a table (primary keys, foreign keys, unique)."""
    cur.execute("""
        SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = connamespace
        WHERE nsp.nspname = 'public' AND rel.relname = %s
        ORDER BY con.conname
    """, (table_name,))
    type_map = {"p": "primary_key", "f": "foreign_key", "u": "unique", "c": "check"}
    return [
        {
            "name": row["conname"],
            "type": type_map.get(row["contype"], str(row["contype"])),
            "definition": row["definition"],
        }
        for row in cur.fetchall()
    ]


def read_functions(cur):
    """Return all stored functions/procedures in the public schema."""
    cur.execute("""
        SELECT routine_name, routine_type, data_type AS return_type,
               routine_definition
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        ORDER BY routine_name
    """)
    return [
        {
            "name": row["routine_name"],
            "type": row["routine_type"],
            "returns": row["return_type"],
            "definition": row["routine_definition"],
        }
        for row in cur.fetchall()
    ]


def read_row_counts(cur, table_names):
    """Return {table_name: row_count} for every table."""
    counts = {}
    for table in table_names:
        try:
            cur.execute(f'SELECT COUNT(*) AS n FROM "{table}"')
            counts[table] = cur.fetchone()["n"]
        except Exception:
            counts[table] = -1  # table exists but query failed (permissions, etc.)
    return counts


def read_full_schema(conn):
    """Read the complete schema from the live database. Returns a dict."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        table_names = read_tables(cur)
        tables = {}
        for table_name in table_names:
            tables[table_name] = {
                "columns": read_columns(cur, table_name),
                "indexes": read_indexes(cur, table_name),
                "constraints": read_constraints(cur, table_name),
            }
        functions = read_functions(cur)
        row_counts = read_row_counts(cur, table_names)

    return {
        "captured_at": datetime.utcnow().isoformat() + "Z",
        "database_url_safe": _safe_db_url(),
        "table_count": len(table_names),
        "tables": tables,
        "functions": functions,
        "row_counts": row_counts,
    }


def _safe_db_url():
    """Return a sanitized version of DATABASE_URL (no password)."""
    url = os.getenv("DATABASE_URL", "")
    if "@" in url:
        # postgresql://user:password@host:port/dbname → postgresql://user:***@host:port/dbname
        prefix, rest = url.split("://", 1)
        creds, host_part = rest.split("@", 1)
        if ":" in creds:
            user = creds.split(":")[0]
        else:
            user = creds
        return f"{prefix}://{user}:***@{host_part}"
    return url


# ──────────────────────────────────────────────────────────────────────
# Commands
# ──────────────────────────────────────────────────────────────────────

def cmd_snapshot():
    """Read the live database and write the schema to snapshot.json."""
    print("Reading live database schema...")

    pool = DatabasePoolManager.get_instance()
    with pool.get_connection() as conn:
        schema = read_full_schema(conn)

    SCHEMA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SNAPSHOT_PATH, "w") as f:
        json.dump(schema, f, indent=2, sort_keys=True)

    total_rows = sum(v for v in schema["row_counts"].values() if v >= 0)
    print(f"\n✅ Snapshot saved to {SNAPSHOT_PATH}")
    print(f"   Tables: {schema['table_count']}")
    print(f"   Functions: {len(schema['functions'])}")
    print(f"   Total rows: {total_rows}")
    print(f"   Captured: {schema['captured_at']}")
    print(f"   Source: {schema['database_url_safe']}")


def cmd_inspect():
    """Print a readable report of the live database."""
    pool = DatabasePoolManager.get_instance()
    with pool.get_connection() as conn:
        schema = read_full_schema(conn)

    print("=" * 70)
    print("DATABASE INSPECTION REPORT")
    print("=" * 70)
    print(f"Source: {schema['database_url_safe']}")
    print(f"Tables: {schema['table_count']}  |  Functions: {len(schema['functions'])}")
    print()

    # Tables with data first, then empty tables
    counts = schema["row_counts"]
    tables_with_data = sorted(
        [t for t in schema["tables"] if counts.get(t, 0) > 0],
        key=lambda t: counts[t],
        reverse=True,
    )
    empty_tables = sorted(
        [t for t in schema["tables"] if counts.get(t, 0) == 0]
    )

    print("TABLES WITH DATA:")
    print("-" * 70)
    for t in tables_with_data:
        col_count = len(schema["tables"][t]["columns"])
        print(f"  {t}")
        print(f"    {counts[t]} rows | {col_count} columns")
        for col in schema["tables"][t]["columns"]:
            nullable = "NULL" if col["nullable"] else "NOT NULL"
            default = f" DEFAULT {col['default']}" if col["default"] else ""
            print(f"      {col['name']:30s} {col['type']:20s} {nullable}{default}")
        print()

    print("EMPTY TABLES:")
    print("-" * 70)
    for t in empty_tables:
        col_count = len(schema["tables"][t]["columns"])
        print(f"  {t} ({col_count} columns, 0 rows)")

    print()
    print("STORED FUNCTIONS:")
    print("-" * 70)
    if schema["functions"]:
        for fn in schema["functions"]:
            print(f"  {fn['name']}() → {fn['returns']}")
    else:
        print("  (none)")

    total_rows = sum(v for v in counts.values() if v >= 0)
    print()
    print("=" * 70)
    print(f"TOTAL: {schema['table_count']} tables, {total_rows} rows, {len(schema['functions'])} functions")
    print("=" * 70)


def cmd_diff():
    """Compare snapshot.json against the live database. Show what changed."""
    if not SNAPSHOT_PATH.exists():
        print(f"❌ No snapshot found at {SNAPSHOT_PATH}")
        print("   Run: python db_manager.py snapshot")
        sys.exit(1)

    with open(SNAPSHOT_PATH) as f:
        snapshot = json.load(f)

    print("Comparing snapshot against live database...")
    print(f"  Snapshot from: {snapshot['captured_at']}")
    print()

    pool = DatabasePoolManager.get_instance()
    with pool.get_connection() as conn:
        live = read_full_schema(conn)

    changes_found = False

    # --- Tables added or removed ---
    snap_tables = set(snapshot["tables"].keys())
    live_tables = set(live["tables"].keys())

    added = sorted(live_tables - snap_tables)
    removed = sorted(snap_tables - live_tables)

    if added:
        changes_found = True
        print("TABLES ADDED (in live, not in snapshot):")
        for t in added:
            print(f"  + {t}")
        print()

    if removed:
        changes_found = True
        print("TABLES REMOVED (in snapshot, not in live):")
        for t in removed:
            print(f"  - {t}")
        print()

    # --- Column changes for tables that exist in both ---
    common_tables = sorted(snap_tables & live_tables)
    for table_name in common_tables:
        snap_cols = {c["name"]: c for c in snapshot["tables"][table_name]["columns"]}
        live_cols = {c["name"]: c for c in live["tables"][table_name]["columns"]}

        cols_added = sorted(set(live_cols.keys()) - set(snap_cols.keys()))
        cols_removed = sorted(set(snap_cols.keys()) - set(live_cols.keys()))

        # Check for type changes on common columns
        cols_changed = []
        for col_name in sorted(set(snap_cols.keys()) & set(live_cols.keys())):
            snap_c = snap_cols[col_name]
            live_c = live_cols[col_name]
            if snap_c["type"] != live_c["type"] or snap_c["nullable"] != live_c["nullable"]:
                cols_changed.append((col_name, snap_c, live_c))

        if cols_added or cols_removed or cols_changed:
            changes_found = True
            print(f"COLUMN CHANGES IN {table_name}:")
            for c in cols_added:
                col = live_cols[c]
                print(f"  + {c} ({col['type']})")
            for c in cols_removed:
                col = snap_cols[c]
                print(f"  - {c} ({col['type']})")
            for c, old, new in cols_changed:
                if old["type"] != new["type"]:
                    print(f"  ~ {c}: type changed {old['type']} → {new['type']}")
                if old["nullable"] != new["nullable"]:
                    old_n = "NULL" if old["nullable"] else "NOT NULL"
                    new_n = "NULL" if new["nullable"] else "NOT NULL"
                    print(f"  ~ {c}: nullable changed {old_n} → {new_n}")
            print()

    # --- Row count changes ---
    print("ROW COUNT CHANGES:")
    print("-" * 70)
    row_changes = False
    for table_name in common_tables:
        snap_count = snapshot["row_counts"].get(table_name, 0)
        live_count = live["row_counts"].get(table_name, 0)
        if snap_count != live_count:
            row_changes = True
            delta = live_count - snap_count
            sign = "+" if delta > 0 else ""
            print(f"  {table_name}: {snap_count} → {live_count} ({sign}{delta})")
    if not row_changes:
        print("  (no row count changes)")
    print()

    # --- Functions changed ---
    snap_fns = {f["name"] for f in snapshot["functions"]}
    live_fns = {f["name"] for f in live["functions"]}
    fns_added = sorted(live_fns - snap_fns)
    fns_removed = sorted(snap_fns - live_fns)

    if fns_added or fns_removed:
        changes_found = True
        print("FUNCTION CHANGES:")
        for fn in fns_added:
            print(f"  + {fn}()")
        for fn in fns_removed:
            print(f"  - {fn}()")
        print()

    if not changes_found and not row_changes:
        print("✅ No changes detected. Live database matches snapshot.")
    elif not changes_found:
        print("ℹ️  Only row counts changed (no schema changes).")


# ──────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python db_manager.py <snapshot|inspect|diff>")
        print()
        print("Commands:")
        print("  snapshot  — Save the live database schema to schema/snapshot.json")
        print("  inspect   — Print a report of the live database")
        print("  diff      — Compare snapshot.json against the live database")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "snapshot":
        cmd_snapshot()
    elif command == "inspect":
        cmd_inspect()
    elif command == "diff":
        cmd_diff()
    else:
        print(f"Unknown command: {command}")
        print("Usage: python db_manager.py <snapshot|inspect|diff>")
        sys.exit(1)


if __name__ == "__main__":
    main()
