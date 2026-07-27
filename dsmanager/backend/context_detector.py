"""
Context Detector - Entity Extraction and Context Detection
Automatically detects characters, topics, and work focus for contextual memory activation
"""

import re
from typing import Dict, List, Optional, Set
from datetime import datetime


class ContextDetector:
    """Detects context entities (character names, topics, work focus) from conversation content"""
    
    def __init__(self):
        # Common character name patterns
        self.character_patterns = [
            r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b',  # Capitalized words (potential names)
            r'"[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?"',    # Quoted names
            r"'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?'",     # Single-quoted names
        ]
        
        # Work focus keywords
        self.work_focus_keywords = {
            'character_development': ['character', 'protagonist', 'hero', 'villain', 'arc', 'development', 'personality', 'backstory'],
            'plot': ['plot', 'story', 'narrative', 'arc', 'conflict', 'resolution', 'climax'],
            'structure': ['structure', 'organization', 'outline', 'chapter', 'section', 'flow'],
            'dialogue': ['dialogue', 'conversation', 'speech', 'said', 'replied', 'asked'],
            'description': ['description', 'setting', 'scene', 'atmosphere', 'imagery', 'detail'],
            'pacing': ['pacing', 'rhythm', 'tempo', 'speed', 'slow', 'fast', 'quick'],
            'theme': ['theme', 'thematic', 'meaning', 'message', 'symbolism'],
            'voice': ['voice', 'style', 'tone', 'narrative', 'perspective', 'POV']
        }
        
        # Literary element keywords
        self.literary_elements = {
            'metaphor': ['metaphor', 'metaphorical', 'like', 'as'],
            'simile': ['simile', 'like', 'as'],
            'dialogue': ['dialogue', 'conversation', 'speech'],
            'pacing': ['pacing', 'rhythm', 'tempo'],
            'imagery': ['imagery', 'image', 'visual', 'picture'],
            'symbolism': ['symbol', 'symbolic', 'symbolism'],
            'foreshadowing': ['foreshadow', 'foreshadowing', 'hint', 'clue']
        }
    
    def detect_context_entities(
        self, 
        user_input: str, 
        conversation_history: Optional[List[Dict]] = None
    ) -> Dict[str, List[str]]:
        """
        Main detection function - extracts all context entities
        
        Enhanced to include emotional concepts and emotion analysis
        
        Returns:
            {
                'characters': ['Marcus', 'Sarah'],
                'work_focus': ['character_development', 'plot'],
                'literary_elements': ['dialogue', 'pacing'],
                'topics': ['war', 'mobility', 'amputation'],
                'emotional_concepts': ['vulnerability', 'internal_state'],  # NEW
                'emotions': {'joy': 0.3, 'sadness': 0.1, ...},  # NEW
                'dominant_emotion': 'joy',  # NEW
                'polarity': 0.45,  # NEW: -1 to +1
                'emotional_intensity': 0.7  # NEW: 0 to 1
            }
        """
        entities = {
            'characters': [],
            'work_focus': [],
            'literary_elements': [],
            'topics': []
        }
        
        # Combine user input with conversation history
        full_text = user_input
        if conversation_history:
            for msg in conversation_history[-5:]:  # Last 5 messages for context
                if isinstance(msg, dict):
                    content = msg.get('content', '') or msg.get('text', '')
                    if content:
                        full_text += ' ' + content
        
        # Extract character names
        entities['characters'] = self.extract_character_names(full_text)
        
        # Detect work focus
        entities['work_focus'] = self.detect_work_focus(full_text)
        
        # Detect literary elements
        entities['literary_elements'] = self.detect_literary_elements(full_text)
        
        # Extract topics (common nouns, important concepts)
        entities['topics'] = self.extract_topics(full_text)
        
        # Detect emotional concepts (NEW)
        try:
            emotion_result = self.detect_emotional_concepts(full_text)
            if emotion_result:
                entities.update(emotion_result)
        except Exception as e:
            print(f"⚠️ Emotion detection failed: {e}")
            # Continue without emotional data
        
        return entities
    
    def detect_emotional_concepts(self, content: str) -> Dict[str, any]:
        """
        Detect emotional concepts from content using EmotionDetector
        
        Args:
            content: Text content to analyze
        
        Returns:
            {
                'emotional_concepts': ['vulnerability', 'internal_state'],
                'emotions': {'joy': 0.3, 'sadness': 0.1, ...},
                'dominant_emotion': 'joy',
                'polarity': 0.45,
                'emotional_intensity': 0.7
            }
        """
        try:
            from senticnet_analysis.implementation.emotion_detector import EmotionDetector
            
            # Initialize detector (lazy loading)
            if not hasattr(self, '_emotion_detector'):
                self._emotion_detector = EmotionDetector()
            
            # Analyze text
            emotion_result = self._emotion_detector.analyze_text(content)
            
            # Map to emotional concepts
            emotional_concepts = self._emotion_detector.map_to_emotional_concepts(emotion_result)
            
            return {
                'emotional_concepts': emotional_concepts,
                'emotions': emotion_result.get('emotions', {}),
                'dominant_emotion': emotion_result.get('dominant_emotion', 'neutral'),
                'polarity': emotion_result.get('polarity', 0.0),
                'emotional_intensity': emotion_result.get('emotional_intensity', 0.0)
            }
        except ImportError:
            # EmotionDetector not available (transformers not installed)
            return {}
        except Exception as e:
            print(f"⚠️ Emotional concept detection failed: {e}")
            return {}
    
    def extract_character_names(self, content: str) -> List[str]:
        """Extract character names from content"""
        names = set()
        
        # Use regex patterns to find potential names
        for pattern in self.character_patterns:
            matches = re.findall(pattern, content)
            for match in matches:
                # Clean up quotes
                name = match.strip('"\'')
                # Filter out common words that aren't names
                if self._is_likely_name(name):
                    names.add(name)
        
        # Also look for patterns like "Marcus's" or "Marcus said"
        possessive_pattern = r'\b([A-Z][a-z]+)\'s\b'
        possessive_matches = re.findall(possessive_pattern, content)
        for name in possessive_matches:
            if self._is_likely_name(name):
                names.add(name)
        
        return sorted(list(names))
    
    def _is_likely_name(self, word: str) -> bool:
        """Filter out common words that aren't names"""
        # Common non-name capitalized words
        common_words = {
            'The', 'A', 'An', 'This', 'That', 'These', 'Those',
            'I', 'He', 'She', 'They', 'We', 'You',
            'It', 'What', 'When', 'Where', 'Why', 'How',
            'But', 'And', 'Or', 'So', 'Because', 'If', 'Then',
            'First', 'Second', 'Third', 'Last', 'Next', 'Previous',
            'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        }
        
        # Must be capitalized, not a common word, and 2+ characters
        if word in common_words or len(word) < 2:
            return False
        
        # Must start with capital letter
        if not word[0].isupper():
            return False
        
        return True
    
    def detect_work_focus(self, content: str) -> List[str]:
        """Detect current work focus from keywords"""
        content_lower = content.lower()
        detected_focus = []
        
        for focus_type, keywords in self.work_focus_keywords.items():
            # Count keyword matches
            matches = sum(1 for keyword in keywords if keyword in content_lower)
            if matches >= 2:  # Require at least 2 keyword matches
                detected_focus.append(focus_type)
        
        return detected_focus
    
    def detect_literary_elements(self, content: str) -> List[str]:
        """Detect literary devices and elements"""
        content_lower = content.lower()
        detected_elements = []
        
        for element, keywords in self.literary_elements.items():
            if any(keyword in content_lower for keyword in keywords):
                detected_elements.append(element)
        
        return detected_elements
    
    def extract_topics(self, content: str) -> List[str]:
        """Extract important topics/concepts (simplified - can be enhanced with NLP)"""
        # Simple approach: extract important nouns and concepts
        # This is a placeholder - could be enhanced with NER or LLM-based extraction
        
        # Look for quoted phrases (often important concepts)
        quoted = re.findall(r'"([^"]+)"', content)
        
        # Look for emphasized phrases (often in asterisks or underscores)
        emphasized = re.findall(r'\*([^*]+)\*', content)
        emphasized.extend(re.findall(r'_([^_]+)_', content))
        
        topics = []
        topics.extend([q.lower() for q in quoted if len(q) > 3])
        topics.extend([e.lower() for e in emphasized if len(e) > 3])
        
        # Remove duplicates and return
        return list(set(topics))[:10]  # Limit to 10 topics
    
    def build_context_query(
        self, 
        entities: Dict[str, List[str]], 
        user_id: str, 
        project_id: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Build retrieval query from detected entities
        
        Returns query structure for context retrieval:
        {
            'character_names': ['Marcus'],
            'tag_paths': ['Novel > Character Development > Marcus'],
            'work_focus': ['character_development'],
            'project_id': '...',
            'user_id': '...'
        }
        """
        query = {
            'character_names': entities.get('characters', []),
            'work_focus': entities.get('work_focus', []),
            'literary_elements': entities.get('literary_elements', []),
            'topics': entities.get('topics', []),
            'user_id': user_id,
            'project_id': project_id
        }
        
        # Build tag paths from entities
        tag_paths = []
        for character in entities.get('characters', []):
            for focus in entities.get('work_focus', []):
                # Format: "Novel > Character Development > Marcus"
                focus_display = focus.replace('_', ' ').title()
                tag_path = f"Novel > {focus_display} > {character}"
                tag_paths.append(tag_path)
        
        query['tag_paths'] = tag_paths
        
        return query

