"""Model server manager for the NVIDIA OpenAI-compatible API."""

import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

PROJECT_ROOT = Path(__file__).parent.parent
CREDENTIALS_FILE = PROJECT_ROOT / "nvidia_credentials.env"

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_MODEL = "nvidia/nemotron-3-ultra-550b-a55b"


def load_api_key() -> str:
    """Load the NVIDIA API key from env vars or the local credentials file."""
    api_key = os.environ.get("NVIDIA_API_KEY") or os.environ.get("NGC_API_KEY")
    if api_key:
        return api_key

    if CREDENTIALS_FILE.exists():
        try:
            with open(CREDENTIALS_FILE, "r") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("NGC_API_KEY="):
                        return line.split("=", 1)[1].strip('"\'')
                    if line.startswith("NVIDIA_API_KEY="):
                        return line.split("=", 1)[1].strip('"\'')
        except Exception as exc:
            print(f"❌ Error reading credentials file: {exc}")

    return ""


def check_api_connection() -> bool:
    """Check that the NVIDIA API can serve a basic chat completion."""
    api_key = load_api_key()
    if not api_key:
        print("❌ No NVIDIA API key found")
        return False

    try:
        client = OpenAI(base_url=NVIDIA_BASE_URL, api_key=api_key)
        client.chat.completions.create(
            model=NVIDIA_MODEL,
            messages=[{"role": "user", "content": "Ping"}],
            max_tokens=1,
            stream=False,
        )
        print("✅ NVIDIA API reachable")
        return True
    except Exception as exc:
        print(f"❌ NVIDIA API connection failed: {exc}")
        return False


def start_grace_server() -> bool:
    print(f"🚀 Starting Grace AI with NVIDIA ({NVIDIA_MODEL})")
    return check_api_connection()


def start_karen_server() -> bool:
    print("⚠️ Karen server not implemented — using Grace")
    return start_grace_server()


def ensure_grace_server() -> bool:
    return check_api_connection()


def ensure_karen_server() -> bool:
    return ensure_grace_server()


def test_model_connection() -> dict:
    api_key = load_api_key()
    if not api_key:
        return {
            "status": "error",
            "message": "No API key found",
            "details": {"api_key_available": False},
        }

    try:
        client = OpenAI(base_url=NVIDIA_BASE_URL, api_key=api_key)
        client.chat.completions.create(
            model=NVIDIA_MODEL,
            messages=[{"role": "user", "content": "Hello"}],
            max_tokens=50,
            stream=False,
        )
        return {
            "status": "success",
            "message": "NVIDIA API operational",
            "details": {"api_key_available": True, "model": NVIDIA_MODEL},
        }
    except Exception as exc:
        return {
            "status": "error",
            "message": str(exc),
            "details": {"api_key_available": bool(api_key), "model": NVIDIA_MODEL},
        }


if __name__ == "__main__":
    result = test_model_connection()
    print(f"Status: {result['status']}")
    print(f"Message: {result['message']}")
