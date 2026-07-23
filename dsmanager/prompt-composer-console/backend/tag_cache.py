"""
Tag Cache - Multi-layer caching for tag queries and tag definitions
Implements browser localStorage, server-side memory cache, and database materialized views
"""

import json
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from functools import lru_cache


class TagCache:
    """Multi-layer caching system for tag operations"""
    
    def __init__(self):
        # Server-side memory cache (Python dict)
        self._memory_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl = timedelta(minutes=5)  # 5 minute TTL
        
        # Cache statistics
        self._cache_hits = 0
        self._cache_misses = 0
    
    # ============================================
    # Server-side Memory Cache
    # ============================================
    
    def get_cached_tags(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get cached tag data from server-side memory"""
        if cache_key in self._memory_cache:
            cached_data = self._memory_cache[cache_key]
            cached_time = cached_data.get('cached_at')
            if cached_time:
                age = datetime.now() - cached_time
                if age < self._cache_ttl:
                    self._cache_hits += 1
                    return cached_data.get('data')
                else:
                    # Expired, remove from cache
                    del self._memory_cache[cache_key]
        
        self._cache_misses += 1
        return None
    
    def set_cached_tags(self, cache_key: str, data: Dict[str, Any]):
        """Cache tag data in server-side memory"""
        self._memory_cache[cache_key] = {
            'data': data,
            'cached_at': datetime.now()
        }
        
        # Clean up old cache entries (keep last 100)
        if len(self._memory_cache) > 100:
            # Remove oldest entries
            sorted_entries = sorted(
                self._memory_cache.items(),
                key=lambda x: x[1].get('cached_at', datetime.min)
            )
            for key, _ in sorted_entries[:-100]:
                del self._memory_cache[key]
    
    def invalidate_cache(self, pattern: Optional[str] = None):
        """Invalidate cache entries matching pattern (or all if None)"""
        if pattern:
            # Invalidate matching keys
            keys_to_remove = [
                key for key in self._memory_cache.keys()
                if pattern in key
            ]
            for key in keys_to_remove:
                del self._memory_cache[key]
        else:
            # Invalidate all
            self._memory_cache.clear()
    
    # ============================================
    # Tag Definitions Cache (LRU)
    # ============================================
    
    @lru_cache(maxsize=100)
    def get_tag_definition(self, tag_path: str, user_id: Optional[str] = None) -> Optional[Dict]:
        """
        Get tag definition (cached with LRU)
        This is for tag definitions which rarely change
        """
        # This would typically query the database
        # For now, return None (implement database query as needed)
        return None
    
    def clear_tag_definition_cache(self):
        """Clear LRU cache for tag definitions"""
        self.get_tag_definition.cache_clear()
    
    # ============================================
    # Conversation Tag Queries Cache
    # ============================================
    
    def get_cached_conversation_tags(
        self,
        user_id: str,
        project_id: Optional[str] = None,
        tag_paths: Optional[List[str]] = None
    ) -> Optional[List[Dict]]:
        """Get cached conversation tag query results"""
        cache_key = self._build_query_cache_key(user_id, project_id, tag_paths)
        return self.get_cached_tags(cache_key)
    
    def set_cached_conversation_tags(
        self,
        user_id: str,
        project_id: Optional[str],
        tag_paths: Optional[List[str]],
        conversations: List[Dict]
    ):
        """Cache conversation tag query results"""
        cache_key = self._build_query_cache_key(user_id, project_id, tag_paths)
        self.set_cached_tags(cache_key, {'conversations': conversations})
    
    def _build_query_cache_key(
        self,
        user_id: str,
        project_id: Optional[str],
        tag_paths: Optional[List[str]]
    ) -> str:
        """Build cache key for tag query"""
        key_parts = [f"user:{user_id}"]
        if project_id:
            key_parts.append(f"project:{project_id}")
        if tag_paths:
            tag_paths_sorted = sorted(tag_paths)
            key_parts.append(f"tags:{','.join(tag_paths_sorted)}")
        return "|".join(key_parts)
    
    # ============================================
    # Database Materialized View Refresh
    # ============================================
    
    def refresh_materialized_view(self, database_connection):
        """
        Refresh the conversation_tag_summary materialized view
        Should be called periodically (e.g., every 10 minutes) or after tag updates
        """
        try:
            cursor = database_connection.cursor()
            cursor.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY conversation_tag_summary")
            database_connection.commit()
            cursor.close()
            print("✅ Refreshed conversation_tag_summary materialized view")
        except Exception as e:
            print(f"⚠️ Failed to refresh materialized view: {e}")
    
    # ============================================
    # Cache Statistics
    # ============================================
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total_requests = self._cache_hits + self._cache_misses
        hit_rate = (self._cache_hits / total_requests * 100) if total_requests > 0 else 0
        
        return {
            'cache_hits': self._cache_hits,
            'cache_misses': self._cache_misses,
            'hit_rate_percent': round(hit_rate, 2),
            'cache_size': len(self._memory_cache),
            'lru_cache_size': self.get_tag_definition.cache_info().currsize
        }


# Global tag cache instance
_tag_cache: Optional[TagCache] = None


def get_tag_cache() -> TagCache:
    """Get or create global tag cache instance"""
    global _tag_cache
    if _tag_cache is None:
        _tag_cache = TagCache()
    return _tag_cache

