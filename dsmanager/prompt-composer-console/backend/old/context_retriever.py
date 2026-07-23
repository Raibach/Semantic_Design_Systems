"""
Context Retriever - Retrieves conversation context for Grace's clarifying questions
Implements agentic RAG pipeline with Grace ↔ Retrieval Model communication
"""

from typing import Dict, List, Optional
from datetime import datetime


class ContextRetriever:
    """Retrieves relevant conversation context based on queries"""
    
    def __init__(self, conversation_api, query_generator=None):
        """
        Initialize context retriever
        
        Args:
            conversation_api: ConversationAPI instance
            query_generator: Optional QueryGenerator instance
        """
        self.conversation_api = conversation_api
        self.query_generator = query_generator
    
    def retrieve_conversation_context(
        self,
        query: str,
        user_id: str,
        project_id: Optional[str] = None,
        limit: int = 5,
        detected_entities: Optional[Dict] = None,
        use_milvus: bool = True
    ) -> Dict[str, any]:
        """
        Main retrieval function - gets relevant conversations based on query
        
        Enhanced to use Milvus semantic search with tag filtering
        
        Args:
            query: Natural language query or Grace's question
            user_id: User ID
            project_id: Optional project ID
            limit: Maximum number of conversations to retrieve
            detected_entities: Optional pre-detected entities from context_detector
            use_milvus: Whether to use Milvus for semantic search (default: True)
        
        Returns:
            {
                'conversations': [...],
                'formatted_context': "...",
                'tag_paths_used': [...],
                'retrieval_count': 5,
                'retrieval_method': 'milvus' | 'postgresql'
            }
        """
        # Use query generator if available to build tag-based query
        tag_paths = []
        character_names = []
        conversations = []
        retrieval_method = 'postgresql'
        
        if self.query_generator:
            try:
                query_result = self.query_generator.generate_query_from_context(
                    user_question=query,
                    user_id=user_id,
                    project_id=project_id,
                    detected_entities=detected_entities
                )
                tag_paths = query_result.get('tag_filters', [])
                character_names = query_result.get('character_filters', [])
            except Exception as e:
                print(f"⚠️ Query generation failed: {e}")
        
        # Try Milvus search first if enabled
        if use_milvus:
            try:
                from milvus_client import get_milvus_client
                from query_generator import QueryGenerator
                
                milvus_client = get_milvus_client()
                if milvus_client and milvus_client.connect():
                    query_gen = QueryGenerator()
                    milvus_query = query_gen.generate_milvus_query(
                        user_question=query,
                        user_id=user_id,
                        project_id=project_id,
                        detected_entities=detected_entities
                    )
                    
                    # Search Milvus
                    results = milvus_client.search(
                        collection_name=milvus_query['collection_name'],
                        query_vectors=[milvus_query['query_embedding']],
                        filter_expr=milvus_query['filter_expr'],
                        limit=limit,
                        output_fields=['conversation_id', 'content', 'tag_path', 'character_names']
                    )
                    
                    # Convert Milvus results to conversation format
                    if results and len(results) > 0:
                        milvus_conversation_ids = set()
                        for result_group in results:
                            for hit in result_group:
                                conv_id = hit.get('conversation_id')
                                if conv_id and conv_id not in milvus_conversation_ids:
                                    milvus_conversation_ids.add(conv_id)
                        
                        # Fetch full conversations from PostgreSQL
                        for conv_id in list(milvus_conversation_ids)[:limit]:
                            try:
                                conv = self.conversation_api.get_conversation(conv_id, user_id)
                                if conv:
                                    conversations.append(conv)
                            except Exception as e:
                                print(f"⚠️ Failed to fetch conversation {conv_id}: {e}")
                        
                        if conversations:
                            retrieval_method = 'milvus'
                            print(f"✅ Retrieved {len(conversations)} conversations from Milvus")
            except Exception as e:
                print(f"⚠️ Milvus retrieval failed, falling back to PostgreSQL: {e}")
                import traceback
                traceback.print_exc()
        
        # Fallback to PostgreSQL tag-based retrieval if Milvus didn't return results
        if not conversations and (tag_paths or character_names):
            try:
                conversations = self.conversation_api.get_conversations_by_tags(
                    tag_paths=tag_paths,
                    user_id=user_id,
                    project_id=project_id,
                    character_names=character_names,
                    limit=limit
                )
                if conversations:
                    retrieval_method = 'postgresql'
            except Exception as e:
                print(f"⚠️ Tag-based retrieval failed: {e}")
        
        # Format context for LLM
        formatted_context = self.format_context_for_llm(conversations, limit=limit)
        
        return {
            'conversations': conversations,
            'formatted_context': formatted_context,
            'tag_paths_used': tag_paths,
            'character_names_used': character_names,
            'retrieval_count': len(conversations),
            'retrieval_method': retrieval_method
        }
    
    def format_context_for_llm(
        self,
        conversations: List[Dict],
        limit: int = 5
    ) -> str:
        """
        Format retrieved conversations for injection into LLM context
        
        Args:
            conversations: List of conversation dictionaries
            limit: Maximum number of conversations to include
        
        Returns:
            Formatted context string (max 2000 tokens)
        """
        if not conversations:
            return ""
        
        # Limit conversations
        conversations = conversations[:limit]
        
        formatted_parts = []
        formatted_parts.append("## Relevant Context from Previous Conversations:\n")
        
        total_length = 0
        max_length = 2000 * 4  # ~2000 tokens * 4 chars per token
        
        for conv in conversations:
            if total_length >= max_length:
                break
            
            conv_title = conv.get('title', 'Untitled Conversation')
            conv_id = conv.get('id', '')
            
            # Get messages for this conversation
            try:
                messages = self.conversation_api.get_messages(
                    conversation_id=conv_id,
                    user_id=conv.get('user_id', ''),
                    limit=10  # Limit messages per conversation
                )
                
                # Format conversation excerpt
                conv_text = f"\n### {conv_title}\n"
                for msg in messages[-3:]:  # Last 3 messages
                    role = msg.get('role', 'unknown')
                    content = msg.get('content', '')
                    if content:
                        # Truncate long messages
                        if len(content) > 300:
                            content = content[:300] + "..."
                        conv_text += f"{role.capitalize()}: {content}\n"
                
                # Check if adding this would exceed limit
                if total_length + len(conv_text) > max_length:
                    # Truncate this conversation
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
    
    def inject_context_into_prompt(
        self,
        base_prompt: str,
        retrieved_context: str
    ) -> str:
        """
        Inject retrieved context into base prompt
        
        Args:
            base_prompt: Original user prompt/question
            retrieved_context: Formatted context from retrieve_conversation_context
        
        Returns:
            Enhanced prompt with context injected
        """
        if not retrieved_context:
            return base_prompt
        
        # Inject context before user's question
        enhanced_prompt = f"{retrieved_context}\n\n---\n\nUser Question: {base_prompt}"
        
        return enhanced_prompt

