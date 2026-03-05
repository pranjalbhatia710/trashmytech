"""trashmy.tech — FastAPI server with WebSocket real-time pipeline."""

from __future__ import annotations

import asyncio
import json
import os
import time
import traceback
import uuid
from collections import defaultdict
from typing import Any

import logging
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from starlette.middleware.base import BaseHTTPMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("trashmy")

from crawler import crawl_site
from personas import sample_personas
from report import generate_report, generate_fix_prompt
from agent import run_agent_local
from annotator import annotate_screenshot
from gemini_tools import GeminiTools

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
AGENT_COUNT = int(os.getenv("AGENT_COUNT", "20"))  # Default 20
USE_MODAL = os.getenv("USE_MODAL", "false").lower() == "true"

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="trashmy.tech", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# In-memory stores
# ---------------------------------------------------------------------------
tests_store: dict[str, dict[str, Any]] = {}
screenshots_store: dict[str, dict[str, str]] = {}  # {test_id: {"persona_id/step": b64, ...}}
rate_limit_store: dict[str, list[float]] = defaultdict(list)
idempotency_cache: dict[str, tuple[str, float]] = {}
preview_cache: dict[str, dict] = {}  # URL → preview result

RATE_LIMIT_MAX = 5
RATE_LIMIT_WINDOW = 60
IDEMPOTENCY_TTL = 300


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response


app.add_middleware(RequestIdMiddleware)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _error_response(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "status": status}},
    )


def _prune_rate_limit(ip: str, now: float) -> None:
    rate_limit_store[ip] = [ts for ts in rate_limit_store[ip] if now - ts < RATE_LIMIT_WINDOW]


def _prune_idempotency(now: float) -> None:
    expired = [url for url, (_, ts) in idempotency_cache.items() if now - ts >= IDEMPOTENCY_TTL]
    for url in expired:
        del idempotency_cache[url]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/v1/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "agent_count": AGENT_COUNT, "use_modal": USE_MODAL}


# Live event log for diagnostics page
_event_log: list[dict] = []
MAX_EVENT_LOG = 200

def _log_event(level: str, msg: str, data: dict | None = None):
    """Log an event to both Python logger and the in-memory event buffer."""
    getattr(log, level, log.info)(msg)
    _event_log.append({
        "ts": time.strftime("%H:%M:%S"),
        "level": level,
        "msg": msg,
        **(data or {}),
    })
    if len(_event_log) > MAX_EVENT_LOG:
        _event_log.pop(0)


@app.get("/v1/events")
async def get_events():
    return _event_log[-100:]


@app.get("/dash")
async def dashboard():
    """Live backend diagnostics dashboard."""
    return HTMLResponse("""<!DOCTYPE html>
<html><head>
<title>trashmy.tech — backend dashboard</title>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0a0a0c; color:#e8e6e3; font-family:'SF Mono',monospace; font-size:12px; padding:20px; }
  h1 { font-size:14px; color:#e8a44a; margin-bottom:16px; font-weight:600; }
  .section { margin-bottom:20px; }
  .label { color:#5a5660; font-size:10px; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:6px; }
  .stat { display:inline-block; background:#111114; border:1px solid #2a2a32; border-radius:6px; padding:8px 14px; margin:0 6px 6px 0; }
  .stat .val { font-size:18px; font-weight:bold; color:#e8e6e3; }
  .stat .lbl { font-size:9px; color:#5a5660; margin-top:2px; }
  #log { background:#111114; border:1px solid #2a2a32; border-radius:6px; padding:10px; max-height:60vh; overflow-y:auto; }
  .entry { padding:2px 0; display:flex; gap:8px; border-bottom:1px solid #1a1a1f; }
  .entry .ts { color:#2a2a32; flex-shrink:0; }
  .entry.error .msg { color:#f87171; font-weight:600; }
  .entry.warning .msg { color:#fbbf24; }
  .entry.info .msg { color:#8a8690; }
  .ok { color:#4ade80; } .fail { color:#f87171; } .warn { color:#fbbf24; }
</style>
</head><body>
<h1>trashmy.tech backend</h1>
<div class="section">
  <div class="label">Config</div>
  <div class="stat"><div class="val" id="agents">-</div><div class="lbl">agents</div></div>
  <div class="stat"><div class="val" id="modal">-</div><div class="lbl">modal</div></div>
  <div class="stat"><div class="val" id="tests">-</div><div class="lbl">tests</div></div>
  <div class="stat"><div class="val" id="headless">-</div><div class="lbl">headless</div></div>
</div>
<div class="section">
  <div class="label">Active tests</div>
  <div id="active">none</div>
</div>
<div class="section">
  <div class="label">Event log (live)</div>
  <div id="log"></div>
</div>
<script>
async function poll() {
  try {
    const h = await (await fetch('/v1/health')).json();
    document.getElementById('agents').textContent = h.agent_count;
    document.getElementById('modal').textContent = h.use_modal ? 'ON' : 'OFF';
    document.getElementById('headless').textContent = 'true';
  } catch(e) {}
  try {
    const evts = await (await fetch('/v1/events')).json();
    const el = document.getElementById('log');
    el.innerHTML = evts.slice(-80).reverse().map(e =>
      `<div class="entry ${e.level}"><span class="ts">${e.ts}</span><span class="msg">${e.msg}</span></div>`
    ).join('');
    document.getElementById('tests').textContent = evts.filter(e => e.msg.includes('test created')).length || '0';
  } catch(e) {}
}
poll(); setInterval(poll, 2000);
</script>
</body></html>""")


@app.post("/v1/tests")
async def create_test(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    _prune_rate_limit(client_ip, now)
    if len(rate_limit_store[client_ip]) >= RATE_LIMIT_MAX:
        return _error_response("rate_limit_exceeded", f"Maximum {RATE_LIMIT_MAX} tests per minute.", 429)

    try:
        body = await request.json()
    except Exception:
        return _error_response("invalid_body", "Request body must be valid JSON.", 400)

    url = body.get("url")
    if not url or not isinstance(url, str):
        return _error_response("invalid_url", "Field 'url' is required.", 400)
    if not url.startswith("http://") and not url.startswith("https://"):
        return _error_response("invalid_url", "URL must start with http:// or https://.", 400)

    _prune_idempotency(now)
    if url in idempotency_cache:
        cached_id, _ = idempotency_cache[url]
        return {"test_id": cached_id, "status": tests_store.get(cached_id, {}).get("status", "queued")}

    test_id = str(uuid.uuid4())
    tests_store[test_id] = {
        "test_id": test_id, "url": url, "status": "queued",
        "created_at": now, "crawl_data": None, "agent_results": [], "report": None,
    }
    rate_limit_store[client_ip].append(now)
    idempotency_cache[url] = (test_id, now)

    _log_event("info", f"test created: {test_id[:8]} -> {url}")
    return {"test_id": test_id, "status": "queued"}


@app.get("/v1/tests/{test_id}")
async def get_test(test_id: str):
    test = tests_store.get(test_id)
    if not test:
        return _error_response("not_found", f"Test '{test_id}' not found.", 404)
    return test


@app.get("/v1/tests/{test_id}/report")
async def get_report(test_id: str):
    test = tests_store.get(test_id)
    if not test:
        return _error_response("not_found", f"Test '{test_id}' not found.", 404)
    if test["report"] is None:
        return _error_response("report_not_ready", "Report has not been generated yet.", 404)
    return test["report"]


@app.get("/v1/tests/{test_id}/screenshots/{persona_id}/{step}")
async def get_screenshot(test_id: str, persona_id: str, step: int):
    key = f"{persona_id}/{step}"
    store = screenshots_store.get(test_id, {})
    b64 = store.get(key)
    if not b64:
        return _error_response("not_found", "Screenshot not found.", 404)
    import base64
    from fastapi.responses import Response
    return Response(content=base64.b64decode(b64), media_type="image/jpeg")


@app.get("/v1/tests/{test_id}/annotated-screenshot")
async def get_annotated_screenshot(test_id: str):
    test = tests_store.get(test_id)
    if not test:
        return _error_response("not_found", f"Test '{test_id}' not found.", 404)
    report = test.get("report")
    if not report:
        return _error_response("not_found", "Report not ready.", 404)
    b64 = report.get("annotated_screenshot_b64")
    if not b64:
        return _error_response("not_found", "No annotated screenshot available.", 404)
    import base64
    from fastapi.responses import Response
    return Response(content=base64.b64decode(b64), media_type="image/jpeg")


# ---------------------------------------------------------------------------
# Preview — quick Gemini Flash analysis
# ---------------------------------------------------------------------------
@app.post("/v1/preview")
async def preview_url(request: Request):
    try:
        body = await request.json()
    except Exception:
        return _error_response("invalid_body", "Request body must be valid JSON.", 400)

    url = body.get("url")
    if not url or not isinstance(url, str):
        return _error_response("invalid_url", "Field 'url' is required.", 400)
    if not url.startswith("http://") and not url.startswith("https://"):
        return _error_response("invalid_url", "URL must start with http:// or https://.", 400)

    # Return cached result if available
    if url in preview_cache:
        return preview_cache[url]

    try:
        tools = GeminiTools(model="flash")
        raw = await asyncio.to_thread(
            tools.analyze_url,
            url,
            (
                "Analyze this website and return a JSON object with exactly these fields:\n"
                '- "site_name": the name or title of the site\n'
                '- "description": one sentence describing what this site does\n'
                '- "audience": who the target audience is (one sentence)\n'
                '- "observations": an array of exactly 3 strings, each a brief UX, accessibility, or performance observation about the site\n'
                "Be specific and concise. Base observations on what you can actually see on the page."
            ),
        )
        result = json.loads(raw)
        preview_cache[url] = result
        return result
    except Exception as exc:
        return _error_response("preview_failed", f"Preview failed: {str(exc)[:200]}", 500)


# ---------------------------------------------------------------------------
# WebSocket — real-time pipeline
# ---------------------------------------------------------------------------
_active_pipelines: set[str] = set()

@app.websocket("/ws/{test_id}")
async def ws_pipeline(websocket: WebSocket, test_id: str):
    await websocket.accept()

    test = tests_store.get(test_id)
    if not test:
        await websocket.send_json({"phase": "error", "message": f"Test '{test_id}' not found."})
        await websocket.close()
        return

    # Prevent duplicate pipeline runs (React strict mode double-mounts)
    if test_id in _active_pipelines:
        # Pipeline already running — just close this duplicate connection silently
        _log_event("info", f"[{test_id[:8]}] duplicate WS connection rejected (pipeline already running)")
        await websocket.close()
        return
    _active_pipelines.add(test_id)

    url = test["url"]

    try:
        # ── Phase 1: Crawling ─────────────────────────────────
        test["status"] = "crawling"
        _log_event("info", f"[{test_id[:8]}] crawl started for {url}")
        await websocket.send_json({"phase": "crawling", "status": "started"})

        async def _crawl_screenshot_cb(b64: str):
            try:
                _log_event("info", f"[{test_id[:8]}] crawl screenshot captured")
                await websocket.send_json({
                    "phase": "crawling",
                    "type": "screenshot",
                    "screenshot_b64": b64,
                })
            except Exception:
                pass

        crawl_data = await crawl_site(url, on_screenshot=_crawl_screenshot_cb)
        _log_event("info", f"[{test_id[:8]}] crawl complete — {len(crawl_data.get('links', []))} links, {len(crawl_data.get('forms', []))} forms")
        test["crawl_data"] = crawl_data

        # Extract counts safely
        links_count = len(crawl_data.get("links", []))
        forms_count = len(crawl_data.get("forms", []))
        buttons_count = len(crawl_data.get("buttons", []))
        images_data = crawl_data.get("images", {})
        images_missing = images_data.get("missing_alt", 0) if isinstance(images_data, dict) else 0
        violations = crawl_data.get("accessibility_violations", [])
        violations_count = len(violations) if isinstance(violations, list) else 0
        page_title = crawl_data.get("title", "")
        load_time = crawl_data.get("page_load_time_ms", 0)

        # Send crawl screenshot to frontend for the browser viewer
        crawl_screenshot_b64 = crawl_data.get("screenshot_base64")
        if crawl_screenshot_b64:
            try:
                await websocket.send_json({
                    "phase": "crawling",
                    "type": "screenshot",
                    "screenshot_b64": crawl_screenshot_b64,
                })
            except Exception:
                pass

        await websocket.send_json({
            "phase": "crawling", "status": "complete",
            "data": {
                "page_title": page_title,
                "links_count": links_count,
                "forms_count": forms_count,
                "buttons_count": buttons_count,
                "images_missing_alt": images_missing,
                "accessibility_violations_count": violations_count,
                "load_time_ms": load_time,
            },
        })

        # ── Phase 2: Swarming ─────────────────────────────────
        personas = sample_personas(AGENT_COUNT)
        agent_count = len(personas)
        test["status"] = "swarming"
        _log_event("info", f"[{test_id[:8]}] swarming started — {agent_count} agents, USE_MODAL={USE_MODAL}")

        await websocket.send_json({
            "phase": "swarming", "status": "started", "agent_count": agent_count,
            "personas": [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "age": p["age"],
                    "category": p["category"],
                    "description": p["description"],
                }
                for p in personas
            ],
        })

        # Notify client about each agent with a brief delay for visual stagger
        for persona in personas:
            await websocket.send_json({
                "phase": "swarming",
                "agent_id": persona["id"],
                "persona_name": persona["name"],
                "persona_age": persona["age"],
                "persona_category": persona["category"],
                "persona_description": persona["description"],
                "status": "running",
            })
            # Also send a log event so frontend log is descriptive
            await websocket.send_json({
                "phase": "swarming",
                "type": "log",
                "level": "info",
                "message": f"{persona['name']} ({persona['category']}) launching browser...",
            })

        # Build site context
        seo = crawl_data.get("seo", {})
        site_context = {
            "page_title": page_title,
            "links_count": links_count,
            "forms_count": forms_count,
            "has_h1": seo.get("has_h1", False),
        }

        # Screenshot streaming callback
        screenshot_queue: asyncio.Queue = asyncio.Queue()

        async def on_screenshot(agent_id, step_num, b64):
            _log_event("info", f"[{test_id[:8]}] screenshot: agent={agent_id} step={step_num}")
            await screenshot_queue.put((agent_id, step_num, b64))

        async def screenshot_sender():
            while True:
                item = await screenshot_queue.get()
                if item is None:
                    break
                aid, step_num, b64 = item
                try:
                    await websocket.send_json({
                        "phase": "swarming",
                        "type": "screenshot",
                        "agent_id": aid,
                        "step": step_num,
                        "screenshot_b64": b64,
                    })
                except Exception:
                    pass

        sender_task = asyncio.create_task(screenshot_sender())

        # Helper to process a completed agent result and stream to client
        async def _process_agent_result(result, persona, idx):
            if isinstance(result, Exception):
                result = {
                    "agent_id": persona["id"],
                    "persona": {
                        "id": persona["id"],
                        "name": persona["name"],
                        "age": persona["age"],
                        "category": persona["category"],
                        "description": persona["description"],
                    },
                    "task_completed": False,
                    "outcome": "blocked",
                    "total_time_ms": 0,
                    "steps": [],
                    "findings": [],
                    "form_test_results": [],
                    "issues_found": 1,
                    "errors": [str(result)[:200]],
                    "dead_ends": ["Agent crashed"],
                    "steps_taken": 0,
                }

            # Stream step summaries
            step_summaries = []
            for step in result.get("steps", []):
                step_summaries.append({
                    "step": step.get("step_number"),
                    "action": step.get("action"),
                    "target": step.get("target_element", "")[:60],
                    "result": step.get("result", "")[:80],
                    "target_size": step.get("target_size_px"),
                    "timestamp_ms": step.get("timestamp_ms"),
                    "click_strategy": step.get("click_strategy"),
                    "failure_classification": step.get("failure_classification"),
                })

            await websocket.send_json({
                "phase": "swarming",
                "agent_id": result.get("agent_id", persona["id"]),
                "persona_name": persona["name"],
                "status": "complete",
                "task_completed": result.get("task_completed", False),
                "outcome": result.get("outcome", "struggled"),
                "total_time_ms": result.get("total_time_ms", 0),
                "issues_found": result.get("issues_found", 0),
                "tool_limitation_count": result.get("tool_limitation_count", 0),
                "steps": step_summaries,
                "findings": result.get("findings", [])[:10],
            })

            # Annotate the last screenshot with agent findings and stream it
            findings = result.get("findings", [])
            steps = result.get("steps", [])
            if findings and steps:
                last_b64 = None
                for s in reversed(steps):
                    if s.get("screenshot_b64"):
                        last_b64 = s["screenshot_b64"]
                        break
                if last_b64:
                    try:
                        annotated_b64 = await annotate_screenshot(
                            last_b64, findings, url
                        )
                        await websocket.send_json({
                            "phase": "swarming",
                            "type": "annotated_screenshot",
                            "agent_id": result.get("agent_id", persona["id"]),
                            "screenshot_b64": annotated_b64,
                        })
                    except Exception as e:
                        print(f"Agent annotation failed: {e}")

            return result

        # Launch Chromium browsers, distribute agents across them
        from playwright.async_api import async_playwright as pw_start

        NUM_BROWSERS = min(int(os.getenv("NUM_BROWSERS", "10")), 10, agent_count)
        headed = os.getenv("HEADLESS", "true").lower() == "false"

        _log_event("info", f"[{test_id[:8]}] launching {NUM_BROWSERS} Chromium browsers (headed={headed})...")

        pw = await pw_start().start()
        browsers = []
        for bi in range(NUM_BROWSERS):
            b = await pw.chromium.launch(
                headless=not headed,
                slow_mo=80 if headed else 0,
            )
            browsers.append(b)
            _log_event("info", f"[{test_id[:8]}] browser {bi+1}/{NUM_BROWSERS} launched (pid {b.contexts})")

        _log_event("info", f"[{test_id[:8]}] all {NUM_BROWSERS} browsers ready — distributing {len(personas)} agents")

        # Distribute personas across browsers: round-robin
        # Each browser gets ~2 agents running as separate tabs (contexts)
        browser_assignments: list[list[tuple[int, dict]]] = [[] for _ in range(NUM_BROWSERS)]
        for i, persona in enumerate(personas):
            browser_assignments[i % NUM_BROWSERS].append((i, persona))

        final_results: list = [None] * len(personas)
        results_lock = asyncio.Lock()
        _agents_started = 0
        _agents_done = 0

        async def _run_agent_on_browser(idx: int, persona: dict, browser):
            nonlocal _agents_started, _agents_done
            # Brief stagger per browser group
            await asyncio.sleep((idx % NUM_BROWSERS) * 0.2)
            _agents_started += 1
            name = persona['name']
            browser_num = idx % NUM_BROWSERS + 1
            _log_event("info", f"[{test_id[:8]}] [{_agents_started}/{len(personas)}] {name} -> browser {browser_num}")
            try:
                await websocket.send_json({
                    "phase": "swarming",
                    "type": "log",
                    "level": "info",
                    "message": f"{name} opening tab on browser {browser_num}...",
                })
            except Exception:
                pass
            try:
                result = await run_agent_local(
                    url, persona, site_context,
                    on_step_screenshot=on_screenshot,
                    shared_browser=browser,
                )
            except Exception as exc:
                _log_event("error", f"[{test_id[:8]}] {name} CRASHED: {str(exc)[:150]}")
                result = exc
            _agents_done += 1
            steps = result.get('steps_taken', 0) if isinstance(result, dict) else 0
            issues = result.get('issues_found', 0) if isinstance(result, dict) else 0
            errs = result.get('errors', []) if isinstance(result, dict) else [str(result)]
            _log_event("info", f"[{test_id[:8]}] [{_agents_done}/{len(personas)}] {name} done — {steps} steps, {issues} issues")
            if errs:
                for err in errs[:2]:
                    _log_event("warning", f"[{test_id[:8]}] {name}: {str(err)[:120]}")
            async with results_lock:
                processed = await _process_agent_result(result, persona, idx)
                final_results[idx] = processed

        async def _run_browser_group(browser_idx: int):
            """Run all agents assigned to one browser concurrently (as separate tabs)."""
            browser = browsers[browser_idx]
            group = browser_assignments[browser_idx]
            await asyncio.gather(
                *(_run_agent_on_browser(idx, persona, browser) for idx, persona in group),
                return_exceptions=True,
            )

        # Run all browser groups in parallel
        await asyncio.gather(
            *(_run_browser_group(bi) for bi in range(NUM_BROWSERS)),
            return_exceptions=True,
        )

        # Fill any failed slots
        failed_count = 0
        for i in range(len(final_results)):
            if final_results[i] is None:
                failed_count += 1
                _log_event("error", f"[{test_id[:8]}] {personas[i]['name']} returned None")
                final_results[i] = await _process_agent_result(
                    Exception("Agent failed silently"), personas[i], i
                )
        if failed_count:
            _log_event("warning", f"[{test_id[:8]}] {failed_count}/{len(personas)} agents failed")

        # Cleanup all browsers
        _log_event("info", f"[{test_id[:8]}] closing {NUM_BROWSERS} browsers...")
        for b in browsers:
            try:
                await b.close()
            except Exception:
                pass
        try:
            await pw.stop()
        except Exception:
            pass

        # Stop screenshot sender
        await screenshot_queue.put(None)
        await sender_task
        _log_event("info", f"[{test_id[:8]}] all {len(personas)} agents complete across {NUM_BROWSERS} browsers")

        test["agent_results"] = final_results

        # ── Phase 3: Reporting ────────────────────────────────
        test["status"] = "reporting"
        _log_event("info", f"[{test_id[:8]}] report generation started")
        await websocket.send_json({"phase": "reporting", "status": "started"})

        report = await generate_report(crawl_data, final_results)
        _log_event("info", f"[{test_id[:8]}] report generated — score={report.get('score', {}).get('overall', '?')}")

        # Generate LLM fix prompt using Gemini Flash
        try:
            fix_prompt = await generate_fix_prompt(report, url)
            report["fix_prompt"] = fix_prompt
        except Exception as e:
            print(f"Fix prompt generation failed: {e}")
            report["fix_prompt"] = None

        test["report"] = report
        test["status"] = "complete"

        # Extract screenshots from report, store separately, replace with URLs
        screenshots_store[test_id] = {}
        ws_report = json.loads(json.dumps(report, default=str))  # deep copy
        # Remove large annotated screenshot from WS payload — serve via REST
        if "annotated_screenshot_b64" in ws_report:
            ws_report.pop("annotated_screenshot_b64")
            ws_report["annotated_screenshot_url"] = f"/v1/tests/{test_id}/annotated-screenshot"
        for session in ws_report.get("sessions_summary", []):
            pid = session.get("persona_id", "")
            for ss in session.get("screenshots", []):
                b64 = ss.pop("screenshot_b64", None)
                if b64:
                    step_num = ss.get("step", 0)
                    screenshots_store[test_id][f"{pid}/{step_num}"] = b64
                    ss["screenshot_url"] = f"/v1/tests/{test_id}/screenshots/{pid}/{step_num}"

        await websocket.send_json({
            "phase": "reporting", "status": "complete", "report": ws_report,
        })

    except WebSocketDisconnect:
        test["status"] = "disconnected"
        _log_event("warning", f"[{test_id[:8]}] client disconnected")
    except Exception as exc:
        test["status"] = "error"
        _log_event("error", f"[{test_id[:8]}] PIPELINE ERROR: {str(exc)[:300]}")
        log.error(f"Pipeline error: {traceback.format_exc()}")
        try:
            await websocket.send_json({
                "phase": "error", "message": str(exc)[:300],
            })
        except Exception:
            pass
    finally:
        _active_pipelines.discard(test_id)
        try:
            await websocket.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    _log_event("info", f"server starting — agents={AGENT_COUNT}, modal={USE_MODAL}, headless={os.getenv('HEADLESS', 'true')}")
    log.info(f"Dashboard: http://localhost:8000/dash")
    uvicorn.run(app, host="0.0.0.0", port=8000)
