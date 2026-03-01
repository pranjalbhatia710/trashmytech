"""
browser_utils.py — Smart browser interaction utilities for trashmy.tech

Provides robust element detection, smart clicking with 12 fallback strategies,
failure classification (tool_limitation vs ux_failure), axe-core integration,
and page readiness helpers.

Inspired by patterns from browser-use and Skyvern.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from playwright.async_api import Page, ElementHandle, Locator

log = logging.getLogger("browser_utils")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
AXE_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js"

INTERACTIVE_ROLES = frozenset({
    "button", "link", "menuitem", "menuitemcheckbox", "menuitemradio",
    "radio", "checkbox", "tab", "textbox", "combobox", "slider",
    "spinbutton", "switch", "searchbox", "option", "gridcell",
    "treeitem", "listbox",
})

INTERACTIVE_TAGS = frozenset({
    "a", "button", "input", "textarea", "select", "details", "summary", "option",
})


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------
class FailureType(str, Enum):
    TOOL_LIMITATION = "tool_limitation"   # Our tool couldn't click it, not a site bug
    UX_FAILURE = "ux_failure"             # Genuine usability issue
    ELEMENT_MISSING = "element_missing"   # Element doesn't exist on page


@dataclass
class ClickResult:
    success: bool = False
    strategy_used: str = ""
    failure_type: FailureType | None = None
    failure_reason: str = ""
    attempts: list[dict] = field(default_factory=list)
    element_exists: bool = True
    element_visible: bool = True
    element_enabled: bool = True
    bounding_box: dict | None = None


@dataclass
class InteractiveElement:
    index: int
    tag: str
    type: str
    text: str
    aria_label: str
    placeholder: str
    href: str
    name: str
    id: str
    role: str
    width: int
    height: int
    x: int
    y: int
    visible: bool
    enabled: bool
    has_click_listener: bool


# ---------------------------------------------------------------------------
# Page readiness
# ---------------------------------------------------------------------------
async def wait_for_interactive(page: Page, timeout_ms: int = 10000) -> bool:
    """Wait until the page is interactive and animations have settled."""
    try:
        # Wait for DOM content loaded
        await page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
    except Exception:
        pass

    try:
        # Wait for network idle (short timeout — don't block forever)
        await page.wait_for_load_state("networkidle", timeout=min(timeout_ms, 5000))
    except Exception:
        pass

    # Wait for document.readyState === 'complete'
    try:
        await page.wait_for_function(
            "document.readyState === 'complete'",
            timeout=min(timeout_ms, 5000),
        )
    except Exception:
        pass

    # Brief settle for CSS animations / JS rendering
    await page.wait_for_timeout(300)
    return True


async def wait_for_animation_end(page: Page, timeout_ms: int = 2000) -> None:
    """Wait for CSS animations/transitions to settle."""
    try:
        await page.evaluate("""() => {
            return new Promise(resolve => {
                const running = document.getAnimations?.() || [];
                if (running.length === 0) return resolve();
                Promise.allSettled(running.map(a => a.finished)).then(resolve);
                setTimeout(resolve, %d);
            });
        }""" % timeout_ms)
    except Exception:
        await page.wait_for_timeout(500)


# ---------------------------------------------------------------------------
# Element detection — build interaction map
# ---------------------------------------------------------------------------
async def build_interaction_map(page: Page, max_elements: int = 80) -> list[InteractiveElement]:
    """Extract all interactive elements with rich metadata."""
    try:
        raw = await page.evaluate("""(maxElements) => {
            const results = [];
            const seen = new Set();

            // Broad selector covering interactive elements
            const selectors = [
                'a[href]', 'button', 'input', 'textarea', 'select',
                '[role="button"]', '[role="link"]', '[role="tab"]',
                '[role="menuitem"]', '[role="checkbox"]', '[role="radio"]',
                '[role="switch"]', '[role="combobox"]', '[role="searchbox"]',
                '[role="textbox"]', '[role="option"]', '[role="slider"]',
                '[tabindex]', '[onclick]', '[contenteditable="true"]',
                'details > summary', 'label',
            ];

            const allEls = new Set();
            for (const sel of selectors) {
                try {
                    document.querySelectorAll(sel).forEach(el => allEls.add(el));
                } catch(e) {}
            }

            // Also find cursor:pointer elements in viewport
            const viewportEls = document.elementsFromPoint?.(
                window.innerWidth / 2, window.innerHeight / 2
            ) || [];

            for (const el of allEls) {
                if (results.length >= maxElements) break;
                const rect = el.getBoundingClientRect();

                // Skip invisible/off-screen elements
                if (rect.width === 0 && rect.height === 0) continue;
                if (rect.bottom < 0 || rect.top > window.innerHeight + 500) continue;

                const cs = window.getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden') continue;
                if (parseFloat(cs.opacity) === 0) continue;

                const key = el.tagName + '|' + rect.x + '|' + rect.y;
                if (seen.has(key)) continue;
                seen.add(key);

                results.push({
                    tag: el.tagName.toLowerCase(),
                    type: el.getAttribute('type') || '',
                    text: (el.innerText || el.textContent || '').trim().slice(0, 100),
                    aria_label: el.getAttribute('aria-label') || '',
                    placeholder: el.getAttribute('placeholder') || '',
                    href: (el.getAttribute('href') || '').slice(0, 200),
                    name: el.getAttribute('name') || '',
                    id: el.id || '',
                    role: el.getAttribute('role') || '',
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    visible: rect.width > 0 && rect.height > 0,
                    enabled: !el.disabled,
                    has_click_listener: el.hasAttribute('onclick') ||
                        el.hasAttribute('onmousedown') ||
                        cs.cursor === 'pointer',
                });
            }
            return results;
        }""", max_elements)

        return [
            InteractiveElement(index=i, **el)
            for i, el in enumerate(raw)
        ]
    except Exception as e:
        log.warning(f"build_interaction_map failed: {e}")
        return []


def format_elements_for_llm(elements: list[InteractiveElement]) -> str:
    """Format elements for LLM consumption."""
    lines = []
    for el in elements:
        parts = [f"[{el.index}] <{el.tag}>"]
        if el.type: parts.append(f'type="{el.type}"')
        if el.role: parts.append(f'role="{el.role}"')
        if el.text: parts.append(f'text="{el.text[:60]}"')
        if el.aria_label: parts.append(f'aria-label="{el.aria_label}"')
        if el.placeholder: parts.append(f'placeholder="{el.placeholder}"')
        if el.href: parts.append(f'href="{el.href[:80]}"')
        if el.name: parts.append(f'name="{el.name}"')
        if el.id: parts.append(f'id="{el.id}"')
        if el.width and el.height:
            parts.append(f'size={el.width}x{el.height}px')
        if not el.enabled: parts.append('[disabled]')
        lines.append(" ".join(parts))
    return "\n".join(lines) if lines else "(no interactive elements found)"


# ---------------------------------------------------------------------------
# Smart find element — multi-strategy
# ---------------------------------------------------------------------------
async def smart_find(
    page: Page,
    target: str,
    elements: list[InteractiveElement],
) -> ElementHandle | None:
    """Find an element using multiple strategies, returning the first match."""
    if not target:
        return None

    strategies = []

    # Strategy 1: By index reference "[3]"
    if target.startswith("[") and "]" in target:
        try:
            idx = int(target.split("]")[0][1:])
            if 0 <= idx < len(elements):
                el = elements[idx]
                if el.id:
                    strategies.append(("id_from_index", f"#{el.id}"))
                if el.name:
                    strategies.append(("name_from_index", f"[name='{el.name}']"))
                # Use coordinates as last resort from index
                if el.x and el.y and el.width and el.height:
                    strategies.append(("coords_from_index", (el.x, el.y, el.width, el.height)))
        except (ValueError, IndexError):
            pass

    # Strategy 2: By ID
    if target.startswith("#"):
        strategies.append(("css_id", target))
    else:
        # Guess it might be an ID
        strategies.append(("css_id_guess", f"#{target}"))

    # Strategy 3: By text content
    strategies.append(("text_exact", f"text='{target}'"))
    strategies.append(("text_has", f"text={target}"))

    # Strategy 4: By aria-label
    strategies.append(("aria_label", f"[aria-label='{target}']"))
    strategies.append(("aria_label_contains", f"[aria-label*='{target}' i]"))

    # Strategy 5: By placeholder
    strategies.append(("placeholder", f"[placeholder='{target}']"))
    strategies.append(("placeholder_contains", f"[placeholder*='{target}' i]"))

    # Strategy 6: By role + text
    for role in ("button", "link", "tab", "menuitem"):
        strategies.append(("role_text", f"role={role}[name='{target}']"))

    # Strategy 7: By name attribute
    strategies.append(("name_attr", f"[name='{target}']"))

    # Strategy 8: Raw CSS selector
    strategies.append(("css_raw", target))

    # Strategy 9: By title attribute
    strategies.append(("title", f"[title='{target}']"))

    # Try each strategy
    for strategy_name, selector in strategies:
        if isinstance(selector, tuple):
            # Coordinate-based: find element at point
            x, y, w, h = selector
            try:
                handle = await page.evaluate_handle(
                    """([x, y]) => document.elementFromPoint(x, y)""",
                    [x + w // 2, y + h // 2],
                )
                element = handle.as_element()
                if element:
                    return element
            except Exception:
                pass
            continue

        try:
            handle = await page.query_selector(selector)
            if handle:
                # Verify it's visible
                box = await handle.bounding_box()
                if box and box["width"] > 0 and box["height"] > 0:
                    return handle
        except Exception:
            pass

    # Strategy 10: Fuzzy match against known elements
    target_lower = target.lower()
    for el in elements:
        for field_val in (el.text, el.aria_label, el.placeholder, el.name, el.id):
            if field_val and target_lower in field_val.lower():
                # Try to locate by whatever attributes we have
                for attr, val in [("id", el.id), ("name", el.name)]:
                    if val:
                        sel = f"#{val}" if attr == "id" else f"[name='{val}']"
                        try:
                            handle = await page.query_selector(sel)
                            if handle:
                                return handle
                        except Exception:
                            pass

                # Try by coordinates
                if el.x >= 0 and el.y >= 0 and el.width > 0 and el.height > 0:
                    try:
                        handle = await page.evaluate_handle(
                            """([x, y]) => document.elementFromPoint(x, y)""",
                            [el.x + el.width // 2, el.y + el.height // 2],
                        )
                        element = handle.as_element()
                        if element:
                            return element
                    except Exception:
                        pass
                break  # Move to next element

    return None


# ---------------------------------------------------------------------------
# Smart click — 12 fallback strategies
# ---------------------------------------------------------------------------
async def smart_click(
    page: Page,
    handle: ElementHandle,
    timeout_ms: int = 5000,
) -> ClickResult:
    """Click an element using up to 12 fallback strategies."""
    result = ClickResult()

    # Get element info
    try:
        box = await handle.bounding_box()
        if box:
            result.bounding_box = {
                "x": round(box["x"]),
                "y": round(box["y"]),
                "width": round(box["width"]),
                "height": round(box["height"]),
            }
    except Exception:
        pass

    # Check if element is visible
    try:
        visible = await handle.is_visible()
        result.element_visible = visible
        if not visible:
            result.failure_type = FailureType.TOOL_LIMITATION
            result.failure_reason = "Element exists but is not visible"
            return result
    except Exception:
        pass

    # Check if element is enabled
    try:
        enabled = await handle.is_enabled()
        result.element_enabled = enabled
        if not enabled:
            result.failure_type = FailureType.UX_FAILURE
            result.failure_reason = "Element is disabled"
            return result
    except Exception:
        pass

    # --- Strategy 1: Direct Playwright click ---
    try:
        await handle.scroll_into_view_if_needed(timeout=2000)
    except Exception:
        pass

    attempt = {"strategy": "direct_click", "success": False}
    try:
        await handle.click(timeout=timeout_ms, force=False)
        attempt["success"] = True
        result.success = True
        result.strategy_used = "direct_click"
        result.attempts.append(attempt)
        return result
    except Exception as e:
        attempt["error"] = str(e)[:150]
        result.attempts.append(attempt)

    # --- Strategy 2: Click with force (skip actionability checks) ---
    attempt = {"strategy": "force_click", "success": False}
    try:
        await handle.click(timeout=timeout_ms, force=True)
        attempt["success"] = True
        result.success = True
        result.strategy_used = "force_click"
        result.attempts.append(attempt)
        return result
    except Exception as e:
        attempt["error"] = str(e)[:150]
        result.attempts.append(attempt)

    # --- Strategy 3: JavaScript element.click() ---
    attempt = {"strategy": "js_click", "success": False}
    try:
        await handle.evaluate("el => el.click()")
        attempt["success"] = True
        result.success = True
        result.strategy_used = "js_click"
        result.attempts.append(attempt)
        return result
    except Exception as e:
        attempt["error"] = str(e)[:150]
        result.attempts.append(attempt)

    # --- Strategy 4: Dispatch click event ---
    attempt = {"strategy": "dispatch_click", "success": False}
    try:
        await handle.evaluate("""el => {
            el.dispatchEvent(new MouseEvent('click', {
                bubbles: true, cancelable: true, view: window
            }));
        }""")
        attempt["success"] = True
        result.success = True
        result.strategy_used = "dispatch_click"
        result.attempts.append(attempt)
        return result
    except Exception as e:
        attempt["error"] = str(e)[:150]
        result.attempts.append(attempt)

    # --- Strategy 5: Coordinate click at element center ---
    if result.bounding_box:
        attempt = {"strategy": "coordinate_click", "success": False}
        try:
            cx = result.bounding_box["x"] + result.bounding_box["width"] / 2
            cy = result.bounding_box["y"] + result.bounding_box["height"] / 2
            await page.mouse.click(cx, cy)
            attempt["success"] = True
            result.success = True
            result.strategy_used = "coordinate_click"
            result.attempts.append(attempt)
            return result
        except Exception as e:
            attempt["error"] = str(e)[:150]
            result.attempts.append(attempt)

    # --- Strategy 6: Focus then Enter key ---
    attempt = {"strategy": "focus_enter", "success": False}
    try:
        await handle.focus()
        await page.keyboard.press("Enter")
        attempt["success"] = True
        result.success = True
        result.strategy_used = "focus_enter"
        result.attempts.append(attempt)
        return result
    except Exception as e:
        attempt["error"] = str(e)[:150]
        result.attempts.append(attempt)

    # --- Strategy 7: Navigate if <a href> ---
    attempt = {"strategy": "navigate_href", "success": False}
    try:
        href = await handle.get_attribute("href")
        if href and href.startswith(("http://", "https://", "/")):
            if href.startswith("/"):
                href = page.url.rstrip("/") + href
            await page.goto(href, wait_until="domcontentloaded", timeout=15000)
            attempt["success"] = True
            result.success = True
            result.strategy_used = "navigate_href"
            result.attempts.append(attempt)
            return result
    except Exception as e:
        attempt["error"] = str(e)[:150]
    result.attempts.append(attempt)

    # --- Strategy 8: Click parent element ---
    attempt = {"strategy": "click_parent", "success": False}
    try:
        parent = await handle.evaluate_handle("el => el.parentElement")
        parent_el = parent.as_element()
        if parent_el:
            await parent_el.click(timeout=3000, force=True)
            attempt["success"] = True
            result.success = True
            result.strategy_used = "click_parent"
            result.attempts.append(attempt)
            return result
    except Exception as e:
        attempt["error"] = str(e)[:150]
        result.attempts.append(attempt)

    # --- Strategy 9: Scroll into view and retry ---
    attempt = {"strategy": "scroll_and_retry", "success": False}
    try:
        await handle.evaluate("el => el.scrollIntoView({block: 'center', behavior: 'instant'})")
        await page.wait_for_timeout(300)
        await handle.click(timeout=3000, force=True)
        attempt["success"] = True
        result.success = True
        result.strategy_used = "scroll_and_retry"
        result.attempts.append(attempt)
        return result
    except Exception as e:
        attempt["error"] = str(e)[:150]
        result.attempts.append(attempt)

    # --- Strategy 10: Find and click blocking element ---
    if result.bounding_box:
        attempt = {"strategy": "click_blocking_element", "success": False}
        try:
            cx = result.bounding_box["x"] + result.bounding_box["width"] / 2
            cy = result.bounding_box["y"] + result.bounding_box["height"] / 2
            blocking = await page.evaluate("""([x, y]) => {
                const el = document.elementFromPoint(x, y);
                if (!el) return null;
                return { tag: el.tagName, id: el.id, text: (el.innerText||'').slice(0,50) };
            }""", [cx, cy])
            if blocking:
                await page.mouse.click(cx, cy)
                attempt["success"] = True
                attempt["blocking_element"] = blocking
                result.success = True
                result.strategy_used = "click_blocking_element"
                result.attempts.append(attempt)
                return result
        except Exception as e:
            attempt["error"] = str(e)[:150]
            result.attempts.append(attempt)

    # --- Strategy 11: Tab to element and press Enter ---
    attempt = {"strategy": "tab_enter", "success": False}
    try:
        # Press Tab multiple times to reach the element
        for _ in range(15):
            await page.keyboard.press("Tab")
            focused = await page.evaluate("""() => {
                const el = document.activeElement;
                return el ? { tag: el.tagName, id: el.id } : null;
            }""")
            if focused:
                target_tag = await handle.evaluate("el => el.tagName")
                target_id = await handle.get_attribute("id")
                if (focused.get("id") and focused["id"] == target_id) or \
                   (focused.get("tag") == target_tag):
                    await page.keyboard.press("Enter")
                    attempt["success"] = True
                    result.success = True
                    result.strategy_used = "tab_enter"
                    break
        result.attempts.append(attempt)
        if result.success:
            return result
    except Exception as e:
        attempt["error"] = str(e)[:150]
        result.attempts.append(attempt)

    # --- Strategy 12: Double-click ---
    attempt = {"strategy": "double_click", "success": False}
    try:
        await handle.dblclick(timeout=3000, force=True)
        attempt["success"] = True
        result.success = True
        result.strategy_used = "double_click"
        result.attempts.append(attempt)
        return result
    except Exception as e:
        attempt["error"] = str(e)[:150]
        result.attempts.append(attempt)

    # All strategies exhausted — classify the failure
    result.failure_type = FailureType.TOOL_LIMITATION
    result.failure_reason = (
        f"All {len(result.attempts)} click strategies failed. "
        "This is likely a complex JS-driven element (React portal, shadow DOM, overlay) "
        "that our automation can't reliably interact with."
    )
    return result


# ---------------------------------------------------------------------------
# Failure classification
# ---------------------------------------------------------------------------
def classify_click_failure(
    result: ClickResult,
    target: str,
    element: InteractiveElement | None,
) -> dict:
    """Classify why a click failed — tool limitation vs genuine UX bug."""
    if result.success:
        return {"type": "success", "is_site_bug": False}

    if not result.element_exists:
        return {
            "type": FailureType.ELEMENT_MISSING.value,
            "is_site_bug": True,
            "reason": f"Element '{target}' does not exist on the page",
            "recommendation": "Check if the element was removed or renamed",
        }

    if not result.element_visible:
        # Could be either — hidden elements might be intentional
        return {
            "type": FailureType.TOOL_LIMITATION.value,
            "is_site_bug": False,
            "reason": "Element exists but is hidden (display:none, visibility:hidden, or off-screen)",
            "recommendation": "Element may be behind a menu or dialog",
        }

    if not result.element_enabled:
        return {
            "type": FailureType.UX_FAILURE.value,
            "is_site_bug": True,
            "reason": "Element is disabled — user cannot interact with it",
            "recommendation": "Consider showing why it's disabled or enabling it",
        }

    # Check if the site uses complex JS patterns that block our clicks
    errors = [a.get("error", "") for a in result.attempts if not a.get("success")]
    has_intercept = any("intercept" in e.lower() for e in errors)
    has_detached = any("detach" in e.lower() for e in errors)
    has_timeout = any("timeout" in e.lower() for e in errors)

    if has_intercept or has_detached:
        return {
            "type": FailureType.TOOL_LIMITATION.value,
            "is_site_bug": False,
            "reason": "Click intercepted by overlay or element detached during click",
            "recommendation": "Complex JS framework interaction — not a UX bug",
        }

    if has_timeout and len(result.attempts) >= 8:
        return {
            "type": FailureType.TOOL_LIMITATION.value,
            "is_site_bug": False,
            "reason": f"All {len(result.attempts)} strategies timed out",
            "recommendation": "Likely a JS-heavy element our automation can't handle",
        }

    # Check for small click target — genuine UX issue
    if result.bounding_box:
        w = result.bounding_box.get("width", 0)
        h = result.bounding_box.get("height", 0)
        if 0 < w < 24 or 0 < h < 24:
            return {
                "type": FailureType.UX_FAILURE.value,
                "is_site_bug": True,
                "reason": f"Click target is very small ({w}x{h}px)",
                "recommendation": "Increase target size to at least 44x44px per WCAG",
            }

    return {
        "type": FailureType.TOOL_LIMITATION.value,
        "is_site_bug": False,
        "reason": result.failure_reason or "Unable to determine exact cause",
        "recommendation": "Complex interaction pattern that automation can't reproduce",
    }


# ---------------------------------------------------------------------------
# Smart fill — type into an input with fallbacks
# ---------------------------------------------------------------------------
async def smart_fill(
    page: Page,
    handle: ElementHandle,
    value: str,
    timeout_ms: int = 5000,
) -> dict:
    """Fill an input element with fallbacks."""
    result = {"success": False, "strategy": "", "error": ""}

    # Strategy 1: Playwright fill
    try:
        await handle.fill(value, timeout=timeout_ms)
        result["success"] = True
        result["strategy"] = "fill"
        return result
    except Exception:
        pass

    # Strategy 2: Click then type
    try:
        await handle.click(timeout=2000, force=True)
        await page.wait_for_timeout(100)
        # Clear existing content
        await page.keyboard.press("Control+A")
        await page.keyboard.press("Backspace")
        await page.keyboard.type(value, delay=30)
        result["success"] = True
        result["strategy"] = "click_type"
        return result
    except Exception:
        pass

    # Strategy 3: JS value set + input event
    try:
        await handle.evaluate("""(el, val) => {
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }""", value)
        result["success"] = True
        result["strategy"] = "js_set_value"
        return result
    except Exception as e:
        result["error"] = str(e)[:200]

    # Strategy 4: Focus and type key by key
    try:
        await handle.focus()
        await page.keyboard.type(value, delay=50)
        result["success"] = True
        result["strategy"] = "focus_type"
        return result
    except Exception as e:
        result["error"] = str(e)[:200]

    return result


# ---------------------------------------------------------------------------
# Element measurement
# ---------------------------------------------------------------------------
async def measure_element(handle: ElementHandle) -> dict:
    """Get detailed measurements of an element."""
    try:
        box = await handle.bounding_box()
        if box:
            return {
                "width": round(box["width"]),
                "height": round(box["height"]),
                "x": round(box["x"]),
                "y": round(box["y"]),
                "area": round(box["width"] * box["height"]),
                "meets_wcag_min": box["width"] >= 44 and box["height"] >= 44,
            }
    except Exception:
        pass
    return {"width": 0, "height": 0, "x": 0, "y": 0, "area": 0, "meets_wcag_min": False}


# ---------------------------------------------------------------------------
# Keyboard navigation
# ---------------------------------------------------------------------------
async def keyboard_navigate(page: Page, direction: str = "forward") -> dict:
    """Navigate by keyboard, return info about the focused element."""
    key = "Tab" if direction == "forward" else "Shift+Tab"
    try:
        await page.keyboard.press(key)
        await page.wait_for_timeout(150)

        focused = await page.evaluate("""() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const rect = el.getBoundingClientRect();
            return {
                tag: el.tagName.toLowerCase(),
                text: (el.innerText || el.textContent || '').trim().slice(0, 80),
                aria_label: el.getAttribute('aria-label') || '',
                role: el.getAttribute('role') || '',
                id: el.id || '',
                has_focus_style: (() => {
                    const cs = window.getComputedStyle(el);
                    const outline = cs.outlineStyle;
                    return outline !== 'none' && outline !== '';
                })(),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
            };
        }""")
        return {"success": True, "focused_element": focused}
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}


# ---------------------------------------------------------------------------
# Axe-core accessibility audit
# ---------------------------------------------------------------------------
async def inject_axe_and_audit(
    page: Page,
    context: str | None = None,
) -> dict:
    """Inject axe-core and run accessibility audit."""
    try:
        # Try to inject axe-core — use add_script_tag which bypasses CSP
        already = await page.evaluate("typeof axe !== 'undefined'")
        if not already:
            try:
                await page.add_script_tag(url=AXE_CDN_URL)
            except Exception:
                # Fallback: fetch and inject inline (bypasses CSP src restrictions)
                try:
                    import aiohttp
                    async with aiohttp.ClientSession() as session:
                        async with session.get(AXE_CDN_URL) as resp:
                            axe_js = await resp.text()
                    await page.evaluate(axe_js)
                except Exception:
                    return {
                        "success": False, "violations": [],
                        "violations_count": 0, "passes_count": 0,
                        "error": "Could not inject axe-core (CSP restriction)",
                    }

        await page.wait_for_timeout(300)

        # Run axe with options
        ctx_arg = f"'{context}'" if context else ""
        results = await page.evaluate(f"""async () => {{
            const options = {{ resultTypes: ['violations'] }};
            const results = await axe.run({ctx_arg or 'document'}, options);
            return {{
                violations: results.violations.map(v => ({{
                    id: v.id,
                    impact: v.impact,
                    description: v.description,
                    help: v.help,
                    helpUrl: v.helpUrl,
                    tags: v.tags,
                    nodes_count: v.nodes.length,
                    nodes: v.nodes.slice(0, 5).map(n => ({{
                        html: n.html.slice(0, 200),
                        target: n.target,
                        failureSummary: n.failureSummary?.slice(0, 200) || '',
                    }})),
                }})),
                violations_count: results.violations.length,
                passes_count: results.passes?.length || 0,
            }};
        }}""")

        return {
            "success": True,
            "violations": results.get("violations", []),
            "violations_count": results.get("violations_count", 0),
            "passes_count": results.get("passes_count", 0),
        }
    except Exception as e:
        log.warning(f"axe audit failed: {e}")
        return {
            "success": False,
            "violations": [],
            "violations_count": 0,
            "passes_count": 0,
            "error": str(e)[:200],
        }


# ---------------------------------------------------------------------------
# Page content extraction
# ---------------------------------------------------------------------------
async def extract_page_state(page: Page) -> dict:
    """Extract visible text content from the page."""
    try:
        visible_text = await page.evaluate("""() => {
            const body = document.body;
            if (!body) return '';
            const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
            let text = '';
            while (walk.nextNode()) {
                const t = walk.currentNode.textContent.trim();
                if (t) text += t + ' ';
            }
            return text.slice(0, 3000);
        }""")
    except Exception:
        visible_text = ""

    return {"visible_text": visible_text}


# ---------------------------------------------------------------------------
# Screenshot
# ---------------------------------------------------------------------------
async def capture_screenshot(
    page: Page,
    width: int = 600,
    quality: int = 50,
) -> bytes | None:
    """Capture viewport as compressed JPEG bytes."""
    try:
        raw = await page.screenshot(type="jpeg", quality=quality)
        # Resize if needed
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(raw))
        ow, oh = img.size
        if ow > width:
            ratio = width / ow
            nh = max(1, int(oh * ratio))
            img = img.resize((width, nh), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        return buf.getvalue()
    except Exception:
        return None
