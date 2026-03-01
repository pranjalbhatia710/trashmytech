"""trashmy.tech — report generator using Gemini with structured reasoning."""

import json
import os
import asyncio
import traceback

from google import genai
from google.genai.types import GenerateContentConfig

SYSTEM_PROMPT = """\
You are the analysis engine for trashmy.tech, a website testing tool that deploys
AI personas to test real websites.

You will receive structured test data from a crawler and persona sessions.
Your job is to reason through this data and produce accurate, calibrated ratings.

RATING PRINCIPLES:
- Every score must be justified by specific data points from the test results.
- Do not infer problems that aren't evidenced in the data. If something wasn't
  tested, say so rather than guessing.
- Scores should be calibrated: a site that loads fast, has clean forms, and works
  for most personas but has 10 accessibility violations might be a 65. A site where
  4 personas are completely blocked and the server crashes on adversarial input is a 25.
- A perfect 100 is extremely rare. Most decent sites score 55-75.

NARRATIVE PRINCIPLES:
- Persona stories must reference specific actions and elements from the test data.
  "Margaret clicked the element labeled 'Sign In' three times" not "Margaret had trouble."
- Reference screenshot steps by number so the frontend can display the right image.
- The "would_recommend" verdict should reflect whether this persona could accomplish
  a basic task on the site.

TONE: Brutally honest but constructive. Like a disappointed mentor who roasts the
site but gives actionable fixes. Darkly funny where appropriate.

WHAT WORKS:
- Always include what works well. If the mobile layout is clean, say so.
  This makes the report credible.

WHAT DOESN'T WORK:
- Be specific. Not "accessibility needs improvement" but "12 images missing alt text,
  heading hierarchy skips from h1 to h4, no skip-navigation link."

Respond with ONLY valid JSON matching the schema below. No markdown fences.
"""

REPORT_SCHEMA = """\
{
  "overall_score": int (0-100),
  "score_reasoning": "2-3 sentences explaining why this score",
  "confidence": float (0-1),

  "category_scores": {
    "accessibility": {
      "score": int (0-100),
      "reasoning": "1-2 sentences",
      "key_evidence": ["specific data points"]
    },
    "security": {
      "score": int (0-100),
      "reasoning": "1-2 sentences",
      "key_evidence": ["specific data points"]
    },
    "usability": {
      "score": int (0-100),
      "reasoning": "1-2 sentences",
      "key_evidence": ["specific data points"]
    },
    "mobile": {
      "score": int (0-100),
      "reasoning": "1-2 sentences",
      "key_evidence": ["specific data points"]
    },
    "performance": {
      "score": int (0-100),
      "reasoning": "1-2 sentences",
      "key_evidence": ["specific data points"]
    }
  },

  "executive_summary": "3-4 sentences, direct, evidence-based",

  "persona_verdicts": [
    {
      "persona_id": "A1",
      "persona_name": "Margaret",
      "would_recommend": true/false,
      "narrative": "3-5 vivid sentences telling their story with specific actions",
      "outcome": "completed/struggled/blocked",
      "primary_barrier": "what stopped them, if anything, or null"
    }
  ],

  "top_issues": [
    {
      "rank": 1,
      "title": "Issue title",
      "severity": "critical/major/minor",
      "category": "accessibility/security/usability/mobile/performance",
      "description": "What's wrong and why it matters",
      "affected_personas": ["names"],
      "fix": "How to fix it",
      "impact_estimate": "affects ~X% of users based on persona coverage"
    }
  ],

  "what_works": [
    {
      "title": "What's good",
      "detail": "Why it's good",
      "personas_who_benefited": ["names"]
    }
  ],

  "what_doesnt_work": [
    {
      "title": "What's broken",
      "detail": "Why it's broken",
      "personas_who_suffered": ["names"]
    }
  ],

  "accessibility_audit": {
    "total_violations": int,
    "critical": int,
    "serious": int,
    "moderate": int,
    "minor_count": int,
    "images_missing_alt": int,
    "details": ["specific findings"]
  },

  "chaos_test_summary": {
    "inputs_tested": int,
    "inputs_rejected": int,
    "inputs_accepted_incorrectly": int,
    "server_errors": int,
    "worst_finding": "description"
  },

  "recommendations": ["top 3 ordered by impact, each 1-2 sentences"]
}
"""


def _classify_sessions(sessions: list[dict]) -> dict:
    total = len(sessions)
    completed = 0
    blocked_list = []
    struggled_list = []
    fine_list = []

    for s in sessions:
        outcome = s.get("outcome", "struggled")
        if outcome == "completed":
            completed += 1
            fine_list.append(s)
        elif outcome == "blocked":
            blocked_list.append(s)
        else:
            struggled_list.append(s)

    return {
        "total": total,
        "completed": completed,
        "blocked": blocked_list,
        "struggled": struggled_list,
        "fine": fine_list,
    }


def _compute_base_score(crawl_data: dict, stats: dict) -> int:
    """Compute a base score from quantitative data."""
    total = stats["total"] or 1
    completion_rate = stats["completed"] / total

    # Completion: 0-40 points
    completion_points = completion_rate * 40

    # Accessibility: 0-30 points (deduct per violation)
    violations = crawl_data.get("accessibility_violations", [])
    critical_violations = sum(1 for v in violations if v.get("impact") == "critical")
    serious_violations = sum(1 for v in violations if v.get("impact") == "serious")
    a11y_deductions = critical_violations * 5 + serious_violations * 3 + max(0, len(violations) - critical_violations - serious_violations)
    a11y_points = max(0, 30 - a11y_deductions)

    # Performance: 0-15 points
    load_time = crawl_data.get("page_load_time_ms", 5000)
    if load_time < 1000:
        perf_points = 15
    elif load_time < 3000:
        perf_points = 10
    elif load_time < 5000:
        perf_points = 5
    else:
        perf_points = 2

    # Content quality: 0-15 points
    seo = crawl_data.get("seo", {})
    content_points = 0
    if seo.get("has_h1"): content_points += 5
    if seo.get("has_meta_description"): content_points += 5
    if seo.get("has_viewport"): content_points += 5

    overall = round(completion_points + a11y_points + perf_points + content_points)
    return min(overall, 100)


async def generate_report(crawl_data: dict, sessions: list[dict]) -> dict:
    """Generate the final trashmy.tech audit report using Gemini."""

    stats = _classify_sessions(sessions)
    base_score = _compute_base_score(crawl_data, stats)

    # Summarize sessions for LLM (no screenshots — too large)
    def _summarize_session(s):
        p = s.get("persona", {})
        steps_summary = []
        for step in s.get("steps", [])[:10]:
            steps_summary.append({
                "step": step.get("step_number"),
                "action": step.get("action"),
                "target": step.get("target_element", "")[:60],
                "result": step.get("result", "")[:100],
                "target_size": step.get("target_size_px"),
                "timestamp_ms": step.get("timestamp_ms"),
            })
        return {
            "persona_id": p.get("id"),
            "name": p.get("name"),
            "age": p.get("age"),
            "category": p.get("category"),
            "description": p.get("description"),
            "outcome": s.get("outcome"),
            "task_completed": s.get("task_completed", False),
            "total_time_ms": s.get("total_time_ms", 0),
            "steps": steps_summary,
            "findings": s.get("findings", [])[:10],
            "form_test_results": s.get("form_test_results", [])[:10],
            "dead_ends": s.get("dead_ends", [])[:5],
            "errors": s.get("errors", [])[:5],
        }

    # Build payload for LLM
    violations = crawl_data.get("accessibility_violations", [])
    payload = json.dumps({
        "base_score": base_score,
        "crawl_summary": {
            "page_title": crawl_data.get("title", ""),
            "load_time_ms": crawl_data.get("page_load_time_ms", 0),
            "links_count": len(crawl_data.get("links", [])),
            "forms_count": len(crawl_data.get("forms", [])),
            "buttons_count": len(crawl_data.get("buttons", [])),
            "images_total": crawl_data.get("images", {}).get("total", 0) if isinstance(crawl_data.get("images"), dict) else 0,
            "images_missing_alt": crawl_data.get("images", {}).get("missing_alt", 0) if isinstance(crawl_data.get("images"), dict) else 0,
            "seo": crawl_data.get("seo", {}),
            "accessibility_violations": [{
                "id": v.get("id"),
                "impact": v.get("impact"),
                "description": v.get("description"),
                "nodes_count": v.get("nodes_count"),
            } for v in violations[:20]],
            "accessibility_violations_total": len(violations),
            "console_errors": crawl_data.get("console_errors", [])[:10],
        },
        "sessions": [_summarize_session(s) for s in sessions],
    }, default=str)

    # Build stats for response
    raw_stats = {
        "total": stats["total"],
        "completed": stats["completed"],
        "blocked": len(stats["blocked"]),
        "struggled": len(stats["struggled"]),
        "blocked_names": [s.get("persona", {}).get("name", "?") for s in stats["blocked"]],
        "struggled_names": [s.get("persona", {}).get("name", "?") for s in stats["struggled"]],
        "fine_names": [s.get("persona", {}).get("name", "?") for s in stats["fine"]],
    }

    report = {"score": {"overall": base_score}, "stats": raw_stats}

    try:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            report["error"] = "GEMINI_API_KEY not set — narrative skipped."
            return report

        client = genai.Client(api_key=api_key)

        prompt = (
            SYSTEM_PROMPT
            + "\n\nOUTPUT SCHEMA:\n" + REPORT_SCHEMA
            + "\n\nTEST DATA:\n" + payload
        )

        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.0-flash",
            contents=prompt,
            config=GenerateContentConfig(
                temperature=0.7,
                max_output_tokens=4000,
            ),
        )

        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        narrative = json.loads(raw)

        # Override score with LLM's reasoned score if provided
        if "overall_score" in narrative:
            report["score"]["overall"] = narrative["overall_score"]
            report["score"]["reasoning"] = narrative.get("score_reasoning", "")
            report["score"]["confidence"] = narrative.get("confidence", 0.7)

        # Store category scores
        if "category_scores" in narrative:
            report["category_scores"] = narrative["category_scores"]

        # Store all narrative components
        report["narrative"] = {
            "executive_summary": narrative.get("executive_summary", ""),
            "persona_verdicts": narrative.get("persona_verdicts", []),
            "top_issues": narrative.get("top_issues", []),
            "what_works": narrative.get("what_works", []),
            "what_doesnt_work": narrative.get("what_doesnt_work", []),
            "accessibility_audit": narrative.get("accessibility_audit", {}),
            "chaos_test_summary": narrative.get("chaos_test_summary", {}),
            "recommendations": narrative.get("recommendations", []),
        }

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

    except json.JSONDecodeError:
        report["error"] = "LLM returned invalid JSON"
    except Exception:
        report["error"] = f"Gemini call failed: {traceback.format_exc()[:300]}"

    return report
