"""
Tag Extractor - LLM-based tag extraction from conversation content
Extracts hierarchical tags (genre, task, specificity, literary device) from conversations
"""

import json
import re
from typing import Dict, List, Optional
from datetime import datetime


class TagExtractor:
    """Extracts hierarchical tags from conversation content using LLM"""
    
    def __init__(self, query_llm_func):
        """
        Initialize tag extractor
        
        Args:
            query_llm_func: Function to call LLM (e.g., query_llm from grace_api)
        """
        self.query_llm = query_llm_func
    
    def extract_tags_from_conversation(
        self, 
        conversation_id: str, 
        user_id: str,
        conversation_content: str,
        conversation_api=None,
        emotional_context: Optional[Dict] = None
    ) -> Dict[str, any]:
        """
        Main extraction function - extracts all tag types from conversation
        
        Args:
            conversation_id: Conversation ID
            user_id: User ID
            conversation_content: Full conversation text (all messages combined)
            conversation_api: Optional ConversationAPI instance for storing tags
            emotional_context: Optional emotional context dict from EmotionDetector:
                {
                    'emotional_concepts': ['vulnerability', 'internal_state'],
                    'dominant_emotion': 'sadness',
                    'emotional_intensity': 0.7,
                    'emotions': {...}
                }
        
        Returns:
            {
                'genre_tags': ['Novel'],
                'task_tags': ['Character Development', 'Plot'],
                'specificity_tags': ['Marcus', 'Sarah'],
                'literary_device_tags': ['Dialogue', 'Pacing'],
                'confidence': 0.85
            }
        """
        if not conversation_content or len(conversation_content.strip()) < 50:
            # Not enough content to extract tags
            return {
                'genre_tags': [],
                'task_tags': [],
                'specificity_tags': [],
                'literary_device_tags': [],
                'confidence': 0.0
            }
        
        # Extract each tag type
        genre_tags = self.extract_genre_tags(conversation_content)
        task_tags = self.extract_task_tags(conversation_content)
        specificity_tags = self.extract_specificity_tags(conversation_content)
        literary_device_tags = self.extract_literary_device_tags(conversation_content, emotional_context=emotional_context)
        
        # Calculate overall confidence (average of individual extractions)
        confidence = 0.75  # Default confidence for LLM extraction
        
        result = {
            'genre_tags': genre_tags,
            'task_tags': task_tags,
            'specificity_tags': specificity_tags,
            'literary_device_tags': literary_device_tags,
            'confidence': confidence
        }
        
        # Store tags in database if conversation_api provided
        if conversation_api:
            try:
                self._store_tags_in_database(
                    conversation_id, 
                    user_id, 
                    result, 
                    conversation_api
                )
            except Exception as e:
                print(f"⚠️ Failed to store tags in database: {e}")
        
        return result
    
    def extract_genre_tags(self, content: str) -> List[str]:
        """Detect genre (novel, poetry, journalism, etc.)"""
        prompt = f"""Analyze the following writing conversation and identify the genre(s) being discussed.

Genre Definitions:
- Novel: Extended fictional prose narrative, typically 40,000+ words, with complex plot and character development
- Poetry: Literary work using verse, rhythm, and often rhyme to express ideas or emotions
- Journalism: Non-fiction writing for news media, reporting facts and current events
- Short Story: Brief fictional prose narrative, typically under 20,000 words, focused on a single incident or character
- Essay: Short non-fiction piece presenting the author's perspective or argument on a topic
- Screenplay: Script for film or television, written in specific format with scene descriptions and dialogue

Content:
{content[:2000]}

Respond with ONLY a JSON array of genre names. Valid genres: Novel, Poetry, Journalism, Short Story, Essay, Screenplay.
If multiple genres apply, include all relevant ones.
If uncertain, return an empty array.

Example response: ["Novel"]
Your response:"""
        
        try:
            response = self.query_llm(
                system="",
                user_input=prompt,
                memory_context="",
                temperature=0.3  # Lower temperature for more consistent extraction
            )
            
            # Parse JSON response
            genres = self._parse_json_array(response)
            
            # Validate genres
            valid_genres = ['Novel', 'Poetry', 'Journalism', 'Short Story', 'Essay', 'Screenplay']
            return [g for g in genres if g in valid_genres]
        except Exception as e:
            print(f"⚠️ Genre tag extraction failed: {e}")
            return []
    
    def extract_task_tags(self, content: str) -> List[str]:
        """Detect task type (character development, plot, structure, etc.)"""
        prompt = f"""Analyze the following writing conversation and identify the writing task(s) being discussed.

Task Category Definitions:
- Character Development: Creating, developing, or refining characters, their personalities, arcs, or relationships
- Plot: Story structure, narrative events, conflict, resolution, or story progression
- Structure: Organization, outline, chapter arrangement, or overall work architecture
- Dialogue: Character conversations, speech patterns, or verbal exchanges
- Description: Setting, scene details, imagery, or sensory details
- Pacing: Narrative rhythm, tempo, speed of story progression, or timing
- Theme: Central ideas, messages, or underlying meanings in the work
- Voice: Narrative style, tone, perspective, point of view, or authorial voice

Content:
{content[:2000]}

Respond with ONLY a JSON array of task names. Valid tasks: Character Development, Plot, Structure, Dialogue, Description, Pacing, Theme, Voice.
If multiple tasks apply, include all relevant ones.

Example response: ["Character Development", "Plot"]
Your response:"""
        
        try:
            response = self.query_llm(
                system="",
                user_input=prompt,
                memory_context="",
                temperature=0.3
            )
            
            tasks = self._parse_json_array(response)
            
            # Validate tasks
            valid_tasks = [
                'Character Development', 'Plot', 'Structure', 'Dialogue',
                'Description', 'Pacing', 'Theme', 'Voice'
            ]
            return [t for t in tasks if t in valid_tasks]
        except Exception as e:
            print(f"⚠️ Task tag extraction failed: {e}")
            return []
    
    def extract_specificity_tags(self, content: str) -> List[str]:
        """Extract character names and specific elements"""
        prompt = f"""Analyze the following writing conversation and extract specific character names and important story elements.

Content:
{content[:2000]}

Respond with ONLY a JSON array of specific names/elements. Include:
- Character names (e.g., "Marcus", "Sarah")
- Important story elements (e.g., "The War", "The Amputation")
- Key locations or objects if mentioned

Example response: ["Marcus", "Sarah", "The War"]
Your response:"""
        
        try:
            response = self.query_llm(
                system="",
                user_input=prompt,
                memory_context="",
                temperature=0.3
            )
            
            specifics = self._parse_json_array(response)
            
            # Filter out common words and validate
            filtered = []
            for item in specifics:
                if isinstance(item, str) and len(item) > 2:
                    # Remove common articles/prepositions
                    if item.lower() not in ['the', 'a', 'an', 'and', 'or', 'but']:
                        filtered.append(item)
            
            return filtered[:10]  # Limit to 10 specific elements
        except Exception as e:
            print(f"⚠️ Specificity tag extraction failed: {e}")
            return []
    
    def extract_literary_device_tags(self, content: str, emotional_context: Optional[Dict] = None) -> List[str]:
        """
        Detect literary devices (metaphor, dialogue, pacing, etc.)
        
        Args:
            content: Text content to analyze
            emotional_context: Optional dict with emotional context:
                {
                    'emotional_concepts': ['vulnerability', 'internal_state'],
                    'dominant_emotion': 'sadness',
                    'emotional_intensity': 0.7
                }
                This provides additional context hints but doesn't prescribe device identification.
        """
        # Build emotional context string if available
        emotional_hint = ""
        if emotional_context:
            hints = []
            if emotional_context.get('emotional_concepts'):
                hints.append(f"Emotional concepts detected: {', '.join(emotional_context['emotional_concepts'])}")
            if emotional_context.get('dominant_emotion') and emotional_context.get('dominant_emotion') != 'neutral':
                hints.append(f"Dominant emotion: {emotional_context['dominant_emotion']}")
            if emotional_context.get('emotional_intensity', 0) > 0.5:
                hints.append(f"High emotional intensity ({emotional_context['emotional_intensity']:.2f})")
            
            if hints:
                emotional_hint = f"\n\nEmotional context (use as hints for device identification, not prescriptive rules):\n" + "\n".join(f"- {h}" for h in hints) + "\n"
        
        prompt = f"""Analyze the following writing conversation and identify literary devices being discussed.

Literary Device Definitions:
- Metaphor: Direct comparison without "like" or "as" (e.g., "time is a thief")
- Simile: Comparison using "like" or "as" (e.g., "brave as a lion")
- Dialogue: Conversation between characters, spoken exchanges
- Pacing: The speed and rhythm of narrative progression, how quickly events unfold
- Imagery: Vivid descriptive language that appeals to the senses (sight, sound, touch, taste, smell)
- Symbolism: Use of symbols, objects, or elements to represent abstract ideas or concepts
- Foreshadowing: Hints, clues, or suggestions about future events in the narrative

Content:
{content[:2000]}{emotional_hint}

Respond with ONLY a JSON array of device names. Valid devices: Metaphor, Simile, Dialogue, Pacing, Imagery, Symbolism, Foreshadowing.
If multiple devices apply, include all relevant ones.

Use the emotional context as additional information to help identify devices, but make your own literary analysis based on the content itself.

Example response: ["Dialogue", "Pacing"]
Your response:"""
        
        try:
            response = self.query_llm(
                system="",
                user_input=prompt,
                memory_context="",
                temperature=0.3
            )
            
            devices = self._parse_json_array(response)
            
            # Validate devices
            valid_devices = [
                'Metaphor', 'Simile', 'Dialogue', 'Pacing',
                'Imagery', 'Symbolism', 'Foreshadowing'
            ]
            return [d for d in devices if d in valid_devices]
        except Exception as e:
            print(f"⚠️ Literary device tag extraction failed: {e}")
            return []
    
    def extract_historical_context_tags(self, content: str) -> Dict[str, List[str]]:
        """
        Extract historical context tags: periods, movements, events
        Returns dict with 'periods', 'movements', 'events' lists
        
        Examples:
        - Periods: "Victorian Era", "Renaissance", "Post-WWII"
        - Movements: "Romanticism", "Modernism", "Post-Apocalyptic Fiction"
        - Events: "Carrington Event", "CME", "Civil War", "Industrial Revolution"
        """
        prompt = f"""Analyze the following writing content and identify historical context: periods, movements, and events.

Content:
{content[:3000]}

Extract:
1. Historical periods (e.g., "Victorian Era", "Renaissance", "Post-WWII", "Medieval")
2. Cultural/literary movements (e.g., "Romanticism", "Modernism", "Post-Apocalyptic Fiction", "Dystopian")
3. Historical events (e.g., "Carrington Event", "CME", "Civil War", "Industrial Revolution", "World War II")

Respond with ONLY a JSON object with three arrays:
{{
  "periods": ["Victorian Era"],
  "movements": ["Post-Apocalyptic Fiction"],
  "events": ["Carrington Event", "CME"]
}}

If no historical context is found, return empty arrays.
Your response:"""
        
        try:
            response = self.query_llm(
                system="",
                user_input=prompt,
                memory_context="",
                temperature=0.3
            )
            
            # Parse JSON object response
            historical_context = self._parse_json_object(response)
            
            return {
                'periods': historical_context.get('periods', []),
                'movements': historical_context.get('movements', []),
                'events': historical_context.get('events', [])
            }
        except Exception as e:
            print(f"⚠️ Historical context tag extraction failed: {e}")
            return {
                'periods': [],
                'movements': [],
                'events': []
            }
    
    def _parse_json_object(self, text: str) -> Dict[str, any]:
        """Parse JSON object from LLM response, with fallback parsing"""
        text = text.strip()
        
        # Remove markdown code blocks if present
        text = re.sub(r'```json\s*', '', text)
        text = re.sub(r'```\s*', '', text)
        
        # Try to find JSON object
        json_match = re.search(r'\{.*?\}', text, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group())
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
        
        # Fallback: try to parse entire response as JSON
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
        
        # Last resort: return empty dict
        return {}
    
    def _parse_json_array(self, text: str) -> List[str]:
        """Parse JSON array from LLM response, with fallback parsing"""
        # Try to extract JSON array from response
        text = text.strip()
        
        # Remove markdown code blocks if present
        text = re.sub(r'```json\s*', '', text)
        text = re.sub(r'```\s*', '', text)
        
        # Try to find JSON array
        json_match = re.search(r'\[.*?\]', text, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group())
                if isinstance(parsed, list):
                    return [str(item) for item in parsed if item]
            except json.JSONDecodeError:
                pass
        
        # Fallback: try to parse entire response as JSON
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(item) for item in parsed if item]
        except json.JSONDecodeError:
            pass
        
        # Last resort: extract quoted strings
        quoted = re.findall(r'"([^"]+)"', text)
        if quoted:
            return quoted
        
        return []
    
    def _store_tags_in_database(
        self,
        conversation_id: str,
        user_id: str,
        tags: Dict[str, any],
        conversation_api
    ):
        """Store extracted tags in database"""
        conn = conversation_api.get_db()
        cursor = conn.cursor()
        conversation_api.set_user_context(cursor, user_id)
        
        try:
            # Get or create tag definitions and link to conversation
            # This is a simplified version - full implementation would:
            # 1. Find or create tag_definitions entries
            # 2. Create conversation_tags links
            # 3. Update conversations.metadata with tags array
            
            # For now, update conversations.metadata with tags
            tags_array = []
            tags_array.extend(tags.get('genre_tags', []))
            tags_array.extend(tags.get('task_tags', []))
            tags_array.extend(tags.get('specificity_tags', []))
            tags_array.extend(tags.get('literary_device_tags', []))
            
            # Update metadata
            cursor.execute("""
                UPDATE conversations
                SET metadata = COALESCE(metadata, '{}'::jsonb) || 
                    jsonb_build_object('tags', %s::jsonb, 'tagged_at', %s)
                WHERE id = %s AND user_id = %s
            """, (json.dumps(tags_array), datetime.now().isoformat(), conversation_id, user_id))
            
            conn.commit()
            print(f"✅ Stored {len(tags_array)} tags for conversation {conversation_id}")
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()
            conn.close()

