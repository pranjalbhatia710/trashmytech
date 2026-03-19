"""trashmy.tech — WebSocket pipeline: crawl -> swarm -> score -> report.

Extracted from main.py for readability. Each phase is a standalone async
function that streams progress over the WebSocket via ``send()``.

Supports two analysis modes controlled by ANALYSIS_MODE env var:
- "lite" (default): skips paid external APIs, uses only free/local checks
- "full": runs all external APIs (PageSpeed, Observatory, Safe Browsing, etc.)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Callable, Awaitable

from crawler import crawl_site
from personas import sample_personas
from agent import run_agent_local
from annotator import annotate_screenshot
from external_apis import run_all_external_apis, run_lite_external_checks
from analysis_lite import should_run_external_apis, get_analysis_mode
from scoring import calculate_scores
from quick_wins import generate_quick_wins
from report import generate_report, generate_fix_prompt
from dspy_modules import (score_emotional_journey, generate_user_voice, generate_one_thing,
                          detect_workflows, analyze_funnel, generate_consolidated_report)
from services.persistence import persist_analysis

log = logging.getLogger("trashmy.pipeline")

Send = Callable[[dict], Awaitable[None]]


# ── Phase 1: Crawl ──────────────────────────────────────────────────

async def run_crawl(url: str, send: Send) -> dict:
    """Crawl the target URL and stream progress."""
    await send({"phase": "crawling", "status": "started"})

    async def _on_screenshot(b64: str):
        await send({"phase": "crawling", "type": "screenshot", "screenshot_b64": b64})

    crawl_data = await crawl_site(url, on_screenshot=_on_screenshot)

    # Send the final crawl screenshot if available
    if crawl_data.get("screenshot_base64"):
        await send({
            "phase": "crawling", "type": "screenshot",
            "screenshot_b64": crawl_data["screenshot_base64"],
        })

    images = crawl_data.get("images", {})
    await send({
        "phase": "crawling", "status": "complete",
        "data": {
            "page_title": crawl_data.get("title", ""),
            "links_count": len(crawl_data.get("links", [])),
            "forms_count": len(crawl_data.get("forms", [])),
            "buttons_count": len(crawl_data.get("buttons", [])),
            "images_missing_alt": images.get("missing_alt", 0) if isinstance(images, dict) else 0,
            "accessibility_violations_count": len(crawl_data.get("accessibility_violations", [])),
            "load_time_ms": crawl_data.get("page_load_time_ms", 0),
        },
    })
    return crawl_data


# ── Phase 2: Swarm ──────────────────────────────────────────────────

async def run_swarm(
    url: str,
    crawl_data: dict,
    agent_count: int,
    send: Send,
    auth_profile: str | None = None,
    max_steps: int = 8,
    workflow_data: dict | None = None,
) -> list[dict]:
    """Launch persona agents in parallel browsers, streaming results live."""
    from playwright.async_api import async_playwright as pw_start

    personas = sample_personas(agent_count, url=url)
    num_browsers = min(int(os.getenv("NUM_BROWSERS", "5")), len(personas))
    headed = os.getenv("HEADLESS", "true").lower() == "false"

    await send({
        "phase": "swarming", "status": "started",
        "agent_count": len(personas),
        "personas": [
            {"id": p["id"], "name": p["name"], "age": p["age"],
             "category": p["category"], "description": p["description"]}
            for p in personas
        ],
    })

    # Announce each persona
    for persona in personas:
        await send({
            "phase": "swarming", "agent_id": persona["id"],
            "persona_name": persona["name"], "persona_age": persona["age"],
            "persona_category": persona["category"],
            "persona_description": persona["description"], "status": "running",
        })
        await send({
            "phase": "swarming", "type": "log", "level": "info",
            "message": f"{persona['name']} ({persona['category']}) launching browser...",
        })

    # Build site context for agents
    seo = crawl_data.get("seo", {})
    site_context = {
        "page_title": crawl_data.get("title", ""),
        "links_count": len(crawl_data.get("links", [])),
        "forms_count": len(crawl_data.get("forms", [])),
        "has_h1": seo.get("has_h1", False),
        "auth_profile": auth_profile,
    }

    # Inject workflow steps so agents follow the detected primary workflow
    if workflow_data and isinstance(workflow_data.get("workflow_steps"), list):
        site_context["workflow_steps"] = workflow_data["workflow_steps"]

    # Screenshot streaming via async queue
    screenshot_queue: asyncio.Queue = asyncio.Queue()

    async def on_screenshot(agent_id, step_num, b64):
        await screenshot_queue.put((agent_id, step_num, b64))

    async def screenshot_sender():
        while True:
            item = await screenshot_queue.get()
            if item is None:
                break
            aid, step_num, b64 = item
            await send({
                "phase": "swarming", "type": "screenshot",
                "agent_id": aid, "step": step_num, "screenshot_b64": b64,
            })

    sender_task = asyncio.create_task(screenshot_sender())

    # Launch all browsers in parallel
    pw = await pw_start().start()
    browsers = await asyncio.gather(*(
        pw.chromium.launch(headless=not headed, slow_mo=80 if headed else 0)
        for _ in range(num_browsers)
    ))

    # Distribute personas round-robin across browsers
    assignments: list[list[tuple[int, dict]]] = [[] for _ in range(num_browsers)]
    for i, persona in enumerate(personas):
        assignments[i % num_browsers].append((i, persona))

    final_results: list[dict | None] = [None] * len(personas)
    results_lock = asyncio.Lock()

    async def _run_agent(idx: int, persona: dict, browser, slot: int):
        # Small stagger within each browser group to avoid thundering herd
        await asyncio.sleep(slot * 0.15)
        try:
            result = await run_agent_local(
                url, persona, site_context,
                on_step_screenshot=on_screenshot,
                shared_browser=browser,
                max_steps=max_steps,
            )
        except Exception as exc:
            log.error("Agent %s crashed: %s", persona["name"], str(exc)[:150])
            result = _make_error_result(persona, exc)

        processed = await _stream_agent_result(result, persona, send, url)
        async with results_lock:
            final_results[idx] = processed

    async def _run_browser_group(bi: int):
        browser = browsers[bi]
        await asyncio.gather(
            *(_run_agent(idx, p, browser, slot)
              for slot, (idx, p) in enumerate(assignments[bi])),
            return_exceptions=True,
        )

    # All browser groups run fully in parallel
    await asyncio.gather(*(_run_browser_group(bi) for bi in range(num_browsers)),
                         return_exceptions=True)

    # Fill failed slots
    for i in range(len(final_results)):
        if final_results[i] is None:
            final_results[i] = await _stream_agent_result(
                _make_error_result(personas[i], Exception("Agent failed silently")),
                personas[i], send, url,
            )

    # Cleanup
    for b in browsers:
        try:
            await b.close()
        except Exception:
            pass
    try:
        await pw.stop()
    except Exception:
        pass
    await screenshot_queue.put(None)
    await sender_task

    return [r for r in final_results if r is not None]


def _make_error_result(persona: dict, exc: Exception) -> dict:
    return {
        "agent_id": persona["id"],
        "persona": {
            "id": persona["id"], "name": persona["name"],
            "age": persona["age"], "category": persona["category"],
            "description": persona["description"],
        },
        "task_completed": False, "outcome": "blocked",
        "total_time_ms": 0, "steps": [], "findings": [],
        "form_test_results": [], "issues_found": 1,
        "errors": [str(exc)[:200]], "dead_ends": ["Agent crashed"],
        "steps_taken": 0,
    }


async def _stream_agent_result(result: dict, persona: dict, send: Send, url: str) -> dict:
    """Process one agent result: stream summary + annotated screenshot."""
    # Support both old "steps" format and new "actions" format
    raw_steps = result.get("steps") or result.get("actions") or []
    step_summaries = [
        {
            "step": s.get("step_number") or s.get("step"),
            "action": s.get("action"),
            "target": (s.get("target_element") or s.get("target") or "")[:60],
            "result": (s.get("result") or s.get("reasoning") or "")[:80],
            "target_size": s.get("target_size_px"),
            "timestamp_ms": s.get("timestamp_ms"),
            "click_strategy": s.get("click_strategy"),
            "failure_classification": s.get("failure_classification"),
        }
        for s in raw_steps
    ]
    # Normalize steps back onto result so report.py can find them
    result["steps"] = raw_steps

    await send({
        "phase": "swarming",
        "agent_id": result.get("agent_id", persona["id"]),
        "persona_name": persona["name"], "status": "complete",
        "task_completed": result.get("task_completed", False),
        "outcome": result.get("outcome", "struggled"),
        "total_time_ms": result.get("total_time_ms", 0),
        "issues_found": result.get("issues_found", 0),
        "tool_limitation_count": result.get("tool_limitation_count", 0),
        "steps": step_summaries,
        "findings": result.get("findings", [])[:10],
    })

    # Annotate last screenshot with findings
    findings = result.get("findings", [])
    steps = raw_steps
    if findings and steps:
        last_b64 = next(
            (s["screenshot_b64"] for s in reversed(steps) if s.get("screenshot_b64")),
            None,
        )
        if last_b64:
            try:
                annotated = await annotate_screenshot(last_b64, findings, url)
                await send({
                    "phase": "swarming", "type": "annotated_screenshot",
                    "agent_id": result.get("agent_id", persona["id"]),
                    "screenshot_b64": annotated,
                })
            except Exception as e:
                log.warning("Annotation failed for %s: %s", persona["name"], e)

    return result


# ── Phase 3: Score + Report ─────────────────────────────────────────

async def run_scoring_and_report(
    url: str,
    crawl_data: dict,
    agent_results: list[dict],
    external_api_data: dict | None,
    send: Send,
    workflow_data: dict | None = None,
) -> dict:
    """Calculate scores, quick wins, generate report with fix prompt."""

    # ── Workflow detection (right after crawl, informs funnel analysis) ──
    if workflow_data is None:
        try:
            links = crawl_data.get("links", [])
            links_summary = json.dumps(
                [{"text": l.get("text", ""), "href": l.get("href", "")} for l in links[:50]],
                default=str,
            )
            forms = crawl_data.get("forms", [])
            forms_summary = json.dumps(forms[:20], default=str)
            buttons = crawl_data.get("buttons", [])
            buttons_summary = json.dumps(
                [{"text": b.get("text", ""), "type": b.get("type", "")} for b in buttons[:30]],
                default=str,
            )
            visible_text = crawl_data.get("visible_text", "")[:2000]
            if not visible_text:
                # Fallback: extract from page text in crawl data
                visible_text = crawl_data.get("page_text", "")[:2000]

            workflow_data = await asyncio.to_thread(
                detect_workflows,
                crawl_data.get("title", ""),
                url,
                links_summary,
                forms_summary,
                buttons_summary,
                visible_text,
            )
            log.info("Workflow detected: site_type=%s, steps=%d",
                     workflow_data.get("site_type"), len(workflow_data.get("workflow_steps", [])))
        except Exception as exc:
            log.warning("Workflow detection failed (non-fatal): %s", exc)
            workflow_data = None

    # Build external data for scoring
    scoring_ext = _build_scoring_external(external_api_data) if external_api_data else {}

    # Composite scores
    composite = calculate_scores(crawl_data, agent_results, scoring_ext)
    composite_dict = composite.to_dict()

    await send({
        "phase": "scoring", "status": "complete",
        "scores": {
            "overall_score": composite.overall_score,
            "letter_grade": composite.letter_grade,
            "categories": {
                c.name: {"score": round(c.score, 1), "weight": c.weight}
                for c in composite.categories
            },
        },
    })

    # Quick wins
    qw_list = generate_quick_wins(composite, crawl_data, agent_results, scoring_ext)

    # Report
    await send({"phase": "reporting", "status": "started"})
    report = await generate_report(
        crawl_data, agent_results,
        external_api_data=external_api_data,
        composite_scores=composite_dict,
        quick_wins=qw_list,
    )

    # Fix prompt
    try:
        report["fix_prompt"] = await generate_fix_prompt(report, url)
    except Exception as e:
        log.warning("Fix prompt generation failed: %s", e)
        report["fix_prompt"] = None

    # ── Candid Report V2: Emotional Journeys, User Voices, The One Thing ──
    try:
        import json as _json

        # 1. Emotional journey scores for each agent result
        emotional_journeys: dict[str, dict] = {}
        for ar in agent_results:
            persona = ar.get("persona", {})
            pid = persona.get("id", ar.get("agent_id", ""))
            steps = ar.get("steps") or ar.get("actions") or []
            transcript = _json.dumps([
                {
                    "step": s.get("step_number") or s.get("step"),
                    "action": s.get("action"),
                    "target": (s.get("target_element") or s.get("target") or "")[:80],
                    "result": (s.get("result") or s.get("reasoning") or "")[:120],
                    "failure": s.get("failure_classification", {}).get("type") if s.get("failure_classification") else None,
                }
                for s in steps[:20]
            ], default=str)
            try:
                ej = await asyncio.to_thread(
                    score_emotional_journey,
                    persona.get("name", "Unknown"),
                    persona.get("description", ""),
                    transcript,
                )
                emotional_journeys[pid] = ej
            except Exception as exc:
                log.warning("Emotional journey failed for %s: %s", pid, exc)
                emotional_journeys[pid] = {"stages": [], "overall_sentiment": "unavailable"}
        report["emotional_journeys"] = emotional_journeys

        # 2. User voice for each persona verdict
        user_voices: dict[str, dict] = {}
        persona_verdicts = report.get("narrative", {}).get("persona_verdicts", [])
        for pv in persona_verdicts:
            pid = pv.get("persona_id", "")
            # Build session summary from the verdict narrative and issues
            session_summary_parts = []
            if pv.get("narrative"):
                session_summary_parts.append(pv["narrative"])
            if pv.get("primary_barrier"):
                session_summary_parts.append(f"Primary barrier: {pv['primary_barrier']}")
            if pv.get("issues_encountered"):
                session_summary_parts.append(f"Issues: {', '.join(pv['issues_encountered'][:5])}")
            if pv.get("notable_moments"):
                session_summary_parts.append(pv["notable_moments"])
            session_summary = " ".join(session_summary_parts) or "No detailed session data available."
            outcome = pv.get("outcome", "struggled")
            try:
                uv = await asyncio.to_thread(
                    generate_user_voice,
                    pv.get("name", pv.get("persona_name", "Unknown")),
                    str(pv.get("age", "unknown")),
                    pv.get("category", "general user"),
                    session_summary,
                    outcome,
                )
                user_voices[pid] = uv
            except Exception as exc:
                log.warning("User voice failed for %s: %s", pid, exc)
                user_voices[pid] = {"verbatim_feedback": "unavailable", "one_word_feeling": "unknown"}
        report["user_voices"] = user_voices

        # 3. The One Thing
        narrative = report.get("narrative", {})
        top_issues_json = _json.dumps(narrative.get("top_issues", [])[:5], default=str)
        # Build persona outcomes summary
        outcomes_parts = []
        for pv in persona_verdicts:
            outcomes_parts.append(f"{pv.get('name', '?')}: {pv.get('outcome', '?')}")
        persona_outcomes_str = "; ".join(outcomes_parts) or "No persona data."
        qw_json = _json.dumps((report.get("quick_wins") or [])[:5], default=str)

        try:
            the_one_thing = await asyncio.to_thread(
                generate_one_thing,
                float(report.get("score", {}).get("overall", 50)),
                top_issues_json,
                persona_outcomes_str,
                qw_json,
            )
            report["the_one_thing"] = the_one_thing
        except Exception as exc:
            log.warning("The One Thing failed: %s", exc)
            report["the_one_thing"] = None

    except Exception as e:
        log.warning("Candid Report V2 enrichment failed (non-fatal): %s", e)
        report.setdefault("emotional_journeys", {})
        report.setdefault("user_voices", {})
        report.setdefault("the_one_thing", None)

    # ── Workflow, Funnel Analysis, Consolidated Report ──
    import json as _json2

    # Attach workflow data
    report["workflow"] = workflow_data

    # Funnel analysis
    try:
        if workflow_data and workflow_data.get("workflow_steps"):
            # Build agent results summary for funnel analysis
            agent_summaries = []
            for ar in agent_results:
                persona = ar.get("persona", {})
                steps = ar.get("steps") or ar.get("actions") or []
                agent_summaries.append({
                    "persona_name": persona.get("name", "Unknown"),
                    "persona_category": persona.get("category", ""),
                    "task_completed": ar.get("task_completed", False),
                    "max_workflow_step": ar.get("max_workflow_step"),
                    "total_workflow_steps": ar.get("total_workflow_steps"),
                    "steps_taken": ar.get("steps_taken", len(steps)),
                    "dead_ends": ar.get("dead_ends", []),
                    "errors": ar.get("errors", [])[:5],
                    "actions_summary": [
                        {
                            "step": s.get("step"),
                            "action": s.get("action"),
                            "target": (s.get("target") or "")[:60],
                            "reasoning": (s.get("reasoning") or "")[:100],
                            "executed": s.get("executed", True),
                            "workflow_step": s.get("workflow_step"),
                        }
                        for s in steps[:15]
                    ],
                })

            funnel_result = await asyncio.to_thread(
                analyze_funnel,
                workflow_data.get("site_type", "other"),
                workflow_data.get("primary_workflow", ""),
                _json2.dumps(workflow_data.get("workflow_steps", []), default=str),
                _json2.dumps(agent_summaries, default=str),
            )
            report["funnel_analysis"] = funnel_result
        else:
            report["funnel_analysis"] = None
    except Exception as exc:
        log.warning("Funnel analysis failed (non-fatal): %s", exc)
        report["funnel_analysis"] = None

    # Consolidated executive report
    try:
        narrative = report.get("narrative", {})
        persona_verdicts = narrative.get("persona_verdicts", [])
        outcomes_parts_c = []
        for pv in persona_verdicts:
            outcomes_parts_c.append(f"{pv.get('name', '?')}: {pv.get('outcome', '?')}")
        persona_outcomes_c = "; ".join(outcomes_parts_c) or "No persona data."

        overall_s = float(report.get("score", {}).get("overall", 50))
        the_one_thing_val = report.get("the_one_thing", "") or ""

        cat_scores = {}
        for cat_name, cat_data in (report.get("category_scores") or {}).items():
            if isinstance(cat_data, dict):
                cat_scores[cat_name] = cat_data.get("score", 0)
            else:
                cat_scores[cat_name] = cat_data

        top_issues_c = _json2.dumps(narrative.get("top_issues", [])[:5], default=str)
        funnel_json = _json2.dumps(report.get("funnel_analysis") or {}, default=str)

        consolidated = await asyncio.to_thread(
            generate_consolidated_report,
            (workflow_data or {}).get("site_type", "other"),
            overall_s,
            the_one_thing_val,
            funnel_json,
            _json2.dumps(cat_scores, default=str),
            top_issues_c,
            persona_outcomes_c,
        )
        report["consolidated"] = consolidated
    except Exception as exc:
        log.warning("Consolidated report failed (non-fatal): %s", exc)
        report["consolidated"] = None

    return report


# ── Phase 4: Persist ────────────────────────────────────────────────

async def run_persist(url: str, report: dict, agent_results: list[dict],
                      crawl_data: dict, duration: float, send: Send,
                      user_id: str | None = None,
                      analysis_mode: str = "standard") -> str | None:
    """Save analysis to DB + cache. Returns analysis_id or None."""
    try:
        analysis_id = await persist_analysis(
            url=url, report=report, sessions=agent_results,
            crawl_data=crawl_data, execution_time_seconds=duration,
            user_id=user_id,
            analysis_mode=analysis_mode,
        )
        if analysis_id:
            await send({"phase": "persisted", "analysis_id": analysis_id})
        return analysis_id
    except Exception:
        log.exception("Persistence failed (non-fatal)")
        return None


# ── Helper ──────────────────────────────────────────────────────────

def _build_scoring_external(ext: dict | None) -> dict:
    """Translate raw external_api_data into the flat key structure scoring.py expects."""
    if not ext:
        return {}

    out: dict = {}

    # PageSpeed / Lighthouse
    ps = ext.get("pagespeed", {})
    if ps:
        strategy = ps.get("mobile") or ps.get("desktop") or {}
        scores = strategy.get("scores", {})
        if scores:
            out["pagespeed"] = {
                "performance": scores.get("performance"),
                "accessibility": scores.get("accessibility"),
                "seo": scores.get("seo"),
                "best_practices": scores.get("best_practices") or scores.get("best-practices"),
            }
        wv = strategy.get("web_vitals", {})
        if wv:
            lcp_ms = wv.get("largest_contentful_paint_ms")
            fcp_ms = wv.get("first_contentful_paint_ms")
            out["core_web_vitals"] = {
                "lcp_seconds": lcp_ms / 1000 if lcp_ms is not None else wv.get("lcp_seconds"),
                "fcp_seconds": fcp_ms / 1000 if fcp_ms is not None else wv.get("fcp_seconds"),
                "cls": wv.get("cumulative_layout_shift") or wv.get("cls"),
                "inp_ms": wv.get("interaction_to_next_paint_ms") or wv.get("inp_ms"),
            }

    # Observatory
    obs = ext.get("observatory", {})
    if obs:
        out["observatory"] = {"grade": obs.get("grade"), "tests": obs.get("tests", {})}

    # Safe Browsing
    sb = ext.get("safe_browsing", {})
    if sb:
        if sb.get("safe") is True or sb.get("safe") == "clean":
            out["safe_browsing"] = "clean"
        elif sb.get("safe") is False:
            out["safe_browsing"] = "flagged"
        else:
            out["safe_browsing"] = sb.get("safe")

    # SSL
    ssl_data = ext.get("ssl", {})
    if ssl_data:
        out["ssl"] = {
            "valid": ssl_data.get("valid", False),
            "days_remaining": ssl_data.get("days_until_expiry") or ssl_data.get("days_remaining"),
        }

    # DNS
    dns = ext.get("dns", {})
    if dns:
        out["dns_auth"] = {
            "spf_present": dns.get("has_spf", False),
            "spf_strict": dns.get("spf_strict", False),
            "dmarc_present": dns.get("has_dmarc", False),
            "dmarc_enforce": dns.get("dmarc_enforce", False),
        }

    # Domain age
    whois = ext.get("whois", {})
    if whois and whois.get("domain_age_days"):
        out["domain_age_years"] = whois["domain_age_days"] / 365.25

    # Green hosting
    green = ext.get("green_web", {})
    if green:
        out["green_hosting"] = bool(green.get("green"))

    # Readability
    read = ext.get("readability", {})
    if read:
        out["readability"] = {"flesch": read.get("flesch")}

    # Grammar
    grammar = ext.get("grammar_errors")
    if grammar is not None:
        out["grammar_errors"] = grammar

    # Lite-mode enrichments: robots.txt and sitemap data
    robots = ext.get("robots_txt", {})
    if robots and robots.get("exists"):
        # Feed sitemap presence from robots.txt into ai_seo-like signals
        out.setdefault("robots_txt", robots)

    sitemap = ext.get("sitemap", {})
    if sitemap and sitemap.get("exists"):
        out.setdefault("sitemap", sitemap)

    # Track analysis mode in scoring external data
    metadata = ext.get("metadata", {})
    if metadata.get("analysis_mode"):
        out["analysis_mode"] = metadata["analysis_mode"]

    return out
