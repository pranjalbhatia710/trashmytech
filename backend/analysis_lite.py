"""trashmy.tech -- Lite analysis mode configuration.

When ANALYSIS_MODE=lite (the default):
- SKIP: Google PageSpeed API, Mozilla Observatory, Google Safe Browsing,
        Website Carbon, Green Web Foundation
- KEEP: Playwright agents (local, free), axe-core (free, runs in browser),
        SSL check (native Python ssl module), DNS check (native dnspython),
        RDAP/WHOIS (free public API), technology detection (local regex),
        robots.txt fetch (simple GET), sitemap.xml existence check (simple GET)
- Use gemini-2.0-flash (cheapest) for all LLM calls

When ANALYSIS_MODE=full:
- Run ALL external APIs (PageSpeed, Observatory, Safe Browsing, Carbon, etc.)
- Use gemini-2.0-flash for reports (or whatever GEMINI_MODEL is set to)

Cost impact:
- lite mode: ~$0.002/analysis (only LLM calls for agents + report)
- full mode: ~$0.05-0.10/analysis (Google API calls + LLM calls)
"""

from __future__ import annotations

import logging
import os

log = logging.getLogger("trashmy.analysis_lite")

# ---------------------------------------------------------------------------
# Environment-driven configuration
# ---------------------------------------------------------------------------

ANALYSIS_MODE: str = os.getenv("ANALYSIS_MODE", "lite")

# Validate once at import time
if ANALYSIS_MODE not in ("lite", "full"):
    log.warning(
        "ANALYSIS_MODE=%r is not recognized; falling back to 'lite'. "
        "Valid values: 'lite', 'full'.",
        ANALYSIS_MODE,
    )
    ANALYSIS_MODE = "lite"


def should_run_external_apis() -> bool:
    """Return True if the expensive external APIs should be called.

    In 'lite' mode only free/local checks run; in 'full' mode everything runs.
    """
    return ANALYSIS_MODE == "full"


def get_gemini_model() -> str:
    """Return the Gemini model name to use for LLM calls.

    Respects GEMINI_MODEL env var.  Defaults to gemini-2.0-flash in lite
    mode and whatever GEMINI_MODEL is set to (or gemini-2.0-flash) in full
    mode.
    """
    env_model = os.getenv("GEMINI_MODEL", "")
    if ANALYSIS_MODE == "full" and env_model:
        return env_model
    # lite mode always uses flash for cost; full mode defaults to flash too
    return env_model or "gemini-2.0-flash"


# The free checks that run in both lite and full modes.
LITE_CHECKS: list[str] = [
    "ssl_check",
    "dns_check",
    "rdap_whois",
    "tech_detection",
    "robots_txt",
    "sitemap_check",
]


def get_lite_external_checks() -> list[str]:
    """Return the list of free checks to run in lite mode."""
    return list(LITE_CHECKS)


# The expensive checks that only run in full mode.
PAID_CHECKS: list[str] = [
    "pagespeed",
    "observatory",
    "safe_browsing",
    "carbon",
    "green_web",
]


def get_analysis_mode() -> str:
    """Return the current analysis mode string ('lite' or 'full')."""
    return ANALYSIS_MODE
