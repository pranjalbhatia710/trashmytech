"""Shared LLM client factory -- Gemini via OpenAI-compatible endpoint.

Respects ANALYSIS_MODE and GEMINI_MODEL environment variables:
- ANALYSIS_MODE=lite (default): uses gemini-2.0-flash for everything
- ANALYSIS_MODE=full: uses GEMINI_MODEL env (defaults to gemini-2.0-flash)
- GEMINI_MODEL env var overrides the model for all modes when set explicitly
"""

import os
from openai import OpenAI

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ---------------------------------------------------------------------------
# Model selection -- driven by env vars
# ---------------------------------------------------------------------------

def _resolve_model(role: str) -> str:
    """Resolve model name from environment.

    Args:
        role: 'fast' for agents/annotations, 'pro' for reports.
    """
    # Explicit GEMINI_MODEL always wins
    explicit = os.getenv("GEMINI_MODEL", "")
    if explicit:
        return explicit

    # In lite mode default everything to flash for cost
    mode = os.getenv("ANALYSIS_MODE", "lite")
    if mode == "lite":
        return "gemini-2.0-flash"

    # Full mode: flash for fast tasks, configurable for pro tasks
    if role == "pro":
        return os.getenv("GEMINI_MODEL_PRO", "gemini-2.0-flash")
    return "gemini-2.0-flash"


# Stable module-level names for backwards compatibility.
# Other modules do: `from llm_client import MODEL_FAST, MODEL_PRO`
MODEL_FAST: str = _resolve_model("fast")
MODEL_PRO: str = _resolve_model("pro")


def get_client() -> OpenAI:
    """Return an OpenAI-compatible client pointed at Gemini."""
    api_key = GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
    return OpenAI(
        api_key=api_key,
        base_url=GEMINI_BASE_URL,
    )
