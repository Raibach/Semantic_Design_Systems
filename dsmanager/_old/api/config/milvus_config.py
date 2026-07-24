"""
Milvus Configuration
Supports Lite, Standalone, and Distributed deployments via configuration
"""

import os
from typing import Optional

# Milvus deployment mode: "lite", "standalone", or "distributed"
MILVUS_MODE = os.getenv("MILVUS_MODE", "lite").lower()

# Connection URI based on mode
if MILVUS_MODE == "lite":
    # Lite uses local file-based storage
    MILVUS_URI = os.getenv("MILVUS_URI", "grace_memory.db")
    MILVUS_TOKEN = None  # Lite doesn't use tokens
elif MILVUS_MODE in ["standalone", "distributed"]:
    # Standalone/Distributed use HTTP connection
    MILVUS_URI = os.getenv("MILVUS_URI", "http://localhost:19530")
    # Token format: "username:password" (e.g., "root:Milvus")
    MILVUS_TOKEN = os.getenv("MILVUS_TOKEN", None)
else:
    raise ValueError(f"Invalid MILVUS_MODE: {MILVUS_MODE}. Must be 'lite', 'standalone', or 'distributed'")

# Collection names for different context types
COLLECTION_CHARACTER = "grace_character_v1"
COLLECTION_PLOT = "grace_plot_v1"
COLLECTION_GENERAL = "grace_general_v1"

# Embedding configuration
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en")
EMBEDDING_DIMENSION = 384  # BGE-small-en output dimension
EMBEDDING_MODEL_VERSION = "bge-small-en-v1"

# Chunking configuration
CHUNK_SIZE = 500  # tokens per chunk
CHUNK_OVERLAP = 50  # overlap between chunks

# Collection configuration
COLLECTION_CONSISTENCY_LEVEL = "Strong"
ENABLE_DYNAMIC_FIELDS = True

def get_collection_name(context_type: str = "general") -> str:
    """Get collection name based on context type"""
    mapping = {
        "character": COLLECTION_CHARACTER,
        "plot": COLLECTION_PLOT,
        "general": COLLECTION_GENERAL
    }
    return mapping.get(context_type.lower(), COLLECTION_GENERAL)

def get_all_collections() -> list:
    """Get list of all collection names"""
    return [COLLECTION_CHARACTER, COLLECTION_PLOT, COLLECTION_GENERAL]

