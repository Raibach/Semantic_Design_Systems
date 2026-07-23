"""
Context Activator - Contextual Memory Activation (Silent Loading)
Automatically loads relevant context when entities are detected, without interrupting conversation flow
"""

from typing import Dict, List, Optional
from datetime import datetime, timedelta


class ContextActivator:
    """Activates contextual memory silently when entities are detected"""
    
    def __init__(self, conversation_api, context_detector, query_generator=None):
        """
        Initialize context activator
        
        Args:
            conversation_api: ConversationAPI instance
            context_detector: ContextDetector instance
            query_generator: Optional QueryGenerator instance
        """
        self.conversation_api = conversation_api
        self.context_detector = context_detector
        self.query_generator = query_generator
        
        # Cache for activated context (request-scoped)
        self._activated_context_cache = {}
        self._cache_ttl = timedelta(minutes=5)  # Cache TTL: 5 minutes
    
    def activate_contextual_memory(
        self,
        detected_entities: Dict[str, List[str]],
        user_id: str,
        project_id: Optional[str] = None,
        current_conversation_id: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Main activation function - loads context silently when entities detected
        
        Args:
            detected_entities: Entities from context_detector.detect_context_entities()
            user_id: User ID
            project_id: Optional project ID
            current_conversation_id: Optional current conversation ID (to exclude from results)
        
        Returns:
            {
                'activated_context': "...",
                'conversations_loaded': [...],
                'entity_types': ['characters', 'work_focus'],
                'cache_key': '...'
            }
        """
        # Check cache first
        cache_key = self._build_cache_key(detected_entities, user_id, project_id)
        cached = self._get_cached_context(cache_key)
        if cached:
            return cached
        
        # Build query from entities
        query = self.context_detector.build_context_query(
            entities=detected_entities,
            user_id=user_id,
            project_id=project_id
        )
        
        # Load character context
        conversations = []
        if query.get('character_names'):
            char_conversations = self.load_character_context(
                character_names=query['character_names'],
                user_id=user_id,
                project_id=project_id,
                exclude_conversation_id=current_conversation_id
            )
            conversations.extend(char_conversations)
        
        # Load topic context
        if query.get('tag_paths'):
            topic_conversations = self.load_topic_context(
                tag_paths=query['tag_paths'],
                user_id=user_id,
                project_id=project_id,
                exclude_conversation_id=current_conversation_id
            )
            conversations.extend(topic_conversations)
        
        # Remove duplicates
        seen_ids = set()
        unique_conversations = []
        for conv in conversations:
            conv_id = conv.get('id')
            if conv_id and conv_id not in seen_ids:
                seen_ids.add(conv_id)
                unique_conversations.append(conv)
        
        # Limit to 5 most relevant conversations
        unique_conversations = unique_conversations[:5]
        
        # Format activated context
        activated_context = self.format_activated_context(
            conversations=unique_conversations,
            entity_type='characters' if query.get('character_names') else 'topics'
        )
        
        result = {
            'activated_context': activated_context,
            'conversations_loaded': unique_conversations,
            'entity_types': list(detected_entities.keys()),
            'cache_key': cache_key
        }
        
        # Cache result
        self._cache_context(cache_key, result)
        
        return result
    
    def load_character_context(
        self,
        character_names: List[str],
        user_id: str,
        project_id: Optional[str] = None,
        exclude_conversation_id: Optional[str] = None,
        limit: int = 5
    ) -> List[Dict]:
        """Load all conversations mentioning specific characters"""
        try:
            conversations = self.conversation_api.get_conversations_by_tags(
                tag_paths=[],  # No tag paths, just character search
                user_id=user_id,
                project_id=project_id,
                character_names=character_names,
                limit=limit * 2  # Get more, then filter
            )
            
            # Filter out current conversation
            if exclude_conversation_id:
                conversations = [
                    c for c in conversations 
                    if c.get('id') != exclude_conversation_id
                ]
            
            return conversations[:limit]
        except Exception as e:
            print(f"⚠️ Failed to load character context: {e}")
            return []
    
    def load_topic_context(
        self,
        tag_paths: List[str],
        user_id: str,
        project_id: Optional[str] = None,
        exclude_conversation_id: Optional[str] = None,
        limit: int = 5
    ) -> List[Dict]:
        """Load conversations by topic tags"""
        try:
            conversations = self.conversation_api.get_conversations_by_tags(
                tag_paths=tag_paths,
                user_id=user_id,
                project_id=project_id,
                character_names=[],
                limit=limit * 2  # Get more, then filter
            )
            
            # Filter out current conversation
            if exclude_conversation_id:
                conversations = [
                    c for c in conversations 
                    if c.get('id') != exclude_conversation_id
                ]
            
            return conversations[:limit]
        except Exception as e:
            print(f"⚠️ Failed to load topic context: {e}")
            return []
    
    def format_activated_context(
        self,
        conversations: List[Dict],
        entity_type: str = 'characters'
    ) -> str:
        """
        Format activated context for silent injection into Grace's prompt
        
        Args:
            conversations: List of conversation dictionaries
            entity_type: Type of entities ('characters', 'topics', etc.)
        
        Returns:
            Formatted context string (max 1500 tokens for silent loading)
        """
        if not conversations:
            return ""
        
        formatted_parts = []
        
        if entity_type == 'characters':
            formatted_parts.append("## Character Context (Silently Loaded):\n")
        else:
            formatted_parts.append("## Topic Context (Silently Loaded):\n")
        
        total_length = 0
        max_length = 1500 * 4  # ~1500 tokens * 4 chars per token (smaller than retrieval for silent loading)
        
        for conv in conversations:
            if total_length >= max_length:
                break
            
            conv_title = conv.get('title', 'Untitled Conversation')
            conv_id = conv.get('id', '')
            
            # Get key messages for this conversation
            try:
                messages = self.conversation_api.get_messages(
                    conversation_id=conv_id,
                    user_id=conv.get('user_id', ''),
                    limit=5  # Fewer messages for silent loading
                )
                
                # Format brief excerpt
                conv_text = f"\n### {conv_title}\n"
                for msg in messages[-2:]:  # Last 2 messages only
                    role = msg.get('role', 'unknown')
                    content = msg.get('content', '')
                    if content:
                        # Truncate long messages more aggressively
                        if len(content) > 200:
                            content = content[:200] + "..."
                        conv_text += f"{role.capitalize()}: {content}\n"
                
                # Check if adding this would exceed limit
                if total_length + len(conv_text) > max_length:
                    remaining = max_length - total_length
                    if remaining > 100:
                        conv_text = conv_text[:remaining] + "...\n"
                    else:
                        break
                
                formatted_parts.append(conv_text)
                total_length += len(conv_text)
            except Exception as e:
                print(f"⚠️ Failed to format conversation {conv_id}: {e}")
                continue
        
        return "\n".join(formatted_parts)
    
    def inject_activated_context(
        self,
        base_prompt: str,
        activated_context: str
    ) -> str:
        """
        Silently inject activated context into base prompt
        
        Args:
            base_prompt: Original user prompt/question
            activated_context: Formatted context from activate_contextual_memory
        
        Returns:
            Enhanced prompt with context silently injected
        """
        if not activated_context:
            return base_prompt
        
        # Inject context silently (no explicit mention to user)
        enhanced_prompt = f"{activated_context}\n\n---\n\n{base_prompt}"
        
        return enhanced_prompt
    
    def _build_cache_key(
        self,
        entities: Dict[str, List[str]],
        user_id: str,
        project_id: Optional[str] = None
    ) -> str:
        """Build cache key from entities"""
        key_parts = [user_id]
        if project_id:
            key_parts.append(project_id)
        
        # Add entity signatures
        for entity_type, values in sorted(entities.items()):
            if values:
                key_parts.append(f"{entity_type}:{','.join(sorted(values))}")
        
        return "|".join(key_parts)
    
    def _get_cached_context(self, cache_key: str) -> Optional[Dict]:
        """Get cached context if still valid"""
        if cache_key in self._activated_context_cache:
            cached_data = self._activated_context_cache[cache_key]
            cached_time = cached_data.get('cached_at')
            if cached_time:
                age = datetime.now() - cached_time
                if age < self._cache_ttl:
                    return cached_data.get('result')
                else:
                    # Expired, remove from cache
                    del self._activated_context_cache[cache_key]
        return None
    
    def _cache_context(self, cache_key: str, result: Dict):
        """Cache context result"""
        self._activated_context_cache[cache_key] = {
            'result': result,
            'cached_at': datetime.now()
        }
        
        # Clean up old cache entries (keep last 50)
        if len(self._activated_context_cache) > 50:
            # Remove oldest entries
            sorted_entries = sorted(
                self._activated_context_cache.items(),
                key=lambda x: x[1].get('cached_at', datetime.min)
            )
            for key, _ in sorted_entries[:-50]:
                del self._activated_context_cache[key]

