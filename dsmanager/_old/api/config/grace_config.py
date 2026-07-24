"""
Grace AI Configuration
Centralized configuration for all Grace settings, model backends, and editorial framework
"""

import os
from enum import Enum
from dotenv import load_dotenv

load_dotenv()

# ===== NEURAL NETWORK BACKEND CONFIGURATION =====

class NeuralBackend(Enum):
    """Available neural network backends"""
    LM_STUDIO = "lm_studio"      # LM Studio GUI (OpenAI-compatible API)
    LLAMA_CPP = "llama_cpp"      # llama.cpp server (OpenAI-compatible API)
    MLX_RSTAR = "mlx_rstar"      # rStar2-Agent-14B via MLX (Apple Silicon optimized)
    MLX_QWEN = "mlx_qwen"        # Qwen 2.5 14B via MLX
    MLX_CUSTOM = "mlx_custom"    # Custom MLX model
    OPENAI = "openai"            # OpenAI API (for testing/comparison)


class ModelConfig:
    """Neural network model configurations"""

    # Active backend - change this to switch between models
    ACTIVE_BACKEND = NeuralBackend.LLAMA_CPP

    # Backend-specific configurations
    BACKENDS = {
        NeuralBackend.LM_STUDIO: {
            "api_url": os.getenv("LM_API_URL", "http://127.0.0.1:1234/v1/chat/completions"),
            "api_type": "openai_compatible",
            "model_name": None,  # LM Studio auto-uses loaded model
            "context_window": 65536,  # 64K context
            "supports_streaming": True,
            "description": "LM Studio - GUI-based model management"
        },
        NeuralBackend.LLAMA_CPP: {
            "api_url": os.getenv("LLAMA_CPP_URL", "http://127.0.0.1:8080/v1/chat/completions"),
            "api_type": "openai_compatible",
                   "model_name": os.getenv("LLAMA_CPP_MODEL", "models/Llama3.1-8B-Instruct/Llama3.1-8B-Instruct-Q6_K-WORKING.gguf"),
            "context_window": 32768,  # 32K context for editorial work (Llama 3.1 8B supports up to 128K)
            "supports_streaming": True,
            "description": "llama.cpp - Local inference server with Metal GPU acceleration (Q6_K quantized)"
        },
        NeuralBackend.MLX_RSTAR: {
            "api_url": "mlx://m-i/rStar2-Agent-14B-mlx-8Bit",
            "api_type": "mlx",
            "model_name": "m-i/rStar2-Agent-14B-mlx-8Bit",
            "context_window": 32768,  # 32K context (typical for 14B models)
            "supports_streaming": False,
            "description": "rStar2-Agent-14B - Agent model optimized for instruction following",
            "mlx_config": {
                "quantization": "8bit",
                "gpu_memory_fraction": 0.8,  # Use 80% of GPU memory
            }
        },
        NeuralBackend.MLX_QWEN: {
            "api_url": "http://127.0.0.1:8080/v1/chat/completions",
            "api_type": "openai_compatible",
            "model_name": "qwen2.5-14b-instruct",
            "context_window": 32768,
            "supports_streaming": True,
            "description": "Qwen 2.5 14B - Backup model via MLX server"
        },
        NeuralBackend.MLX_CUSTOM: {
            "api_url": os.getenv("MLX_CUSTOM_URL", "http://127.0.0.1:9000/v1/chat/completions"),
            "api_type": "mlx",
            "model_name": os.getenv("MLX_CUSTOM_MODEL", ""),
            "context_window": 32768,
            "supports_streaming": False,
            "description": "Custom MLX model"
        },
        NeuralBackend.OPENAI: {
            "api_url": "https://api.openai.com/v1/chat/completions",
            "api_type": "openai",
            "model_name": "gpt-4",
            "context_window": 8192,
            "supports_streaming": True,
            "api_key": os.getenv("OPENAI_API_KEY", ""),
            "description": "OpenAI API - for testing/comparison only"
        }
    }

    @classmethod
    def get_active_config(cls):
        """Get configuration for currently active backend"""
        return cls.BACKENDS[cls.ACTIVE_BACKEND]

    @classmethod
    def get_api_url(cls):
        """Get API URL for active backend"""
        return cls.get_active_config()["api_url"]

    @classmethod
    def get_context_window(cls):
        """Get context window size for active backend"""
        return cls.get_active_config()["context_window"]


# ===== LLM GENERATION PARAMETERS =====

class GenerationConfig:
    """LLM generation parameters - tuned for editorial precision"""

    # Temperature: Lower = less hedging, more directness
    # Editorial work needs precision over creativity
    TEMPERATURE = 0.55

    # Max tokens for output
    MAX_TOKENS = 50000

    # Alternative temperature settings for different use cases
    TEMPERATURES = {
        "precise": 0.3,      # Maximum precision, minimal creativity
        "editorial": 0.55,   # Balanced for editorial work (default)
        "creative": 0.8,     # More creative, less constrained
        "exploratory": 1.0   # Maximum creativity
    }

    # Top-p (nucleus sampling) - None means model default
    TOP_P = None

    # Frequency/presence penalty - None means model default
    FREQUENCY_PENALTY = None
    PRESENCE_PENALTY = None

    # Stop sequences
    STOP_SEQUENCES = None


# ===== REASONING & COGNITION =====
# Removed - cognitive parameters now handled by fine-tuned model


# ===== MEMORY SYSTEM =====

class MemoryConfig:
    """Memory system settings (Memory + Will = Consciousness)"""

    # Enable memory system
    MEMORY_ENABLED = True

    # Number of memory entries to retrieve per query
    MEMORY_TOP_K = 3

    # Auto-generate Q&A pairs for memory enrichment
    MEMORY_AUTO_QNA = True

    # Database connection
    DATABASE_URL = os.getenv("DATABASE_URL")

    # Memory file paths (legacy FAISS system)
    MEMORY_INDEX_PATH = "logs/memory_index.faiss"
    MEMORY_METADATA_PATH = "logs/memory_metadata.pkl"


# ===== TEXT PROCESSING LIMITS =====

class ProcessingLimits:
    """Text processing and content limits"""

    # PDF processing
    PDF_MAX_CHARS = 50000  # ~10-13 pages at ~4000 chars/page

    # Auto-QnA generation
    AUTO_QNA_MAX_CHARS = 2000

    # News search results
    NEWS_SEARCH_RESULTS = 5


# ===== EDITORIAL FRAMEWORK =====

class EditorialConfig:
    """Editorial framework configuration (persona and cognitive parameters removed - handled by fine-tuned model)"""
    pass


# ===== LOGGING & TRACING =====

class LoggingConfig:
    """Logging and tracing settings"""

    # Enable logging
    LOG_REASONING = True
    LOG_TRACE = True
    LOG_NEWS_QUERIES = True
    LOG_PDF_SUMMARIES = True

    # Log file paths
    REASONING_LOG_PATH = "logs/reasoning_log.txt"
    REASONING_TRACE_PATH = "logs/reasoning_trace.json"
    AUTO_QNA_LOG_PATH = "logs/auto_qna_log.txt"
    SECURITY_LOG_PATH = "logs/security_log.txt"


# ===== SECURITY & AUTHENTICATION =====

class SecurityConfig:
    """Security and authentication settings"""

    # API Keys
    VALID_API_KEYS = set(os.getenv("GRACE_API_KEYS", "").split(",")) if os.getenv("GRACE_API_KEYS") else set()

    # HTTP Basic Auth
    HTTP_BASIC_AUTH_USERNAME = os.getenv("HTTP_BASIC_AUTH_USERNAME")
    HTTP_BASIC_AUTH_PASSWORD = os.getenv("HTTP_BASIC_AUTH_PASSWORD")

    # Rate limiting (requests per minute per API key)
    RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "60"))
    RATE_LIMIT_WINDOW = 60  # seconds

    # CORS allowed origins
    CORS_ORIGINS = [
        "https://grace-editor-production.up.railway.app",  # Production
        "http://localhost:5173",  # Local frontend dev
        "http://localhost:5001"   # Local backend dev
    ]


# ===== MEDIA CLASSIFICATION =====

class MediaBuckets:
    """Media literacy classification buckets"""

    BUCKETS = {
        "good": {
            "description": "Reputable editorial sources with known citations, authorship, and journalistic integrity.",
            "examples": ["Reuters", "AP", "BBC", "Scientific American"],
            "include_in_memory": True,
            "flag_for_review": False
        },
        "suspect": {
            "description": "Sources lacking clear bylines, emerging outlets, or partially credible info.",
            "examples": ["ZeroHedge", "Medium posts", "unverified startups"],
            "include_in_memory": True,
            "flag_for_review": True
        },
        "propaganda_training": {
            "description": "Known misinformation or biased narratives retained for contrast.",
            "examples": ["state-sponsored outlets", "disinfo samples"],
            "include_in_memory": True,
            "manual_override_required": True
        },
        "social_excluded": {
            "description": "Exclude Reddit, blogs, personal websites.",
            "examples": ["Reddit", "Tumblr", "Personal blogs"],
            "include_in_memory": False,
            "flag_for_review": False
        },
        "garbage_skipped": {
            "description": "Clickbait, spam, scraper sites, low-effort content.",
            "examples": ["The Onion", "ads", "SEO spam"],
            "include_in_memory": False,
            "log_and_purge_after_days": 30
        }
    }


# ===== ENVIRONMENT-SPECIFIC CONFIGURATIONS =====

class Environment(Enum):
    """Deployment environments"""
    DEVELOPMENT = "development"
    PRODUCTION = "production"
    TESTING = "testing"


class EnvironmentConfig:
    """Environment-specific settings"""

    # Auto-detect environment
    CURRENT_ENV = Environment(os.getenv("ENVIRONMENT", "development"))

    CONFIGS = {
        Environment.DEVELOPMENT: {
            "debug": True,
            "require_auth": False,  # Optional auth in dev
            "enable_cors": True,
            "log_level": "DEBUG",
            "active_backend": NeuralBackend.LM_STUDIO,  # Default to LM Studio in dev
        },
        Environment.PRODUCTION: {
            "debug": False,
            "require_auth": True,  # Always require auth in production
            "enable_cors": True,
            "log_level": "INFO",
            "active_backend": NeuralBackend.LM_STUDIO,  # LM Studio in production
        },
        Environment.TESTING: {
            "debug": True,
            "require_auth": False,
            "enable_cors": False,
            "log_level": "DEBUG",
            "active_backend": NeuralBackend.MLX_RSTAR,  # Test with MLX
        }
    }

    @classmethod
    def get_config(cls):
        """Get configuration for current environment"""
        return cls.CONFIGS[cls.CURRENT_ENV]


# ===== GRACE UNIFIED CONFIG =====

class GraceConfig:
    """
    Unified Grace configuration
    Single point of access for all Grace settings
    """

    # Model & Generation
    model = ModelConfig
    generation = GenerationConfig

    # Memory & Processing
    memory = MemoryConfig
    processing = ProcessingLimits

    # Editorial Framework
    editorial = EditorialConfig

    # System
    logging = LoggingConfig
    security = SecurityConfig
    media = MediaBuckets
    environment = EnvironmentConfig

    @classmethod
    def get_llm_config(cls):
        """Get complete LLM configuration for query_llm function"""
        return {
            "api_url": cls.model.get_api_url(),
            "temperature": cls.generation.TEMPERATURE,
            "max_tokens": cls.generation.MAX_TOKENS,
            "top_p": cls.generation.TOP_P,
            "context_window": cls.model.get_context_window(),
        }

    @classmethod
    def switch_backend(cls, backend: NeuralBackend):
        """Switch to a different neural network backend"""
        cls.model.ACTIVE_BACKEND = backend
        print(f"✅ Switched to backend: {backend.value}")
        print(f"   API URL: {cls.model.get_api_url()}")
        print(f"   Description: {cls.model.BACKENDS[backend]['description']}")

    @classmethod
    def get_active_backend_info(cls):
        """Get information about currently active backend"""
        backend = cls.model.ACTIVE_BACKEND
        config = cls.model.BACKENDS[backend]
        return {
            "backend": backend.value,
            "api_url": config["api_url"],
            "api_type": config["api_type"],
            "model_name": config["model_name"],
            "context_window": config["context_window"],
            "description": config["description"]
        }


# ===== HELPER FUNCTIONS =====

def print_current_config():
    """Print current Grace configuration"""
    print("\n" + "="*60)
    print("GRACE AI CONFIGURATION")
    print("="*60)

    backend_info = GraceConfig.get_active_backend_info()
    print(f"\n🧠 Neural Backend: {backend_info['backend'].upper()}")
    print(f"   {backend_info['description']}")
    print(f"   API: {backend_info['api_url']}")
    print(f"   Context: {backend_info['context_window']:,} tokens")

    print(f"\n🎛️  Generation Settings:")
    print(f"   Temperature: {GraceConfig.generation.TEMPERATURE}")
    print(f"   Max Tokens: {GraceConfig.generation.MAX_TOKENS:,}")

    print(f"\n🤔 Reasoning:")
    print(f"   (Handled by fine-tuned model)")

    print(f"\n💾 Memory:")
    print(f"   Enabled: {GraceConfig.memory.MEMORY_ENABLED}")
    print(f"   Top-K: {GraceConfig.memory.MEMORY_TOP_K}")
    print(f"   Auto-QnA: {GraceConfig.memory.MEMORY_AUTO_QNA}")

    print(f"\n🌍 Environment: {GraceConfig.environment.CURRENT_ENV.value.upper()}")
    env_config = GraceConfig.environment.get_config()
    print(f"   Debug: {env_config['debug']}")
    print(f"   Require Auth: {env_config['require_auth']}")

    print("\n" + "="*60 + "\n")


if __name__ == "__main__":
    # Print configuration when run directly
    print_current_config()

    # Example: Switch backends
    print("Available backends:")
    for backend in NeuralBackend:
        config = ModelConfig.BACKENDS[backend]
        print(f"  - {backend.value}: {config['description']}")

    print("\n# Example: Switch to MLX rStar backend")
    print("GraceConfig.switch_backend(NeuralBackend.MLX_RSTAR)")
