"""trashmy.tech — WebSocket pipeline: crawl -> swarm -> score -> report.

Extracted from main.py for readability. Each phase is a standalone async
function that streams progress over the WebSocket via ``send()``.
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
from external_apis import run_all_external_apis
from scoring import calculate_scores
from quick_wins import generate_quick_wins
from report import generate_report, generate_fix_prompt
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
) -> list[dict]:
    """Launch persona agents in parallel browsers, streaming results live."""
    from playwright.async_api import async_playwright as pw_start

    personas = sample_personas(agent_count)
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

    # Launch browsers
    pw = await pw_start().start()
    browsers = []
    for _ in range(num_browsers):
        browsers.append(await pw.chromium.launch(
            headless=not headed,
            slow_mo=80 if headed else 0,
        ))

    # Distribute personas round-robin across browsers
    assignments: list[list[tuple[int, dict]]] = [[] for _ in range(num_browsers)]
    for i, persona in enumerate(personas):
        assignments[i % num_browsers].append((i, persona))

    final_results: list[dict | None] = [None] * len(personas)
    results_lock = asyncio.Lock()

    async def _run_agent(idx: int, persona: dict, browser):
        await asyncio.sleep((idx % num_browsers) * 0.2)
        try:
            result = await run_agent_local(
                url, persona, site_context,
                on_step_screenshot=on_screenshot,
                shared_browser=browser,
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
            *(_run_agent(idx, p, browser) for idx, p in assignments[bi]),
            return_exceptions=True,
        )

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
    step_summaries = [
        {
            "step": s.get("step_number"), "action": s.get("action"),
            "target": (s.get("target_element") or "")[:60],
            "result": (s.get("result") or "")[:80],
            "target_size": s.get("target_size_px"),
            "timestamp_ms": s.get("timestamp_ms"),
            "click_strategy": s.get("click_strategy"),
            "failure_classification": s.get("failure_classification"),
        }
        for s in result.get("steps", [])
    ]

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
    steps = result.get("steps", [])
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
) -> dict:
    """Calculate scores, quick wins, generate report with fix prompt."""

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

    return report


# ── Phase 4: Persist ────────────────────────────────────────────────

async def run_persist(url: str, report: dict, agent_results: list[dict],
                      crawl_data: dict, duration: float, send: Send) -> str | None:
    """Save analysis to DB + cache. Returns analysis_id or None."""
    try:
        analysis_id = await persist_analysis(
            url=url, report=report, sessions=agent_results,
            crawl_data=crawl_data, execution_time_seconds=duration,
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

    return out
