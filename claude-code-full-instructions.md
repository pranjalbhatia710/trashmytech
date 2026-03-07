# CLAUDE CODE -- REFERENCE REPOS AND INSTRUCTIONS

## STEP 1: Clone these repos into /tmp for reference

Run these commands first:

```bash
cd /tmp
git clone --depth 1 https://github.com/browser-use/browser-use.git
git clone --depth 1 https://github.com/pamelafox/axe-playwright-python.git
git clone --depth 1 https://github.com/abhinaba-ghosh/axe-playwright.git
git clone --depth 1 https://github.com/harlan-zw/unlighthouse.git
git clone --depth 1 https://github.com/Skyvern-AI/skyvern.git
git clone --depth 1 https://github.com/pa11y/pa11y.git
```

## STEP 2: Read these specific files before writing any code

Read these files from the cloned repos. They contain the patterns you need.

### From browser-use (element detection + clicking that works on real sites):
```
/tmp/browser-use/browser_use/dom/service.py
/tmp/browser-use/browser_use/dom/views.py
/tmp/browser-use/browser_use/dom/extraction_readability.js
/tmp/browser-use/browser_use/controller/service.py
/tmp/browser-use/browser_use/controller/views.py
/tmp/browser-use/browser_use/browser/service.py
/tmp/browser-use/browser_use/browser/views.py
```

### From Skyvern (AI-augmented clicking + element interaction):
```
/tmp/skyvern/skyvern/webeye/actions/handler.py
/tmp/skyvern/skyvern/webeye/scraper/scraper.py
/tmp/skyvern/skyvern/webeye/utils/dom.py
```

### From axe-playwright-python (proper axe-core integration in Python):
```
/tmp/axe-playwright-python/axe_playwright_python/sync_playwright.py
/tmp/axe-playwright-python/axe_playwright_python/async_playwright.py
```

### From unlighthouse (parallel scanning architecture):
```
/tmp/unlighthouse/packages/core/src/discovery/
/tmp/unlighthouse/packages/core/src/process/
```

### From pa11y (reliable page waiting and accessibility testing):
```
/tmp/pa11y/lib/runner.js
/tmp/pa11y/lib/action.js
```

## STEP 3: The actual task

Here is what you need to build. Read all the reference files above first, then implement the following.

---

### CONTEXT

trashmy.tech is a website testing tool. Users paste a URL. We crawl it, then deploy 15-20 AI personas in parallel (via Modal or locally) to interact with the site. Each persona has different abilities and constraints (a blind user, a keyboard-only user, a user with tremor, a chaos agent submitting SQL injection, etc). Each persona runs a Playwright browser, follows a scripted behavior, takes screenshots, and reports findings. Then Gemini 2.5 Flash synthesizes all the session data into a scored report.

THE PROBLEM: Our agents can't reliably interact with real websites. When we tested Apple.com, every agent reported "element not clickable" and the site scored 35/100. Apple.com is a well-built website. The problem is our agents, not the site. We need smarter element detection, smarter clicking, and the ability to distinguish between "our tool failed to interact" vs "the site has a real usability problem."

---

### FILE: backend/browser_utils.py

Create a utility module with robust browser interaction functions. Study how browser-use extracts interactive elements from the DOM (their `extraction_readability.js` and `dom/service.py`) and how Skyvern handles clicking (their `actions/handler.py`).

```python
"""
browser_utils.py -- Robust Playwright interaction utilities for trashmy.tech

This module provides functions that reliably interact with real websites,
including JS-heavy sites like Apple.com, Amazon, etc. It handles:
- Waiting for pages to be truly interactive (not just DOM loaded)
- Extracting all interactive elements with their actual sizes and positions
- Clicking elements using multiple fallback strategies
- Distinguishing tool failures from real UX issues
"""
import asyncio
import base64
from playwright.async_api import Page, Locator
from typing import Optional


async def wait_for_interactive(page: Page, timeout_ms: int = 15000):
    """
    Wait for the page to be truly interactive.
    
    Don't just wait for DOMContentLoaded. Real sites load JS async,
    hydrate frameworks, and attach event listeners after the DOM is ready.
    
    Study how browser-use handles this in browser/service.py and how
    pa11y handles it in lib/runner.js.
    
    Steps:
    1. Wait for load event (basic)
    2. Wait for network to settle (no pending requests for 500ms)
       -- use try/except because some sites never reach networkidle
    3. Wait 1 additional second for JS framework hydration
    4. Verify that interactive elements exist in the DOM
    """
    pass  # IMPLEMENT


async def build_interaction_map(page: Page) -> list[dict]:
    """
    Extract all interactive elements from the page with full metadata.
    
    Study browser-use's extraction_readability.js for how they find
    elements. Study Skyvern's scraper.py for how they build element maps.
    
    For each interactive element, capture:
    - tag: str (a, button, input, select, etc)
    - text: str (visible text content, trimmed, max 100 chars)
    - aria_label: str (aria-label attribute)
    - href: str (for links)
    - role: str (ARIA role)
    - type: str (input type, button type)
    - rect: {x, y, width, height} (bounding box in pixels)
    - visible: bool (actually visible on screen, not display:none)
    - in_viewport: bool (within the current scroll position)
    - interactable: bool (pointer-events not none, not disabled)
    - selector: str (a CSS selector that uniquely identifies this element)
    
    Use page.evaluate() to run JS that:
    1. Queries for: a[href], button, [role="button"], [role="link"],
       input, select, textarea, [tabindex="0"], summary,
       [role="tab"], [role="menuitem"], [onclick], [role="checkbox"],
       [role="radio"], [role="switch"], [role="combobox"]
    2. For each, gets getBoundingClientRect() and getComputedStyle()
    3. Filters out invisible/zero-size elements
    4. Generates a unique selector (prefer id, then data-testid, 
       then nth-of-type, then xpath)
    5. Deduplicates by position (elements at same x,y are likely the same)
    
    Sort by: in_viewport first, then by y position (top to bottom).
    """
    pass  # IMPLEMENT


async def smart_click(page: Page, target: str, timeout_ms: int = 8000) -> dict:
    """
    Try to click an element using multiple strategies, in order of reliability.
    
    Study browser-use's controller/service.py for how they handle clicks.
    Study Skyvern's actions/handler.py for their fallback strategies.
    
    target: visible text, aria-label, or CSS selector of the element to click
    
    Strategies (try in order, stop at first success):
    1. page.get_by_role("link", name=target) -- most semantic
    2. page.get_by_role("button", name=target)
    3. page.get_by_role("menuitem", name=target) -- for nav menus
    4. page.get_by_label(target) -- for labeled elements
    5. page.get_by_text(target, exact=True) -- exact text match
    6. page.get_by_text(target) -- partial text match
    7. page.locator(f"a:has-text('{target}')").first
    8. page.locator(f"[aria-label='{target}']").first
    9. page.locator(f"[title='{target}']").first
    10. JavaScript click: find element by text content and call .click()
    11. JavaScript click: find by innerText includes
    12. Coordinate click: find element position and click at coordinates
    
    After each successful click, wait for navigation or DOM change.
    
    Returns:
    {
        "success": bool,
        "strategy_index": int (which strategy worked, 1-12),
        "strategy_name": str,
        "url_after": str (page URL after click),
        "navigated": bool (did the URL change),
        "error": str | None
    }
    """
    pass  # IMPLEMENT


async def classify_click_failure(page: Page, target: str) -> dict:
    """
    When smart_click fails on all strategies, determine WHY.
    
    This is critical. We need to distinguish:
    - tool_limitation: our Playwright can't click it, but a real user could
    - ux_failure: the element has a genuine usability problem
    - element_missing: the element doesn't exist in the DOM at all
    
    Use page.evaluate() to check:
    1. Does any element contain this text in the DOM?
    2. If yes: is it visible? (display, visibility, opacity, size)
    3. If visible: is it interactable? (pointer-events, disabled, aria-disabled)
    4. If interactable: what are its dimensions?
    5. Is it behind another element? (use elementFromPoint to check)
    
    Returns:
    {
        "classification": "tool_limitation" | "ux_failure" | "element_missing",
        "detail": str (human-readable explanation),
        "element_exists": bool,
        "element_visible": bool,
        "element_interactable": bool,
        "element_size": {width, height} | None,
        "blocked_by": str | None (if another element is on top)
    }
    """
    pass  # IMPLEMENT


async def smart_fill(page: Page, selector_or_label: str, value: str, timeout_ms: int = 5000) -> dict:
    """
    Fill a form field using multiple strategies.
    
    Strategies:
    1. page.get_by_label(selector_or_label).fill(value)
    2. page.get_by_placeholder(selector_or_label).fill(value)
    3. page.locator(f"input[name='{selector_or_label}']").fill(value)
    4. page.locator(f"#{selector_or_label}").fill(value)
    5. Find by associated label text via JS and fill
    6. Find the nth input on the page and fill
    
    Returns: {success, strategy_index, error}
    """
    pass  # IMPLEMENT


async def measure_element(page: Page, selector: str) -> dict:
    """
    Measure an element's properties for accessibility reporting.
    
    Returns:
    {
        "width_px": int,
        "height_px": int,
        "font_size_px": float,
        "color": str (rgb),
        "background_color": str (rgb),
        "contrast_ratio": float (calculated),
        "is_focusable": bool,
        "has_focus_indicator": bool,
        "has_aria_label": bool,
        "tap_target_sufficient": bool (>= 44x44px)
    }
    """
    pass  # IMPLEMENT


async def take_screenshot(page: Page, quality: int = 55, max_width: int = 800) -> str:
    """
    Take a compressed screenshot and return as base64 string.
    Resize to max_width to keep data transfer small.
    """
    screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
    return base64.b64encode(screenshot_bytes).decode()


async def keyboard_navigate(page: Page, max_tabs: int = 100) -> dict:
    """
    Navigate the page using only keyboard (Tab, Enter, Escape, Arrow keys).
    
    Used by keyboard-only personas like James.
    
    Returns:
    {
        "total_focusable": int,
        "focus_order": [{"element": str, "tag": str, "text": str, "step": int}],
        "focus_traps": [{"element": str, "loop_count": int, "step": int}],
        "unreachable_after_header": [str] (elements that exist but focus never reached),
        "skip_nav_present": bool,
        "escape_closes_modals": bool,
        "visible_focus_indicator": bool (at each step)
    }
    
    Logic:
    1. Focus the page body
    2. Press Tab repeatedly (up to max_tabs times)
    3. After each Tab, record what element has focus (document.activeElement)
    4. Detect focus traps: if the same element gets focus 3+ times in a row
    5. Track whether focus ever reaches the main content area
    6. Check if focus indicators are visible at each step
    """
    pass  # IMPLEMENT


async def inject_axe_and_audit(page: Page) -> dict:
    """
    Inject axe-core and run a full accessibility audit.
    
    Study axe-playwright-python for the right way to do this.
    Don't load from CDN -- bundle axe-core.min.js or use the npm package approach.
    
    Returns structured results:
    {
        "violations": [{
            "id": str,
            "impact": "critical" | "serious" | "moderate" | "minor",
            "description": str,
            "help_url": str,
            "nodes_count": int,
            "nodes": [{"html": str, "target": str}]
        }],
        "passes_count": int,
        "incomplete_count": int,
        "inapplicable_count": int
    }
    
    If axe-core injection fails (some sites block external scripts),
    fall back to manual checks:
    - Count images without alt text
    - Count inputs without labels
    - Check heading hierarchy
    - Check for skip-nav links
    """
    pass  # IMPLEMENT
```

---

### FILE: backend/crawler.py

Rewrite the crawler to use the new browser_utils functions.

```python
"""
crawler.py -- Site crawler for trashmy.tech

Crawls a URL and builds a comprehensive site map including:
- All pages (via internal links, max 20)
- All forms with their fields
- All interactive elements with sizes and positions
- Full accessibility audit via axe-core
- Baseline screenshots
- Performance timing
- Meta information (h1, description, viewport, etc)
"""
import time
from playwright.async_api import async_playwright
from .browser_utils import (
    wait_for_interactive,
    build_interaction_map,
    inject_axe_and_audit,
    take_screenshot
)


async def crawl_site(url: str) -> dict:
    """
    Crawl a URL and return a complete site map.
    
    Use wait_for_interactive (not just domcontentloaded).
    Use build_interaction_map (not simple querySelector).
    Use inject_axe_and_audit (not CDN injection).
    
    Return the full schema defined in the v4 PRD data schema section.
    Handle all errors gracefully. Close browser in finally block.
    Timeout: 30 seconds total for the entire crawl.
    """
    pass  # IMPLEMENT
```

---

### FILE: backend/agent.py

Rewrite the agent to use smart_click with classification, take screenshots at every step, and separate tool limitations from real findings.

```python
"""
agent.py -- Persona agent engine for trashmy.tech

Each agent:
1. Launches Playwright
2. Navigates to the target URL
3. Waits for the page to be interactive
4. Follows scripted behavior based on persona category
5. Takes screenshots after every action
6. Classifies every failure as tool_limitation or ux_failure
7. Collects measured data (element sizes, timing, errors)
8. Returns structured session data

CRITICAL RULE: If smart_click fails and classify_click_failure returns
"tool_limitation", do NOT record this as a site failure. Record it as a
tool limitation. Only record findings with real evidence.

Modal deployment:
- Use modal.App with Playwright + Pillow image
- Each agent runs in its own container
- run_swarm uses .starmap for parallel execution

Local fallback:
- Use asyncio.gather for local parallel execution
- Same logic, just without Modal decorators
"""
import modal
import asyncio
import time
from .browser_utils import (
    wait_for_interactive,
    build_interaction_map,
    smart_click,
    classify_click_failure,
    smart_fill,
    measure_element,
    take_screenshot,
    keyboard_navigate,
    inject_axe_and_audit
)
from .personas import PERSONAS, ADVERSARIAL_INPUTS


app = modal.App("trashmy-tech")

playwright_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("playwright", "Pillow")
    .run_commands(
        "playwright install chromium",
        "playwright install-deps chromium"
    )
)


@app.function(image=playwright_image, timeout=120)
async def run_agent_test(url: str, persona: dict, interaction_map: list) -> dict:
    """
    Run a single persona's test session.
    
    Args:
        url: the target URL
        persona: the persona dict from PERSONAS
        interaction_map: the pre-built interaction map from the crawler
    
    The persona's behavior is determined by their category:
    
    ACCESSIBILITY personas:
    - Margaret (A1): Navigate with 200% zoom, check readability, slow clicks
    - James (A2): Keyboard-only navigation via keyboard_navigate()
    - Priya (A3): DOM audit only (no visual navigation), use inject_axe_and_audit()
    - Carlos (A4): Fill forms, trigger validation, check color-only feedback
    - Lin (A5): Click with high misclick rate, measure all click targets
    
    CHAOS personas:
    - Form Anarchist (C1): Find forms, fill with ADVERSARIAL_INPUTS, check responses
    - Back Button Masher (C2): Navigate forward/back, check state preservation
    - Speed Runner (C3): Click everything with 0 delay, measure completion time
    - Double Clicker (C4): Double-click all buttons, check for duplicate submissions
    - Rage Quitter (C5): Short patience, rapid clicks on slow elements
    
    DEMOGRAPHIC personas:
    - Jayden (D1): Mobile viewport (390x844), skip text, visual-only navigation
    - Fatima (D2): Read all labels, flag idioms and unclear text
    - Aiko (D3): Mobile viewport (375x812), check responsive design
    - Pat (D4): One-handed, long delays between actions, check thumb zone
    - Robert (D5): Tablet viewport (810x1080), look for hidden nav
    
    BEHAVIORAL personas:
    - Dana/Skeptic (B1): Check footer for privacy policy, trust signals
    - Marco/Explorer (B2): Click every nav link, check for 404s
    - Yuki/Minimalist (B3): Fill only required fields, submit
    - Susan/Confused (B4): Slow, misclicks, look for guidance
    - Kai/PowerUser (B5): Keyboard shortcuts, Ctrl+K, Escape, Tab order
    
    EVERY action must:
    1. Use smart_click (not page.click directly)
    2. If smart_click fails, call classify_click_failure
    3. Take a screenshot after the action
    4. Record timing
    5. Add finding only if there's real evidence (not tool_limitation)
    
    Return the full session schema from the v4 PRD.
    """
    pass  # IMPLEMENT


async def run_swarm(url: str, personas: list, interaction_map: list) -> list:
    """Run all agents in parallel on Modal."""
    inputs = [(url, p, interaction_map) for p in personas]
    return list(run_agent_test.starmap(inputs))


async def run_swarm_local(url: str, personas: list, interaction_map: list) -> list:
    """Run all agents in parallel locally using asyncio."""
    async def _run(p):
        # Same logic as run_agent_test but without Modal
        # Import playwright here to avoid issues
        pass
    
    results = await asyncio.gather(
        *[_run(p) for p in personas],
        return_exceptions=True
    )
    
    # Convert exceptions to error sessions
    processed = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            processed.append({
                "persona": personas[i],
                "task_completed": False,
                "outcome": "crashed_site",
                "error": str(r),
                "steps": [],
                "findings": [{
                    "type": "tool_limitation",
                    "title": f"Agent crashed: {type(r).__name__}",
                    "detail": str(r),
                    "category": "testing"
                }]
            })
        else:
            processed.append(r)
    
    return processed
```

---

### FILE: backend/report.py

```python
"""
report.py -- Report generator using Gemini 2.5 Flash with reasoning

Uses Gemini with thinking enabled to reason through all test data
and produce calibrated, evidence-based ratings.

CRITICAL: Gemini must be told to ignore tool_limitation findings
when scoring. Only real findings (ux_failure, measured violations)
count against the site's score.
"""
import os
import json
from google import genai
from google.genai.types import GenerateContentConfig, ThinkingConfig


GEMINI_SYSTEM_PROMPT = """You are the analysis engine for trashmy.tech, a website testing tool that deploys AI personas to stress-test real websites.

You will receive:
1. Crawler data: site structure, accessibility violations from axe-core, performance metrics
2. Session data: results from 15 persona test sessions, each with steps, findings, and screenshots

YOUR JOB: Reason through all the data and produce accurate, calibrated ratings with cited evidence.

CRITICAL -- TOOL LIMITATIONS VS REAL FAILURES:
When agent sessions contain findings with type "tool_limitation", these mean our automated testing tool (Playwright) could not interact with an element. This does NOT mean the site has a problem. Real users can likely click elements that Playwright cannot. Do NOT count tool_limitation findings against the site's score. Only count findings with type "ux_failure" and violations from axe-core as real problems.

If most agents hit tool_limitation, set confidence to "low" and note that the site could not be fully tested.

SCORING CALIBRATION:
- A well-built site from a major company with only minor accessibility issues and no real UX failures: 70-90
- A site with some genuine accessibility gaps and a few usability problems: 50-70
- A site where multiple personas are genuinely blocked by real UX issues: 30-50
- A site that crashes, returns 500 errors, or has critical security vulnerabilities: 0-30
- Never score a site below 30 based only on tool_limitation findings

NARRATIVE RULES:
- Reference specific elements, measurements, and step numbers
- When a persona was blocked by a tool_limitation (not a real issue), say "our testing tool could not interact with [element] -- this may not reflect real user experience" instead of blaming the site
- Always include what works well. If load time is fast, say so. If mobile layout is clean, say so. This makes the report credible.
- The "would_recommend" verdict should be based on real evidence only

Respond with valid JSON matching the requested schema. No markdown formatting."""


async def generate_report(site_map: dict, sessions: list[dict]) -> dict:
    """
    Generate a full report using Gemini 2.5 Flash with thinking.
    
    1. Calculate base scores from hard data (axe-core, measured sizes, timing)
    2. Separate tool_limitation findings from real findings
    3. Build comprehensive prompt with all session data
       (exclude screenshot base64 from prompt -- too large. 
        Include step descriptions and finding details only.)
    4. Call Gemini with ThinkingConfig enabled
    5. Parse structured JSON response
    6. Attach screenshot references for the frontend
    
    Uses Gemini structured output:
    response_mime_type="application/json"
    
    Return the full report schema from the v4 PRD.
    """
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    # Count real vs tool failures
    real_findings = []
    tool_limitations = []
    for session in sessions:
        for finding in session.get("findings", []):
            if finding.get("type") == "tool_limitation":
                tool_limitations.append(finding)
            else:
                real_findings.append(finding)
    
    # Build prompt with all session data (minus screenshots)
    sessions_for_prompt = []
    for s in sessions:
        sessions_for_prompt.append({
            "persona_id": s["persona"]["id"],
            "persona_name": s["persona"]["name"],
            "persona_category": s["persona"]["category"],
            "persona_backstory": s["persona"]["backstory"],
            "task_completed": s.get("task_completed", False),
            "outcome": s.get("outcome", "unknown"),
            "total_time_ms": s.get("total_time_ms", 0),
            "steps_summary": [
                {"step": step["step_number"], "action": step["action"],
                 "target": step.get("target_element", ""), "result": step.get("result", "")}
                for step in s.get("steps", [])
            ],
            "findings": s.get("findings", []),
            "form_test_results": s.get("form_test_results", []),
            "keyboard_audit": s.get("keyboard_audit"),
            "mobile_audit": s.get("mobile_audit")
        })
    
    prompt = f"""Analyze the following website test data and produce a scored report.

SITE DATA:
URL: {site_map.get('url', 'unknown')}
Title: {site_map.get('title', 'unknown')}
Load time: {site_map.get('load_time_ms', 'unknown')}ms
Pages found: {len(site_map.get('pages_found', []))}
Forms found: {len(site_map.get('forms', []))}
Interactive elements: {len(site_map.get('buttons', []) + site_map.get('links', []))}

ACCESSIBILITY AUDIT (axe-core):
{json.dumps(site_map.get('accessibility', {}), indent=2)}

IMAGES:
Total: {site_map.get('images', {}).get('total', 0)}
Missing alt text: {site_map.get('images', {}).get('missing_alt', 0)}

META:
{json.dumps(site_map.get('meta', {}), indent=2)}

TOOL LIMITATION NOTE:
{len(tool_limitations)} findings were tool limitations (Playwright could not interact).
{len(real_findings)} findings were real UX/accessibility issues.
Score based on real findings only.

SESSION DATA:
{json.dumps(sessions_for_prompt, indent=2)}

Produce the report JSON with these exact keys:
- overall_score (0-100, calibrated per instructions)
- score_reasoning (2-3 sentences)
- confidence ("high" if <30% tool limitations, "moderate" if 30-60%, "low" if >60%)
- category_scores (accessibility, security, usability, mobile, performance -- each with score, reasoning, key_evidence, personas_affected)
- executive_summary (3-4 sentences)
- persona_verdicts (for each persona: persona_id, persona_name, would_recommend, narrative, key_moment_step, time_spent_seconds, outcome, primary_barrier)
- top_issues (ranked, each with rank, title, severity, category, description, evidence, affected_personas, fix, impact_estimate)
- what_works (list of things the site does well, with title, detail, personas_who_benefited)
- what_doesnt_work (list of real failures, with title, detail, personas_who_suffered)
- chaos_test_summary (inputs_tested, inputs_rejected, inputs_accepted_incorrectly, server_errors, xss_vulnerabilities, worst_finding)
- recommendations (top 3 ordered by impact)
"""
    
    # MODEL STRATEGY:
    # gemini-3.1-pro-preview for report (max reasoning, 5 RPM / 100 RPD free tier)
    # gemini-3-flash-preview for annotations (fast vision, 10 RPM / 250 RPD free tier)
    # One API key works for all models.
    
    response = client.models.generate_content(
        model="gemini-3.1-pro-preview",  # max model for scored report reasoning
        contents=prompt,
        config=GenerateContentConfig(
            system_instruction=GEMINI_SYSTEM_PROMPT,
            response_mime_type="application/json",
            thinking_config=ThinkingConfig(thinking_level="HIGH"),  # Gemini 3.x uses thinking_level: LOW/MEDIUM/HIGH/MAX
        )
    )
    
    try:
        report = json.loads(response.text)
    except json.JSONDecodeError:
        # Try to extract JSON from response
        text = response.text
        start = text.find('{')
        end = text.rfind('}') + 1
        if start >= 0 and end > start:
            report = json.loads(text[start:end])
        else:
            # Fall back to template report
            report = _fallback_report(site_map, sessions, real_findings, tool_limitations)
    
    # Attach screenshot data for frontend
    report["sessions_with_screenshots"] = [
        {
            "persona_id": s["persona"]["id"],
            "persona_name": s["persona"]["name"],
            "persona_category": s["persona"]["category"],
            "outcome": s.get("outcome", "unknown"),
            "time_ms": s.get("total_time_ms", 0),
            "screenshots": [
                {
                    "step": step["step_number"],
                    "action": step.get("action", ""),
                    "description": step.get("result", ""),
                    "screenshot_b64": step.get("screenshot_b64", "")
                }
                for step in s.get("steps", [])
                if step.get("screenshot_b64")
            ]
        }
        for s in sessions
    ]
    
    report["meta"] = {
        "url": site_map.get("url"),
        "tested_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "total_personas": len(sessions),
        "real_findings": len(real_findings),
        "tool_limitations": len(tool_limitations)
    }
    
    return report


def _fallback_report(site_map, sessions, real_findings, tool_limitations):
    """Template-based report when Gemini fails."""
    completed = sum(1 for s in sessions if s.get("outcome") == "completed")
    blocked = sum(1 for s in sessions if s.get("outcome") == "blocked")
    total = len(sessions)
    
    return {
        "overall_score": max(30, int((completed / max(total, 1)) * 70 + 30)),
        "score_reasoning": f"{completed}/{total} personas completed their tasks. {len(real_findings)} real issues found.",
        "confidence": "low" if len(tool_limitations) > len(real_findings) else "moderate",
        "executive_summary": f"Testing found {len(real_findings)} genuine issues. {len(tool_limitations)} interactions could not be completed due to testing tool limitations.",
        "category_scores": {},
        "persona_verdicts": [],
        "top_issues": [],
        "what_works": [],
        "what_doesnt_work": [],
        "chaos_test_summary": {"inputs_tested": 0, "inputs_rejected": 0, "inputs_accepted_incorrectly": 0, "server_errors": 0, "xss_vulnerabilities": 0, "worst_finding": "N/A"},
        "recommendations": ["Address accessibility violations found by axe-core", "Ensure all images have alt text", "Verify form validation handles edge cases"]
    }
```

---

### FILE: backend/main.py

```python
"""
main.py -- FastAPI server for trashmy.tech

Endpoints:
  POST /api/test        Start a test (body: {url: str})
  WS   /ws/{test_id}    Stream test progress
  GET  /api/test/{id}    Get full test data
  GET  /health           Health check

Pipeline (runs as background task):
1. crawl_site(url) -- uses new browser_utils
2. sample_personas(15) -- from personas.py  
3. run_swarm (Modal) or run_swarm_local (local)
4. generate_report -- Gemini with reasoning
5. Stream everything to frontend via WebSocket
"""
# IMPLEMENT using FastAPI, websockets, CORS allow all
# Store results in-memory dict keyed by test_id (uuid)
# USE_MODAL env var controls Modal vs local execution
```

---

### FILE: backend/personas.py

```python
"""
personas.py -- The 20 persona definitions for trashmy.tech

Each persona is a dict with id, name, age, category, description,
backstory, viewport, behavioral_modifiers, and behavior_script.

See the persona deep profiles document for full backstories.
These backstories are sent to Gemini to generate narrative reports.

Also includes ADVERSARIAL_INPUTS list and sample_personas(n) function.
"""
# IMPLEMENT all 20 personas as defined in the PRD
```

---

### FILE: requirements.txt

```
fastapi
uvicorn[standard]
websockets
playwright
google-genai
Pillow
modal
python-dotenv
```

---

### FILE: .env.example

```
# One key from aistudio.google.com -- works for ALL Gemini models
# We use gemini-3.1-pro-preview (report) + gemini-3-flash-preview (annotations)
GEMINI_API_KEY=your-gemini-api-key-from-aistudio.google.com
USE_MODAL=false
```

---

## STEP 4: Test against Apple.com

After implementing all files, run a test against https://apple.com.

Expected behavior:
- smart_click should successfully click Apple's navigation elements using fallback strategies (role-based selectors, JS click, coordinate click)
- If some elements still can't be clicked, classify_click_failure should return "tool_limitation" not "ux_failure"
- axe-core should find real accessibility violations (missing alt text is real on Apple.com)
- The score should be 70-85, not 35
- The report should acknowledge "X interactions could not be fully tested" honestly
- The report should note what works well (fast load, clean design)
- Real issues like missing alt text should still be flagged

## STEP 5: Test against a genuinely bad site

Test against a simple HTML page you create with known issues:
- No alt text on images
- No form labels
- Tiny click targets (20x20px)
- No skip-nav link
- Color-only error indicators
- No input validation

This site should score 20-40 and the report should be devastating. The contrast between Apple.com (70-85) and this bad site (20-40) proves the scoring is calibrated.
