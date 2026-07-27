"""
Milvus Configuration
Configuration for Milvus vector database
"""

import os

# Project root is the parent directory of this config/ folder
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Milvus deployment mode: "lite", "standalone", or "distributed"
MILVUS_MODE = os.getenv("MILVUS_MODE", "lite")

# Milvus connection URI
# For lite mode: file path (e.g., "./milvus.db") or directory path — always resolved to an absolute path
# For standalone/distributed: connection string (e.g., "http://localhost:19530")
_uri_env = os.getenv("MILVUS_URI", os.path.join(_PROJECT_ROOT, "milvus.db"))
# If URI is a relative file path (not a URL), resolve it relative to the project root
_is_url = _uri_env.startswith("http://") or _uri_env.startswith("https://")
if not _is_url:
    if not os.path.isabs(_uri_env):
        _uri_env = os.path.join(_PROJECT_ROOT, _uri_env.lstrip("./"))
    MILVUS_URI = os.path.abspath(_uri_env)
else:
    # Leave HTTP/HTTPS URLs untouched — os.path.abspath corrupts them on macOS
    MILVUS_URI = _uri_env

# Milvus authentication token (for standalone/distributed with auth enabled)
MILVUS_TOKEN = os.getenv("MILVUS_TOKEN", "")

# Embedding model configuration
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
EMBEDDING_MODEL_VERSION = os.getenv("EMBEDDING_MODEL_VERSION", "1.0")
EMBEDDING_DIMENSION = 384  # Dimension for all-MiniLM-L6-v2

# Chunking configuration for long texts
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "512"))  # Tokens per chunk
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))  # Token overlap between chunks

# Collection configuration
COLLECTION_CONSISTENCY_LEVEL = "Session"  # Consistency level for collections
ENABLE_DYNAMIC_FIELDS = True  # Enable dynamic fields for metadata

# Collection names for different context types
def get_collection_name(context_type: str = "general") -> str:
    """
    Get collection name based on context type
    
    Args:
        context_type: "character", "plot", or "general" (legacy — all now use prompt_memory)
    
    Returns:
        Collection name string
    """
    return "prompt_memory"

# A2UI Agentic Workspace — Collection Schema
# ai_actions       — every AI tag mutation tracked with prompt_id partition
# prompt_versions  — workspace snapshots on save, partitioned by prompt_id
# prompt_memory    — vectorized context for semantic retrieval, by prompt_id

def get_all_collections() -> list:
    """All collections for the A2UI agentic workspace."""
    return [
        "ai_actions",
        "prompt_versions",
        "prompt_memory",
    ]