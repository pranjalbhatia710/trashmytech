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

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from crawler import crawl_site
from personas import sample_personas
from report import generate_report
from agent import run_agent_local

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
AGENT_COUNT = int(os.getenv("AGENT_COUNT", "5"))  # Default 5, scale to 20
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
# WebSocket — real-time pipeline
# ---------------------------------------------------------------------------
@app.websocket("/ws/{test_id}")
async def ws_pipeline(websocket: WebSocket, test_id: str):
    await websocket.accept()

    test = tests_store.get(test_id)
    if not test:
        await websocket.send_json({"phase": "error", "message": f"Test '{test_id}' not found."})
        await websocket.close()
        return

    url = test["url"]

    try:
        # ── Phase 1: Crawling ─────────────────────────────────
        test["status"] = "crawling"
        await websocket.send_json({"phase": "crawling", "status": "started"})

        crawl_data = await crawl_site(url)
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

        # Notify client about each agent
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

        # Build site context
        seo = crawl_data.get("seo", {})
        site_context = {
            "page_title": page_title,
            "links_count": links_count,
            "forms_count": forms_count,
            "has_h1": seo.get("has_h1", False),
        }

        # Run agents
        if USE_MODAL:
            agent_results = await _run_agents_modal(url, personas, site_context)
        else:
            agent_results = await asyncio.gather(
                *(run_agent_local(url, persona, site_context) for persona in personas),
                return_exceptions=True,
            )

        # Process results and stream to client
        final_results = []
        for i, result in enumerate(agent_results):
            if isinstance(result, Exception):
                result = {
                    "agent_id": personas[i]["id"],
                    "persona": {
                        "id": personas[i]["id"],
                        "name": personas[i]["name"],
                        "age": personas[i]["age"],
                        "category": personas[i]["category"],
                        "description": personas[i]["description"],
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
            final_results.append(result)

            # Stream step summaries (no screenshots in WS to save bandwidth)
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
                "agent_id": result.get("agent_id", personas[i]["id"]),
                "persona_name": personas[i]["name"],
                "status": "complete",
                "task_completed": result.get("task_completed", False),
                "outcome": result.get("outcome", "struggled"),
                "total_time_ms": result.get("total_time_ms", 0),
                "issues_found": result.get("issues_found", 0),
                "tool_limitation_count": result.get("tool_limitation_count", 0),
                "steps": step_summaries,
                "findings": result.get("findings", [])[:10],
            })

        test["agent_results"] = final_results

        # ── Phase 3: Reporting ────────────────────────────────
        test["status"] = "reporting"
        await websocket.send_json({"phase": "reporting", "status": "started"})

        report = await generate_report(crawl_data, final_results)
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
    except Exception as exc:
        test["status"] = "error"
        print(f"Pipeline error: {traceback.format_exc()}")
        try:
            await websocket.send_json({
                "phase": "error", "message": str(exc)[:300],
            })
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Modal execution (optional)
# ---------------------------------------------------------------------------
async def _run_agents_modal(url: str, personas: list[dict], site_context: dict) -> list[dict]:
    """Run agents on Modal for parallel serverless execution."""
    try:
        from modal_agent import run_agent_remote
        tasks = [
            asyncio.to_thread(run_agent_remote, url, persona, site_context)
            for persona in personas
        ]
        return await asyncio.gather(*tasks, return_exceptions=True)
    except ImportError:
        print("Modal not configured, falling back to local execution")
        from agent import run_swarm_local
        return await run_swarm_local(url, personas, site_context)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print(f"Starting trashmy.tech server (agents={AGENT_COUNT}, modal={USE_MODAL})")
    uvicorn.run(app, host="0.0.0.0", port=8000)
