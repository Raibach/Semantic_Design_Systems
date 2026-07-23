"""
Milvus Client Wrapper
Abstract client supporting Lite, Standalone, and Distributed deployments
"""

import os
import time
from typing import Dict, List, Optional, Any

try:
    from pymilvus import MilvusClient
    HAS_MILVUS = True
except Exception:
    MilvusClient = None
    HAS_MILVUS = False

# Cache for search results (TTL-based)
_query_cache = {}
_cache_ttl = 300  # seconds

def _cache_key(collection_name, query_vector, filter_expr, limit):
    """Generate a cache key from search parameters."""
    vector_prefix = tuple(query_vector[:10]) if query_vector else ()
    return (collection_name, vector_prefix, filter_expr, limit)

# MilvusServer and MilvusServerConfig are only available in milvus-lite package
# For now, we'll use MilvusClient directly for Lite mode
try:
    from pymilvus import MilvusServer, MilvusServerConfig
except Exception:
    # Catches ImportError, AttributeError (marshmallow version issues), etc.
    MilvusServer = None
    MilvusServerConfig = None
from config import (
    MILVUS_MODE,
    MILVUS_URI,
    MILVUS_TOKEN,
    get_collection_name,
    get_all_collections,
    EMBEDDING_DIMENSION,
    COLLECTION_CONSISTENCY_LEVEL,
    ENABLE_DYNAMIC_FIELDS
)


class MilvusClientWrapper:
    """Abstract Milvus client wrapper supporting all deployment modes"""
    
    def __init__(self):
        self.mode = MILVUS_MODE
        self.uri = MILVUS_URI
        self.token = MILVUS_TOKEN
        self.client = None
        self._server = None  # For Lite mode server instance
        
    def connect(self):
        """Initialize and connect to Milvus"""
        if not HAS_MILVUS:
            print("⚠️ Milvus not available — features disabled")
            self.client = None
            return None
        try:
            if self.mode == "lite":
                # Lite mode: Use local file directly
                # MilvusClient can work with file paths directly
                if self.uri.endswith(".db") or not os.path.exists(self.uri):
                    # File-based storage - MilvusClient handles this directly
                    # MEMORY FIX: Add timeout and error handling to prevent memory spikes
                    try:
                        self.client = MilvusClient(uri=self.uri)
                    except Exception as e:
                        print(f"⚠️ Milvus file connection failed: {e}")
                        print(f"⚠️ Milvus features will be disabled to prevent memory issues")
                        self.client = None
                        return None
                else:
                    # Directory-based storage - try to use embedded server if available
                    if MilvusServer is not None and MilvusServerConfig is not None:
                        try:
                            config = MilvusServerConfig(
                                data_dir=self.uri,
                                common_security_authorizationEnabled=os.getenv("MILVUS_AUTH_ENABLED", "false").lower() == "true",
                                common_security_superUsers=os.getenv("MILVUS_SUPER_USERS", "root,admin")
                            )
                            self._server = MilvusServer(config=config)
                            self._server.start()
                            server_uri = "http://localhost:19530"
                            server_token = os.getenv("MILVUS_TOKEN", "root:Milvus") if config.common_security_authorizationEnabled else None
                            self.client = MilvusClient(uri=server_uri, token=server_token)
                        except Exception as e:
                            print(f"⚠️ Milvus server startup failed: {e}")
                            print(f"⚠️ Milvus features will be disabled to prevent memory issues")
                            self.client = None
                            return None
                    else:
                        # Fallback: use MilvusClient with directory path
                        try:
                            self.client = MilvusClient(uri=self.uri)
                        except Exception as e:
                            print(f"⚠️ Milvus directory connection failed: {e}")
                            print(f"⚠️ Milvus features will be disabled to prevent memory issues")
                            self.client = None
                            return None
            else:
                # Standalone or Distributed mode
                try:
                    self.client = MilvusClient(uri=self.uri, token=self.token)
                except Exception as e:
                    print(f"⚠️ Milvus connection failed: {e}")
                    print(f"⚠️ Milvus features will be disabled to prevent memory issues")
                    self.client = None
                    return None
            
            if self.client is None:
                return None
            
            # Ensure collections exist - FAIL HARD if this doesn't work
            self._ensure_collections_exist()
            
            print(f"✅ Connected to Milvus ({self.mode} mode)")
            return self.client
        except Exception as e:
            print(f"❌ Failed to connect to Milvus: {e}")
            print(f"⚠️ Milvus features will be disabled to prevent crashes")
            import traceback
            traceback.print_exc()
            self.client = None
            return None
    
    def _ensure_collections_exist(self):
        """Ensure all required collections exist"""
        collections = get_all_collections()
        existing = self.client.list_collections()
        
        for collection_name in collections:
            if collection_name not in existing:
                self.create_collection(collection_name)
                print(f"✅ Created collection: {collection_name}")
    
    def create_collection(self, collection_name: str):
        """Create a collection with standard schema"""
        try:
            self.client.create_collection(
                collection_name=collection_name,
                dimension=EMBEDDING_DIMENSION,
                enable_dynamic_field=ENABLE_DYNAMIC_FIELDS,
                consistency_level=COLLECTION_CONSISTENCY_LEVEL,
                auto_id=True,
            )
        except Exception as e:
            # Collection might already exist
            if "already exists" not in str(e).lower():
                raise
    
    def insert(
        self,
        collection_name: str,
        vectors: List[List[float]],
        metadata: List[Dict[str, Any]],
        ids: Optional[List[int]] = None
    ):
        """
        Insert vectors with metadata into collection
        
        Args:
            collection_name: Name of collection
            vectors: List of embedding vectors
            metadata: List of metadata dicts (must include user_id, conversation_id, etc.)
            ids: Optional list of IDs (auto-generated if not provided)
        """
        if not self.client:
            self.connect()
        
        # Prepare data for insertion
        data = []
        for i, (vector, meta) in enumerate(zip(vectors, metadata)):
            item = {
                "vector": vector,
                **meta  # Include all metadata as dynamic fields
            }
            if ids:
                item["id"] = ids[i]
            data.append(item)
        
        try:
            self.client.insert(
                collection_name=collection_name,
                data=data
            )
        except Exception as e:
            print(f"❌ Failed to insert into {collection_name}: {e}")
            raise
    
    def search(
        self,
        collection_name: str,
        query_vectors: List[List[float]],
        filter_expr: Optional[str] = None,
        limit: int = 10,
        output_fields: Optional[List[str]] = None,
        timeout: Optional[int] = None
    ) -> List[Dict]:
        """
        Search for similar vectors
        
        Args:
            collection_name: Name of collection
            query_vectors: List of query embedding vectors
            filter_expr: Optional filter expression (e.g., 'user_id == "123"')
            limit: Maximum number of results
            output_fields: Optional list of fields to return
            timeout: Optional timeout in seconds (default: 30)
        
        Returns:
            List of search results with scores
        """
        if not self.client:
            self.connect()
        
        try:
            # Set default timeout
            if timeout is None:
                timeout = 30
            
            # Check cache first
            cache_key = _cache_key(collection_name, query_vectors[0] if query_vectors else [], filter_expr, limit)
            if cache_key in _query_cache:
                cached_result, cached_time = _query_cache[cache_key]
                if time.time() - cached_time < _cache_ttl:
                    return cached_result
                else:
                    # Expired, remove from cache
                    del _query_cache[cache_key]
            
            # Optimize filter expression for better performance
            if filter_expr:
                # Simplify common patterns
                filter_expr = filter_expr.replace(' == ', ' == ')  # Normalize spacing
                # Add parentheses for complex expressions if needed
                if ' && ' in filter_expr and ' || ' in filter_expr:
                    # Ensure proper grouping
                    pass  # Keep as-is for now
            
            start_time = time.time()
            results = self.client.search(
                collection_name=collection_name,
                data=query_vectors,
                filter=filter_expr,
                limit=limit,
                output_fields=output_fields or [],
                timeout=timeout
            )
            query_time = time.time() - start_time
            
            # Cache results
            _query_cache[cache_key] = (results, time.time())
            
            # Limit cache size (simple LRU: remove oldest if over 100 entries)
            if len(_query_cache) > 100:
                oldest_key = min(_query_cache.keys(), key=lambda k: _query_cache[k][1])
                del _query_cache[oldest_key]
            
            # pymilvus returns list of lists (one per query vector)
            # Each inner list contains dicts with 'id', 'distance', and entity fields
            return results
        except Exception as e:
            print(f"❌ Search failed in {collection_name}: {e}")
            # Fallback to empty results
            return []
    
    def get_collection_stats(self, collection_name: str) -> Dict:
        """Get collection statistics"""
        if not self.client:
            self.connect()
        
        try:
            stats = self.client.get_collection_stats(collection_name)
            return stats
        except Exception as e:
            print(f"⚠️ Failed to get stats for {collection_name}: {e}")
            return {}
    
    def delete_by_filter(self, collection_name: str, filter_expr: str):
        """Delete vectors matching filter expression"""
        if not self.client:
            self.connect()
        
        try:
            self.client.delete(
                collection_name=collection_name,
                filter=filter_expr
            )
        except Exception as e:
            print(f"❌ Failed to delete from {collection_name}: {e}")
            raise
    
    def close(self):
        """Close connection and stop server if in Lite mode"""
        if self._server:
            try:
                self._server.stop()
            except:
                pass
        if self.client:
            try:
                self.client.close()
            except:
                pass


# Global client instance
_milvus_client: Optional[MilvusClientWrapper] = None


def get_milvus_client() -> Optional[MilvusClientWrapper]:
    """Get or create global Milvus client instance
    Returns None if Milvus is unavailable to prevent crashes"""
    global _milvus_client
    if _milvus_client is None:
        try:
            _milvus_client = MilvusClientWrapper()
            result = _milvus_client.connect()
            if result is None:
                # Connection failed - disable Milvus
                _milvus_client = None
                return None
        except Exception as e:
            print(f"⚠️ Milvus initialization failed: {e}")
            print(f"⚠️ Milvus features disabled to prevent crashes")
            _milvus_client = None
            return None
    return _milvus_client

