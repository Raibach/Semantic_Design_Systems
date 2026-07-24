"""
Embedding Rules Configuration
Define what content should automatically get embeddings generated
"""

import os
from typing import Dict, List, Optional, Callable
from config.milvus_config import get_collection_name


class EmbeddingRules:
    """Configuration for when embeddings should be automatically generated"""
    
    # ===== GLOBAL SETTINGS =====
    
    # Enable/disable automatic embedding generation
    AUTO_EMBED_ENABLED = os.getenv("AUTO_EMBED_ENABLED", "true").lower() == "true"
    
    # Maximum content length for automatic embedding (chars)
    MAX_CONTENT_LENGTH = int(os.getenv("AUTO_EMBED_MAX_LENGTH", "50000"))
    
    # Minimum content length to embed (skip very short content)
    MIN_CONTENT_LENGTH = int(os.getenv("AUTO_EMBED_MIN_LENGTH", "50"))
    
    # ===== CONTENT TYPE RULES =====
    
    # Content types that should ALWAYS be embedded
    ALWAYS_EMBED_CONTENT_TYPES = [
        "conversation",  # All conversation messages
        "text",          # Text uploads
        "dictation",     # Dictation/editor content
        "story",         # Story drafts
    ]
    
    # Content types that should NEVER be embedded automatically
    NEVER_EMBED_CONTENT_TYPES = [
        "pdf",  # PDFs are too large - use batch processing
        "rss",  # RSS feeds - use batch processing
    ]
    
    # ===== SOURCE TYPE RULES =====
    
    # Source types that should ALWAYS be embedded
    ALWAYS_EMBED_SOURCE_TYPES = [
        "conversation",      # Conversation messages
        "dictation",         # Dictation/editor saves
        "user_upload",      # User uploads
    ]
    
    # Source types that should NEVER be embedded automatically
    NEVER_EMBED_SOURCE_TYPES = [
        "rss_feed",  # RSS feeds - use batch processing
        "pdf_extract",  # PDF extracts - use batch processing
    ]
    
    # ===== TAG-BASED RULES =====
    
    # If conversation has these tags, always embed
    ALWAYS_EMBED_TAGS = [
        "Character",  # Character-related content
        "Plot",       # Plot-related content
        "Structure",  # Structure-related content
    ]
    
    # Tag prefixes that indicate important content
    IMPORTANT_TAG_PREFIXES = [
        "Character >",
        "Plot >",
        "Structure >",
    ]
    
    # ===== PROJECT-BASED RULES =====
    
    # If memory is associated with a project, always embed
    EMBED_WITH_PROJECT = True
    
    # ===== IMPORTANCE-BASED RULES =====
    
    # Minimum importance score to auto-embed (0.0-1.0)
    MIN_IMPORTANCE_SCORE = float(os.getenv("AUTO_EMBED_MIN_IMPORTANCE", "0.0"))
    
    # ===== QUARANTINE-BASED RULES =====
    
    # Only embed content that has passed quarantine
    REQUIRE_QUARANTINE_SAFE = False  # Set to True to only embed safe content
    
    # ===== CUSTOM RULES =====
    
    # Custom function to determine if content should be embedded
    # Signature: should_embed(content_type, source_type, metadata, **kwargs) -> bool
    CUSTOM_RULE: Optional[Callable] = None
    
    @classmethod
    def should_embed(
        cls,
        content_type: str,
        source_type: str,
        metadata: Optional[Dict] = None,
        content_length: int = 0,
        has_tags: bool = False,
        tag_paths: Optional[List[str]] = None,
        project_id: Optional[str] = None,
        importance_score: Optional[float] = None,
        quarantine_status: Optional[str] = None,
        **kwargs
    ) -> bool:
        """
        Determine if content should be automatically embedded
        
        Args:
            content_type: Type of content ('conversation', 'text', 'pdf', etc.)
            source_type: Source type ('conversation', 'dictation', 'user_upload', etc.)
            metadata: Optional metadata dict
            content_length: Length of content in characters
            has_tags: Whether content has tags
            tag_paths: List of tag paths
            project_id: Associated project ID
            importance_score: Importance score (0.0-1.0)
            quarantine_status: Quarantine status
            **kwargs: Additional context
        
        Returns:
            True if content should be embedded, False otherwise
        """
        # Check global setting
        if not cls.AUTO_EMBED_ENABLED:
            return False
        
        # Check content length
        if content_length < cls.MIN_CONTENT_LENGTH:
            return False
        
        if content_length > cls.MAX_CONTENT_LENGTH:
            return False
        
        # Check content type rules
        if content_type in cls.NEVER_EMBED_CONTENT_TYPES:
            return False
        
        if content_type in cls.ALWAYS_EMBED_CONTENT_TYPES:
            return True
        
        # Check source type rules
        if source_type in cls.NEVER_EMBED_SOURCE_TYPES:
            return False
        
        if source_type in cls.ALWAYS_EMBED_SOURCE_TYPES:
            return True
        
        # Check tag-based rules
        if has_tags and tag_paths:
            for tag_path in tag_paths:
                # Check if any tag matches always-embed tags
                for always_tag in cls.ALWAYS_EMBED_TAGS:
                    if always_tag in tag_path:
                        return True
                
                # Check if tag starts with important prefix
                for prefix in cls.IMPORTANT_TAG_PREFIXES:
                    if tag_path.startswith(prefix):
                        return True
        
        # Check project-based rules
        if cls.EMBED_WITH_PROJECT and project_id:
            return True
        
        # Check importance score
        if importance_score is not None and importance_score >= cls.MIN_IMPORTANCE_SCORE:
            return True
        
        # Check quarantine status
        if cls.REQUIRE_QUARANTINE_SAFE:
            if quarantine_status not in ['safe', 'pending']:
                return False
        
        # Check custom rule if provided
        if cls.CUSTOM_RULE:
            try:
                return cls.CUSTOM_RULE(
                    content_type=content_type,
                    source_type=source_type,
                    metadata=metadata,
                    content_length=content_length,
                    has_tags=has_tags,
                    tag_paths=tag_paths,
                    project_id=project_id,
                    importance_score=importance_score,
                    quarantine_status=quarantine_status,
                    **kwargs
                )
            except Exception as e:
                print(f"⚠️ Custom embedding rule failed: {e}")
                # Fall back to default behavior
                pass
        
        # Default: don't embed (conservative approach)
        return False
    
    @classmethod
    def get_embedding_priority(cls, metadata: Optional[Dict] = None) -> int:
        """
        Get embedding priority (higher = more important)
        Used for batch processing order
        
        Returns:
            Priority score (0-100)
        """
        priority = 0
        
        if metadata:
            # High priority for tagged content
            if metadata.get('tag_path'):
                priority += 30
            
            # High priority for project content
            if metadata.get('project_id'):
                priority += 20
            
            # High priority for important content types
            if metadata.get('content_type') in ['story', 'dictation']:
                priority += 10
            
            # High priority for high importance scores
            importance = metadata.get('importance_score', 0)
            if importance:
                priority += int(importance * 20)
        
        return priority


# Convenience function
def should_embed_automatically(
    content_type: str,
    source_type: str,
    metadata: Optional[Dict] = None,
    **kwargs
) -> bool:
    """Check if content should be automatically embedded"""
    # Extract common metadata fields
    content_length = kwargs.get('content_length', len(metadata.get('content', '')) if metadata else 0)
    tag_paths = kwargs.get('tag_paths') or (metadata.get('tag_paths', []) if metadata else [])
    has_tags = bool(tag_paths) or bool(metadata.get('tag_path')) if metadata else False
    project_id = kwargs.get('project_id') or (metadata.get('project_id') if metadata else None)
    importance_score = kwargs.get('importance_score') or (metadata.get('importance_score') if metadata else None)
    quarantine_status = kwargs.get('quarantine_status') or (metadata.get('quarantine_status') if metadata else None)
    
    return EmbeddingRules.should_embed(
        content_type=content_type,
        source_type=source_type,
        metadata=metadata,
        content_length=content_length,
        has_tags=has_tags,
        tag_paths=tag_paths,
        project_id=project_id,
        importance_score=importance_score,
        quarantine_status=quarantine_status,
        **kwargs
    )

