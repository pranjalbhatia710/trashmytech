"""trashmy.tech -- Composite scoring system.

Aggregates data from crawl results, persona agent sessions, and external API
checks into a single 0-100 score with six weighted categories:

    Accessibility  25%
    SEO            20%
    Performance    20%
    Content        15%
    Security       10%
    UX             10%

Each category is itself a weighted blend of sub-metrics.  When a data source
is unavailable the sub-metric weight is redistributed proportionally among
the sources that *are* present so that a missing API never tanks a category.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("trashmy.scoring")

# ---------------------------------------------------------------------------
# Top-level category weights  (must sum to 1.0)
# ---------------------------------------------------------------------------
SCORE_WEIGHTS: dict[str, float] = {
    "accessibility": 0.25,
    "seo":           0.20,
    "performance":   0.20,
    "content":       0.15,
    "security":      0.10,
    "ux":            0.10,
}

# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------

@dataclass
class CategoryScore:
    name: str
    score: float            # 0-100
    weight: float           # 0.0-1.0
    breakdown: dict[str, float]          # sub-metric name -> score
    data_sources_used: list[str]
    data_sources_missing: list[str]

@dataclass
class CompositeScore:
    overall_score: float
    letter_grade: str
    categories: list[CategoryScore]
    quick_wins: list[Any] = field(default_factory=list)    # populated by quick_wins.py
    calculated_at: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        # Also provide a flat category_scores map for backwards compat with report.py
        d["category_scores"] = {
            c["name"]: {"score": round(c["score"], 1), "weight": c["weight"], "breakdown": c["breakdown"]}
            for c in d["categories"]
        }
        return d


# ---------------------------------------------------------------------------
# Letter grade thresholds
# ---------------------------------------------------------------------------

def get_letter_grade(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 65:
        return "C"
    if score >= 45:
        return "D"
    return "F"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _weighted_average(items: list[tuple[str, float | None, float]]) -> tuple[float, list[str], list[str]]:
    """Compute a weighted average, redistributing weight from None entries.

    *items* is a list of (name, score_or_None, original_weight).
    Returns (blended_score, used_names, missing_names).
    """
    present: list[tuple[str, float, float]] = []
    missing: list[str] = []
    for name, score, w in items:
        if score is not None:
            present.append((name, score, w))
        else:
            missing.append(name)

    if not present:
        return 50.0, [], [n for n, _, _ in items]  # fallback neutral

    total_w = sum(w for _, _, w in present)
    blended = sum(s * (w / total_w) for _, s, w in present)
    return _clamp(blended), [n for n, _, _ in present], missing


# ===================================================================
# ACCESSIBILITY  (25 %)
# ===================================================================
# Sub-metrics and their internal weights:
#   lighthouse_a11y       30 %   — Lighthouse accessibility score
#   axe_core              25 %   — axe-core violation deductions
#   keyboard_completion   15 %   — keyboard persona completion rate
#   screen_reader         15 %   — screen reader persona completion rate
#   color_contrast        15 %   — color contrast issue deductions
# ===================================================================

# Axe severity point costs
AXE_SEVERITY_COST = {"critical": 10, "serious": 5, "moderate": 2, "minor": 1}

def _score_accessibility(crawl: dict, sessions: list[dict], external: dict) -> CategoryScore:
    breakdown: dict[str, float] = {}
    items: list[tuple[str, float | None, float]] = []

    # -- Lighthouse a11y (from external PageSpeed data if available) --------
    lighthouse_a11y: float | None = None
    psi = external.get("pagespeed", {})
    if psi:
        lighthouse_a11y = psi.get("accessibility")
        if lighthouse_a11y is not None:
            # Lighthouse returns 0-1 or 0-100; normalise to 0-100
            if lighthouse_a11y <= 1.0:
                lighthouse_a11y = lighthouse_a11y * 100
            lighthouse_a11y = _clamp(lighthouse_a11y)
    if lighthouse_a11y is not None:
        breakdown["lighthouse_a11y"] = round(lighthouse_a11y, 1)
    items.append(("lighthouse_a11y", lighthouse_a11y, 0.30))

    # -- axe-core violations ------------------------------------------------
    violations = crawl.get("accessibility_violations", [])
    if isinstance(violations, list) and len(violations) >= 0:
        deductions = 0.0
        for v in violations:
            sev = v.get("impact", "minor")
            nodes = v.get("nodes_count", 1) or 1
            deductions += AXE_SEVERITY_COST.get(sev, 1) * min(nodes, 5)  # cap per-rule
        axe_score = _clamp(100 - deductions)
        breakdown["axe_core"] = round(axe_score, 1)
        items.append(("axe_core", axe_score, 0.25))
    else:
        items.append(("axe_core", None, 0.25))

    # -- Helper: adjusted completion rate that accounts for tool limitations --
    def _adjusted_completion(persona_sessions: list[dict]) -> float:
        """Calculate completion rate, partially crediting tool_limitation failures."""
        completed = 0.0
        for s in persona_sessions:
            if s.get("task_completed"):
                completed += 1.0
            else:
                tool_lims = len(s.get("tool_limitations", []))
                real_bugs = [f for f in s.get("findings", []) if f.get("is_site_bug", True)]
                if tool_lims > 0 and len(real_bugs) == 0:
                    completed += 0.75  # mostly tool limitation, not a site problem
                elif tool_lims > 0 and len(real_bugs) <= 1:
                    completed += 0.4  # mixed
        return (completed / len(persona_sessions)) * 100 if persona_sessions else 0

    # -- Keyboard persona completion ----------------------------------------
    keyboard_personas = [s for s in sessions
                         if s.get("persona", {}).get("category") == "accessibility"
                         and _is_keyboard_persona(s)]
    if keyboard_personas:
        rate = _adjusted_completion(keyboard_personas)
        breakdown["keyboard_completion"] = round(rate, 1)
        items.append(("keyboard_completion", rate, 0.15))
    else:
        items.append(("keyboard_completion", None, 0.15))

    # -- Screen reader persona completion -----------------------------------
    sr_personas = [s for s in sessions
                   if s.get("persona", {}).get("category") == "accessibility"
                   and _is_screen_reader_persona(s)]
    if sr_personas:
        rate = _adjusted_completion(sr_personas)
        breakdown["screen_reader_completion"] = round(rate, 1)
        items.append(("screen_reader_completion", rate, 0.15))
    else:
        items.append(("screen_reader_completion", None, 0.15))

    # -- Color contrast issues ----------------------------------------------
    contrast_issues = _count_contrast_issues(crawl, sessions)
    contrast_score = _clamp(100 - contrast_issues * 3)
    breakdown["color_contrast"] = round(contrast_score, 1)
    items.append(("color_contrast", contrast_score, 0.15))

    score, used, missing = _weighted_average(items)
    return CategoryScore(
        name="accessibility", score=round(score, 1), weight=SCORE_WEIGHTS["accessibility"],
        breakdown=breakdown, data_sources_used=used, data_sources_missing=missing,
    )


def _is_keyboard_persona(session: dict) -> bool:
    """Heuristic: persona uses keyboard-only navigation."""
    mods = session.get("persona", {}).get("behavioral_modifiers", {})
    if mods.get("keyboard_only"):
        return True
    pid = session.get("persona", {}).get("id", "")
    return pid in ("A2", "P9")  # James Whitfield, Angela Rivera


def _is_screen_reader_persona(session: dict) -> bool:
    pid = session.get("persona", {}).get("id", "")
    ts = session.get("persona", {}).get("task_style", "")
    return pid == "A3" or ts == "screen_reader"


def _count_contrast_issues(crawl: dict, sessions: list[dict]) -> int:
    """Count colour-contrast violations from axe and persona findings."""
    count = 0
    for v in crawl.get("accessibility_violations", []):
        vid = (v.get("id") or "").lower()
        if "contrast" in vid:
            count += v.get("nodes_count", 1) or 1
    for s in sessions:
        for f in s.get("findings", []):
            title = (f.get("title") or "").lower()
            detail = (f.get("detail") or "").lower()
            if "contrast" in title or "contrast" in detail:
                count += 1
    return count


# ===================================================================
# SEO  (20 %)
# ===================================================================
# Sub-metrics:
#   lighthouse_seo    35 %
#   crawl_seo_signals 25 %   — from crawler's _check_seo + ai_seo
#   content_seo       25 %   — heading hierarchy, meta tags, OG tags
#   domain_age        10 %   — bonus from external
#   green_hosting      5 %   — bonus from external
# ===================================================================

def _score_seo(crawl: dict, _sessions: list[dict], external: dict) -> CategoryScore:
    breakdown: dict[str, float] = {}
    items: list[tuple[str, float | None, float]] = []

    # -- Lighthouse SEO ------------------------------------------------------
    psi = external.get("pagespeed", {})
    lh_seo: float | None = psi.get("seo") if psi else None
    if lh_seo is not None:
        if lh_seo <= 1.0:
            lh_seo = lh_seo * 100
        lh_seo = _clamp(lh_seo)
        breakdown["lighthouse_seo"] = round(lh_seo, 1)
    items.append(("lighthouse_seo", lh_seo, 0.35))

    # -- Crawl SEO signals ---------------------------------------------------
    seo = crawl.get("seo", {})
    ai_seo = crawl.get("ai_seo", {})
    points = 0.0
    max_points = 0.0

    signal_checks = [
        (seo.get("has_h1"), 15),
        (seo.get("has_meta_description"), 15),
        (seo.get("has_viewport"), 10),
        (seo.get("has_lang"), 10),
        (seo.get("has_canonical"), 10),
        (ai_seo.get("sitemap_exists"), 15),
        (bool(ai_seo.get("structured_data")), 10),
        (bool(ai_seo.get("open_graph")), 10),
        (ai_seo.get("llms_txt"), 5),
    ]
    for present, pts in signal_checks:
        max_points += pts
        if present:
            points += pts
    crawl_seo = _clamp((points / max_points) * 100) if max_points else 50
    breakdown["crawl_seo_signals"] = round(crawl_seo, 1)
    items.append(("crawl_seo_signals", crawl_seo, 0.25))

    # -- Content SEO quality (heading hierarchy + AI readability) ------------
    headings = crawl.get("heading_hierarchy", {})
    h_score = 100.0
    h1_count = headings.get("h1_count", 0)
    if h1_count == 0:
        h_score -= 30
    elif h1_count > 1:
        h_score -= 10
    skips = headings.get("skips", [])
    h_score -= len(skips) * 10
    h_score = _clamp(h_score)

    ai_read = ai_seo.get("ai_readability_score")
    if ai_read is not None:
        content_seo = (h_score * 0.4 + float(ai_read) * 0.6)
    else:
        content_seo = h_score
    breakdown["content_seo"] = round(_clamp(content_seo), 1)
    items.append(("content_seo", _clamp(content_seo), 0.25))

    # -- Domain age bonus (from external, e.g. WHOIS) -----------------------
    domain_age_years: float | None = external.get("domain_age_years")
    if domain_age_years is not None:
        if domain_age_years >= 5:
            da_score = 100.0
        elif domain_age_years >= 3:
            da_score = 80.0
        elif domain_age_years >= 1:
            da_score = 50.0
        else:
            da_score = 20.0
        breakdown["domain_age"] = round(da_score, 1)
        items.append(("domain_age", da_score, 0.10))
    else:
        items.append(("domain_age", None, 0.10))

    # -- Green hosting bonus ------------------------------------------------
    green = external.get("green_hosting")
    if green is not None:
        gh_score = 100.0 if green else 30.0
        breakdown["green_hosting"] = round(gh_score, 1)
        items.append(("green_hosting", gh_score, 0.05))
    else:
        items.append(("green_hosting", None, 0.05))

    score, used, missing = _weighted_average(items)
    return CategoryScore(
        name="seo", score=round(score, 1), weight=SCORE_WEIGHTS["seo"],
        breakdown=breakdown, data_sources_used=used, data_sources_missing=missing,
    )


# ===================================================================
# PERFORMANCE  (20 %)
# ===================================================================
# Sub-metrics:
#   lighthouse_perf   30 %
#   lcp               20 %   <2.5s=100, 2.5-4=75, 4-6=50, >6=25
#   fcp               15 %   <1.8s=100, 1.8-3=75, 3-5=50, >5=25
#   cls               15 %   <0.1=100, 0.1-0.25=75, 0.25-0.5=50, >0.5=25
#   inp               15 %   <200ms=100, 200-500=75, 500-800=50, >800=25
#   agent_load_times   5 %   average page load from crawl / agents
# ===================================================================

def _bucket_score(value: float, thresholds: list[tuple[float, float]]) -> float:
    """Map a metric value to a score using threshold buckets.
    *thresholds* is [(upper_bound, score), ...] in ascending order.
    The last entry's score is the floor.
    """
    for bound, s in thresholds:
        if value < bound:
            return s
    return thresholds[-1][1]  # worst bucket

FCP_THRESHOLDS = [(1.8, 100), (3.0, 75), (5.0, 50), (999, 25)]
LCP_THRESHOLDS = [(2.5, 100), (4.0, 75), (6.0, 50), (999, 25)]
CLS_THRESHOLDS = [(0.1, 100), (0.25, 75), (0.5, 50), (999, 25)]
INP_THRESHOLDS = [(200, 100), (500, 75), (800, 50), (9999, 25)]

# Agent page-load thresholds (ms)
LOAD_THRESHOLDS_MS = [(1000, 100), (2000, 85), (3000, 70), (5000, 50), (999999, 25)]


def _score_performance(crawl: dict, sessions: list[dict], external: dict) -> CategoryScore:
    breakdown: dict[str, float] = {}
    items: list[tuple[str, float | None, float]] = []

    psi = external.get("pagespeed", {})

    # -- Lighthouse performance ---------------------------------------------
    lh_perf: float | None = psi.get("performance") if psi else None
    if lh_perf is not None:
        if lh_perf <= 1.0:
            lh_perf = lh_perf * 100
        lh_perf = _clamp(lh_perf)
        breakdown["lighthouse_perf"] = round(lh_perf, 1)
    items.append(("lighthouse_perf", lh_perf, 0.30))

    # -- Core Web Vitals from external data ---------------------------------
    cwv = external.get("core_web_vitals", {})

    for metric_name, key, thresholds, weight in [
        ("lcp", "lcp_seconds", LCP_THRESHOLDS, 0.20),
        ("fcp", "fcp_seconds", FCP_THRESHOLDS, 0.15),
        ("cls", "cls", CLS_THRESHOLDS, 0.15),
        ("inp", "inp_ms", INP_THRESHOLDS, 0.15),
    ]:
        val = cwv.get(key)
        if val is not None:
            s = _bucket_score(val, thresholds)
            breakdown[metric_name] = round(s, 1)
            items.append((metric_name, s, weight))
        else:
            items.append((metric_name, None, weight))

    # -- Agent load times ---------------------------------------------------
    load_ms = crawl.get("page_load_time_ms")
    agent_loads = [s.get("total_time_ms", 0) for s in sessions if s.get("total_time_ms")]
    if load_ms:
        agent_load_score = _bucket_score(load_ms, LOAD_THRESHOLDS_MS)
        breakdown["agent_load_times"] = round(agent_load_score, 1)
        items.append(("agent_load_times", agent_load_score, 0.05))
    elif agent_loads:
        avg = sum(agent_loads) / len(agent_loads)
        # agent times include browsing, normalise generously
        agent_load_score = _bucket_score(avg / 3, LOAD_THRESHOLDS_MS)
        breakdown["agent_load_times"] = round(agent_load_score, 1)
        items.append(("agent_load_times", agent_load_score, 0.05))
    else:
        items.append(("agent_load_times", None, 0.05))

    score, used, missing = _weighted_average(items)
    return CategoryScore(
        name="performance", score=round(score, 1), weight=SCORE_WEIGHTS["performance"],
        breakdown=breakdown, data_sources_used=used, data_sources_missing=missing,
    )


# ===================================================================
# SECURITY  (10 %)
# ===================================================================
# Sub-metrics:
#   observatory       35 %   Mozilla Observatory grade -> score
#   safe_browsing     25 %   clean=100, flagged=0
#   ssl               20 %   validity + days remaining
#   dns_auth          20 %   SPF + DMARC
# ===================================================================

OBSERVATORY_GRADE_MAP: dict[str, float] = {
    "A+": 100, "A": 95, "A-": 90,
    "B+": 85, "B": 80, "B-": 75,
    "C+": 70, "C": 65, "C-": 60,
    "D+": 55, "D": 50, "D-": 45,
    "F": 20,
}


def _score_security(_crawl: dict, sessions: list[dict], external: dict) -> CategoryScore:
    breakdown: dict[str, float] = {}
    items: list[tuple[str, float | None, float]] = []

    # -- Mozilla Observatory ------------------------------------------------
    obs = external.get("observatory", {})
    obs_grade = obs.get("grade")
    if obs_grade:
        obs_score = OBSERVATORY_GRADE_MAP.get(obs_grade.strip(), 50.0)
        breakdown["observatory"] = round(obs_score, 1)
        items.append(("observatory", obs_score, 0.35))
    else:
        items.append(("observatory", None, 0.35))

    # -- Safe Browsing ------------------------------------------------------
    sb = external.get("safe_browsing")
    if sb is not None:
        sb_score = 100.0 if sb == "clean" or sb is True else 0.0
        breakdown["safe_browsing"] = round(sb_score, 1)
        items.append(("safe_browsing", sb_score, 0.25))
    else:
        items.append(("safe_browsing", None, 0.25))

    # -- SSL ----------------------------------------------------------------
    ssl_data = external.get("ssl", {})
    if ssl_data:
        valid = ssl_data.get("valid", False)
        days = ssl_data.get("days_remaining")
        if not valid:
            ssl_score = 0.0
        elif days is not None:
            if days > 90:
                ssl_score = 100.0
            elif days > 30:
                ssl_score = 80.0
            else:
                ssl_score = 50.0
        else:
            ssl_score = 70.0  # valid but unknown expiry
        breakdown["ssl"] = round(ssl_score, 1)
        items.append(("ssl", ssl_score, 0.20))
    else:
        items.append(("ssl", None, 0.20))

    # -- DNS authentication (SPF + DMARC) -----------------------------------
    dns = external.get("dns_auth", {})
    if dns:
        pts = 0.0
        if dns.get("spf_present"):
            pts += 25
            if dns.get("spf_strict"):
                pts += 10
        if dns.get("dmarc_present"):
            pts += 25
            if dns.get("dmarc_enforce"):
                pts += 15
        dns_score = _clamp((pts / 75) * 100)
        breakdown["dns_auth"] = round(dns_score, 1)
        items.append(("dns_auth", dns_score, 0.20))
    else:
        items.append(("dns_auth", None, 0.20))

    # When no external security data exists at all, derive a basic score from
    # what we can infer: HTTPS in the URL is a positive signal.
    score, used, missing = _weighted_average(items)

    # Fallback: if everything is missing, give a neutral 50 rather than
    # the default 50 from _weighted_average (which already does this).
    return CategoryScore(
        name="security", score=round(score, 1), weight=SCORE_WEIGHTS["security"],
        breakdown=breakdown, data_sources_used=used, data_sources_missing=missing,
    )


# ===================================================================
# CONTENT  (15 %)
# ===================================================================
# Sub-metrics:
#   readability       20 %   Flesch score mapped
#   grammar           15 %   error count
#   heading_structure  15 %
#   trust_signals     20 %   privacy policy, contact, about, testimonials
#   value_proposition 15 %   from content evaluator
#   alt_text_coverage 15 %   % of images with alt
# ===================================================================

def _flesch_to_score(flesch: float | None) -> float | None:
    """Map Flesch readability to a 0-100 quality score.
    60-70 is ideal for web content and scores 100.
    Deviations in either direction reduce the score.
    """
    if flesch is None:
        return None
    # ideal centre is 65
    dist = abs(flesch - 65)
    if dist <= 5:
        return 100.0
    elif dist <= 15:
        return 85.0
    elif dist <= 25:
        return 65.0
    elif dist <= 35:
        return 45.0
    return 25.0


def _score_content(crawl: dict, sessions: list[dict], external: dict) -> CategoryScore:
    breakdown: dict[str, float] = {}
    items: list[tuple[str, float | None, float]] = []

    # -- Readability --------------------------------------------------------
    flesch = external.get("readability", {}).get("flesch")
    readability = _flesch_to_score(flesch)
    if readability is not None:
        breakdown["readability"] = round(readability, 1)
    items.append(("readability", readability, 0.20))

    # -- Grammar errors -----------------------------------------------------
    grammar_count = external.get("grammar_errors")
    if grammar_count is not None:
        grammar_score = _clamp(100 - grammar_count * 5)
        breakdown["grammar"] = round(grammar_score, 1)
        items.append(("grammar", grammar_score, 0.15))
    else:
        items.append(("grammar", None, 0.15))

    # -- Heading structure --------------------------------------------------
    headings = crawl.get("heading_hierarchy", {})
    h1c = headings.get("h1_count", 0)
    total_h = headings.get("total_headings", 0)
    skips = headings.get("skips", [])
    if total_h > 0 or h1c > 0:
        h_score = 100.0
        if h1c == 0:
            h_score = 10.0  # missing
        elif h1c > 1:
            h_score -= 15
        h_score -= len(skips) * 15
        if total_h < 2:
            h_score -= 20
        h_score = _clamp(h_score)
        breakdown["heading_structure"] = round(h_score, 1)
        items.append(("heading_structure", h_score, 0.15))
    else:
        items.append(("heading_structure", None, 0.15))

    # -- Trust signals (privacy policy, contact, about, testimonials) -------
    trust = _detect_trust_signals(crawl, sessions)
    trust_score = (trust["privacy_policy"] + trust["contact_info"]
                   + trust["about_page"] + trust["testimonials"]) * 25
    breakdown["trust_signals"] = round(trust_score, 1)
    items.append(("trust_signals", trust_score, 0.20))

    # -- Value proposition --------------------------------------------------
    vp = external.get("value_proposition_score")
    if vp is not None:
        breakdown["value_proposition"] = round(_clamp(vp), 1)
        items.append(("value_proposition", _clamp(vp), 0.15))
    else:
        items.append(("value_proposition", None, 0.15))

    # -- Image alt text coverage -------------------------------------------
    images = crawl.get("images", {})
    if isinstance(images, dict):
        total = images.get("total", 0)
        missing_alt = images.get("missing_alt", 0)
        if total > 0:
            coverage = ((total - missing_alt) / total) * 100
            breakdown["alt_text_coverage"] = round(coverage, 1)
            items.append(("alt_text_coverage", coverage, 0.15))
        else:
            # No images -- full marks, nothing to penalise
            breakdown["alt_text_coverage"] = 100.0
            items.append(("alt_text_coverage", 100.0, 0.15))
    else:
        items.append(("alt_text_coverage", None, 0.15))

    score, used, missing_srcs = _weighted_average(items)
    return CategoryScore(
        name="content", score=round(score, 1), weight=SCORE_WEIGHTS["content"],
        breakdown=breakdown, data_sources_used=used, data_sources_missing=missing_srcs,
    )


def _detect_trust_signals(crawl: dict, sessions: list[dict]) -> dict[str, bool]:
    """Detect trust signals from links, page content, and persona findings."""
    signals = {"privacy_policy": False, "contact_info": False,
               "about_page": False, "testimonials": False}

    # Check links text
    for link in crawl.get("links", []):
        text = (link.get("text") or "").lower()
        href = (link.get("href") or "").lower()
        if any(kw in text or kw in href for kw in ("privacy", "privacy-policy", "privacy_policy")):
            signals["privacy_policy"] = True
        if any(kw in text or kw in href for kw in ("contact", "get in touch", "reach")):
            signals["contact_info"] = True
        if any(kw in text or kw in href for kw in ("about", "about-us", "about_us")):
            signals["about_page"] = True
        if any(kw in text or kw in href for kw in ("testimonial", "review", "case-stud")):
            signals["testimonials"] = True

    # Also check from persona observations (e.g. B1 Monica checks privacy policy)
    for s in sessions:
        pa = s.get("persona_analysis", {})
        for field_name in ("form_verdict", "function_verdict", "purpose_verdict"):
            txt = (pa.get(field_name) or "").lower()
            if "privacy" in txt:
                signals["privacy_policy"] = True
            if "contact" in txt:
                signals["contact_info"] = True

    return signals


# ===================================================================
# UX  (10 %)
# ===================================================================
# Sub-metrics:
#   task_completion   35 %   average across all behavioural personas
#   chaos_survival    25 %   chaos agent crash rate
#   confusion_signals 20 %   count of confused/stuck moments
#   mobile_usability  20 %   mobile persona outcomes
# ===================================================================

def _score_ux(crawl: dict, sessions: list[dict], external: dict) -> CategoryScore:
    breakdown: dict[str, float] = {}
    items: list[tuple[str, float | None, float]] = []

    # -- Count how many sessions are dominated by tool limitations ----------
    total_tool_lims = sum(len(s.get("tool_limitations", [])) for s in sessions)
    total_real_issues = sum(
        len([f for f in s.get("findings", []) if f.get("is_site_bug", True)])
        for s in sessions
    )
    tool_lim_dominant = total_tool_lims > total_real_issues * 2 and total_tool_lims > 5

    # -- Task completion rate (all non-chaos behavioural personas) ----------
    behavioural = [s for s in sessions
                   if s.get("persona", {}).get("category") in ("behavioral", "portfolio", "demographic")]
    if behavioural:
        raw_completed = sum(1 for s in behavioural if s.get("task_completed"))
        # When tool limitations dominate, credit partial completions
        adjusted_completed = raw_completed
        if tool_lim_dominant:
            for s in behavioural:
                if not s.get("task_completed"):
                    tool_lims = len(s.get("tool_limitations", []))
                    real_issues = [f for f in s.get("findings", []) if f.get("is_site_bug", True)]
                    if tool_lims > 0 and len(real_issues) == 0:
                        adjusted_completed += 0.8  # nearly full credit
                    elif tool_lims > 0 and len(real_issues) <= 1:
                        adjusted_completed += 0.5
        rate = (adjusted_completed / len(behavioural)) * 100
        breakdown["task_completion"] = round(rate, 1)
        items.append(("task_completion", rate, 0.35))
    else:
        items.append(("task_completion", None, 0.35))

    # -- Chaos agent survival ----------------------------------------------
    chaos = [s for s in sessions if s.get("persona", {}).get("category") == "chaos"]
    if chaos:
        crashes = 0
        for s in chaos:
            errs = s.get("errors", [])
            if any("crash" in str(e).lower() for e in errs):
                crashes += 1
            if s.get("outcome") == "blocked" and not s.get("tool_limitations"):
                crashes += 1
        survival = _clamp(100 - crashes * 20)
        breakdown["chaos_survival"] = round(survival, 1)
        items.append(("chaos_survival", survival, 0.25))
    else:
        items.append(("chaos_survival", None, 0.25))

    # -- Confusion signals --------------------------------------------------
    confusion_count = 0
    for s in sessions:
        for step in s.get("steps", []):
            obs = (step.get("observation") or "").lower()
            action = (step.get("action") or "").lower()
            if action == "stuck":
                confusion_count += 1
            if any(kw in obs for kw in ("confus", "don't understand", "where is", "can't find", "no idea")):
                confusion_count += 1
        for de in s.get("dead_ends", []):
            confusion_count += 1
    confusion_score = _clamp(100 - confusion_count * 10)
    breakdown["confusion_signals"] = round(confusion_score, 1)
    items.append(("confusion_signals", confusion_score, 0.20))

    # -- Mobile usability ---------------------------------------------------
    mobile = [s for s in sessions
              if _is_mobile_persona(s)]
    if mobile:
        mobile_completed = sum(1 for s in mobile if s.get("task_completed"))
        mobile_rate = (mobile_completed / len(mobile)) * 100
        breakdown["mobile_usability"] = round(mobile_rate, 1)
        items.append(("mobile_usability", mobile_rate, 0.20))
    else:
        items.append(("mobile_usability", None, 0.20))

    score, used, missing = _weighted_average(items)
    return CategoryScore(
        name="ux", score=round(score, 1), weight=SCORE_WEIGHTS["ux"],
        breakdown=breakdown, data_sources_used=used, data_sources_missing=missing,
    )


def _is_mobile_persona(session: dict) -> bool:
    """Check if persona uses a mobile viewport."""
    p = session.get("persona", {})
    ts = p.get("task_style", "")
    if ts == "mobile_thumb":
        return True
    pid = p.get("id", "")
    return pid in ("D1", "D3", "D4", "P3")  # known mobile personas


# ===================================================================
# PUBLIC API
# ===================================================================

def _compute_external_signal_floor(ext: dict) -> float:
    """Compute a minimum score floor based on strong external API signals.

    When external APIs report excellent data (high Lighthouse scores,
    A+ Observatory grade, valid SSL, mature domain), the site is clearly
    well-built. This floor prevents persona tool_limitations from dragging
    the score below what the external data objectively shows.

    Returns 0.0 if no strong signals, or up to ~85–90 for top sites.
    """
    if not ext:
        return 0.0

    signals = []

    # PageSpeed / Lighthouse performance
    psi = ext.get("pagespeed", {})
    if psi:
        perf = psi.get("performance")
        a11y = psi.get("accessibility")
        seo = psi.get("seo")
        if perf is not None:
            p = perf * 100 if perf <= 1 else perf
            if p >= 85:
                signals.append(p)
        if a11y is not None:
            a = a11y * 100 if a11y <= 1 else a11y
            if a >= 85:
                signals.append(a)
        if seo is not None:
            s = seo * 100 if seo <= 1 else seo
            if s >= 85:
                signals.append(s)

    # Observatory grade
    obs = ext.get("observatory", {})
    if obs:
        grade = obs.get("grade", "")
        grade_scores = {"A+": 98, "A": 93, "A-": 88, "B+": 83}
        if grade in grade_scores:
            signals.append(grade_scores[grade])

    # SSL validity
    ssl_data = ext.get("ssl", {})
    if ssl_data and ssl_data.get("valid"):
        days = ssl_data.get("days_remaining", 0)
        if days and days > 60:
            signals.append(90)  # strong positive

    # Domain maturity
    domain_years = ext.get("domain_age_years")
    if domain_years is not None and domain_years >= 10:
        signals.append(85)  # well-established domain

    # Safe browsing clean
    sb = ext.get("safe_browsing")
    if sb == "clean" or sb is True:
        signals.append(88)

    if len(signals) < 3:
        return 0.0  # not enough strong signals to establish a floor

    # Floor = average of strong signals, dampened slightly
    avg = sum(signals) / len(signals)
    # Floor is avg * 0.85 — gives a floor of ~72-78 for sites scoring 85+ across the board
    floor = avg * 0.85
    return round(floor, 1)


def calculate_scores(
    crawl_data: dict,
    agent_results: list[dict],
    external_api_data: dict | None = None,
) -> CompositeScore:
    """Calculate composite scores from all collected pipeline data.

    Parameters
    ----------
    crawl_data : dict
        Output of ``crawl_site()`` -- page metadata, axe violations, SEO, etc.
    agent_results : dict
        List of per-persona session results from ``run_agent_local()``.
    external_api_data : dict | None
        Optional dict with keys like ``pagespeed``, ``observatory``,
        ``safe_browsing``, ``ssl``, ``dns_auth``, ``domain_age_years``,
        ``green_hosting``, ``core_web_vitals``, ``readability``,
        ``grammar_errors``, ``value_proposition_score``.

    Returns
    -------
    CompositeScore
        Dataclass with overall_score, letter_grade, and per-category details.
    """
    ext = external_api_data or {}

    categories = [
        _score_accessibility(crawl_data, agent_results, ext),
        _score_seo(crawl_data, agent_results, ext),
        _score_performance(crawl_data, agent_results, ext),
        _score_security(crawl_data, agent_results, ext),
        _score_content(crawl_data, agent_results, ext),
        _score_ux(crawl_data, agent_results, ext),
    ]

    # Weighted overall from category scores
    raw_overall = sum(c.score * c.weight for c in categories)
    raw_overall = round(_clamp(raw_overall), 1)

    # Apply external signal floor: if strong external data says the site is
    # excellent, don't let tool_limitation-heavy persona results drag it down
    ext_floor = _compute_external_signal_floor(ext)
    overall = max(raw_overall, ext_floor)

    # Also check if tool_limitations dominated — boost slightly if site has
    # strong signals but low persona completion
    total_tool_lims = sum(len(s.get("tool_limitations", [])) for s in agent_results)
    total_real_issues = sum(
        len([f for f in s.get("findings", []) if f.get("is_site_bug", True)])
        for s in agent_results
    )
    if total_tool_lims > total_real_issues * 3 and ext_floor > 0:
        # Heavy tool limitations + strong external signals → site is better than we measured
        boost = min(8, total_tool_lims // 5)
        overall = min(100, overall + boost)

    overall = round(_clamp(overall), 1)

    log.info("Composite score: %.1f (%s) [raw=%.1f, floor=%.1f] | %s",
             overall, get_letter_grade(overall), raw_overall, ext_floor,
             ", ".join(f"{c.name}={c.score:.0f}" for c in categories))

    return CompositeScore(
        overall_score=overall,
        letter_grade=get_letter_grade(overall),
        categories=categories,
        calculated_at=datetime.now(timezone.utc).isoformat(),
    )
