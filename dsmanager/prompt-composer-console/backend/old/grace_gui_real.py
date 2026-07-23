"""
Real grace_gui module for the prompt-composer-console backend.
Connects to NVIDIA NIM Cloud API for AI model inference.
"""

import json
from typing import List, Optional, Any, Dict
import os
import requests
import time

# Configuration - NVIDIA NIM Cloud API
NVIDIA_NIM_CLOUD_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_NIM_MODEL = "mistralai/mixtral-8x22b-instruct-v0.1"
MAX_RETRIES = 3
RETRY_DELAY = 2

# Path to credentials file
CREDENTIALS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "nvidia_credentials.env")

def load_api_key() -> str:
    """Load API key from credentials file or environment variables"""
    # First try environment variables
    api_key = os.environ.get("NGC_API_KEY") or os.environ.get("NVIDIA_API_KEY")
    if api_key:
        return api_key

    # Try to load from credentials file
    if os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, "r") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("NGC_API_KEY="):
                        return line.split("=", 1)[1].strip("\"'")
                    elif line.startswith("NVIDIA_API_KEY="):
                        return line.split("=", 1)[1].strip("\"'")
        except Exception as e:
            print(f"❌ Error reading credentials file: {e}")

    return ""

def search_news(query: str, reasoning: bool = False, memory: str = "") -> str:
    """Search news using the LLM."""
    print(f"[REAL] search_news called with query: {query}, reasoning: {reasoning}")
    
    prompt = f"""Search for news about: {query}
    
    Memory context: {memory[:500] if memory else "None"}
    
    Please provide a summary of relevant news articles."""
    
    return query_llm(
        context="You are a news research assistant.",
        question=prompt,
        reasoning=reasoning
    )

def summarize_pdfs(files: List[Any], reasoning: bool = False) -> str:
    """Summarize PDFs using the LLM."""
    print(f"[REAL] summarize_pdfs called with {len(files)} files, reasoning: {reasoning}")
    
    # For now, return a placeholder since we don't have PDF processing
    return "PDF summarization requires actual PDF processing. This feature will be implemented when PDF files are provided."

def retrieve_memory_context(query: str) -> str:
    """Retrieve memory context for a query."""
    print(f"[REAL] retrieve_memory_context called with query: {query}")
    
    # For now, return empty memory context
    # This should be connected to the actual memory system
    return ""

def query_llm(
    context: str = "",
    question: str = "",
    reasoning: bool = False,
    reasoning_style: str = "chain_of_thought",
    memory_context: str = "",
    temperature: float = 0.45,
    self_reflection: bool = False,
    editorial: Optional[Dict[str, Any]] = None
) -> str:
    """Real LLM query function that connects to NVIDIA NIM Cloud API."""
    print(f"[REAL] query_llm called with question: {question[:100]}..., reasoning: {reasoning}")
    
    if not question.strip():
        return "Please provide a question to answer."
    
    # Load API key
    api_key = load_api_key()
    if not api_key:
        return "Error: NVIDIA API key not found. Please check nvidia_credentials.env file or set NGC_API_KEY/NVIDIA_API_KEY environment variable."
    
    # Build the system prompt based on context and requirements
    system_prompt = f"""You are Grace, a helpful AI assistant.

Context: {context}
Memory context: {memory_context}"""
    
    if reasoning:
        system_prompt += "\n\nPlease show your reasoning step by step."
    
    # Prepare the messages for the chat completion
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question}
    ]
    
    # Prepare the request payload for NVIDIA NIM Cloud API
    payload = {
        "model": NVIDIA_NIM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 2048,
        "stream": False
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    # Try to connect to the NVIDIA NIM Cloud API with retries
    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post(
                f"{NVIDIA_NIM_CLOUD_URL}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60  # Longer timeout for cloud API
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                
                if not content:
                    return "The model returned an empty response."
                
                # Return the content as-is without adding prompt suggestions
                
                return content
            else:
                print(f"❌ NVIDIA NIM Cloud API returned status {response.status_code}: {response.text[:200]}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY)
                    continue
                else:
                    return f"Error: NVIDIA NIM Cloud API returned status {response.status_code}"
                    
        except requests.exceptions.ConnectionError:
            print(f"❌ Connection error to NVIDIA NIM Cloud API (attempt {attempt + 1}/{MAX_RETRIES})")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
                continue
            else:
                return "Error: Could not connect to the NVIDIA NIM Cloud API. Please check your internet connection."
        except Exception as e:
            print(f"❌ Error querying NVIDIA NIM Cloud API: {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
                continue
            else:
                return f"Error: {str(e)}"
    
    return "Error: Failed to get response from the model after multiple attempts."

def load_logs_to_vectorstore() -> None:
    """Load logs to vectorstore."""
    print("[REAL] load_logs_to_vectorstore called - placeholder")

def evaluate_source(url: str, title: str = "", content: str = "") -> Dict[str, Any]:
    """Evaluate a source using the LLM."""
    print(f"[REAL] evaluate_source called for URL: {url}")
    
    evaluation_prompt = f"""Evaluate the credibility and relevance of this source:
    
    URL: {url}
    Title: {title}
    Content preview: {content[:500] if content else "No content provided"}
    
    Please provide an evaluation with credibility score (0-1), relevance score (0-1), summary, and recommendation."""
    
    evaluation_text = query_llm(
        context="You are a source evaluation assistant.",
        question=evaluation_prompt
    )
    
    # Parse the evaluation (simplified - in reality would need more sophisticated parsing)
    return {
        "credibility": 0.8,
        "relevance": 0.7,
        "summary": f"Evaluation of {url}",
        "recommendation": "use_with_caution",
        "full_evaluation": evaluation_text
    }