"""
Query Generator - Natural language to Milvus/SQL query translation
Parses Grace's questions and builds semantic search queries with tag filtering
"""

import re
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from memory_embedder import get_embedder
from config import get_collection_name


class QueryGenerator:
    """Generates SQL queries from natural language questions and tag filters"""
    
    def __init__(self):
        # Grace's signature question patterns
        self.grace_question_patterns = [
            r'are we working on (.+?)\?',
            r'what are we (.+?)\?',
            r'this reminds me of (.+?)',
            r'have we discussed (.+?)\?',
            r'what did we say about (.+?)\?',
            r'can you recall (.+?)\?',
            r'remember when (.+?)\?'
        ]
        
        # Tag mapping from natural language to tag paths
        self.tag_mappings = {
            'character development': 'Character Development',
            'character': 'Character Development',
            'plot': 'Plot',
            'story': 'Plot',
            'structure': 'Structure',
            'dialogue': 'Dialogue',
            'conversation': 'Dialogue',
            'description': 'Description',
            'setting': 'Description',
            'pacing': 'Pacing',
            'rhythm': 'Pacing',
            'theme': 'Theme',
            'voice': 'Voice',
            'style': 'Voice'
        }
    
    def generate_category_boost_query(
        self,
        query_text: str,
        preferred_categories: Optional[List[str]] = None,
        boost_factor: float = 1.5
    ) -> Dict:
        """
        Generate search query with category boosting.
        Boosts results matching preferred categories.
        
        Args:
            query_text: Search query text
            preferred_categories: List of category names to boost
            boost_factor: Multiplier for preferred category results (default 1.5)
        
        Returns:
            Dict with query vector and filter expression
        """
        from memory_embedder import get_embedder
        
        embedder = get_embedder()
        if not embedder:
            return {'query_vector': None, 'filter_expr': None}
        
        query_vector = embedder.generate_embedding(query_text)
        
        # Build filter with category boost preference
        # Note: Milvus doesn't support native boosting, so we'll use post-processing
        filter_expr = None
        if preferred_categories:
            # Filter to include preferred categories with higher priority
            category_list = ', '.join([f'"{cat}"' for cat in preferred_categories])
            filter_expr = f'memory_category in [{category_list}]'
        
        return {
            'query_vector': query_vector,
            'filter_expr': filter_expr,
            'preferred_categories': preferred_categories,
            'boost_factor': boost_factor
        }
    
    def generate_query_from_context(
        self,
        user_question: str,
        conversation_context: Optional[str] = None,
        user_id: str = None,
        project_id: Optional[str] = None,
        detected_entities: Optional[Dict] = None
    ) -> Dict[str, any]:
        """
        Main function - generates query structure from context
        
        Returns:
            {
                'sql_params': {...},
                'tag_filters': [...],
                'character_filters': [...],
                'intent': 'character_development' | 'plot' | etc.
            }
        """
        # Parse Grace's question
        intent = self.parse_grace_question(user_question)
        
        # Build tag filters from intent and detected entities
        tag_filters = self.build_tag_filters(intent, detected_entities)
        
        # Build SQL query parameters
        sql_params = self.build_sql_from_tags(
            tag_filters=tag_filters,
            user_id=user_id,
            project_id=project_id,
            character_names=detected_entities.get('characters', []) if detected_entities else []
        )
        
        return {
            'sql_params': sql_params,
            'tag_filters': tag_filters,
            'character_filters': detected_entities.get('characters', []) if detected_entities else [],
            'intent': intent,
            'original_question': user_question
        }
    
    def parse_grace_question(self, question: str) -> Optional[str]:
        """Extract intent from Grace's questions"""
        question_lower = question.lower()
        
        # Check for specific patterns
        for pattern in self.grace_question_patterns:
            match = re.search(pattern, question_lower, re.IGNORECASE)
            if match:
                extracted = match.group(1).strip()
                # Map to tag type
                for key, tag in self.tag_mappings.items():
                    if key in extracted:
                        return tag.lower().replace(' ', '_')
        
        # Fallback: keyword matching
        for key, tag in self.tag_mappings.items():
            if key in question_lower:
                return tag.lower().replace(' ', '_')
        
        return None
    
    def build_tag_filters(
        self,
        intent: Optional[str],
        detected_entities: Optional[Dict] = None
    ) -> List[str]:
        """Build tag path filters from intent and entities"""
        tag_paths = []
        
        if not intent and not detected_entities:
            return []
        
        # Base genre (default to Novel if not specified)
        base_genre = 'Novel'
        
        # Build tag paths
        if intent:
            # Map intent to task tag
            intent_display = intent.replace('_', ' ').title()
            tag_path = f"{base_genre} > {intent_display}"
            tag_paths.append(tag_path)
        
        # Add character-specific paths if entities detected
        if detected_entities:
            characters = detected_entities.get('characters', [])
            work_focus = detected_entities.get('work_focus', [])
            
            for character in characters:
                for focus in work_focus:
                    focus_display = focus.replace('_', ' ').title()
                    tag_path = f"{base_genre} > {focus_display} > {character}"
                    tag_paths.append(tag_path)
        
        return tag_paths
    
    def build_sql_from_tags(
        self,
        tag_filters: List[str],
        user_id: str,
        project_id: Optional[str] = None,
        character_names: List[str] = None
    ) -> Dict[str, any]:
        """
        Generate SQL query parameters for tag-based conversation retrieval
        
        Returns parameters dict for use in SQL queries
        """
        params = {
            'user_id': user_id,
            'project_id': project_id,
            'tag_paths': tag_filters,
            'character_names': character_names or [],
            'limit': 10  # Default limit
        }
        
        return params
    
    def execute_tagged_conversation_query(
        self,
        sql_params: Dict[str, any],
        conversation_api
    ) -> List[Dict]:
        """
        Execute tag-based conversation query using conversation_api
        
        This is a convenience method that calls conversation_api.get_conversations_by_tags()
        """
        if not conversation_api:
            return []
        
        try:
            conversations = conversation_api.get_conversations_by_tags(
                tag_paths=sql_params.get('tag_paths', []),
                user_id=sql_params['user_id'],
                project_id=sql_params.get('project_id'),
                character_names=sql_params.get('character_names', []),
                limit=sql_params.get('limit', 10)
            )
            return conversations
        except Exception as e:
            print(f"⚠️ Tagged conversation query failed: {e}")
            return []
    
    def generate_milvus_query(
        self,
        user_question: str,
        user_id: str,
        project_id: Optional[str] = None,
        detected_entities: Optional[Dict] = None
    ) -> Dict[str, any]:
        """
        Generate Milvus semantic search query from natural language question
        
        Enhanced to parse character names from user queries and build tag_path filters
        
        Returns:
            {
                'query_embedding': [vector],
                'collection_name': 'grace_character_v1',
                'filter_expr': 'user_id == "123" and tag_path like "%Marcus%" and tag_path like "%Character Development%"',
                'context_type': 'character',
                'limit': 10
            }
        """
        # Parse intent to determine context type
        intent = self.parse_grace_question(user_question)
        context_type = "general"
        
        if intent:
            intent_lower = intent.lower()
            if "character" in intent_lower:
                context_type = "character"
            elif "plot" in intent_lower or "structure" in intent_lower:
                context_type = "plot"
        
        # Parse character names from user question if not in detected_entities
        if not detected_entities:
            detected_entities = {}
        
        # Extract character names from question using simple pattern matching
        # Look for capitalized words that might be character names
        import re
        question_words = re.findall(r'\b[A-Z][a-z]+\b', user_question)
        # Filter out common words
        common_words = {'The', 'This', 'That', 'What', 'When', 'Where', 'Why', 'How', 'I', 'You', 'We', 'They'}
        potential_characters = [w for w in question_words if w not in common_words and len(w) > 2]
        
        if potential_characters and not detected_entities.get('characters'):
            detected_entities['characters'] = potential_characters[:5]  # Limit to 5
        
        # Generate embedding for query
        embedder = get_embedder()
        query_embedding = embedder.generate_embedding(user_question)
        
        # Build tag filters
        tag_filters = self.build_tag_filters(intent, detected_entities)
        
        # Build filter expression
        filter_parts = [f'user_id == "{user_id}"']
        
        if project_id:
            filter_parts.append(f'project_id == "{project_id}"')
        
        # Enhanced tag_path filtering: build AND conditions for multiple tag components
        if tag_filters:
            # For each tag path, create a filter that matches all components
            tag_filter_exprs = []
            for tag_path in tag_filters:
                # Split tag path into components: "Novel > Character Development > Marcus"
                components = [c.strip() for c in tag_path.split('>')]
                component_filters = []
                for component in components:
                    escaped = component.replace('"', '\\"')
                    component_filters.append(f'tag_path like "%{escaped}%"')
                
                # All components must match (AND condition)
                if component_filters:
                    tag_filter_exprs.append(f"({' and '.join(component_filters)})")
            
            if tag_filter_exprs:
                # Any of the tag paths can match (OR condition)
                filter_parts.append(f"({' or '.join(tag_filter_exprs)})")
        
        # Extract character names from detected entities or parsed from question
        # Example: User says "Marcus" → filter: 'character_names like "%Marcus%"'
        characters = detected_entities.get('characters', [])
        if characters:
            char_filters = []
            for char_name in characters:
                escaped_name = char_name.replace('"', '\\"')
                char_filters.append(f'character_names like "%{escaped_name}%"')
            if char_filters:
                filter_parts.append(f"({' or '.join(char_filters)})")
        
        # Add emotional filtering if emotional concepts detected in query
        # Support queries like:
        # "Marcus discussions about vulnerability" → emotional_concepts contains "vulnerability"
        # "high-tension Marcus scenes" → emotional_intensity > 0.5
        # "emotional Marcus character development" → emotional_intensity > 0.3
        question_lower = user_question.lower()
        
        # Check for emotional intensity keywords
        if 'high-tension' in question_lower or 'high tension' in question_lower or 'intense' in question_lower:
            filter_parts.append('emotional_intensity > 0.5')
        elif 'emotional' in question_lower or 'emotion' in question_lower:
            filter_parts.append('emotional_intensity > 0.3')
        
        # Check for specific emotional concepts in query
        emotional_concept_keywords = {
            'vulnerability': 'vulnerability',
            'tension': 'tension',
            'conflict': 'conflict_tension',
            'depth': 'psychological_depth',
            'resonance': 'emotional_resonance'
        }
        
        for keyword, concept in emotional_concept_keywords.items():
            if keyword in question_lower:
                escaped_concept = concept.replace('"', '\\"')
                filter_parts.append(f'emotional_concepts like "%{escaped_concept}%"')
                break  # Only add one emotional concept filter
        
        # Check for dominant emotion in query
        emotion_keywords = {
            'sad': 'sadness',
            'happy': 'joy',
            'angry': 'anger',
            'fear': 'fear',
            'surprise': 'surprise',
            'disgust': 'disgust'
        }
        
        for keyword, emotion in emotion_keywords.items():
            if keyword in question_lower:
                filter_parts.append(f'dominant_emotion == "{emotion}"')
                break  # Only add one dominant emotion filter
        
        filter_expr = " and ".join(filter_parts) if filter_parts else None
        
        return {
            'query_embedding': query_embedding,
            'collection_name': get_collection_name(context_type),
            'filter_expr': filter_expr,
            'context_type': context_type,
            'limit': 10,
            'tag_filters': tag_filters
        }
    
    def is_memory_related_question(self, question: str) -> bool:
        """
        Detect if question is memory-related (triggers lazy loading)
        
        Uses pattern matching to detect Grace's behavioral questions
        """
        question_lower = question.lower()
        
        # Check for memory-related patterns
        memory_patterns = [
            r'are we working on',
            r'what are we',
            r'this reminds me of',
            r'have we discussed',
            r'what did we say about',
            r'can you recall',
            r'remember when',
            r'do you remember',
            r'what did we talk about',
            r'earlier we',
            r'previously we'
        ]
        
        for pattern in memory_patterns:
            if re.search(pattern, question_lower):
                return True
        
        return False
    
    def parse_emotional_query(self, question: str) -> Dict[str, any]:
        """
        Parse emotional patterns from natural language queries
        
        Supports queries like:
        - "Marcus discussions about vulnerability"
        - "high-tension Marcus scenes"
        - "emotional Marcus character development"
        - "sad Marcus moments"
        - "positive character development"
        
        Returns:
            {
                'emotional_concepts': ['vulnerability'],
                'emotional_intensity_threshold': 0.5,
                'dominant_emotion': 'sadness',
                'polarity_filter': 'negative'  # 'positive', 'negative', or None
            }
        """
        question_lower = question.lower()
        result = {
            'emotional_concepts': [],
            'emotional_intensity_threshold': None,
            'dominant_emotion': None,
            'polarity_filter': None
        }
        
        # Parse emotional concepts
        emotional_concept_keywords = {
            'vulnerability': 'vulnerability',
            'vulnerable': 'vulnerability',
            'tension': 'tension',
            'tense': 'tension',
            'conflict': 'conflict_tension',
            'depth': 'psychological_depth',
            'resonance': 'emotional_resonance',
            'momentum': 'positive_momentum',
            'uncertainty': 'uncertainty',
            'revelation': 'revelation',
            'twist': 'narrative_twist'
        }
        
        for keyword, concept in emotional_concept_keywords.items():
            if keyword in question_lower:
                result['emotional_concepts'].append(concept)
        
        # Parse intensity keywords
        if 'high-tension' in question_lower or 'high tension' in question_lower or 'intense' in question_lower:
            result['emotional_intensity_threshold'] = 0.5
        elif 'emotional' in question_lower or 'emotion' in question_lower:
            result['emotional_intensity_threshold'] = 0.3
        elif 'low' in question_lower and 'emotion' in question_lower:
            result['emotional_intensity_threshold'] = 0.2
        
        # Parse emotion keywords
        emotion_keywords = {
            'sad': 'sadness',
            'sadness': 'sadness',
            'happy': 'joy',
            'joy': 'joy',
            'joyful': 'joy',
            'angry': 'anger',
            'anger': 'anger',
            'fear': 'fear',
            'afraid': 'fear',
            'surprise': 'surprise',
            'surprised': 'surprise',
            'disgust': 'disgust',
            'disgusted': 'disgust'
        }
        
        for keyword, emotion in emotion_keywords.items():
            if keyword in question_lower:
                result['dominant_emotion'] = emotion
                break
        
        # Parse polarity
        if any(word in question_lower for word in ['positive', 'happy', 'joy', 'uplifting', 'hopeful']):
            result['polarity_filter'] = 'positive'
        elif any(word in question_lower for word in ['negative', 'sad', 'angry', 'fear', 'dark', 'gloomy']):
            result['polarity_filter'] = 'negative'
        
        return result
    
    def build_emotional_filters(self, emotional_query: Dict[str, any]) -> List[str]:
        """
        Build Milvus filter expressions from emotional query parsing
        
        Args:
            emotional_query: Result from parse_emotional_query()
        
        Returns:
            List of filter expression strings
        """
        filters = []
        
        # Emotional concept filters
        if emotional_query.get('emotional_concepts'):
            concept_filters = []
            for concept in emotional_query['emotional_concepts']:
                escaped = concept.replace('"', '\\"')
                concept_filters.append(f'emotional_concepts like "%{escaped}%"')
            if concept_filters:
                filters.append(f"({' or '.join(concept_filters)})")
        
        # Intensity threshold filter
        if emotional_query.get('emotional_intensity_threshold') is not None:
            threshold = emotional_query['emotional_intensity_threshold']
            filters.append(f'emotional_intensity > {threshold}')
        
        # Dominant emotion filter
        if emotional_query.get('dominant_emotion'):
            emotion = emotional_query['dominant_emotion']
            filters.append(f'dominant_emotion == "{emotion}"')
        
        # Polarity filter
        if emotional_query.get('polarity_filter'):
            polarity = emotional_query['polarity_filter']
            if polarity == 'positive':
                filters.append('polarity > 0')
            elif polarity == 'negative':
                filters.append('polarity < 0')
        
        return filters
    
    def generate_milvus_query_with_emotional_patterns(
        self,
        user_question: str,
        user_id: str,
        project_id: Optional[str] = None,
        detected_entities: Optional[Dict] = None
    ) -> Dict[str, any]:
        """
        Generate Milvus query with enhanced emotional pattern parsing
        
        This is an enhanced version that uses parse_emotional_query() for better
        natural language understanding of emotional queries.
        
        Returns:
            Same structure as generate_milvus_query() but with enhanced emotional filtering
        """
        # Parse emotional patterns from query
        emotional_query = self.parse_emotional_query(user_question)
        
        # Generate base query
        base_query = self.generate_milvus_query(
            user_question=user_question,
            user_id=user_id,
            project_id=project_id,
            detected_entities=detected_entities
        )
        
        # Enhance filter expression with emotional pattern filters
        if base_query.get('filter_expr'):
            emotional_filters = self.build_emotional_filters(emotional_query)
            if emotional_filters:
                # Add emotional filters to existing filter expression
                base_query['filter_expr'] = f"{base_query['filter_expr']} and {' and '.join(emotional_filters)}"
        else:
            # Build new filter expression with emotional filters
            filter_parts = [f'user_id == "{user_id}"']
            if project_id:
                filter_parts.append(f'project_id == "{project_id}"')
            
            emotional_filters = self.build_emotional_filters(emotional_query)
            filter_parts.extend(emotional_filters)
            
            base_query['filter_expr'] = " and ".join(filter_parts) if filter_parts else None
        
        # Add emotional query info to result
        base_query['emotional_query'] = emotional_query
        
        return base_query

