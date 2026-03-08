"""Shared LLM client factory — Gemini via OpenAI-compatible endpoint."""

import os
from openai import OpenAI

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Models
MODEL_FAST = "gemini-2.5-flash"   # agents, annotations, small tasks
MODEL_PRO = "gemini-2.5-pro"      # reports, complex analysis


def get_client() -> OpenAI:
    """Return an OpenAI-compatible client pointed at Gemini."""
    api_key = GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
    return OpenAI(
        api_key=api_key,
        base_url=GEMINI_BASE_URL,
    )
