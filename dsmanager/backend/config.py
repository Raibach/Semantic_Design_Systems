"""
Simple configuration module for Milvus and other settings
"""
import os

# Milvus Configuration
MILVUS_MODE = os.getenv("MILVUS_MODE", "lite")
MILVUS_URI = os.getenv("MILVUS_URI", "./milvus.db")
MILVUS_TOKEN = os.getenv("MILVUS_TOKEN", "")
# Matches the live Zilliz collections (384-dim FloatVector, COSINE) and the
# SentenceTransformer model actually used for embeddings (see ARCHITECTURE docs).
EMBEDDING_DIMENSION = 384
EMBEDDING_MODEL = "BAAI/bge-small-en"
EMBEDDING_MODEL_VERSION = "v1"
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
COLLECTION_CONSISTENCY_LEVEL = "Eventually"
ENABLE_DYNAMIC_FIELDS = True

# Collection names
def get_collection_name(name):
    return name

def get_all_collections():
    return ["default", "prompt_versions", "ai_actions", "prompt_sessions", "conversations", "memories", "files"]

# Create milvus_config submodule reference for imports
class MilvusConfig:
    MILVUS_MODE = MILVUS_MODE
    MILVUS_URI = MILVUS_URI
    MILVUS_TOKEN = MILVUS_TOKEN
    EMBEDDING_DIMENSION = EMBEDDING_DIMENSION
    COLLECTION_CONSISTENCY_LEVEL = COLLECTION_CONSISTENCY_LEVEL
    ENABLE_DYNAMIC_FIELDS = ENABLE_DYNAMIC_FIELDS
    get_collection_name = staticmethod(get_collection_name)
    get_all_collections = staticmethod(get_all_collections)

milvus_config = MilvusConfig()


# ─────────────────────────────────────────────────────────────────────────────
# Dev mode detection (caches are NEVER used in development)
# Set in backend/.env:
#   ENVIRONMENT=development
#   (also accepts: dev, local)
# Or set DEBUG=1 / true
# ─────────────────────────────────────────────────────────────────────────────
def is_development() -> bool:
    """
    Returns True when running in local development mode.
    In this mode all in-memory/TTL caches are bypassed so every request
    hits the real data sources (DB, Milvus, Figma, etc.).
    """
    env = (os.getenv("ENVIRONMENT") or "").strip().lower()
    if env in ("development", "dev", "local"):
        return True
    debug = (os.getenv("DEBUG") or "").strip().lower()
    if debug in ("1", "true", "yes", "on"):
        return True
    return False