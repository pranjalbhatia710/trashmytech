"""
crawler.py — Async website crawler for trashmy.tech

Launches headless Chromium via Playwright, captures page metadata, structure,
accessibility violations (axe-core), and a resized screenshot. Designed to
never crash: every section is individually guarded so partial results are
always returned.
"""

from __future__ import annotations

import asyncio
import base64
import io
import time
import traceback
from typing import Any
from urllib.parse import urljoin

from PIL import Image
from playwright.async_api import async_playwright, Page, Error as PlaywrightError

# ---------------------------------------------------------------------------
# Axe-core CDN URL (pinned version for reproducibility)
# ---------------------------------------------------------------------------
AXE_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js"

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _safe(coro, default=None):
    """Await *coro* and swallow any exception, returning *default* instead."""
    try:
        return await coro
    except Exception:
        return default


def _safe_sync(fn, default=None):
    """Call *fn()* synchronously and swallow any exception."""
    try:
        return fn()
    except Exception:
        return default


async def _collect_links(page: Page, base_url: str, max_links: int = 30) -> list[dict]:
    """Return up to *max_links* anchor elements with href and text."""
    try:
        raw = await page.evaluate(
            """(maxLinks) => {
                const anchors = Array.from(document.querySelectorAll('a[href]'));
                return anchors.slice(0, maxLinks).map(a => ({
                    href: a.href,
                    text: (a.innerText || '').trim().substring(0, 200)
                }));
            }""",
            max_links,
        )
        # Resolve relative URLs on the Python side as a safety net
        for link in raw:
            if link.get("href") and not link["href"].startswith(("http://", "https://", "mailto:", "tel:")):
                link["href"] = urljoin(base_url, link["href"])
        return raw
    except Exception:
        return []


async def _collect_forms(page: Page) -> list[dict]:
    """Return every <form> with its fields (inputs, selects, textareas)."""
    try:
        return await page.evaluate(
            """() => {
                return Array.from(document.querySelectorAll('form')).map((form, idx) => {
                    const fields = Array.from(
                        form.querySelectorAll('input, select, textarea')
                    ).map(el => ({
                        tag: el.tagName.toLowerCase(),
                        name: el.getAttribute('name') || null,
                        type: el.getAttribute('type') || (el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName === 'SELECT' ? 'select' : null),
                        placeholder: el.getAttribute('placeholder') || null,
                        required: el.hasAttribute('required')
                    }));
                    return {
                        index: idx,
                        action: form.getAttribute('action') || null,
                        method: (form.getAttribute('method') || 'GET').toUpperCase(),
                        fields: fields
                    };
                });
            }"""
        )
    except Exception:
        return []


async def _collect_buttons(page: Page) -> list[dict]:
    """Return every <button> and <input type="submit|button|reset">."""
    try:
        return await page.evaluate(
            """() => {
                const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], input[type="reset"]'));
                return btns.map(b => ({
                    text: (b.innerText || b.value || '').trim().substring(0, 200),
                    type: b.getAttribute('type') || 'submit',
                    tag: b.tagName.toLowerCase()
                }));
            }"""
        )
    except Exception:
        return []


async def _collect_images(page: Page) -> dict:
    """Return total image count and how many are missing alt text."""
    try:
        return await page.evaluate(
            """() => {
                const imgs = Array.from(document.querySelectorAll('img'));
                const missingAlt = imgs.filter(i => !i.getAttribute('alt') || i.getAttribute('alt').trim() === '').length;
                return { total: imgs.length, missing_alt: missingAlt };
            }"""
        )
    except Exception:
        return {"total": 0, "missing_alt": 0}


async def _check_seo(page: Page) -> dict:
    """Check for h1, meta description, and viewport meta tag."""
    try:
        return await page.evaluate(
            """() => {
                const h1 = document.querySelector('h1');
                const metaDesc = document.querySelector('meta[name="description"]');
                const viewport = document.querySelector('meta[name="viewport"]');
                return {
                    has_h1: !!h1,
                    h1_text: h1 ? h1.innerText.trim().substring(0, 300) : null,
                    has_meta_description: !!metaDesc,
                    meta_description: metaDesc ? metaDesc.getAttribute('content') : null,
                    has_viewport: !!viewport
                };
            }"""
        )
    except Exception:
        return {
            "has_h1": False,
            "h1_text": None,
            "has_meta_description": False,
            "meta_description": None,
            "has_viewport": False,
        }


async def _run_axe(page: Page) -> list[dict]:
    """Inject axe-core from CDN and return accessibility violations."""
    try:
        # Inject axe-core
        await page.evaluate(
            """async (cdnUrl) => {
                if (typeof axe !== 'undefined') return;
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = cdnUrl;
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
            }""",
            AXE_CDN_URL,
        )
        # Small grace period for script initialization
        await asyncio.sleep(0.3)

        results = await page.evaluate(
            """async () => {
                const results = await axe.run();
                return results.violations.map(v => ({
                    id: v.id,
                    impact: v.impact,
                    description: v.description,
                    help: v.help,
                    helpUrl: v.helpUrl,
                    nodes_count: v.nodes.length
                }));
            }"""
        )
        return results
    except Exception:
        return []


async def _capture_screenshot_b64(page: Page, width: int = 800) -> str | None:
    """Take a full-page screenshot, resize to *width* px wide, return base64."""
    try:
        raw_bytes = await page.screenshot(full_page=True, type="png")
        img = Image.open(io.BytesIO(raw_bytes))

        # Resize proportionally
        original_w, original_h = img.size
        if original_w > 0:
            ratio = width / original_w
            new_h = max(1, int(original_h * ratio))
            img = img.resize((width, new_h), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def crawl_site(url: str) -> dict:
    """
    Crawl *url* with headless Chromium and return a structured dict of results.

    The function **never raises**. If a subsystem fails, its key will contain
    a sensible default (empty list, None, etc.) and the ``errors`` list will
    describe what went wrong.
    """
    result: dict[str, Any] = {
        "url": url,
        "success": False,
        "title": None,
        "links": [],
        "forms": [],
        "buttons": [],
        "images": {"total": 0, "missing_alt": 0},
        "seo": {
            "has_h1": False,
            "h1_text": None,
            "has_meta_description": False,
            "meta_description": None,
            "has_viewport": False,
        },
        "accessibility_violations": [],
        "console_errors": [],
        "page_load_time_ms": None,
        "screenshot_base64": None,
        "errors": [],
    }

    playwright = None
    browser = None

    try:
        playwright = await async_playwright().start()
    except Exception as exc:
        result["errors"].append(f"Failed to start Playwright: {exc}")
        return result

    try:
        browser = await playwright.chromium.launch(headless=True)
    except Exception as exc:
        result["errors"].append(f"Failed to launch browser: {exc}")
        await _safe(playwright.stop())
        return result

    try:
        context = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            ignore_https_errors=True,
        )
        page = await context.new_page()

        # ---- Collect console errors ----
        console_errors: list[str] = []

        def _on_console(msg):
            if msg.type == "error":
                console_errors.append(msg.text[:500])

        page.on("console", _on_console)

        # ---- Navigate ----
        load_start = time.perf_counter()
        try:
            await page.goto(url, timeout=15_000, wait_until="domcontentloaded")
        except PlaywrightError as exc:
            # Timeout or net error — we still try to extract whatever loaded
            result["errors"].append(f"Navigation issue: {exc}")
        load_end = time.perf_counter()
        result["page_load_time_ms"] = round((load_end - load_start) * 1000)

        # Brief wait for any late JS to settle
        await _safe(page.wait_for_load_state("networkidle", timeout=5_000))

        # ---- Title ----
        result["title"] = await _safe(page.title(), default=None)

        # ---- Parallel data collection ----
        (
            links,
            forms,
            buttons,
            images,
            seo,
            axe_violations,
            screenshot,
        ) = await asyncio.gather(
            _collect_links(page, url),
            _collect_forms(page),
            _collect_buttons(page),
            _collect_images(page),
            _check_seo(page),
            _run_axe(page),
            _capture_screenshot_b64(page),
        )

        result["links"] = links
        result["forms"] = forms
        result["buttons"] = buttons
        result["images"] = images
        result["seo"] = seo
        result["accessibility_violations"] = axe_violations
        result["screenshot_base64"] = screenshot
        result["console_errors"] = console_errors
        result["success"] = True

    except Exception as exc:
        result["errors"].append(f"Crawl error: {traceback.format_exc()}")
    finally:
        # Always tear down browser resources
        if browser:
            await _safe(browser.close())
        if playwright:
            await _safe(playwright.stop())

    return result


# ---------------------------------------------------------------------------
# CLI convenience — ``python crawler.py https://example.com``
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import json
    import sys

    target = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"

    async def _main():
        data = await crawl_site(target)
        # Truncate screenshot for terminal readability
        if data.get("screenshot_base64"):
            data["screenshot_base64"] = data["screenshot_base64"][:80] + "...(truncated)"
        print(json.dumps(data, indent=2, ensure_ascii=False))

    asyncio.run(_main())
