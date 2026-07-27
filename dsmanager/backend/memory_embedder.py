"""
Memory Embedder - Embedding generation service with chunking support
Generates embeddings for conversations using sentence-transformers
"""

import os
from typing import List, Dict, Optional, Tuple
try:
    from sentence_transformers import SentenceTransformer
    HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    SentenceTransformer = None
    HAS_SENTENCE_TRANSFORMERS = False
from config import (
    EMBEDDING_MODEL,
    EMBEDDING_MODEL_VERSION,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    get_collection_name
)


class MemoryEmbedder:
    """Generates embeddings for conversations with chunking support"""
    
    def __init__(self, model_name: Optional[str] = None):
        """
        Initialize embedder with model (LAZY LOAD - model not loaded until first use)
        
        Args:
            model_name: Optional model name (defaults to config)
        """
        self.model_name = model_name or EMBEDDING_MODEL
        self.model_version = EMBEDDING_MODEL_VERSION
        self.model = None
        # MEMORY OPTIMIZATION: Don't load model at init - load lazily on first use
        # This prevents memory spike at startup
    
    def _load_model(self):
        """Lazy load the embedding model with memory safety checks"""
        if self.model is None:
            try:
                # Check if SentenceTransformer is available
                if SentenceTransformer is None:
                    print(f"⚠️ SentenceTransformer not available, embedding features disabled")
                    self.model = None
                    return
                
                # MEMORY SAFETY: Check system memory before loading
                try:
                    import psutil
                    import os as os_module
                    process = psutil.Process(os_module.getpid())
                    memory_mb = process.memory_info().rss / (1024 * 1024)
                    
                    # Skip loading if memory is already high (embedding model adds ~500MB-2GB)
                    if memory_mb > 4000:  # 4GB threshold
                        print(f"⚠️ Memory too high ({memory_mb:.0f}MB), skipping embedding model load")
                        print(f"   Embedding features will be disabled until memory usage decreases")
                        self.model = None
                        return
                except Exception:
                    # If psutil fails, continue anyway (better to try than fail silently)
                    pass
                
                print(f"📦 Loading embedding model: {self.model_name}")
                print(f"   This may take 30-60 seconds and use ~500MB-2GB memory")
                self.model = SentenceTransformer(self.model_name)
                print(f"✅ Model loaded successfully")
            except Exception as e:
                print(f"❌ Failed to load embedding model: {e}")
                import traceback
                traceback.print_exc()
                # Don't raise - set model to None to gracefully disable
                self.model = None
    
    def chunk_text(self, text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
        """
        Split text into chunks for embedding
        
        Args:
            text: Text to chunk
            chunk_size: Target chunk size in tokens (approximate)
            overlap: Overlap between chunks in tokens
        
        Returns:
            List of text chunks
        """
        if not text or len(text.strip()) == 0:
            return []
        
        # Simple token-based chunking (approximate)
        # 1 token ≈ 4 characters for English text
        char_chunk_size = chunk_size * 4
        char_overlap = overlap * 4
        
        chunks = []
        start = 0
        text_length = len(text)
        
        while start < text_length:
            end = min(start + char_chunk_size, text_length)
            
            # Try to break at sentence boundary
            if end < text_length:
                # Look for sentence endings
                for punct in ['. ', '.\n', '! ', '!\n', '? ', '?\n']:
                    last_punct = text.rfind(punct, start, end)
                    if last_punct > start:
                        end = last_punct + len(punct)
                        break
            
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            
            # Move start position with overlap
            start = end - char_overlap
            if start <= 0:
                start = end
        
        return chunks
    
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for a single text
        MEMORY OPTIMIZED: Limits text size and cleans up after processing
        
        Args:
            text: Text to embed
        
        Returns:
            Embedding vector (list of floats)
        """
        if not self.model:
            self._load_model()
        
        # MEMORY SAFETY: Limit text size to prevent memory spikes
        MAX_TEXT_SIZE = 50000  # 50k chars max
        if len(text) > MAX_TEXT_SIZE:
            print(f"⚠️ Text too large ({len(text)} chars), truncating for embedding")
            text = text[:MAX_TEXT_SIZE]
        
        try:
            import gc
            embedding = self.model.encode(text, normalize_embeddings=True)
            result = embedding.tolist()
            # Cleanup
            del embedding
            gc.collect()
            return result
        except Exception as e:
            print(f"❌ Failed to generate embedding: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def generate_embeddings_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """
        Generate embeddings for multiple texts (batch processing)
        MEMORY OPTIMIZED: Limits batch size and cleans up after processing
        
        Args:
            texts: List of texts to embed
            batch_size: Batch size for processing (max 32 for memory safety)
        
        Returns:
            List of embedding vectors
        """
        if not self.model:
            self._load_model()
        
        # MEMORY SAFETY: Limit batch size to prevent memory spikes
        MAX_BATCH_SIZE = 32
        batch_size = min(batch_size, MAX_BATCH_SIZE)
        
        # MEMORY SAFETY: Limit individual text size
        MAX_TEXT_SIZE = 50000  # 50k chars max per text
        texts = [text[:MAX_TEXT_SIZE] if len(text) > MAX_TEXT_SIZE else text for text in texts]
        
        try:
            import gc
            
            # Process in smaller chunks if needed
            if len(texts) > 100:
                # For very large batches, process in chunks
                all_embeddings = []
                chunk_size = 50
                for i in range(0, len(texts), chunk_size):
                    chunk = texts[i:i + chunk_size]
                    chunk_embeddings = self.model.encode(
                        chunk,
                        batch_size=batch_size,
                        normalize_embeddings=True,
                        show_progress_bar=False
                    )
                    all_embeddings.extend(chunk_embeddings.tolist())
                    # Cleanup after each chunk
                    del chunk_embeddings
                    gc.collect()
                return all_embeddings
            else:
                embeddings = self.model.encode(
                    texts,
                    batch_size=batch_size,
                    normalize_embeddings=True,
                    show_progress_bar=len(texts) > 10
                )
                result = embeddings.tolist()
                # Cleanup
                del embeddings
                gc.collect()
                return result
        except Exception as e:
            print(f"❌ Failed to generate batch embeddings: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    def embed_conversation(
        self,
        conversation_text: str,
        chunk: bool = True
    ) -> List[Tuple[List[float], Dict[str, any]]]:
        """
        Embed a conversation with optional chunking
        
        Args:
            conversation_text: Full conversation text
            chunk: Whether to chunk long conversations
        
        Returns:
            List of (embedding, metadata) tuples
        """
        if chunk and len(conversation_text) > CHUNK_SIZE * 4:  # Approximate token check
            # Chunk the conversation
            chunks = self.chunk_text(conversation_text)
            embeddings = self.generate_embeddings_batch(chunks)
            
            results = []
            for i, (embedding, chunk_text) in enumerate(zip(embeddings, chunks)):
                metadata = {
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "chunk_text": chunk_text[:200]  # Preview
                }
                results.append((embedding, metadata))
            return results
        else:
            # Single embedding for short conversations
            embedding = self.generate_embedding(conversation_text)
            return [(embedding, {"chunk_index": 0, "total_chunks": 1})]
    
    def get_model_info(self) -> Dict[str, str]:
        """Get model information"""
        return {
            "model_name": self.model_name,
            "model_version": self.model_version,
            "dimension": self.model.get_sentence_embedding_dimension() if self.model else None
        }


# Global embedder instance
_embedder: Optional[MemoryEmbedder] = None


def get_embedder() -> Optional[MemoryEmbedder]:
    """Get or create global embedder instance"""
    global _embedder
    if _embedder is None:
        try:
            _embedder = MemoryEmbedder()
            _embedder._load_model()
            # If model failed to load, return None
            if _embedder.model is None:
                _embedder = None
                return None
        except Exception as e:
            print(f"⚠️ Failed to initialize embedder: {e}")
            _embedder = None
            return None
    return _embedder

