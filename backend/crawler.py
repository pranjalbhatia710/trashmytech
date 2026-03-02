"""
crawler.py — Async website crawler for trashmy.tech

Uses browser_utils for robust page readiness and axe-core integration.
Launches Chromium via Playwright, captures page metadata, structure,
accessibility violations, and a resized screenshot. Never crashes.
"""

from __future__ import annotations

import asyncio
import base64
import io
import os
import time
import traceback
from typing import Any
from urllib.parse import urljoin

from PIL import Image
from playwright.async_api import async_playwright, Page, Error as PlaywrightError

from browser_utils import (
    wait_for_interactive,
    inject_axe_and_audit,
    build_interaction_map,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _safe(coro, default=None):
    try:
        return await coro
    except Exception:
        return default


async def _collect_links(page: Page, base_url: str, max_links: int = 30) -> list[dict]:
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
        for link in raw:
            if link.get("href") and not link["href"].startswith(("http://", "https://", "mailto:", "tel:")):
                link["href"] = urljoin(base_url, link["href"])
        return raw
    except Exception:
        return []


async def _collect_forms(page: Page) -> list[dict]:
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
    try:
        return await page.evaluate(
            """() => {
                const h1 = document.querySelector('h1');
                const metaDesc = document.querySelector('meta[name="description"]');
                const viewport = document.querySelector('meta[name="viewport"]');
                const lang = document.documentElement.getAttribute('lang');
                const canonical = document.querySelector('link[rel="canonical"]');
                return {
                    has_h1: !!h1,
                    h1_text: h1 ? h1.innerText.trim().substring(0, 300) : null,
                    has_meta_description: !!metaDesc,
                    meta_description: metaDesc ? metaDesc.getAttribute('content') : null,
                    has_viewport: !!viewport,
                    has_lang: !!lang,
                    lang: lang || null,
                    has_canonical: !!canonical,
                };
            }"""
        )
    except Exception:
        return {
            "has_h1": False, "h1_text": None,
            "has_meta_description": False, "meta_description": None,
            "has_viewport": False, "has_lang": False, "lang": None,
            "has_canonical": False,
        }


async def _check_heading_hierarchy(page: Page) -> dict:
    """Check heading structure for accessibility."""
    try:
        return await page.evaluate("""() => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
            const levels = headings.map(h => parseInt(h.tagName[1]));
            const skips = [];
            for (let i = 1; i < levels.length; i++) {
                if (levels[i] - levels[i-1] > 1) {
                    skips.push({ from: 'h' + levels[i-1], to: 'h' + levels[i] });
                }
            }
            return {
                total_headings: headings.length,
                h1_count: levels.filter(l => l === 1).length,
                levels: levels,
                skips: skips,
                has_skip_nav: !!document.querySelector('a[href="#main"], a[href="#content"], [class*="skip"]'),
            };
        }""")
    except Exception:
        return {"total_headings": 0, "h1_count": 0, "levels": [], "skips": [], "has_skip_nav": False}


async def _check_focus_indicators(page: Page) -> dict:
    """Check if interactive elements have visible focus styles."""
    try:
        return await page.evaluate("""() => {
            const interactive = Array.from(document.querySelectorAll(
                'a, button, input, textarea, select, [tabindex]'
            )).slice(0, 20);
            let withOutline = 0;
            let withoutOutline = 0;
            for (const el of interactive) {
                const cs = window.getComputedStyle(el, ':focus');
                const outline = cs.outlineStyle;
                if (outline && outline !== 'none') withOutline++;
                else withoutOutline++;
            }
            return {
                total_checked: interactive.length,
                with_focus_style: withOutline,
                without_focus_style: withoutOutline,
            };
        }""")
    except Exception:
        return {"total_checked": 0, "with_focus_style": 0, "without_focus_style": 0}


async def _capture_screenshot_b64(page: Page, width: int = 800) -> str | None:
    try:
        raw_bytes = await page.screenshot(full_page=True, type="png")
        img = Image.open(io.BytesIO(raw_bytes))
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

async def crawl_site(url: str, on_screenshot=None) -> dict:
    """Crawl *url* with Chromium and return structured results. Never raises.

    on_screenshot: optional async callback(b64: str) called with screenshots during crawl.
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
            "has_h1": False, "h1_text": None,
            "has_meta_description": False, "meta_description": None,
            "has_viewport": False,
        },
        "accessibility_violations": [],
        "heading_hierarchy": {},
        "focus_indicators": {},
        "interactive_elements_count": 0,
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
        headless = os.getenv("HEADLESS", "true").lower() != "false"
        browser = await playwright.chromium.launch(headless=headless)
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

        # Console errors
        console_errors: list[str] = []
        def _on_console(msg):
            if msg.type == "error":
                console_errors.append(msg.text[:500])
        page.on("console", _on_console)

        # Navigate — use networkidle for JS-heavy sites like Apple.com
        load_start = time.perf_counter()
        try:
            await page.goto(url, timeout=30_000, wait_until="networkidle")
        except PlaywrightError as exc:
            # Timeout or net error — still try to extract what loaded
            result["errors"].append(f"Navigation issue: {exc}")
            # Try domcontentloaded as fallback
            try:
                await page.goto(url, timeout=15_000, wait_until="domcontentloaded")
            except Exception:
                pass
        load_end = time.perf_counter()
        result["page_load_time_ms"] = round((load_end - load_start) * 1000)

        # Wait for page to be truly interactive
        await wait_for_interactive(page, timeout_ms=10000)

        # Early screenshot — stream to frontend while data collection runs
        if on_screenshot:
            try:
                early_b64 = await _capture_screenshot_b64(page)
                if early_b64:
                    await on_screenshot(early_b64)
            except Exception:
                pass

            # Scroll down and capture mid-page screenshot
            try:
                await page.evaluate("window.scrollBy(0, window.innerHeight)")
                await asyncio.sleep(0.5)
                mid_b64 = await _capture_screenshot_b64(page)
                if mid_b64:
                    await on_screenshot(mid_b64)
                # Scroll back to top
                await page.evaluate("window.scrollTo(0, 0)")
            except Exception:
                pass

        # Title
        result["title"] = await _safe(page.title(), default=None)

        # Parallel data collection
        (
            links, forms, buttons, images, seo, axe_result,
            headings, focus, screenshot, interaction_map,
        ) = await asyncio.gather(
            _collect_links(page, url),
            _collect_forms(page),
            _collect_buttons(page),
            _collect_images(page),
            _check_seo(page),
            inject_axe_and_audit(page),
            _check_heading_hierarchy(page),
            _check_focus_indicators(page),
            _capture_screenshot_b64(page),
            build_interaction_map(page),
        )

        result["links"] = links
        result["forms"] = forms
        result["buttons"] = buttons
        result["images"] = images
        result["seo"] = seo
        result["accessibility_violations"] = axe_result.get("violations", [])
        result["heading_hierarchy"] = headings
        result["focus_indicators"] = focus
        result["interactive_elements_count"] = len(interaction_map)
        result["screenshot_base64"] = screenshot
        result["console_errors"] = console_errors
        result["success"] = True

    except Exception as exc:
        result["errors"].append(f"Crawl error: {traceback.format_exc()}")
    finally:
        if browser:
            await _safe(browser.close())
        if playwright:
            await _safe(playwright.stop())

    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import json
    import sys

    target = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"

    async def _main():
        data = await crawl_site(target)
        if data.get("screenshot_base64"):
            data["screenshot_base64"] = data["screenshot_base64"][:80] + "...(truncated)"
        print(json.dumps(data, indent=2, ensure_ascii=False))

    asyncio.run(_main())
