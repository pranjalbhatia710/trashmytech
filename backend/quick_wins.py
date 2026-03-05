"""trashmy.tech -- Quick Wins analyzer.

Examines all findings, scores, and raw data to identify the top actionable
fixes ranked by estimated score impact.  Each quick win reports which scoring
category it affects, the expected point gain in that category and the
weighted impact on the overall composite score.

Returns at most 5 quick wins sorted by overall impact descending.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, asdict
from typing import Any

from scoring import SCORE_WEIGHTS, _clamp

log = logging.getLogger("trashmy.quick_wins")

# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class QuickWin:
    action: str                    # Human-readable action
    category: str                  # Scoring category affected
    estimated_points: float        # Point gain in that category (0-100 scale)
    estimated_overall_impact: float  # Weighted impact on overall score
    difficulty: str                # "easy" | "medium" | "hard"
    details: str                   # Implementation guidance
    affected_personas: list[str]   # Persona names who would benefit

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Individual detectors
# Each returns a QuickWin or None.
# ---------------------------------------------------------------------------

def _detect_missing_alt_text(crawl: dict, sessions: list[dict], scores: Any) -> QuickWin | None:
    """Missing alt text on images hurts accessibility."""
    images = crawl.get("images", {})
    if not isinstance(images, dict):
        return None
    missing = images.get("missing_alt", 0)
    total = images.get("total", 0)
    if missing <= 0 or total <= 0:
        return None

    # Estimate: each missing alt deducts ~3 pts from the alt_text_coverage sub-metric
    # which has 15% weight inside accessibility (25% overall)
    coverage_now = ((total - missing) / total) * 100
    coverage_after = 100.0
    delta = (coverage_after - coverage_now) * 0.15  # sub-weight inside accessibility
    category_gain = min(delta, 15)

    a11y_personas = [s.get("persona", {}).get("name", "?") for s in sessions
                     if s.get("persona", {}).get("category") == "accessibility"]

    return QuickWin(
        action=f"Add alt text to {missing} image{'s' if missing != 1 else ''}",
        category="accessibility",
        estimated_points=round(category_gain, 1),
        estimated_overall_impact=round(category_gain * SCORE_WEIGHTS["accessibility"], 1),
        difficulty="easy",
        details=(
            f"{missing} of {total} images are missing alt attributes. "
            "Add descriptive alt text to each image. Use empty alt=\"\" only for "
            "purely decorative images."
        ),
        affected_personas=a11y_personas[:5],
    )


def _detect_missing_csp(crawl: dict, sessions: list[dict], external: dict) -> QuickWin | None:
    """Missing Content-Security-Policy header."""
    obs = external.get("observatory", {})
    grade = obs.get("grade", "")
    tests = obs.get("tests", {})

    # If Observatory isn't available, check if we know CSP is missing from findings
    csp_missing = False
    if tests:
        csp_test = tests.get("content-security-policy", {})
        if csp_test and not csp_test.get("pass", True):
            csp_missing = True
    elif not obs:
        # No Observatory data -- skip this detector
        return None

    # Also infer from grade: D or F likely means missing security headers
    if not csp_missing and grade in ("D+", "D", "D-", "F"):
        csp_missing = True

    if not csp_missing:
        return None

    return QuickWin(
        action="Add Content-Security-Policy header",
        category="security",
        estimated_points=8.0,
        estimated_overall_impact=round(8.0 * SCORE_WEIGHTS["security"], 1),
        difficulty="medium",
        details=(
            "Add a Content-Security-Policy HTTP header to prevent XSS and data injection. "
            "Start with: Content-Security-Policy: default-src 'self'; script-src 'self'; "
            "style-src 'self' 'unsafe-inline'"
        ),
        affected_personas=[],
    )


def _detect_low_contrast(crawl: dict, sessions: list[dict], scores: Any) -> QuickWin | None:
    """Low contrast text issues."""
    count = 0
    for v in crawl.get("accessibility_violations", []):
        vid = (v.get("id") or "").lower()
        if "contrast" in vid:
            count += v.get("nodes_count", 1) or 1

    for s in sessions:
        for f in s.get("findings", []):
            t = (f.get("title") or "").lower()
            d = (f.get("detail") or "").lower()
            if "contrast" in t or "contrast" in d:
                count += 1

    if count == 0:
        return None

    gain = min(count * 3, 15)  # cap at 15 pts

    return QuickWin(
        action=f"Fix {count} low-contrast text element{'s' if count != 1 else ''}",
        category="accessibility",
        estimated_points=round(gain, 1),
        estimated_overall_impact=round(gain * SCORE_WEIGHTS["accessibility"], 1),
        difficulty="easy",
        details=(
            f"{count} elements have insufficient colour contrast. "
            "Ensure a minimum 4.5:1 contrast ratio for normal text and 3:1 for large text (WCAG AA)."
        ),
        affected_personas=["Carlos Mendes", "Margaret Liu"],
    )


def _detect_missing_meta_description(crawl: dict, **_kw) -> QuickWin | None:
    seo = crawl.get("seo", {})
    if seo.get("has_meta_description"):
        return None

    return QuickWin(
        action="Add a meta description tag",
        category="seo",
        estimated_points=8.0,
        estimated_overall_impact=round(8.0 * SCORE_WEIGHTS["seo"], 1),
        difficulty="easy",
        details=(
            "The page is missing <meta name=\"description\" content=\"...\">. "
            "Write a 150-160 character description summarising the page content. "
            "This improves search engine snippets and social sharing previews."
        ),
        affected_personas=[],
    )


def _detect_missing_structured_data(crawl: dict, **_kw) -> QuickWin | None:
    ai_seo = crawl.get("ai_seo", {})
    if ai_seo.get("structured_data"):
        return None

    return QuickWin(
        action="Add JSON-LD structured data markup",
        category="seo",
        estimated_points=10.0,
        estimated_overall_impact=round(10.0 * SCORE_WEIGHTS["seo"], 1),
        difficulty="medium",
        details=(
            "No JSON-LD structured data found. Add a <script type=\"application/ld+json\"> "
            "block with appropriate schema (WebSite, Person, Organization, Article) to help "
            "search engines and AI crawlers understand your content."
        ),
        affected_personas=[],
    )


def _detect_heading_issues(crawl: dict, **_kw) -> QuickWin | None:
    headings = crawl.get("heading_hierarchy", {})
    h1_count = headings.get("h1_count", 0)
    skips = headings.get("skips", [])

    issues = []
    if h1_count == 0:
        issues.append("no <h1> element found")
    elif h1_count > 1:
        issues.append(f"{h1_count} <h1> elements (should be exactly 1)")
    if skips:
        skip_descs = [f"{s['from']}->{s['to']}" for s in skips[:3]]
        issues.append(f"heading level skips: {', '.join(skip_descs)}")

    if not issues:
        return None

    gain = 6.0 if h1_count == 0 else 4.0

    return QuickWin(
        action="Fix heading hierarchy issues",
        category="content",
        estimated_points=round(gain, 1),
        estimated_overall_impact=round(gain * SCORE_WEIGHTS["content"], 1),
        difficulty="easy",
        details=(
            f"Issues found: {'; '.join(issues)}. "
            "Use exactly one <h1> for the main title, then <h2> for sections, "
            "<h3> for sub-sections, etc. Never skip levels."
        ),
        affected_personas=["Priya Sharma", "Angela Rivera"],
    )


def _detect_large_images(crawl: dict, sessions: list[dict], **_kw) -> QuickWin | None:
    """Detect unoptimised images based on slow load or performance findings."""
    # Look for performance findings mentioning images
    image_perf_issues = 0
    for s in sessions:
        for f in s.get("findings", []):
            t = (f.get("title") or "").lower()
            d = (f.get("detail") or "").lower()
            if any(kw in t or kw in d for kw in ("slow", "image", "large", "load")):
                image_perf_issues += 1

    load_ms = crawl.get("page_load_time_ms", 0)
    images_total = crawl.get("images", {}).get("total", 0) if isinstance(crawl.get("images"), dict) else 0

    # Heuristic: slow load + many images suggests unoptimised assets
    if load_ms and load_ms > 3000 and images_total > 3:
        gain = 7.0
    elif image_perf_issues > 0:
        gain = 5.0
    else:
        return None

    return QuickWin(
        action=f"Compress and optimise {images_total} images",
        category="performance",
        estimated_points=round(gain, 1),
        estimated_overall_impact=round(gain * SCORE_WEIGHTS["performance"], 1),
        difficulty="easy",
        details=(
            f"Page load time is {load_ms}ms with {images_total} images. "
            "Convert images to WebP/AVIF, use responsive srcset, and lazy-load "
            "below-the-fold images to reduce load time."
        ),
        affected_personas=["Ruth Kamau", "Riley Chen"],
    )


def _detect_missing_dmarc(external: dict, **_kw) -> QuickWin | None:
    dns = external.get("dns_auth", {})
    if not dns:
        return None
    if dns.get("dmarc_present"):
        return None

    return QuickWin(
        action="Add a DMARC DNS record",
        category="security",
        estimated_points=6.0,
        estimated_overall_impact=round(6.0 * SCORE_WEIGHTS["security"], 1),
        difficulty="medium",
        details=(
            "No DMARC record found for this domain. Add a TXT record at "
            "_dmarc.yourdomain.com with v=DMARC1; p=quarantine; to prevent "
            "email spoofing and improve domain trustworthiness."
        ),
        affected_personas=[],
    )


def _detect_grammar_errors(external: dict, **_kw) -> QuickWin | None:
    count = external.get("grammar_errors")
    if count is None or count <= 0:
        return None

    gain = min(count * 5, 15)

    return QuickWin(
        action=f"Fix {count} grammar/spelling error{'s' if count != 1 else ''}",
        category="content",
        estimated_points=round(gain, 1),
        estimated_overall_impact=round(gain * SCORE_WEIGHTS["content"], 1),
        difficulty="easy",
        details=(
            f"{count} grammar or spelling errors detected in page text. "
            "Proofread all visible copy. Consider using a tool like Grammarly."
        ),
        affected_personas=["Sam Brennan", "Fatima Al-Rashid"],
    )


def _detect_missing_trust_signals(crawl: dict, sessions: list[dict], **_kw) -> QuickWin | None:
    """Check for missing privacy policy, contact info, etc."""
    from scoring import _detect_trust_signals

    signals = _detect_trust_signals(crawl, sessions)
    missing = [name.replace("_", " ") for name, present in signals.items() if not present]

    if not missing:
        return None

    gain = len(missing) * 5  # ~5 pts per missing signal

    return QuickWin(
        action=f"Add missing trust signals: {', '.join(missing)}",
        category="content",
        estimated_points=round(min(gain, 20), 1),
        estimated_overall_impact=round(min(gain, 20) * SCORE_WEIGHTS["content"], 1),
        difficulty="medium",
        details=(
            f"Missing: {', '.join(missing)}. "
            "These signals build user trust. Add a privacy policy page, "
            "visible contact information, an about section, and social proof."
        ),
        affected_personas=["Monica Reeves", "Diane Kowalski"],
    )


def _detect_axe_critical(crawl: dict, sessions: list[dict], **_kw) -> QuickWin | None:
    """Critical/serious axe-core violations that are high-impact fixes."""
    violations = crawl.get("accessibility_violations", [])
    critical = [v for v in violations if v.get("impact") in ("critical", "serious")]
    if not critical:
        return None

    total_nodes = sum(v.get("nodes_count", 1) or 1 for v in critical)
    # Each critical deducts 10pts, serious 5pts from axe sub-score (25% of a11y)
    gain_raw = sum(
        (10 if v.get("impact") == "critical" else 5) * min(v.get("nodes_count", 1) or 1, 5)
        for v in critical
    )
    gain = min(gain_raw * 0.25, 20)  # scaled by axe sub-weight, capped

    top_ids = [v.get("id", "?") for v in critical[:3]]

    return QuickWin(
        action=f"Fix {len(critical)} critical accessibility violation{'s' if len(critical) != 1 else ''}",
        category="accessibility",
        estimated_points=round(gain, 1),
        estimated_overall_impact=round(gain * SCORE_WEIGHTS["accessibility"], 1),
        difficulty="medium",
        details=(
            f"{len(critical)} critical/serious axe-core violations across {total_nodes} elements: "
            f"{', '.join(top_ids)}. "
            "Fix these first -- they block assistive technology users entirely."
        ),
        affected_personas=["Priya Sharma", "James Whitfield", "Angela Rivera"],
    )


def _detect_missing_h1(crawl: dict, **_kw) -> QuickWin | None:
    seo = crawl.get("seo", {})
    if seo.get("has_h1"):
        return None
    return QuickWin(
        action="Add a primary <h1> heading",
        category="seo",
        estimated_points=6.0,
        estimated_overall_impact=round(6.0 * SCORE_WEIGHTS["seo"], 1),
        difficulty="easy",
        details=(
            "The page has no <h1> element. Search engines and screen readers "
            "use <h1> as the primary page title. Add one descriptive <h1>."
        ),
        affected_personas=["Priya Sharma"],
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

MAX_QUICK_WINS = 5


def generate_quick_wins(
    scores: Any,
    crawl_data: dict,
    agent_results: list[dict],
    external_api_data: dict | None = None,
) -> list[dict]:
    """Analyse all findings and return the top quick wins sorted by impact.

    Parameters
    ----------
    scores : CompositeScore
        The computed composite scores (used for context but detectors mostly
        work from raw data).
    crawl_data : dict
        Crawler output.
    agent_results : list[dict]
        Per-persona session results.
    external_api_data : dict | None
        External API results (Observatory, PageSpeed, etc.).

    Returns
    -------
    list[dict]
        Top 5 quick wins as dicts, sorted by ``estimated_overall_impact`` desc.
    """
    ext = external_api_data or {}
    candidates: list[QuickWin] = []

    # Run every detector -- each returns QuickWin | None
    detectors = [
        lambda: _detect_missing_alt_text(crawl_data, agent_results, scores),
        lambda: _detect_missing_csp(crawl_data, agent_results, ext),
        lambda: _detect_low_contrast(crawl_data, agent_results, scores),
        lambda: _detect_missing_meta_description(crawl_data),
        lambda: _detect_missing_structured_data(crawl_data),
        lambda: _detect_heading_issues(crawl_data),
        lambda: _detect_large_images(crawl_data, agent_results),
        lambda: _detect_missing_dmarc(ext),
        lambda: _detect_grammar_errors(ext),
        lambda: _detect_missing_trust_signals(crawl_data, agent_results),
        lambda: _detect_axe_critical(crawl_data, agent_results),
        lambda: _detect_missing_h1(crawl_data),
    ]

    for detect in detectors:
        try:
            result = detect()
            if result is not None:
                candidates.append(result)
        except Exception as exc:
            log.warning("Quick-win detector failed: %s", exc)

    # Sort by overall impact descending, then by difficulty (easy first)
    difficulty_order = {"easy": 0, "medium": 1, "hard": 2}
    candidates.sort(
        key=lambda qw: (-qw.estimated_overall_impact, difficulty_order.get(qw.difficulty, 1)),
    )

    top = candidates[:MAX_QUICK_WINS]

    if top:
        log.info("Quick wins: %s", " | ".join(
            f"{qw.action} (+{qw.estimated_overall_impact} overall)" for qw in top
        ))

    return [qw.to_dict() for qw in top]
