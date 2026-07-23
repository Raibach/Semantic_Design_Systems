"""
Keeper API - Backend endpoints for The Keeper character (memory/retrieval interface)
Handles memory management, tag organization, and project asset queries

INTEGRATION NOTE:
This API integrates with the existing MemoriesTab frontend component:
- MemoriesTab shows memories organized by project with The Keeper character
- KeeperChatPanel (Memory Store tab) provides chat interface to query The Keeper
- Both use the same underlying memory system (conversations, tags, projects)
- Hierarchical tag system (tag_definitions, conversation_tags) works alongside existing metadata tags
"""

from flask import Blueprint, request, jsonify
from typing import Dict, List, Optional
import json

# Create Blueprint for Keeper API
keeper_bp = Blueprint('keeper', __name__)


@keeper_bp.route('/api/keeper/query', methods=['POST'])
def keeper_query():
    """
    Keeper query endpoint - handles memory/retrieval model responses through Keeper persona
    
    IMPORTANT: This endpoint is READ-ONLY. It only retrieves context from Milvus/PostgreSQL
    and queries the Karen model. It does NOT write to the database.
    
    Database commits only happen when the user explicitly saves a draft in the editor.
    """
    try:
        data = request.get_json()
        question = data.get('question', '')
        project_id = data.get('project_id')
        tag_paths = data.get('tag_paths', [])
        character_names = data.get('character_names', [])
        
        if not question:
            return jsonify({"error": "No question provided"}), 400
        
        # Import here to avoid circular dependencies
        from grace_api import get_user_id_from_header, query_llm, HAS_DATABASE_APIS, conversation_api
        from context_retriever import ContextRetriever
        from query_generator import QueryGenerator
        
        uid = get_user_id_from_header()
        if not uid:
            return jsonify({"error": "User ID required"}), 401
        
        # Build context for Keeper based on query type
        # The Keeper maintains memory assets of the project: tagged drafts, characters, plot, etc.
        # IMPORTANT: The Keeper AUTOMATICALLY retrieves context from Milvus (shared knowledge base)
        # Grace, on the other hand, PROMPTS the user for context - she doesn't auto-retrieve
        # Both use the same Milvus database for characters and tagged elements, but:
        # - The Keeper: Automatic retrieval via Milvus
        # - Grace: Prompts user for context (user provides info, which is stored in Milvus)
        keeper_context = ""
        
        # Always retrieve project context when project_id is provided
        # This allows The Keeper to use Milvus to access tagged project assets (drafts, characters, plot, etc.)
        if project_id or tag_paths or character_names:
            try:
                if HAS_DATABASE_APIS and conversation_api:
                    query_generator = QueryGenerator()
                    context_retriever = ContextRetriever(
                        conversation_api=conversation_api,
                        query_generator=query_generator
                    )
                    
                    # Retrieve context from tagged project assets via Milvus
                    # This includes drafts, characters, plot points, and other tagged content
                    retrieval_result = context_retriever.retrieve_conversation_context(
                        query=question,
                        user_id=uid,
                        project_id=project_id,
                        tag_paths=tag_paths,
                        character_names=character_names,
                        limit=10
                    )
                    
                    keeper_context = retrieval_result.get('formatted_context', '')
                    tag_paths_used = retrieval_result.get('tag_paths_used', [])
                    character_names_used = retrieval_result.get('character_names_used', [])
                    
                    if keeper_context:
                        print(f"📚 Keeper retrieved project context: {len(keeper_context)} chars")
                        if tag_paths_used:
                            print(f"   Tag paths used: {tag_paths_used}")
                        if character_names_used:
                            print(f"   Character names used: {character_names_used}")
            except Exception as retrieval_err:
                print(f"⚠️ Keeper context retrieval failed: {retrieval_err}")
        
        # Query Karen model with Keeper persona (Karen is used for Keeper chat)
        # IMPORTANT: Karen runs on port 8081 (different from Grace on port 8080)
        user_input = question
        if keeper_context:
            user_input = f"{keeper_context}\n\n---\n\nUser Question: {question}"
        
        print(f"🔵 Keeper query routing to Karen model on port 8081 (Grace uses port 8080)")
        print(f"   Question: {question[:100]}...")
        print(f"   Context length: {len(keeper_context)} chars")
        
        # Import query_karen instead of query_llm
        from grace_api import query_karen
        
        result = query_karen(
            system="",
            user_input=user_input,
            memory_context="",
            temperature=0.4  # Slightly lower temperature for more precise Keeper responses
        )
        
        print(f"✅ Keeper query completed (Karen model on port 8081)")
        
        return jsonify({
            "content": result,
            "tag_paths_used": tag_paths,
            "character_names_used": character_names
        })
    except Exception as e:
        print(f"❌ Keeper query error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@keeper_bp.route('/api/keeper/tags', methods=['GET'])
def get_tags():
    """Get available tags for a project - integrates with existing memory system"""
    try:
        from grace_api import get_user_id_from_header, HAS_DATABASE_APIS, conversation_api
        
        uid = get_user_id_from_header()
        project_id = request.args.get('project_id')
        
        if not uid:
            return jsonify({"error": "User ID required"}), 401
        
        if not HAS_DATABASE_APIS or not conversation_api:
            return jsonify({"tags": []})
        
        # Query tag definitions from database (hierarchical tag system)
        conn = conversation_api.get_db()
        cursor = conn.cursor()
        conversation_api.set_user_context(cursor, uid)
        
        try:
            # Get hierarchical tags from tag_definitions
            query = """
                SELECT DISTINCT td.tag_path, td.tag_level, td.tag_name
                FROM tag_definitions td
                LEFT JOIN conversation_tags ct ON td.id = ct.tag_id
                LEFT JOIN conversations c ON ct.conversation_id = c.id
                WHERE (c.user_id = %s OR td.user_id IS NULL OR td.user_id = %s)
            """
            params = [uid, uid]
            
            if project_id:
                query += " AND (c.metadata->>'project_id' = %s)"
                params.append(project_id)
            
            query += " ORDER BY td.tag_level, td.tag_path LIMIT 100"
            
            cursor.execute(query, params)
            hierarchical_tags = cursor.fetchall()
            
            # Also get tags from existing memory system (conversations.metadata->'tags')
            # This integrates with the MemoriesTab tag system
            memory_tags_query = """
                SELECT DISTINCT jsonb_array_elements_text(metadata->'tags') as tag
                FROM conversations
                WHERE user_id = %s
            """
            memory_tags_params = [uid]
            
            if project_id:
                memory_tags_query += " AND (metadata->>'project_id' = %s)"
                memory_tags_params.append(project_id)
            
            cursor.execute(memory_tags_query, memory_tags_params)
            memory_tags = cursor.fetchall()
            
            # Combine hierarchical tags and memory tags
            result = [dict(tag) for tag in hierarchical_tags]
            
            # Add memory tags as simple tags (level 0)
            for tag_row in memory_tags:
                tag_name = tag_row.get('tag')
                if tag_name and tag_name not in [t.get('tag_path') for t in result]:
                    result.append({
                        'tag_path': tag_name,
                        'tag_level': 0,
                        'tag_name': tag_name
                    })
            
            return jsonify({"tags": result})
        finally:
            cursor.close()
            conn.close()
    except Exception as e:
        print(f"❌ Get tags error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "tags": []}), 500


@keeper_bp.route('/api/keeper/conversations', methods=['GET'])
def get_tagged_conversations():
    """Get conversations by tags"""
    try:
        from grace_api import get_user_id_from_header, HAS_DATABASE_APIS, conversation_api
        
        uid = get_user_id_from_header()
        project_id = request.args.get('project_id')
        tag_paths = request.args.getlist('tag_paths')  # Multiple tag paths
        character_names = request.args.getlist('character_names')  # Multiple character names
        limit = int(request.args.get('limit', 10))
        
        if not uid:
            return jsonify({"error": "User ID required"}), 401
        
        if not HAS_DATABASE_APIS or not conversation_api:
            return jsonify({"conversations": []})
        
        conversations = conversation_api.get_conversations_by_tags(
            tag_paths=tag_paths,
            user_id=uid,
            project_id=project_id,
            character_names=character_names,
            limit=limit
        )
        
        return jsonify({"conversations": conversations})
    except Exception as e:
        print(f"❌ Get tagged conversations error: {e}")
        return jsonify({"error": str(e), "conversations": []}), 500

