"""
Model Server Manager - Updated for Cloud API Integration
Handles NVIDIA NIM Cloud API connection instead of local server startup
Reads API key from nvidia_credentials.env file
"""

import os
import time
from pathlib import Path
from typing import Optional

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent

# API Configuration
NVIDIA_NIM_CLOUD_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_NIM_MODEL = "mistralai/mixtral-8x22b-instruct-v0.1"

# Path to credentials file
CREDENTIALS_FILE = PROJECT_ROOT / "nvidia_credentials.env"


def load_api_key() -> str:
    """Load API key from credentials file or environment variables"""
    # First try environment variables
    api_key = os.environ.get("NGC_API_KEY") or os.environ.get("NVIDIA_API_KEY")
    if api_key:
        return api_key

    # Try to load from credentials file
    if CREDENTIALS_FILE.exists():
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


def check_api_connection() -> bool:
    """Check if NVIDIA NIM Cloud API is accessible"""
    import requests

    # Check if API key is available
    api_key = load_api_key()
    if not api_key:
        print("❌ No NVIDIA API key found")
        print(
            "   Check nvidia_credentials.env file or set NGC_API_KEY/NVIDIA_API_KEY environment variable"
        )
        return False

    try:
        # Test API connection by listing available models
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        response = requests.get(
            f"{NVIDIA_NIM_CLOUD_URL}/models", headers=headers, timeout=10
        )

        if response.status_code == 200:
            models = response.json().get("data", [])
            model_names = [model.get("id", "") for model in models]

            if NVIDIA_NIM_MODEL in model_names:
                print(f"✅ NVIDIA NIM Cloud API is accessible")
                print(f"   Model '{NVIDIA_NIM_MODEL}' is available")
                return True
            else:
                print(f"⚠️  NVIDIA NIM Cloud API is accessible, but model not found")
                print(f"   Available models: {', '.join(model_names[:5])}...")
                print(f"   Looking for: {NVIDIA_NIM_MODEL}")
                # Still return True as API is working, just model might have different name
                return True
        else:
            print(f"❌ NVIDIA NIM API returned status {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return False

    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to NVIDIA NIM Cloud API")
        print("   Check your internet connection")
        return False
    except requests.exceptions.Timeout:
        print("❌ NVIDIA NIM API connection timeout")
        return False
    except Exception as e:
        print(f"❌ Error checking NVIDIA NIM API: {e}")
        return False


def start_grace_server() -> bool:
    """Start Grace AI service using NVIDIA NIM Cloud API"""
    print("🚀 Starting Grace AI with NVIDIA NIM Cloud API...")
    print(f"   Model: {NVIDIA_NIM_MODEL}")
    print(f"   Endpoint: {NVIDIA_NIM_CLOUD_URL}")

    # Check API connection
    if check_api_connection():
        print("✅ Grace AI service ready (using NVIDIA NIM Cloud API)")
        return True
    else:
        print("❌ Failed to connect to NVIDIA NIM Cloud API")
        print("   Please check your API key and internet connection")
        return False


def start_karen_server() -> bool:
    """Start Karen model server - placeholder for future implementation"""
    print("⚠️  Karen server not implemented yet")
    print("   Using Grace AI service instead")
    return start_grace_server()


def ensure_grace_server() -> bool:
    """Ensure Grace AI service is available"""
    return check_api_connection()


def ensure_karen_server() -> bool:
    """Ensure Karen server is available - placeholder"""
    return ensure_grace_server()


def test_model_connection() -> dict:
    """Test the model connection and return detailed status"""
    import requests

    api_key = load_api_key()

    if not api_key:
        return {
            "status": "error",
            "message": "No API key found. Check nvidia_credentials.env file or set NGC_API_KEY/NVIDIA_API_KEY environment variable.",
            "details": {
                "api_key_available": False,
                "cloud_api_accessible": False,
                "model_available": False,
                "credentials_file_exists": CREDENTIALS_FILE.exists(),
            },
        }

    try:
        # Test 1: Check API accessibility
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        models_response = requests.get(
            f"{NVIDIA_NIM_CLOUD_URL}/models", headers=headers, timeout=10
        )

        if models_response.status_code != 200:
            return {
                "status": "error",
                "message": f"API returned status {models_response.status_code}",
                "details": {
                    "api_key_available": True,
                    "cloud_api_accessible": False,
                    "model_available": False,
                    "response": models_response.text[:500],
                },
            }

        # Test 2: Check if our model is available
        models = models_response.json().get("data", [])
        model_names = [model.get("id", "") for model in models]
        model_available = NVIDIA_NIM_MODEL in model_names

        # Test 3: Try a simple chat completion
        test_payload = {
            "model": NVIDIA_NIM_MODEL,
            "messages": [{"role": "user", "content": "Hello, are you working?"}],
            "max_tokens": 50,
            "temperature": 0.7,
        }

        chat_response = requests.post(
            f"{NVIDIA_NIM_CLOUD_URL}/chat/completions",
            headers=headers,
            json=test_payload,
            timeout=30,
        )

        chat_success = chat_response.status_code == 200

        if model_available and chat_success:
            return {
                "status": "success",
                "message": "NVIDIA NIM Cloud API is fully operational",
                "details": {
                    "api_key_available": True,
                    "cloud_api_accessible": True,
                    "model_available": True,
                    "chat_test_successful": True,
                    "available_models": model_names[:10],  # First 10 models
                    "test_response_time": chat_response.elapsed.total_seconds(),
                },
            }
        else:
            return {
                "status": "partial",
                "message": "API accessible but model test failed",
                "details": {
                    "api_key_available": True,
                    "cloud_api_accessible": True,
                    "model_available": model_available,
                    "chat_test_successful": chat_success,
                    "available_models": model_names[:10],
                    "chat_response_status": chat_response.status_code,
                },
            }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Connection test failed: {str(e)}",
            "details": {
                "api_key_available": bool(api_key),
                "cloud_api_accessible": False,
                "model_available": False,
                "error": str(e),
            },
        }


# Quick test function
if __name__ == "__main__":
    print("Testing NVIDIA NIM Cloud API connection...")
    result = test_model_connection()
    print(f"Status: {result['status']}")
    print(f"Message: {result['message']}")
    print(f"Details: {result['details']}")
