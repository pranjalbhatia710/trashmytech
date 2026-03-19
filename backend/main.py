"""trashmy.tech — FastAPI server with WebSocket real-time pipeline."""

from __future__ import annotations

import asyncio
import base64
import json
import os
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

import logging
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware
from llm_client import get_client, MODEL_FAST

from db.connection import (init_pool, close_pool, run_migrations,
                           is_available as db_available, health_check as db_health_check)
from db import queries as db_queries
from cache.redis_client import (init_redis, close_redis,
                                is_available as cache_available,
                                CacheManager, health_check as cache_health_check)
from services.persistence import persist_analysis, normalize_domain
from auth.auth_manager import (list_profiles as list_auth_profiles,
                               delete_profile as delete_auth_profile,
                               create_auth_profile)
from auth.user_auth import router as user_auth_router
from auth.stripe_webhook import router as stripe_webhook_router
from pipeline import run_crawl, run_swarm, run_scoring_and_report, run_persist
from external_apis import run_all_external_apis, run_lite_external_checks
from analysis_lite import should_run_external_apis, get_analysis_mode

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("trashmy")

load_dotenv()

# ── Config ──────────────────────────────────────────────────────────

AGENT_COUNT = int(os.getenv("AGENT_COUNT", "12"))

# Audit mode configs: (persona_count, max_steps_per_agent)
AUDIT_MODES = {
    "fast":     (6, 6),
    "standard": (12, 8),
    "deep":     (30, 12),
}
USE_MODAL = os.getenv("USE_MODAL", "false").lower() == "true"

RATE_LIMIT_MAX = 5
RATE_LIMIT_WINDOW = 60
IDEMPOTENCY_TTL = 300


# ── App lifecycle ───────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("Initialising database and cache connections...")
    await init_pool()
    if db_available():
        try:
            await run_migrations()
            log.info("Database migrations applied")
        except Exception:
            log.exception("Database migration failed")
    await init_redis()
    yield
    await close_pool()
    await close_redis()
    log.info("Connections closed")


app = FastAPI(title="trashmy.tech", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ── Register auth & payment routers ──────────────────────────────
app.include_router(user_auth_router, prefix="/v1/auth", tags=["auth"])
app.include_router(stripe_webhook_router, prefix="/v1/stripe", tags=["stripe"])


# ── In-memory stores ───────────────────────────────────────────────

tests_store: dict[str, dict[str, Any]] = {}
screenshots_store: dict[str, dict[str, str]] = {}
rate_limit_store: dict[str, list[float]] = defaultdict(list)
idempotency_cache: dict[str, tuple[str, float]] = {}
preview_cache: dict[str, dict] = {}


# ── Middleware ──────────────────────────────────────────────────────

class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = str(uuid.uuid4())
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response

app.add_middleware(RequestIdMiddleware)


# ── Event log ──────────────────────────────────────────────────────

_event_log: list[dict] = []

def _log_event(level: str, msg: str, data: dict | None = None):
    getattr(log, level, log.info)(msg)
    _event_log.append({"ts": time.strftime("%H:%M:%S"), "level": level, "msg": msg, **(data or {})})
    if len(_event_log) > 200:
        _event_log.pop(0)


# ── Helpers ────────────────────────────────────────────────────────

def _error(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content={"error": {"code": code, "message": message, "status": status}})

def _prune_rate_limit(ip: str, now: float):
    rate_limit_store[ip] = [ts for ts in rate_limit_store[ip] if now - ts < RATE_LIMIT_WINDOW]

def _prune_idempotency(now: float):
    expired = [u for u, (_, ts) in idempotency_cache.items() if now - ts >= IDEMPOTENCY_TTL]
    for u in expired:
        del idempotency_cache[u]


# ===================================================================
# ROUTES
# ===================================================================

# ── Health ─────────────────────────────────────────────────────────

@app.get("/v1/health")
async def health():
    return {
        "status": "ok", "version": "2.0.0",
        "agent_count": AGENT_COUNT, "use_modal": USE_MODAL,
        "analysis_mode": get_analysis_mode(),
        "database": "available" if db_available() else "unavailable",
        "cache": "available" if cache_available() else "unavailable",
    }

@app.get("/v1/health/deep")
async def health_deep():
    db_status = await db_health_check()
    cache_status = await cache_health_check()
    overall = "ok" if db_status.get("status") == "ok" and cache_status.get("status") == "ok" else "degraded"
    return {"status": overall, "database": db_status, "cache": cache_status}

@app.get("/v1/events")
async def get_events():
    return _event_log[-100:]


# ── Keyword extraction ─────────────────────────────────────────────

@app.get("/v1/keyword")
async def extract_keyword(url: str):
    from urllib.parse import urlparse
    from dspy_modules import extract_brand
    try:
        parsed = urlparse(url if "://" in url else f"https://{url}")
        fallback = (parsed.netloc or parsed.path).split(":")[0].replace("www.", "").split(".")[0].upper()
    except Exception:
        fallback = "SITE"

    kw = await asyncio.to_thread(extract_brand, url, fallback)
    return {"keyword": kw}


# ── Test CRUD ──────────────────────────────────────────────────────

@app.post("/v1/tests")
async def create_test(request: Request, force_refresh: bool = Query(False)):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()

    # Rate limit
    _prune_rate_limit(client_ip, now)
    if len(rate_limit_store[client_ip]) >= RATE_LIMIT_MAX:
        return _error("rate_limit_exceeded", f"Maximum {RATE_LIMIT_MAX} tests per minute.", 429)

    # Parse body
    try:
        body = await request.json()
    except Exception:
        return _error("invalid_body", "Request body must be valid JSON.", 400)

    url = body.get("url")
    force_refresh = body.get("force_refresh", force_refresh)
    if not url or not isinstance(url, str):
        return _error("invalid_url", "Field 'url' is required.", 400)
    if not url.startswith(("http://", "https://")):
        return _error("invalid_url", "URL must start with http:// or https://.", 400)

    # Cache-first: check Redis then Postgres
    if not force_refresh:
        cached = await _check_cache(url)
        if cached:
            return cached

    # Idempotency
    _prune_idempotency(now)
    if url in idempotency_cache:
        tid, _ = idempotency_cache[url]
        return {"test_id": tid, "status": tests_store.get(tid, {}).get("status", "queued")}

    # Audit mode
    mode = body.get("mode", "standard")
    if mode not in AUDIT_MODES:
        mode = "standard"

    # Create test
    test_id = str(uuid.uuid4())
    tests_store[test_id] = {
        "test_id": test_id, "url": url, "status": "queued",
        "created_at": now, "crawl_data": None, "agent_results": [],
        "report": None, "auth_profile": body.get("auth_profile"),
        "mode": mode, "user_id": body.get("user_id"),
    }
    rate_limit_store[client_ip].append(now)
    idempotency_cache[url] = (test_id, now)
    _log_event("info", f"test created: {test_id[:8]} -> {url}")
    return {"test_id": test_id, "status": "queued"}


async def _check_cache(url: str) -> dict | None:
    """Try Redis then Postgres for a cached analysis."""
    domain = normalize_domain(url)

    cached_id = await CacheManager.get_cached_analysis(domain)
    if cached_id:
        cached_report = await CacheManager.get_cached_report(cached_id)
        if cached_report:
            _log_event("info", f"cache HIT for {domain}")
            return {"test_id": cached_id, "status": "complete", "cached": True,
                    "analysis_id": cached_id, "report": cached_report}

    try:
        row = await db_queries.get_latest_analysis_for_domain(domain, max_age_days=7)
        if row and row.get("report_json"):
            aid = str(row["id"])
            _log_event("info", f"database HIT for {domain}")
            await CacheManager.cache_analysis(domain, aid)
            report_resp = {
                "id": aid, "domain": row.get("domain", domain),
                "created_at": str(row["created_at"]),
                "overall_score": row.get("overall_score"),
                "report": row["report_json"],
            }
            await CacheManager.cache_report(aid, report_resp)
            return {"test_id": aid, "status": "complete", "cached": True,
                    "analysis_id": aid, "report": report_resp}
    except Exception:
        log.exception("Database cache check failed for %s", domain)
    return None


@app.get("/v1/tests/{test_id}")
async def get_test(test_id: str):
    test = tests_store.get(test_id)
    return test if test else _error("not_found", f"Test '{test_id}' not found.", 404)


@app.get("/v1/tests/{test_id}/report")
async def get_report(test_id: str):
    test = tests_store.get(test_id)
    if not test:
        return _error("not_found", f"Test '{test_id}' not found.", 404)
    if test["report"] is None:
        return _error("report_not_ready", "Report has not been generated yet.", 404)
    return test["report"]


# ── Screenshots ────────────────────────────────────────────────────

@app.get("/v1/tests/{test_id}/screenshots/{persona_id}/{step}")
async def get_screenshot(test_id: str, persona_id: str, step: int):
    b64 = screenshots_store.get(test_id, {}).get(f"{persona_id}/{step}")
    if not b64:
        return _error("not_found", "Screenshot not found.", 404)
    return Response(content=base64.b64decode(b64), media_type="image/jpeg")


@app.get("/v1/tests/{test_id}/annotated-screenshot")
async def get_annotated_screenshot(test_id: str):
    test = tests_store.get(test_id)
    if not test:
        return _error("not_found", f"Test '{test_id}' not found.", 404)
    b64 = (test.get("report") or {}).get("annotated_screenshot_b64")
    if not b64:
        return _error("not_found", "No annotated screenshot available.", 404)
    return Response(content=base64.b64decode(b64), media_type="image/jpeg")


# ── Stored reports & site history ──────────────────────────────────

@app.get("/v1/report/{analysis_id}")
async def get_stored_report(analysis_id: str):
    try:
        uid = UUID(analysis_id)
    except ValueError:
        return _error("invalid_id", "Invalid analysis ID format.", 400)

    cached = await CacheManager.get_cached_report(analysis_id)
    if cached:
        return cached

    row = await db_queries.get_analysis_by_id(uid)
    if not row:
        return _error("not_found", f"Analysis '{analysis_id}' not found.", 404)

    response = {
        "id": str(row["id"]), "domain": row.get("domain", ""),
        "created_at": str(row["created_at"]),
        "overall_score": row.get("overall_score"),
        "accessibility_score": row.get("accessibility_score"),
        "seo_score": row.get("seo_score"),
        "performance_score": row.get("performance_score"),
        "security_score": row.get("security_score"),
        "content_score": row.get("content_score"),
        "ux_score": row.get("ux_score"),
        "total_issues": row.get("total_issues", 0),
        "critical_issues": row.get("critical_issues", 0),
        "execution_time_seconds": row.get("execution_time_seconds"),
        "report": row.get("report_json"),
    }
    if row.get("report_json"):
        await CacheManager.cache_report(analysis_id, response)
    return response


@app.get("/v1/site/{domain}")
async def get_site(domain: str, page: int = Query(1, ge=1), limit: int = Query(10, ge=1, le=100)):
    site = await db_queries.get_site_by_domain(domain)
    if not site:
        return _error("not_found", f"Domain '{domain}' has never been analyzed.", 404)

    analyses, total = await db_queries.get_analyses_for_site(site["id"], page=page, limit=limit)
    return {
        "site": {
            "id": str(site["id"]), "url": site["url"], "domain": site["domain"],
            "category": site.get("category"),
            "first_analyzed": str(site["first_analyzed"]),
            "last_analyzed": str(site["last_analyzed"]),
            "analysis_count": site["analysis_count"],
            "latest_overall_score": site.get("latest_overall_score"),
            "latest_accessibility_score": site.get("latest_accessibility_score"),
            "latest_seo_score": site.get("latest_seo_score"),
            "latest_performance_score": site.get("latest_performance_score"),
            "latest_security_score": site.get("latest_security_score"),
            "latest_content_score": site.get("latest_content_score"),
            "latest_ux_score": site.get("latest_ux_score"),
        },
        "analyses": [
            {"id": str(a["id"]), "created_at": str(a["created_at"]),
             "overall_score": a.get("overall_score"),
             "total_issues": a.get("total_issues", 0),
             "critical_issues": a.get("critical_issues", 0),
             "execution_time_seconds": a.get("execution_time_seconds")}
            for a in analyses
        ],
        "total_analyses": total, "page": page, "limit": limit,
    }


@app.get("/v1/recent")
async def get_recent_sites(limit: int = Query(20, ge=1, le=100)):
    sites = await db_queries.get_recent_sites(limit=limit)
    return {
        "sites": [
            {"domain": s["domain"], "url": s["url"],
             "latest_overall_score": s.get("latest_overall_score"),
             "last_analyzed": str(s["last_analyzed"]),
             "analysis_count": s.get("analysis_count", 1),
             "category": s.get("category")}
            for s in sites
        ],
    }


@app.get("/v1/stats")
async def get_stats():
    stats = await db_queries.get_stats()
    return {
        "total_sites": stats.get("total_sites", 0),
        "total_analyses": stats.get("total_analyses", 0),
        "total_issues": stats.get("total_issues", 0),
        "avg_score": float(stats["avg_score"]) if stats.get("avg_score") is not None else None,
    }


# ── Preview (quick GPT analysis) ──────────────────────────────────

@app.post("/v1/preview")
async def preview_url(request: Request):
    try:
        body = await request.json()
    except Exception:
        return _error("invalid_body", "Request body must be valid JSON.", 400)

    url = body.get("url")
    if not url or not isinstance(url, str):
        return _error("invalid_url", "Field 'url' is required.", 400)
    if not url.startswith(("http://", "https://")):
        return _error("invalid_url", "URL must start with http:// or https://.", 400)

    if url in preview_cache:
        return preview_cache[url]

    try:
        import httpx
        from dspy_modules import preview_site
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as http:
            resp = await http.get(url, headers={"User-Agent": "TrashmyTech/2.0"})
            page_html = resp.text[:8000]

        result = await asyncio.to_thread(preview_site, url, page_html)
        preview_cache[url] = result
        return result
    except Exception as exc:
        return _error("preview_failed", f"Preview failed: {str(exc)[:200]}", 500)


# ── Auth profiles ─────────────────────────────────────────────────

@app.get("/v1/auth/profiles")
async def get_auth_profiles():
    return JSONResponse({"profiles": list_auth_profiles()})

@app.post("/v1/auth/profiles")
async def create_profile(request: Request):
    body = await request.json()
    name, url = body.get("name"), body.get("url")
    if not name or not url:
        return JSONResponse({"error": "name and url are required"}, status_code=400)
    return JSONResponse(await create_auth_profile(name, url))

@app.delete("/v1/auth/profiles/{name}")
async def remove_profile(name: str):
    if delete_auth_profile(name):
        return JSONResponse({"deleted": True, "name": name})
    return JSONResponse({"error": "Profile not found"}, status_code=404)


# ── Dashboard ─────────────────────────────────────────────────────

@app.get("/dash")
async def dashboard():
    return HTMLResponse(DASHBOARD_HTML)

DASHBOARD_HTML = """<!DOCTYPE html>
<html><head>
<title>trashmy.tech — backend dashboard</title>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#08090d; color:#d4d7e0; font-family:'SF Mono',monospace; font-size:12px; padding:20px; }
  h1 { font-size:14px; color:#e8a44a; margin-bottom:16px; font-weight:600; }
  .section { margin-bottom:20px; }
  .label { color:#4a506a; font-size:10px; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:6px; }
  .stat { display:inline-block; background:#0f1117; border:1px solid #252a3a; border-radius:6px; padding:8px 14px; margin:0 6px 6px 0; }
  .stat .val { font-size:18px; font-weight:bold; color:#d4d7e0; }
  .stat .lbl { font-size:9px; color:#4a506a; margin-top:2px; }
  #log { background:#0f1117; border:1px solid #252a3a; border-radius:6px; padding:10px; max-height:60vh; overflow-y:auto; }
  .entry { padding:2px 0; display:flex; gap:8px; border-bottom:1px solid #181b25; }
  .entry .ts { color:#252a3a; flex-shrink:0; }
  .entry.error .msg { color:#ef4444; font-weight:600; }
  .entry.warning .msg { color:#eab308; }
  .entry.info .msg { color:#7a8099; }
  .ok { color:#22c55e; } .fail { color:#ef4444; } .warn { color:#eab308; }
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
    document.getElementById('log').innerHTML = evts.slice(-80).reverse().map(e =>
      `<div class="entry ${e.level}"><span class="ts">${e.ts}</span><span class="msg">${e.msg}</span></div>`
    ).join('');
    document.getElementById('tests').textContent = evts.filter(e => e.msg.includes('test created')).length || '0';
  } catch(e) {}
}
poll(); setInterval(poll, 2000);
</script>
</body></html>"""


# ===================================================================
# WEBSOCKET PIPELINE
# ===================================================================

_active_pipelines: set[str] = set()
# Map test_id -> list of active WebSocket connections (supports reconnects)
_ws_subscribers: dict[str, list[WebSocket]] = defaultdict(list)

@app.websocket("/ws/{test_id}")
async def ws_pipeline(websocket: WebSocket, test_id: str):
    await websocket.accept()

    test = tests_store.get(test_id)
    if not test:
        try:
            await websocket.send_json({"phase": "error", "message": f"Test '{test_id}' not found."})
            await websocket.close()
        except Exception:
            pass
        return

    # If pipeline already running, subscribe as a late-joiner
    if test_id in _active_pipelines:
        _ws_subscribers[test_id].append(websocket)
        # Send catch-up state so the frontend knows the current phase
        try:
            status = test.get("status", "queued")
            if status == "complete" and test.get("report"):
                await websocket.send_json({"phase": "reporting", "status": "complete", "report": test["report"]})
            else:
                # Tell the frontend what phase we're in + how many agents
                mode = test.get("mode", "standard")
                agent_count, _ = AUDIT_MODES.get(mode, AUDIT_MODES["standard"])
                if status in ("crawling", "swarming", "reporting"):
                    await websocket.send_json({"phase": "crawling", "status": "started"})
                if status in ("swarming", "reporting"):
                    # Send crawl data if available
                    if test.get("crawl_data"):
                        await websocket.send_json({"phase": "crawling", "status": "complete", "data": test["crawl_data"]})
                    await websocket.send_json({"phase": "swarming", "status": "started", "agent_count": agent_count, "personas": []})
        except Exception:
            pass
        # Keep connection alive until pipeline finishes or client disconnects
        try:
            while True:
                await websocket.receive_text()
        except (WebSocketDisconnect, Exception):
            pass
        finally:
            try:
                _ws_subscribers[test_id].remove(websocket)
            except ValueError:
                pass
        return

    _active_pipelines.add(test_id)
    _ws_subscribers[test_id].append(websocket)

    url = test["url"]

    async def send(data: dict):
        """Broadcast to all subscribed WebSocket clients."""
        dead: list[WebSocket] = []
        for ws in _ws_subscribers.get(test_id, []):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                _ws_subscribers[test_id].remove(ws)
            except ValueError:
                pass

    try:
        # Resolve audit mode settings
        mode = test.get("mode", "standard")
        agent_count, max_steps = AUDIT_MODES.get(mode, AUDIT_MODES["standard"])

        # Start crawl and swarm together so agents begin immediately after connect.
        test["status"] = "crawling"
        _log_event("info", f"[{test_id[:8]}] crawl started for {url} (mode={mode})")
        crawl_task = asyncio.create_task(run_crawl(url, send))

        # External APIs also run in parallel with the live test.
        # In lite mode, only free/local checks run (SSL, DNS, WHOIS, tech detection).
        analysis_mode = get_analysis_mode()
        if should_run_external_apis():
            ext_task = asyncio.create_task(run_all_external_apis(url))
            _log_event("info", f"[{test_id[:8]}] external APIs: full mode")
        else:
            ext_task = asyncio.create_task(run_lite_external_checks(url))
            _log_event("info", f"[{test_id[:8]}] external APIs: lite mode (free checks only)")

        test["status"] = "swarming"
        _log_event("info", f"[{test_id[:8]}] swarming {agent_count} agents (mode={mode})")
        swarm_task = asyncio.create_task(
            run_swarm(
                url, {}, agent_count, send,
                auth_profile=test.get("auth_profile"),
                max_steps=max_steps,
            )
        )

        crawl_data, agent_results = await asyncio.gather(crawl_task, swarm_task)
        test["crawl_data"] = crawl_data
        test["agent_results"] = agent_results
        _log_event("info", f"[{test_id[:8]}] crawl complete")
        _log_event("info", f"[{test_id[:8]}] swarming complete")

        # Collect external API results
        external_api_data = None
        try:
            external_api_data = await asyncio.wait_for(ext_task, timeout=35.0)
            _log_event("info", f"[{test_id[:8]}] external APIs complete")
        except (asyncio.TimeoutError, Exception) as exc:
            _log_event("warning", f"[{test_id[:8]}] external APIs: {type(exc).__name__}")

        # Phase 3: Score + Report
        test["status"] = "reporting"
        _log_event("info", f"[{test_id[:8]}] scoring and reporting")
        report = await run_scoring_and_report(url, crawl_data, agent_results, external_api_data, send)

        report["audit_mode"] = mode
        report["analysis_mode"] = analysis_mode
        test["report"] = report
        test["status"] = "complete"

        # Strip large data from WS payload to stay under WebSocket size limits
        ws_report = json.loads(json.dumps(report, default=str))
        screenshots_store[test_id] = {}

        # Remove annotated screenshot
        if "annotated_screenshot_b64" in ws_report:
            ws_report.pop("annotated_screenshot_b64")
            ws_report["annotated_screenshot_url"] = f"/v1/tests/{test_id}/annotated-screenshot"

        # Strip all base64 screenshots from sessions, replace with REST URLs
        for session in ws_report.get("sessions_summary", []):
            pid = session.get("persona_id", "")
            # Remove session_log (can be huge)
            session.pop("session_log", None)
            for ss in session.get("screenshots", []):
                b64 = ss.pop("screenshot_b64", None)
                if b64:
                    key = f"{pid}/{ss.get('step', 0)}"
                    screenshots_store[test_id][key] = b64
                    ss["screenshot_url"] = f"/v1/tests/{test_id}/screenshots/{key}"

        # Remove any remaining large base64 strings anywhere in the report
        def _strip_b64(obj):
            if isinstance(obj, dict):
                for k in list(obj.keys()):
                    if isinstance(obj[k], str) and len(obj[k]) > 50000:
                        obj[k] = None  # strip strings > 50KB (likely base64)
                    elif isinstance(obj[k], (dict, list)):
                        _strip_b64(obj[k])
            elif isinstance(obj, list):
                for item in obj:
                    if isinstance(item, (dict, list)):
                        _strip_b64(item)
        _strip_b64(ws_report)

        report_json = json.dumps({"phase": "reporting", "status": "complete", "report": ws_report})
        _log_event("info", f"[{test_id[:8]}] WS report payload: {len(report_json)} bytes")
        await send({"phase": "reporting", "status": "complete", "report": ws_report})
        _log_event("info", f"[{test_id[:8]}] report sent to client")

        # Phase 4: Persist
        duration = time.time() - test["created_at"]
        analysis_id = await run_persist(url, report, agent_results, crawl_data, duration, send,
                                        user_id=test.get("user_id"),
                                        analysis_mode=mode)
        if analysis_id:
            test["analysis_id"] = analysis_id
            _log_event("info", f"[{test_id[:8]}] persisted as {analysis_id[:8]}")

    except WebSocketDisconnect:
        test["status"] = "disconnected"
        _log_event("warning", f"[{test_id[:8]}] client disconnected")
    except Exception as exc:
        test["status"] = "error"
        _log_event("error", f"[{test_id[:8]}] pipeline error: {str(exc)[:300]}")
        await send({"phase": "error", "message": str(exc)[:300]})
    finally:
        _active_pipelines.discard(test_id)
        # Close all subscriber connections
        for ws in _ws_subscribers.pop(test_id, []):
            try:
                await ws.close()
            except Exception:
                pass


# ── Entrypoint ─────────────────────────────────────────────────────

if __name__ == "__main__":
    _log_event("info", f"server starting — agents={AGENT_COUNT}, modal={USE_MODAL}")
    log.info("Dashboard: http://localhost:8000/dash")
    uvicorn.run(app, host="0.0.0.0", port=8000)
