"""Model server manager — startup verification and health checks.

Providers are defined once here; grace_gui.py has the runtime fallback loop.
This module is only used by main.py (startup), /api/health, and /api/teacher/ensure-model.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

# ── Provider registry ──────────────────────────────────────────────────
PROVIDERS = {
    "zai": {
        "name": "Z.ai API",
        "base_url": "https://api.z.ai/api/paas/v4",
        "model": "glm-4.7",
        "api_key_env": "ZAI_API_KEY",
    },
}


def load_api_key(provider: str = "zai") -> str:
    """Load API key from env for the given provider."""
    cfg = PROVIDERS.get(provider)
    if not cfg:
        print(f"❌ Unknown provider: {provider}")
        return ""
    key = os.environ.get(cfg["api_key_env"], "")
    if not key:
        print(f"⚠️  No API key for {cfg['name']} ({cfg['api_key_env']})")
    return key


def check_api_connection(provider: str = "zai") -> bool:
    """Ping the provider with a minimal chat completion. Returns True on success."""
    cfg = PROVIDERS.get(provider)
    if not cfg:
        print(f"❌ Unknown provider: {provider}")
        return False

    api_key = load_api_key(provider)
    if not api_key:
        return False

    try:
        client = OpenAI(base_url=cfg["base_url"], api_key=api_key, timeout=10, max_retries=0)
        t0 = __import__("time").perf_counter()
        client.chat.completions.create(
            model=cfg["model"],
            messages=[{"role": "user", "content": "Ping"}],
            max_tokens=1,
            stream=False,
        )
        elapsed = __import__("time").perf_counter() - t0
        print(f"✅ {cfg['name']} reachable in {elapsed:.2f}s")
        return True
    except Exception as exc:
        print(f"❌ {cfg['name']} failed: {exc}")
        return False


def test_model_connection(provider: str = "zai") -> dict:
    """Return a status dict for a provider — used by /api/health."""
    cfg = PROVIDERS.get(provider)
    if not cfg:
        return {"status": "error", "message": f"Unknown provider: {provider}", "details": {"provider": provider}}

    api_key = load_api_key(provider)
    if not api_key:
        return {
            "status": "error",
            "message": f"No {cfg['name']} API key",
            "details": {"api_key_available": False, "provider": provider},
        }

    try:
        client = OpenAI(base_url=cfg["base_url"], api_key=api_key)
        client.chat.completions.create(
            model=cfg["model"],
            messages=[{"role": "user", "content": "Hello"}],
            max_tokens=50,
            stream=False,
        )
        return {
            "status": "success",
            "message": f"{cfg['name']} operational",
            "details": {"api_key_available": True, "model": cfg["model"], "provider": provider},
        }
    except Exception as exc:
        return {
            "status": "error",
            "message": f"{cfg['name']} failed: {exc}",
            "details": {"api_key_available": bool(api_key), "model": cfg["model"], "provider": provider},
        }


# Backwards-compatible aliases used by main.py startup and teacher route
def ensure_grace_server(provider: str = "zai") -> bool:
    return check_api_connection(provider)


if __name__ == "__main__":
    result = test_model_connection()
    print(f"Status: {result['status']}")
    print(f"Message: {result['message']}")
