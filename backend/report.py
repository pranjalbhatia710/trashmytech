"""trashmy.tech — Report generator using Gemini 2.5 Pro with deep thinking + structured JSON."""

import json
import os
import asyncio
import traceback

from google import genai
from google.genai.types import GenerateContentConfig

from annotator import annotate_overview_screenshot

# ---------------------------------------------------------------------------
# Model strategy — one API key, two models
# ---------------------------------------------------------------------------
REPORT_MODEL = "gemini-2.5-pro"                # max reasoning for scored report
ANNOTATION_MODEL = "gemini-2.5-flash"          # fast vision for bounding boxes

# ---------------------------------------------------------------------------
# System prompt — concise, clinical, calibrated
# ---------------------------------------------------------------------------
GEMINI_REPORT_PROMPT = """You are the report engine for trashmy.tech. You produce concise, data-driven website audit reports.

VOICE: Direct. Clinical. Like a senior consultant who bills $500/hour and doesn't waste words. No filler. No "it appears that" or "it is worth noting." State facts and move on.

SCORING RULES:
- Only count findings with type "ux_failure" or is_site_bug=true against the score. Findings with type "tool_limitation" mean our testing tool (Playwright) couldn't interact, NOT that the site is broken. A real user likely can use elements our tool cannot.
- axe-core violations are always real. Count them.
- Measured values are always real (element sizes, timing, contrast ratios). Count them.
- If >50% of agents hit tool_limitation, set confidence to "low" and say "partially tested" -- don't pretend you know the full picture.
- CALIBRATION ANCHORS (use these as reference points):
  * 90-100: Near-perfect. Fast, accessible, no real issues found. Very rare.
  * 75-89: Polished professional site (Apple, Google, Stripe). Fast load, clean UX, but has accessibility gaps like missing alt text or small targets. These are GOOD sites with room to improve.
  * 60-74: Decent site with real usability problems. Navigation confusion, broken flows, multiple a11y failures.
  * 40-59: Significant problems. Users struggle to complete tasks. Major a11y violations.
  * 0-39: Fundamentally broken. Pages crash, forms don't submit, critical content missing.
- Missing image alt text alone should NOT drop a polished site below 70. It's a MEDIUM issue, not a site-killer.
- Fast load time (<2s) is a strong positive signal. Weight it.
- NEVER score below 40 based only on tool_limitation findings.
- The base_score provided is a starting calibration. You may adjust ±15 points based on your analysis, but explain why.

REPORT STRUCTURE (follow this exactly):

1. SCORE: Single number 0-100. One sentence explaining why. Confidence level.

2. THE THIRTY-SECOND VERSION: 2-3 sentences max. A busy CEO reads this and knows whether to panic or not. Reference the single most important finding and the single best thing about the site.

3. SIX SCORES (one line each):
   - Accessibility: [score]/100 -- [one sentence with specific data point]
   - Security: [score]/100 -- [one sentence]
   - Usability: [score]/100 -- [one sentence]
   - Mobile: [score]/100 -- [one sentence]
   - Performance: [score]/100 -- [one sentence]
   - AI Readability: [score]/100 -- [one sentence about GEO/AI SEO readiness]

AI READABILITY scoring guidance:
- 90-100: Has JSON-LD, OG tags, llms.txt, semantic HTML, structured data, sitemap, no AI bots blocked
- 70-89: Most signals present but missing 1-2 key items (like llms.txt or structured data)
- 50-69: Basic SEO present but poor AI discoverability (no structured data, limited semantic HTML)
- 0-49: Minimal signals — AI crawlers will struggle to understand and cite this content

4. WHAT'S GOOD (2-4 bullets, each 1 sentence):
   Real things that work. Fast load? Clean layout? Good form validation? Say it. This makes the report credible. Always find something.

5. WHAT'S BROKEN (2-5 items, ranked by severity):
   Each item:
   - Severity tag: CRITICAL / HIGH / MEDIUM / LOW
   - One-line title
   - One-line description with measured evidence
   - Who it affects: list persona names
   - One-line fix

6. PERSONA VERDICTS (for each persona that ran):
   Format: [Name] -- [outcome] -- [would recommend: yes/no]
   Then 1-2 sentences of narrative ONLY if something interesting happened. Skip boring completions. Focus on dramatic moments. If a persona was blocked by tool_limitation, say: "[Name] could not be fully tested due to testing tool limitations" -- do NOT blame the site.

7. TOP 3 RECOMMENDATIONS (ordered by impact):
   Each: one sentence describing what to do + estimated user impact percentage

RULES FOR NARRATIVES:
- Reference specific step numbers: "At step 4, Margaret clicked..."
- Include measured values: "28x28px", "3.2 second load", "Tab pressed 12 times"
- Don't repeat the same finding across multiple personas -- mention it once, list all affected personas
- Keep persona narratives to 2 sentences max unless genuinely critical

OUTPUT: Valid JSON matching the schema. No markdown. No preamble."""

# ---------------------------------------------------------------------------
# Report JSON schema
# ---------------------------------------------------------------------------
REPORT_SCHEMA = """{
  "overall_score": 0,
  "score_reasoning": "",
  "confidence": "high|moderate|low",

  "thirty_second_summary": "",

  "category_scores": {
    "accessibility": {"score": 0, "one_liner": ""},
    "security": {"score": 0, "one_liner": ""},
    "usability": {"score": 0, "one_liner": ""},
    "mobile": {"score": 0, "one_liner": ""},
    "performance": {"score": 0, "one_liner": ""},
    "ai_readability": {"score": 0, "one_liner": ""}
  },

  "whats_good": [
    {"title": "", "detail": "", "benefited": ["persona names"]}
  ],

  "whats_broken": [
    {
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "title": "",
      "description": "",
      "affected_personas": ["names"],
      "fix": "",
      "screenshot_step": null
    }
  ],

  "persona_verdicts": [
    {
      "persona_id": "",
      "name": "",
      "category": "",
      "outcome": "completed|struggled|blocked|not_tested",
      "would_recommend": true,
      "time_seconds": 0,
      "narrative": "",
      "key_screenshot_step": null
    }
  ],

  "recommendations": [
    {"rank": 1, "action": "", "impact": ""}
  ],

  "testing_notes": {
    "total_personas": 0,
    "fully_tested": 0,
    "partially_tested": 0,
    "real_findings": 0,
    "tool_limitations": 0,
    "axe_violations": 0
  }
}"""


# ---------------------------------------------------------------------------
# Session classification
# ---------------------------------------------------------------------------
def _classify_sessions(sessions: list[dict]) -> dict:
    total = len(sessions)
    completed = sum(1 for s in sessions if s.get("outcome") == "completed")
    blocked = [s for s in sessions if s.get("outcome") == "blocked"]
    struggled = [s for s in sessions if s.get("outcome") == "struggled"]
    fine = [s for s in sessions if s.get("outcome") == "completed"]

    return {
        "total": total, "completed": completed,
        "blocked": blocked, "struggled": struggled, "fine": fine,
    }


def _compute_base_score(crawl_data: dict, stats: dict, sessions: list[dict]) -> int:
    """Compute calibrated base score excluding tool limitations."""
    total = stats["total"] or 1

    # Count real vs tool issues
    total_tool_lims = sum(len(s.get("tool_limitations", [])) for s in sessions)
    total_real = sum(
        len([f for f in s.get("findings", []) if f.get("is_site_bug", True)])
        for s in sessions
    )

    # Adjusted completion rate — be generous when tool limitations dominate
    adjusted_completed = stats["completed"]
    for s in sessions:
        if s.get("outcome") != "completed":
            tool_lims = len(s.get("tool_limitations", []))
            real_issues = [f for f in s.get("findings", []) if f.get("is_site_bug", True)]
            critical_real = len([f for f in real_issues if f.get("type") in ("critical", "major")])
            if tool_lims > 0 and critical_real == 0:
                # Agent was mostly blocked by our tool, not the site
                adjusted_completed += 0.7
            elif tool_lims > 0 and critical_real <= 1:
                adjusted_completed += 0.4
    completion_rate = adjusted_completed / total

    # Completion: 0-40 points
    completion_points = completion_rate * 40

    # Accessibility: 0-30 points
    violations = crawl_data.get("accessibility_violations", [])
    critical_v = sum(1 for v in violations if v.get("impact") == "critical")
    serious_v = sum(1 for v in violations if v.get("impact") == "serious")
    moderate_v = sum(1 for v in violations if v.get("impact") == "moderate")
    minor_v = len(violations) - critical_v - serious_v - moderate_v
    a11y_deductions = critical_v * 6 + serious_v * 3 + moderate_v * 1.5 + minor_v * 0.5
    a11y_points = max(5, 30 - int(a11y_deductions))
    if len(violations) == 0:
        a11y_points = 30

    # Performance: 0-15 points
    load_time = crawl_data.get("page_load_time_ms") or 5000
    if load_time < 1000: perf_points = 15
    elif load_time < 2000: perf_points = 12
    elif load_time < 3000: perf_points = 10
    elif load_time < 5000: perf_points = 5
    else: perf_points = 2

    # Content quality: 0-15 points
    seo = crawl_data.get("seo", {})
    content_points = 0
    if seo.get("has_h1"): content_points += 4
    if seo.get("has_meta_description"): content_points += 4
    if seo.get("has_viewport"): content_points += 4
    if seo.get("has_lang"): content_points += 2
    if seo.get("has_canonical"): content_points += 1

    overall = round(completion_points + a11y_points + perf_points + content_points)

    # Bump for tool-limitation-heavy runs — don't punish the site for our tool's failures
    if total_tool_lims > total_real * 2:
        # Tool limitations dominate — site is probably better than we can measure
        bump = min(12, total_tool_lims // 4)
        overall = min(100, overall + bump)

    return min(overall, 100)


# ---------------------------------------------------------------------------
# Main report generation
# ---------------------------------------------------------------------------
async def generate_report(crawl_data: dict, sessions: list[dict]) -> dict:
    """Generate report using Gemini 3.1 Pro with thinking + structured JSON."""
    stats = _classify_sessions(sessions)
    base_score = _compute_base_score(crawl_data, stats, sessions)

    # Separate real findings from tool limitations
    real_findings = []
    tool_limitations = []
    for s in sessions:
        for f in s.get("findings", []):
            if f.get("is_site_bug", True):
                real_findings.append(f)
            else:
                tool_limitations.append(f)
        for tl in s.get("tool_limitations", []):
            tool_limitations.append(tl)

    # Summarize sessions for prompt — include ALL step data for accuracy
    def _summarize_session(s):
        p = s.get("persona", {})
        steps_summary = []
        all_console_errors = []
        all_network_errors = []
        for step in s.get("steps", [])[:20]:
            step_data = {
                "step": step.get("step_number"),
                "action": step.get("action"),
                "target": step.get("target_element", "")[:80],
                "result": step.get("result", "")[:150],
                "target_size": step.get("target_size_px"),
                "timestamp_ms": step.get("timestamp_ms"),
                "click_strategy": step.get("click_strategy"),
                "page_url_after": step.get("page_url_after", ""),
                "reasoning": step.get("reasoning", "")[:100],
                "observation": step.get("observation", "")[:150],
            }
            fc = step.get("failure_classification")
            if fc:
                step_data["failure_type"] = fc.get("type", "")
                step_data["is_site_bug"] = fc.get("is_site_bug", False)
                step_data["failure_reason"] = fc.get("reason", "")[:100]

            # Collect console/network errors per step
            console_errs = step.get("console_errors_new", [])
            network_errs = step.get("network_errors_new", [])
            if console_errs:
                step_data["console_errors"] = console_errs[:3]
                all_console_errors.extend(console_errs)
            if network_errs:
                step_data["network_errors"] = [
                    {"url": e.get("url", "")[:80], "status": e.get("status")}
                    for e in network_errs[:3]
                ]
                all_network_errors.extend(network_errs)

            steps_summary.append(step_data)

        return {
            "persona_id": p.get("id"),
            "name": p.get("name"),
            "age": p.get("age"),
            "category": p.get("category"),
            "description": p.get("description"),
            "outcome": s.get("outcome"),
            "task_completed": s.get("task_completed", False),
            "total_time_ms": s.get("total_time_ms", 0),
            "steps_taken": s.get("steps_taken", len(steps_summary)),
            "steps": steps_summary,
            "findings": [f for f in s.get("findings", [])[:15] if f.get("is_site_bug", True)],
            "tool_limitations_count": len(s.get("tool_limitations", [])),
            "form_test_results": s.get("form_test_results", [])[:10],
            "dead_ends": s.get("dead_ends", [])[:5],
            "errors": s.get("errors", [])[:5],
            "console_errors_total": len(all_console_errors),
            "console_errors_sample": all_console_errors[:5],
            "network_errors_total": len(all_network_errors),
            "network_errors_sample": [
                {"url": e.get("url", "")[:80], "status": e.get("status")}
                for e in all_network_errors[:5]
            ],
        }

    # Build payload
    violations = crawl_data.get("accessibility_violations", [])
    images = crawl_data.get("images", {})
    if not isinstance(images, dict):
        images = {"total": 0, "missing_alt": 0}

    payload = json.dumps({
        "base_score": base_score,
        "url": crawl_data.get("url", ""),
        "crawl_summary": {
            "page_title": crawl_data.get("title", ""),
            "load_time_ms": crawl_data.get("page_load_time_ms") or 0,
            "links_count": len(crawl_data.get("links", [])),
            "forms_count": len(crawl_data.get("forms", [])),
            "buttons_count": len(crawl_data.get("buttons", [])),
            "images_total": images.get("total", 0),
            "images_missing_alt": images.get("missing_alt", 0),
            "seo": crawl_data.get("seo", {}),
            "heading_hierarchy": crawl_data.get("heading_hierarchy", {}),
            "focus_indicators": crawl_data.get("focus_indicators", {}),
            "interactive_elements_count": crawl_data.get("interactive_elements_count", 0),
            "accessibility_violations": [{
                "id": v.get("id"),
                "impact": v.get("impact"),
                "description": v.get("description"),
                "help": v.get("help"),
                "nodes_count": v.get("nodes_count"),
            } for v in violations[:25]],
            "accessibility_violations_total": len(violations),
            "console_errors": crawl_data.get("console_errors", [])[:10],
            "ai_seo": crawl_data.get("ai_seo", {}),
        },
        "tool_limitation_note": (
            f"{len(tool_limitations)} findings were tool limitations (Playwright couldn't interact). "
            f"{len(real_findings)} findings were real UX issues. "
            "Score based on real findings only. NEVER score below 40 on tool_limitation alone."
        ),
        "sessions": [_summarize_session(s) for s in sessions],
    }, default=str)

    # Stats for response
    raw_stats = {
        "total": stats["total"],
        "completed": stats["completed"],
        "blocked": len(stats["blocked"]),
        "struggled": len(stats["struggled"]),
        "blocked_names": [s.get("persona", {}).get("name", "?") for s in stats["blocked"]],
        "struggled_names": [s.get("persona", {}).get("name", "?") for s in stats["struggled"]],
        "fine_names": [s.get("persona", {}).get("name", "?") for s in stats["fine"]],
    }

    # Build report shell
    report = {"score": {"overall": base_score}, "stats": raw_stats}

    try:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            report["error"] = "GEMINI_API_KEY not set"
            return report

        client = genai.Client(api_key=api_key)

        prompt = (
            f"REPORT SCHEMA:\n{REPORT_SCHEMA}\n\n"
            f"TEST DATA:\n{payload}"
        )

        # Gemini 3.1 Pro with thinking + structured JSON output
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=REPORT_MODEL,
            contents=prompt,
            config=GenerateContentConfig(
                system_instruction=GEMINI_REPORT_PROMPT,
                response_mime_type="application/json",
                thinking_config={"thinking_budget": 16384},
                max_output_tokens=16000,
            ),
        )

        raw = response.text.strip()
        # response_mime_type should give clean JSON, but strip fences just in case
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        narrative = json.loads(raw)

        # Map the new schema to our report structure
        if "overall_score" in narrative:
            report["score"]["overall"] = narrative["overall_score"]
            report["score"]["reasoning"] = narrative.get("score_reasoning", "")
            report["score"]["confidence"] = narrative.get("confidence", "moderate")

        if "category_scores" in narrative:
            report["category_scores"] = narrative["category_scores"]

        report["narrative"] = {
            "executive_summary": narrative.get("thirty_second_summary", ""),
            "persona_verdicts": narrative.get("persona_verdicts", []),
            "top_issues": narrative.get("whats_broken", []),
            "what_works": narrative.get("whats_good", []),
            "what_doesnt_work": narrative.get("whats_broken", []),
            "accessibility_audit": {
                "total_violations": len(violations),
                "critical": sum(1 for v in violations if v.get("impact") == "critical"),
                "serious": sum(1 for v in violations if v.get("impact") == "serious"),
                "moderate": sum(1 for v in violations if v.get("impact") == "moderate"),
                "minor_count": sum(1 for v in violations if v.get("impact") == "minor"),
                "images_missing_alt": images.get("missing_alt", 0),
                "details": [f"{v.get('id')}: {v.get('description', '')}" for v in violations[:10]],
            },
            "recommendations": narrative.get("recommendations", []),
            "testing_notes": narrative.get("testing_notes", {}),
        }

        # Attach AI SEO data directly to report
        report["ai_seo"] = crawl_data.get("ai_seo", {})

        # Attach screenshot references
        report["sessions_summary"] = [
            {
                "persona_id": s["persona"]["id"],
                "persona_name": s["persona"]["name"],
                "screenshots": [
                    {
                        "step": step["step_number"],
                        "description": step.get("result", ""),
                        "screenshot_b64": step.get("screenshot_b64"),
                    }
                    for step in s.get("steps", [])
                    if step.get("screenshot_b64")
                ],
            }
            for s in sessions
        ]

    except json.JSONDecodeError as e:
        report["error"] = f"LLM returned invalid JSON: {str(e)[:100]}"
        report["narrative"] = _fallback_narrative(crawl_data, sessions, real_findings, tool_limitations)
    except Exception:
        report["error"] = f"Gemini call failed: {traceback.format_exc()[:300]}"
        report["narrative"] = _fallback_narrative(crawl_data, sessions, real_findings, tool_limitations)

    # Annotate the crawl screenshot with top findings
    crawl_screenshot = crawl_data.get("screenshot_base64")
    if crawl_screenshot and real_findings:
        try:
            all_findings_for_annotation = real_findings[:]
            # Add axe violations as findings for annotation
            for v in violations[:3]:
                all_findings_for_annotation.append({
                    "type": "problem",
                    "title": v.get("id", "a11y violation"),
                    "detail": v.get("description", v.get("help", "")),
                    "is_site_bug": True,
                })
            annotated = await annotate_overview_screenshot(
                crawl_screenshot,
                all_findings_for_annotation,
                page_url=crawl_data.get("url", ""),
            )
            report["annotated_screenshot_b64"] = annotated
        except Exception as e:
            print(f"Screenshot annotation failed: {e}")
            report["annotated_screenshot_b64"] = crawl_screenshot

    return report


def _fallback_narrative(crawl_data, sessions, real_findings, tool_limitations):
    """Template-based narrative when Gemini fails."""
    completed = sum(1 for s in sessions if s.get("outcome") == "completed")
    total = len(sessions)

    return {
        "executive_summary": (
            f"Testing found {len(real_findings)} genuine issues across {total} persona sessions. "
            f"{len(tool_limitations)} interactions could not be completed due to testing tool limitations. "
            f"{completed}/{total} personas completed their tasks."
        ),
        "persona_verdicts": [],
        "top_issues": [],
        "what_works": [],
        "what_doesnt_work": [],
        "accessibility_audit": {},
        "recommendations": [
            {"rank": 1, "action": "Address accessibility violations from axe-core", "impact": "affects all screen reader users"},
            {"rank": 2, "action": "Ensure all images have alt text", "impact": "affects ~15% of users"},
            {"rank": 3, "action": "Increase small click targets to 44x44px", "impact": "affects ~10% of users"},
        ],
        "testing_notes": {
            "total_personas": total,
            "fully_tested": completed,
            "partially_tested": total - completed,
            "real_findings": len(real_findings),
            "tool_limitations": len(tool_limitations),
        },
    }


# ---------------------------------------------------------------------------
# LLM Fix Prompt Generator — uses Gemini Flash for speed
# ---------------------------------------------------------------------------

async def generate_fix_prompt(report: dict, url: str) -> str:
    """Generate a copy-paste prompt for ChatGPT/Claude to fix the issues found."""
    from gemini_tools import GeminiTools

    tools = GeminiTools(model="flash")

    score = report.get("score", {}).get("overall", "?")
    narrative = report.get("narrative", {})
    top_issues = narrative.get("top_issues", [])
    a11y = narrative.get("accessibility_audit", {})
    recommendations = narrative.get("recommendations", [])
    what_doesnt_work = narrative.get("what_doesnt_work", [])

    ai_seo = report.get("ai_seo", {})
    ai_seo_checks = ai_seo.get("checks", [])

    findings_summary = json.dumps({
        "url": url,
        "overall_score": score,
        "top_issues": top_issues[:10],
        "accessibility": a11y,
        "what_doesnt_work": what_doesnt_work[:8],
        "recommendations": recommendations[:8],
        "ai_seo_checks": ai_seo_checks,
    }, default=str)

    prompt = f"""You are generating a prompt that a developer can paste into ChatGPT or Claude to get code-level fixes for their website.

The website {url} was audited by trashmy.tech with AI personas. Here are the findings:
{findings_summary}

Generate a comprehensive, well-structured prompt that:
1. Starts with "I need help fixing issues found on my website {url}"
2. Lists each issue with specific details (what element, what's wrong, WCAG references where applicable)
3. Asks for code fixes (HTML, CSS, JS, ARIA attributes) for each issue
4. Groups fixes by type (accessibility, usability, security, performance, AI SEO)
5. Asks for the fixes in order of impact

IMPORTANT — Include an "AI SEO / Generative Engine Optimization" section that covers:
- Adding JSON-LD structured data (Person, WebSite, Article schemas as appropriate)
- Adding/completing Open Graph meta tags
- Creating a llms.txt file for AI crawler guidance
- Configuring robots.txt to allow AI bots (GPTBot, ClaudeBot, PerplexityBot)
- Adding semantic HTML elements (article, section, nav, main, header, footer)
- Adding content freshness signals (dates, last-modified)
- Creating/updating sitemap.xml
- Making content citation-worthy for LLMs (clear headings, statistical evidence, quotable passages)

Output ONLY the prompt text. Make it clear, actionable, and ready to paste. Do not wrap in JSON."""

    raw = await asyncio.to_thread(
        tools._generate_content,
        prompt,
        use_url_context=False,
        use_google_search=False,
        thinking_level="LOW",
        response_mime_type="text/plain",
    )
    return raw
