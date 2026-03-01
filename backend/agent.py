"""trashmy.tech — AI agent engine using Gemini for browser-based user testing."""

import json
import asyncio
import base64
import io
import os
import random
import time
import traceback

from PIL import Image
from personas import ADVERSARIAL_INPUTS

# ---------------------------------------------------------------------------
# System prompt template
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_TEMPLATE = """\
You are role-playing as a REAL person testing a website.

YOUR IDENTITY:
- Name: {name}
- Age: {age}
- Description: {description}
- Browsing style: {task_style}

BEHAVIORAL RULES:
{behavioral_rules}

You will be given the page's visible text (possibly truncated) and a list of
interactive elements on the page. Decide what action to take NEXT as this
persona would.

Respond with ONLY valid JSON — no markdown fences, no extra text:
{{
  "action": "click|type|scroll|back|tab|stuck|done",
  "target": "visible element text, ARIA label, or CSS selector to interact with",
  "value": "text to type (only for type action, otherwise empty string)",
  "reasoning": "one sentence from this persona's perspective explaining why"
}}

ACTIONS:
- click  — click on an element matching `target`
- type   — focus the `target` input and type `value` into it
- scroll — scroll the page (target = "up" or "down")
- back   — press the browser back button
- tab    — press Tab to move focus to the next element
- stuck  — you cannot figure out what to do next
- done   — you have finished exploring or completed the task
"""


def _build_behavioral_rules(persona: dict) -> str:
    mods = persona.get("behavioral_modifiers", {})
    rules = []

    if mods.get("keyboard_only"):
        rules.append(
            "You can ONLY use 'tab' and 'type' actions. You cannot click "
            "with a mouse — you navigate solely with the keyboard."
        )
    if mods.get("skips_text"):
        rules.append("You NEVER read long text. You scan for buttons and links and click immediately.")
    if mods.get("reads_everything"):
        rules.append("You read every piece of text carefully before taking any action.")
    if mods.get("uses_back_button"):
        rules.append("You frequently hit the back button, especially when confused.")
    if mods.get("refreshes_randomly"):
        rules.append("You sometimes refresh the page impatiently when things seem slow.")
    if mods.get("double_clicks"):
        rules.append("You double-click everything out of habit.")
    if mods.get("input_strategy") == "adversarial":
        rules.append(
            "When typing into ANY form field, you deliberately enter "
            "malicious or absurd inputs: SQL injection, XSS payloads, emojis."
        )
    if mods.get("input_strategy") == "minimal":
        rules.append("You type the bare minimum into every field and skip anything optional.")

    patience = mods.get("patience_threshold_ms", 30000)
    if patience <= 5000:
        rules.append("You are EXTREMELY impatient. If something doesn't happen instantly, say 'stuck' or 'done'.")
    elif patience <= 15000:
        rules.append("You get bored quickly and may give up early.")

    task = persona.get("task_style", "")
    if task == "screen_reader":
        rules.append("You rely entirely on ARIA labels and semantic HTML. If an element has no accessible label you cannot find it.")
    if task == "visual_check":
        rules.append("You pay close attention to color contrasts and visual design.")
    if task == "confused":
        rules.append("You are confused by modern web conventions. Pop-ups, modals, and hamburger menus bewilder you.")
    if task == "power_user":
        rules.append("You expect keyboard shortcuts and fast load times.")

    return "\n".join(f"- {r}" for r in rules) if rules else "- Act naturally."


# ---------------------------------------------------------------------------
# Page state extraction
# ---------------------------------------------------------------------------

async def _extract_page_state(page) -> dict:
    try:
        visible_text = await page.evaluate(
            """() => {
                const body = document.body;
                if (!body) return '';
                const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
                let text = '';
                while (walk.nextNode()) {
                    const t = walk.currentNode.textContent.trim();
                    if (t) text += t + ' ';
                }
                return text.slice(0, 2000);
            }"""
        )
    except Exception:
        visible_text = ""

    try:
        elements = await page.evaluate(
            """() => {
                const selectors = 'a, button, input, textarea, select, [role="button"], [role="link"], [tabindex]';
                const els = Array.from(document.querySelectorAll(selectors));
                return els.slice(0, 50).map((el, i) => {
                    const rect = el.getBoundingClientRect();
                    return {
                        index: i,
                        tag: el.tagName.toLowerCase(),
                        type: el.getAttribute('type') || '',
                        text: (el.innerText || '').trim().slice(0, 80),
                        aria_label: el.getAttribute('aria-label') || '',
                        placeholder: el.getAttribute('placeholder') || '',
                        href: (el.getAttribute('href') || '').slice(0, 120),
                        name: el.getAttribute('name') || '',
                        id: el.id || '',
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                    };
                });
            }"""
        )
    except Exception:
        elements = []

    return {"visible_text": visible_text, "elements": elements}


def _format_elements(elements: list[dict]) -> str:
    lines = []
    for el in elements:
        parts = [f"[{el['index']}] <{el['tag']}>"]
        if el.get("type"): parts.append(f'type="{el["type"]}"')
        if el.get("text"): parts.append(f'text="{el["text"]}"')
        if el.get("aria_label"): parts.append(f'aria-label="{el["aria_label"]}"')
        if el.get("placeholder"): parts.append(f'placeholder="{el["placeholder"]}"')
        if el.get("href"): parts.append(f'href="{el["href"]}"')
        if el.get("name"): parts.append(f'name="{el["name"]}"')
        if el.get("width") and el.get("height"):
            parts.append(f'size={el["width"]}x{el["height"]}px')
        lines.append(" ".join(parts))
    return "\n".join(lines) if lines else "(no interactive elements found)"


# ---------------------------------------------------------------------------
# Screenshot capture
# ---------------------------------------------------------------------------

async def _capture_step_screenshot(page, width: int = 600, quality: int = 50) -> str | None:
    """Capture current viewport as compressed JPEG base64."""
    try:
        raw_bytes = await page.screenshot(type="jpeg", quality=quality)
        img = Image.open(io.BytesIO(raw_bytes))
        original_w, original_h = img.size
        if original_w > width:
            ratio = width / original_w
            new_h = max(1, int(original_h * ratio))
            img = img.resize((width, new_h), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Gemini LLM call
# ---------------------------------------------------------------------------

async def _ask_llm(client, system_prompt: str, user_prompt: str) -> dict:
    """Call Gemini and parse JSON response."""
    from google.genai.types import GenerateContentConfig
    try:
        full_prompt = system_prompt + "\n\n" + user_prompt
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model="gemini-2.0-flash",
                contents=full_prompt,
                config=GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=300,
                ),
            ),
            timeout=30,
        )
        raw = response.text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"action": "stuck", "target": "", "value": "", "reasoning": "LLM returned invalid JSON"}
    except asyncio.TimeoutError:
        return {"action": "stuck", "target": "", "value": "", "reasoning": "LLM request timed out"}
    except Exception as e:
        return {"action": "stuck", "target": "", "value": "", "reasoning": f"LLM error: {str(e)[:120]}"}


# ---------------------------------------------------------------------------
# Element finding + action execution
# ---------------------------------------------------------------------------

async def _find_element(page, target: str, elements: list[dict]):
    if not target:
        return None

    # Try by element index e.g. "[3]"
    if target.startswith("[") and "]" in target:
        try:
            idx = int(target.split("]")[0][1:])
            if 0 <= idx < len(elements):
                el = elements[idx]
                for attr in ("id", "name"):
                    if el.get(attr):
                        sel = f"#{el[attr]}" if attr == "id" else f"[name='{el[attr]}']"
                        handle = await page.query_selector(sel)
                        if handle:
                            return handle
        except (ValueError, IndexError):
            pass

    # Try by text, aria-label, placeholder, raw selector
    for strategy in [
        lambda: page.query_selector(f"text={target}"),
        lambda: page.query_selector(f"[aria-label='{target}']"),
        lambda: page.query_selector(f"[placeholder='{target}']"),
        lambda: page.query_selector(target),
    ]:
        try:
            handle = await strategy()
            if handle:
                return handle
        except Exception:
            pass

    # Fuzzy match
    for el in elements:
        for field in ("text", "aria_label", "placeholder"):
            val = el.get(field, "")
            if val and target.lower() in val.lower():
                for attr in ("id", "name"):
                    if el.get(attr):
                        sel = f"#{el[attr]}" if attr == "id" else f"[name='{el[attr]}']"
                        try:
                            handle = await page.query_selector(sel)
                            if handle:
                                return handle
                        except Exception:
                            pass

    return None


async def _get_element_size(handle) -> dict:
    """Get bounding box of an element."""
    try:
        box = await handle.bounding_box()
        if box:
            return {"width": round(box["width"]), "height": round(box["height"])}
    except Exception:
        pass
    return {"width": 0, "height": 0}


async def _execute_action(page, decision: dict, persona: dict, elements: list[dict]) -> dict:
    action = decision.get("action", "stuck")
    target = decision.get("target", "")
    value = decision.get("value", "")
    mods = persona.get("behavioral_modifiers", {})
    result = {"executed": True, "error": None, "target_size": {"width": 0, "height": 0}}
    click_delay = mods.get("click_delay_ms", 400) / 1000.0

    try:
        if action == "click":
            handle = await _find_element(page, target, elements)
            if handle:
                result["target_size"] = await _get_element_size(handle)
                await asyncio.sleep(click_delay)
                if mods.get("double_clicks"):
                    await handle.dblclick(timeout=5000)
                else:
                    await handle.click(timeout=5000)
            else:
                result["executed"] = False
                result["error"] = f"Element not found: {target}"

        elif action == "type":
            handle = await _find_element(page, target, elements)
            if handle:
                result["target_size"] = await _get_element_size(handle)
                await asyncio.sleep(click_delay)
                await handle.click(timeout=5000)
                if mods.get("input_strategy") == "adversarial":
                    value = random.choice(ADVERSARIAL_INPUTS)
                    result["adversarial_input"] = value
                await handle.fill(value, timeout=5000)
            else:
                result["executed"] = False
                result["error"] = f"Input not found: {target}"

        elif action == "scroll":
            direction = -300 if target.lower() == "up" else 300
            await page.evaluate(f"window.scrollBy(0, {direction})")
            await asyncio.sleep(0.3)

        elif action == "back":
            await page.go_back(timeout=10000)
            await asyncio.sleep(0.5)

        elif action == "tab":
            await page.keyboard.press("Tab")
            await asyncio.sleep(0.2)

        elif action in ("stuck", "done"):
            pass
        else:
            result["executed"] = False
            result["error"] = f"Unknown action: {action}"

    except Exception as e:
        result["executed"] = False
        result["error"] = str(e)[:200]

    return result


# ---------------------------------------------------------------------------
# Core agent loop
# ---------------------------------------------------------------------------

async def _agent_loop(url: str, persona: dict, site_context: dict, model) -> dict:
    from playwright.async_api import async_playwright

    session_start = time.time()
    steps: list[dict] = []
    findings: list[dict] = []
    dead_ends: list[str] = []
    all_errors: list[str] = []
    form_test_results: list[dict] = []
    task_completed = False
    final_url = url

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        name=persona.get("name", "Unknown"),
        age=persona.get("age", "unknown"),
        description=persona.get("description", ""),
        task_style=persona.get("task_style", "normal"),
        behavioral_rules=_build_behavioral_rules(persona),
    )

    pw = None
    browser = None
    try:
        pw = await async_playwright().start()
        viewport = persona.get("viewport", {"width": 1280, "height": 720})
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport=viewport,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        )
        page = await context.new_page()

        # Collect console errors
        console_errors: list[str] = []
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text[:200]}") if msg.type in ("error", "warning") else None)

        # Collect network errors
        network_errors: list[dict] = []
        page.on("response", lambda resp: network_errors.append({"url": resp.url[:200], "status": resp.status}) if resp.status >= 400 else None)

        # Navigate
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(1500)
        except Exception as e:
            all_errors.append(f"Navigation failed: {str(e)[:200]}")
            return _make_result(persona, steps, all_errors, dead_ends, findings, form_test_results, False, session_start, url, 0)

        # Agent loop — up to 10 steps
        for step_num in range(10):
            state = await _extract_page_state(page)

            user_prompt = (
                f"CURRENT URL: {page.url}\n\n"
                f"VISIBLE TEXT:\n{state['visible_text']}\n\n"
                f"INTERACTIVE ELEMENTS:\n{_format_elements(state['elements'])}\n\n"
                f"Step {step_num + 1} of 10. What do you do next?"
            )

            decision = await _ask_llm(model, system_prompt, user_prompt)

            # Capture screenshot before action
            screenshot_b64 = await _capture_step_screenshot(page)

            # Execute action
            exec_result = await _execute_action(page, decision, persona, state["elements"])

            step_record = {
                "step_number": step_num + 1,
                "action": decision.get("action"),
                "target_element": decision.get("target", ""),
                "value": decision.get("value", ""),
                "reasoning": decision.get("reasoning", ""),
                "target_size_px": exec_result.get("target_size", {"width": 0, "height": 0}),
                "result": "success" if exec_result["executed"] else exec_result.get("error", "failed"),
                "page_url_after": page.url,
                "screenshot_b64": screenshot_b64,
                "timestamp_ms": int((time.time() - session_start) * 1000),
                "console_errors_new": list(console_errors),
                "network_errors_new": list(network_errors),
            }
            console_errors.clear()
            network_errors.clear()

            steps.append(step_record)

            # Track form test results for chaos agents
            if exec_result.get("adversarial_input") and decision.get("action") == "type":
                form_test_results.append({
                    "input_type": _classify_adversarial(exec_result["adversarial_input"]),
                    "input_value": exec_result["adversarial_input"],
                    "field_name": decision.get("target", "unknown"),
                    "accepted": exec_result["executed"],
                    "server_error": any(e.get("status", 0) >= 500 for e in step_record["network_errors_new"]),
                    "error_message": exec_result.get("error", ""),
                })

            # Generate findings
            if exec_result.get("error"):
                all_errors.append(f"Step {step_num + 1}: {exec_result['error']}")

            if not exec_result["executed"] and decision["action"] not in ("stuck", "done"):
                dead_ends.append(f"Step {step_num + 1}: Could not {decision['action']} '{decision.get('target', '')}'")
                findings.append({
                    "type": "major",
                    "category": "usability",
                    "title": f"Could not {decision['action']} target element",
                    "detail": f"{persona['name']} tried to {decision['action']} '{decision.get('target', '')}' but the element was not found or not interactable.",
                    "evidence_step": step_num + 1,
                    "measured_value": "element not found",
                    "expected_value": "element should be interactable",
                })

            # Check for small click targets
            size = exec_result.get("target_size", {})
            if decision["action"] == "click" and exec_result["executed"]:
                w, h = size.get("width", 0), size.get("height", 0)
                if 0 < w < 44 or 0 < h < 44:
                    findings.append({
                        "type": "minor",
                        "category": "accessibility",
                        "title": "Click target too small",
                        "detail": f"Element '{decision.get('target', '')}' is {w}x{h}px, below the 44x44px WCAG minimum.",
                        "evidence_step": step_num + 1,
                        "measured_value": f"{w}x{h}px",
                        "expected_value": "44x44px minimum",
                    })

            try:
                await page.wait_for_timeout(800)
            except Exception:
                pass

            if decision["action"] == "done":
                task_completed = True
                break
            if decision["action"] == "stuck":
                dead_ends.append(f"Step {step_num + 1}: Persona got stuck — {decision.get('reasoning', '')}")
                findings.append({
                    "type": "critical",
                    "category": "usability",
                    "title": f"{persona['name']} got stuck",
                    "detail": decision.get("reasoning", "Could not determine next action"),
                    "evidence_step": step_num + 1,
                    "measured_value": "blocked",
                    "expected_value": "clear path forward",
                })
                break

        final_url = page.url

    except Exception:
        all_errors.append(f"Agent crash: {traceback.format_exc()[:500]}")
    finally:
        try:
            if browser: await browser.close()
        except Exception: pass
        try:
            if pw: await pw.stop()
        except Exception: pass

    return _make_result(persona, steps, all_errors, dead_ends, findings, form_test_results, task_completed, session_start, final_url, len(steps))


def _classify_adversarial(input_val: str) -> str:
    if "DROP" in input_val or "OR" in input_val:
        return "sql_injection"
    if "<script" in input_val or "onerror" in input_val:
        return "xss"
    if "../" in input_val:
        return "path_traversal"
    if input_val in ("null", "undefined"):
        return "null_literal"
    if input_val == "":
        return "empty_string"
    if len(input_val) > 100:
        return "overflow"
    return "other"


def _make_result(persona, steps, errors, dead_ends, findings, form_test_results, completed, start_time, final_url, step_count):
    time_spent = int((time.time() - start_time) * 1000)

    # Determine outcome
    if completed:
        outcome = "completed"
    elif dead_ends:
        outcome = "blocked"
    elif time_spent > 30000:
        outcome = "struggled"
    else:
        outcome = "struggled"

    return {
        "agent_id": persona.get("id"),
        "persona": {
            "id": persona.get("id"),
            "name": persona.get("name"),
            "age": persona.get("age"),
            "category": persona.get("category"),
            "description": persona.get("description"),
        },
        "task_completed": completed,
        "outcome": outcome,
        "total_time_ms": time_spent,
        "steps": steps,
        "findings": findings,
        "form_test_results": form_test_results,
        "errors": errors,
        "dead_ends": dead_ends,
        "final_url": final_url,
        "steps_taken": step_count,
        "issues_found": len(findings),
    }


# ---------------------------------------------------------------------------
# Local execution (no Modal)
# ---------------------------------------------------------------------------

async def run_agent_local(url: str, persona: dict, site_context: dict) -> dict:
    """Run a single persona test locally using Gemini."""
    from google import genai

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return _make_result(persona, [], ["GEMINI_API_KEY not set"], [], [], [], False, time.time(), url, 0)

    client = genai.Client(api_key=api_key)
    return await _agent_loop(url, persona, site_context, client)


async def run_swarm_local(url: str, personas: list[dict], site_context: dict) -> list[dict]:
    """Run all persona tests concurrently."""
    tasks = [run_agent_local(url, persona, site_context) for persona in personas]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    final = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            final.append(_make_result(personas[i], [], [f"Agent exception: {str(result)[:300]}"], [], [], [], False, time.time(), url, 0))
        else:
            final.append(result)
    return final


# ---------------------------------------------------------------------------
# CLI test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    from dotenv import load_dotenv
    from personas import PERSONAS

    load_dotenv()
    test_url = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"
    test_persona = PERSONAS[0]

    print(f"Testing {test_url} as {test_persona['name']}...")
    result = asyncio.run(run_agent_local(test_url, test_persona, {}))
    # Don't print screenshots
    for step in result.get("steps", []):
        step.pop("screenshot_b64", None)
    print(json.dumps(result, indent=2, default=str))
