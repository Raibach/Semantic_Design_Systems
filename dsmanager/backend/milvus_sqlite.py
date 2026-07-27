"""
Lightweight Milvus SQLite Bridge
Directly reads/writes the Milvus Lite SQLite database,
bypassing the milvus-lite dependency chain entirely.
"""
import sqlite3
import json
import os
import struct
from typing import Optional

# Use the absolute path from config to avoid working-directory ambiguity
from config import MILVUS_URI
MILVUS_DB = MILVUS_URI if MILVUS_URI.endswith(".db") else os.path.join(MILVUS_URI, "milvus.db")

def _get_db():
    """Get a read-only connection to the Milvus SQLite database."""
    if not os.path.exists(MILVUS_DB):
        return None
    conn = sqlite3.connect(f"file:{MILVUS_DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn

def list_collections() -> list:
    """List all vector collections in Milvus."""
    db = _get_db()
    if not db:
        return []
    try:
        rows = db.execute(
            "SELECT DISTINCT collection_name FROM collection_meta"
        ).fetchall()
        return [r["collection_name"] for r in rows]
    finally:
        db.close()

def get_collection_stats() -> list:
    """Get stats for all collections."""
    db = _get_db()
    if not db:
        return []
    try:
        stats = []
        collections = db.execute(
            "SELECT DISTINCT collection_name FROM collection_meta"
        ).fetchall()
        for col in collections:
            name = col["collection_name"]
            count = db.execute(f"SELECT COUNT(*) as cnt FROM [{name}]").fetchone()["cnt"]
            stats.append({"collection": name, "vector_count": count})
        return stats
    finally:
        db.close()

def search_vectors(
    collection: str,
    limit: int = 20,
    offset: int = 0,
) -> list:
    """Retrieve stored vectors with their metadata from a collection."""
    db = _get_db()
    if not db:
        return []
    try:
        rows = db.execute(
            f"SELECT rowid, * FROM [{collection}] LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        results = []
        for row in rows:
            d = dict(row)
            # If there's a vector blob, note its size
            if "vector" in d and d["vector"]:
                d["vector_dim"] = len(d["vector"]) // 4  # float32 = 4 bytes
            results.append(d)
        return results
    finally:
        db.close()

def insert_vector(
    collection: str,
    vector: list,
    metadata: Optional[dict] = None,
) -> bool:
    """Insert a vector + metadata into a Milvus collection."""
    import sqlite3 as _sqlite3
    if not os.path.exists(MILVUS_DB):
        return False
    # Pack float32 vector into binary
    blob = struct.pack(f"{len(vector)}f", *vector)
    conn = _sqlite3.connect(MILVUS_DB)
    try:
        conn.execute(
            f"INSERT INTO [{collection}] (vector, metadata) VALUES (?, ?)",
            (blob, json.dumps(metadata or {})),
        )
        conn.commit()
        return True
    except Exception as e:
        print(f"Milvus insert error: {e}")
        return False
    finally:
        conn.close()

def get_db_info() -> dict:
    """Get overall Milvus database information."""
    if not os.path.exists(MILVUS_DB):
        return {"exists": False, "path": MILVUS_DB}
    size = os.path.getsize(MILVUS_DB)
    stats = get_collection_stats()
    total_vectors = sum(s["vector_count"] for s in stats)
    return {
        "exists": True,
        "path": MILVUS_DB,
        "size_bytes": size,
        "size_mb": round(size / (1024 * 1024), 2),
        "collections": stats,
        "total_vectors": total_vectors,
    }
