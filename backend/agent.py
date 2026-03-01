"""trashmy.tech — AI agent engine with smart clicking and failure classification."""

import json
import asyncio
import base64
import os
import random
import time
import traceback

from personas import ADVERSARIAL_INPUTS
from browser_utils import (
    wait_for_interactive,
    build_interaction_map,
    format_elements_for_llm,
    smart_find,
    smart_click,
    smart_fill,
    measure_element,
    classify_click_failure,
    capture_screenshot,
    extract_page_state,
    keyboard_navigate,
    FailureType,
    InteractiveElement,
)

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
  "target": "visible element text, ARIA label, index [N], or CSS selector",
  "value": "text to type (only for type action, otherwise empty string)",
  "reasoning": "one sentence from this persona's perspective explaining why"
}}

IMPORTANT TARGETING TIPS:
- Prefer using the [N] index from the elements list for reliable targeting
- If an element has an id, you can use #id
- For links, use the exact visible text
- For buttons, use the button text
- For inputs, use name, placeholder, or aria-label

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
# Gemini LLM call
# ---------------------------------------------------------------------------

async def _ask_llm(client, system_prompt: str, user_prompt: str) -> dict:
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
# Visual overlay helpers (headed mode only)
# ---------------------------------------------------------------------------

_CURSOR_OVERLAY_JS = """\
(function() {
  if (document.getElementById('__tmt_cursor')) return;
  const cur = document.createElement('div');
  cur.id = '__tmt_cursor';
  cur.style.cssText = `
    position: fixed; z-index: 2147483647; pointer-events: none;
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid rgba(239,68,68,0.9);
    background: rgba(239,68,68,0.25);
    transform: translate(-50%, -50%);
    transition: left 0.25s cubic-bezier(.22,1,.36,1), top 0.25s cubic-bezier(.22,1,.36,1);
    left: -50px; top: -50px;
    box-shadow: 0 0 12px rgba(239,68,68,0.3);
  `;
  document.body.appendChild(cur);
  const label = document.createElement('div');
  label.id = '__tmt_label';
  label.style.cssText = `
    position: fixed; z-index: 2147483647; pointer-events: none;
    font: bold 10px 'JetBrains Mono', monospace; color: #fff;
    background: rgba(239,68,68,0.85); padding: 2px 6px; border-radius: 3px;
    transform: translate(12px, -50%);
    transition: left 0.25s cubic-bezier(.22,1,.36,1), top 0.25s cubic-bezier(.22,1,.36,1);
    left: -200px; top: -200px; white-space: nowrap;
  `;
  document.body.appendChild(label);
  document.addEventListener('mousemove', (e) => {
    cur.style.left = e.clientX + 'px';
    cur.style.top = e.clientY + 'px';
    label.style.left = e.clientX + 'px';
    label.style.top = e.clientY + 'px';
  });
})();
"""

_RIPPLE_JS = """\
(function(x, y, color) {
  const r = document.createElement('div');
  r.style.cssText = `
    position: fixed; z-index: 2147483646; pointer-events: none;
    left: ${x}px; top: ${y}px;
    width: 0; height: 0; border-radius: 50%;
    background: ${color || 'rgba(239,68,68,0.4)'};
    transform: translate(-50%, -50%);
    animation: __tmt_ripple 0.5s ease-out forwards;
  `;
  if (!document.getElementById('__tmt_ripple_style')) {
    const s = document.createElement('style');
    s.id = '__tmt_ripple_style';
    s.textContent = `@keyframes __tmt_ripple {
      0% { width: 0; height: 0; opacity: 1; }
      100% { width: 60px; height: 60px; opacity: 0; }
    }`;
    document.head.appendChild(s);
  }
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 600);
})(%f, %f, '%s');
"""

_FAIL_FLASH_JS = """\
(function(msg) {
  const d = document.createElement('div');
  d.style.cssText = `
    position: fixed; z-index: 2147483647; pointer-events: none;
    top: 16px; left: 50%%; transform: translateX(-50%%);
    background: rgba(239,68,68,0.9); color: #fff;
    font: bold 12px 'JetBrains Mono', monospace;
    padding: 8px 20px; border-radius: 6px;
    animation: __tmt_fail 1.2s ease-out forwards;
    box-shadow: 0 4px 24px rgba(239,68,68,0.4);
  `;
  d.textContent = msg;
  if (!document.getElementById('__tmt_fail_style')) {
    const s = document.createElement('style');
    s.id = '__tmt_fail_style';
    s.textContent = `@keyframes __tmt_fail {
      0%% { opacity: 0; transform: translateX(-50%%) translateY(-10px); }
      15%% { opacity: 1; transform: translateX(-50%%) translateY(0); }
      80%% { opacity: 1; }
      100%% { opacity: 0; transform: translateX(-50%%) translateY(-10px); }
    }`;
    document.head.appendChild(s);
  }
  document.body.appendChild(d);
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;
    border: 3px solid rgba(239,68,68,0.7);
    animation: __tmt_border_flash 0.6s ease-out forwards;
  `;
  if (!document.getElementById('__tmt_border_style')) {
    const s = document.createElement('style');
    s.id = '__tmt_border_style';
    s.textContent = `@keyframes __tmt_border_flash {
      0%% { opacity: 1; } 100%% { opacity: 0; }
    }`;
    document.head.appendChild(s);
  }
  document.body.appendChild(overlay);
  setTimeout(() => { d.remove(); overlay.remove(); }, 1400);
})('%s');
"""


async def _inject_overlays(page, headed: bool, persona: dict | None = None):
    if not headed:
        return
    try:
        already = await page.evaluate("!!document.getElementById('__tmt_cursor')")
        if not already:
            await page.evaluate(_CURSOR_OVERLAY_JS)
    except Exception:
        pass
    if persona:
        try:
            cat_colors = {
                "accessibility": "#3b82f6", "chaos": "#ef4444",
                "demographic": "#14b8a6", "behavioral": "#8b5cf6",
            }
            color = cat_colors.get(persona.get("category", ""), "#7a8099")
            name = persona.get("name", "Agent").replace("'", "\\'")
            cat = persona.get("category", "")
            await page.evaluate(f"""(() => {{
                if (document.getElementById('__tmt_badge')) return;
                const b = document.createElement('div');
                b.id = '__tmt_badge';
                b.style.cssText = `
                    position: fixed; z-index: 2147483647; pointer-events: none;
                    bottom: 12px; right: 12px;
                    font: bold 11px 'JetBrains Mono', monospace;
                    color: #fff; background: {color};
                    padding: 5px 12px; border-radius: 4px;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.4);
                `;
                b.textContent = 'trashmy.tech — {name} [{cat}]';
                document.body.appendChild(b);
            }})()""")
        except Exception:
            pass


async def _move_cursor_to(page, handle, headed: bool):
    if not headed:
        return
    try:
        box = await handle.bounding_box()
        if not box:
            return
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        await page.evaluate(f"""(() => {{
            const c = document.getElementById('__tmt_cursor');
            const l = document.getElementById('__tmt_label');
            if (c) {{ c.style.left = '{cx}px'; c.style.top = '{cy}px'; }}
            if (l) {{ l.style.left = '{cx}px'; l.style.top = '{cy}px'; }}
        }})()""")
        await page.wait_for_timeout(250)
    except Exception:
        pass


async def _show_ripple(page, handle, headed: bool, color="rgba(239,68,68,0.4)"):
    if not headed:
        return
    try:
        box = await handle.bounding_box()
        if not box:
            return
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        await page.evaluate(_RIPPLE_JS % (cx, cy, color))
    except Exception:
        pass


async def _show_fail(page, message: str, headed: bool):
    if not headed:
        return
    try:
        safe_msg = message.replace("'", "\\'").replace("\n", " ")[:60]
        await page.evaluate(_FAIL_FLASH_JS % safe_msg)
        await page.wait_for_timeout(300)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Action execution with smart clicking
# ---------------------------------------------------------------------------

async def _execute_action(
    page, decision: dict, persona: dict,
    elements: list[InteractiveElement], headed: bool,
) -> dict:
    action = decision.get("action", "stuck")
    target = decision.get("target", "")
    value = decision.get("value", "")
    mods = persona.get("behavioral_modifiers", {})
    click_delay = mods.get("click_delay_ms", 400) / 1000.0

    result = {
        "executed": True,
        "error": None,
        "target_size": {"width": 0, "height": 0},
        "failure_classification": None,
        "click_strategy": None,
    }

    try:
        if action == "click":
            handle = await smart_find(page, target, elements)
            if handle:
                size = await measure_element(handle)
                result["target_size"] = {"width": size["width"], "height": size["height"]}

                await _move_cursor_to(page, handle, headed)
                await asyncio.sleep(click_delay)
                await _show_ripple(page, handle, headed)

                if mods.get("double_clicks"):
                    try:
                        await handle.dblclick(timeout=5000)
                        result["click_strategy"] = "double_click"
                    except Exception:
                        # Fall through to smart_click
                        click_result = await smart_click(page, handle)
                        result["click_strategy"] = click_result.strategy_used
                        if not click_result.success:
                            classification = classify_click_failure(click_result, target, None)
                            result["failure_classification"] = classification
                            if classification.get("is_site_bug"):
                                result["executed"] = False
                                result["error"] = classification.get("reason", "Click failed")
                            else:
                                # Tool limitation — mark as executed (not a site bug)
                                result["tool_limitation"] = True
                                result["error"] = classification.get("reason", "")
                else:
                    click_result = await smart_click(page, handle)
                    result["click_strategy"] = click_result.strategy_used
                    if not click_result.success:
                        classification = classify_click_failure(click_result, target, None)
                        result["failure_classification"] = classification
                        if classification.get("is_site_bug"):
                            result["executed"] = False
                            result["error"] = classification.get("reason", "Click failed")
                            await _show_fail(page, classification.get("reason", "Click failed"), headed)
                        else:
                            result["tool_limitation"] = True
                            result["error"] = classification.get("reason", "")
            else:
                result["executed"] = False
                result["error"] = f"Element not found: {target}"
                # Can't find element — this is almost always our tool's problem,
                # not the site's. LLM asked to click something we can't locate.
                result["tool_limitation"] = True
                result["failure_classification"] = {
                    "type": FailureType.TOOL_LIMITATION.value,
                    "is_site_bug": False,
                    "reason": f"Could not locate element matching '{target}'",
                }
                await _show_fail(page, f"Not found: {target[:40]}", headed)

        elif action == "type":
            handle = await smart_find(page, target, elements)
            if handle:
                size = await measure_element(handle)
                result["target_size"] = {"width": size["width"], "height": size["height"]}

                await _move_cursor_to(page, handle, headed)
                await asyncio.sleep(click_delay)

                if mods.get("input_strategy") == "adversarial":
                    value = random.choice(ADVERSARIAL_INPUTS)
                    result["adversarial_input"] = value

                await _show_ripple(page, handle, headed, color="rgba(59,130,246,0.5)")
                fill_result = await smart_fill(page, handle, value)
                if not fill_result["success"]:
                    result["executed"] = False
                    result["error"] = fill_result.get("error", "Could not fill input")
                    result["failure_classification"] = {
                        "type": FailureType.TOOL_LIMITATION.value,
                        "is_site_bug": False,
                        "reason": "Could not fill input — likely a custom component",
                    }
                    await _show_fail(page, "Can't fill input", headed)
            else:
                result["executed"] = False
                result["error"] = f"Input not found: {target}"
                result["tool_limitation"] = True
                result["failure_classification"] = {
                    "type": FailureType.TOOL_LIMITATION.value,
                    "is_site_bug": False,
                    "reason": f"Input element '{target}' not found",
                }
                await _show_fail(page, f"Input not found: {target[:40]}", headed)

        elif action == "scroll":
            direction = -400 if target.lower() == "up" else 400
            await page.evaluate(f"window.scrollBy(0, {direction})")
            await asyncio.sleep(0.3)

        elif action == "back":
            await page.go_back(timeout=10000)
            await asyncio.sleep(0.5)

        elif action == "tab":
            nav_result = await keyboard_navigate(page)
            if nav_result.get("focused_element"):
                fe = nav_result["focused_element"]
                if not fe.get("has_focus_style"):
                    result["finding"] = {
                        "type": "minor",
                        "category": "accessibility",
                        "title": "Missing focus indicator",
                        "detail": f"Element <{fe.get('tag', '?')}> '{fe.get('text', '')[:30]}' has no visible focus style",
                    }

        elif action in ("stuck", "done"):
            if headed and action == "stuck":
                await _show_fail(page, "STUCK — can't proceed", headed)

        else:
            result["executed"] = False
            result["error"] = f"Unknown action: {action}"

    except Exception as e:
        result["executed"] = False
        result["error"] = str(e)[:200]
        # Classify unexpected errors as tool limitations
        result["failure_classification"] = {
            "type": FailureType.TOOL_LIMITATION.value,
            "is_site_bug": False,
            "reason": f"Unexpected error: {str(e)[:150]}",
        }
        await _show_fail(page, str(e)[:60], headed)

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
    tool_limitations: list[dict] = []
    task_completed = False
    final_url = url
    headed = os.getenv("HEADLESS", "true").lower() == "false"

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
        browser = await pw.chromium.launch(
            headless=not headed,
            slow_mo=150 if headed else 0,
        )
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
            await wait_for_interactive(page, timeout_ms=8000)
            await _inject_overlays(page, headed, persona)
        except Exception as e:
            all_errors.append(f"Navigation failed: {str(e)[:200]}")
            return _make_result(persona, steps, all_errors, dead_ends, findings,
                              form_test_results, tool_limitations, False, session_start, url, 0)

        # Agent loop — up to 12 steps
        max_steps = 12
        for step_num in range(max_steps):
            await _inject_overlays(page, headed, persona)

            # Build interaction map (much richer than old element extraction)
            elements = await build_interaction_map(page)
            page_state = await extract_page_state(page)

            user_prompt = (
                f"CURRENT URL: {page.url}\n\n"
                f"VISIBLE TEXT:\n{page_state['visible_text']}\n\n"
                f"INTERACTIVE ELEMENTS:\n{format_elements_for_llm(elements)}\n\n"
                f"Step {step_num + 1} of {max_steps}. What do you do next?"
            )

            decision = await _ask_llm(model, system_prompt, user_prompt)

            # Capture screenshot before action
            screenshot_bytes = await capture_screenshot(page)
            screenshot_b64 = base64.b64encode(screenshot_bytes).decode("ascii") if screenshot_bytes else None

            # Execute action with smart clicking
            exec_result = await _execute_action(page, decision, persona, elements, headed)

            step_record = {
                "step_number": step_num + 1,
                "action": decision.get("action"),
                "target_element": decision.get("target", ""),
                "value": decision.get("value", ""),
                "reasoning": decision.get("reasoning", ""),
                "target_size_px": exec_result.get("target_size", {"width": 0, "height": 0}),
                "result": "success" if exec_result["executed"] else exec_result.get("error", "failed"),
                "click_strategy": exec_result.get("click_strategy"),
                "failure_classification": exec_result.get("failure_classification"),
                "page_url_after": page.url,
                "screenshot_b64": screenshot_b64,
                "timestamp_ms": int((time.time() - session_start) * 1000),
                "console_errors_new": list(console_errors),
                "network_errors_new": list(network_errors),
            }
            console_errors.clear()
            network_errors.clear()

            steps.append(step_record)

            # Track tool limitations separately
            if exec_result.get("tool_limitation"):
                tool_limitations.append({
                    "step": step_num + 1,
                    "target": decision.get("target", ""),
                    "reason": exec_result.get("error", ""),
                    "strategy_attempts": exec_result.get("click_strategy", ""),
                })

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

            # Generate findings — only for genuine UX issues, NOT tool limitations
            classification = exec_result.get("failure_classification")
            is_tool_limitation = (
                exec_result.get("tool_limitation") or
                (classification and classification.get("type") == FailureType.TOOL_LIMITATION.value)
            )

            if exec_result.get("error") and not is_tool_limitation:
                all_errors.append(f"Step {step_num + 1}: {exec_result['error']}")

            if not exec_result["executed"] and not is_tool_limitation and decision["action"] not in ("stuck", "done"):
                dead_ends.append(f"Step {step_num + 1}: Could not {decision['action']} '{decision.get('target', '')}'")
                findings.append({
                    "type": "major",
                    "category": "usability",
                    "title": f"Could not {decision['action']} target element",
                    "detail": f"{persona['name']} tried to {decision['action']} '{decision.get('target', '')}' but the element was not interactable. {classification.get('reason', '') if classification else ''}",
                    "evidence_step": step_num + 1,
                    "measured_value": classification.get("reason", "element not interactable") if classification else "element not found",
                    "expected_value": "element should be interactable",
                    "is_site_bug": True,
                })

            # Check for tab finding (focus indicators)
            if exec_result.get("finding"):
                findings.append({
                    **exec_result["finding"],
                    "evidence_step": step_num + 1,
                    "is_site_bug": True,
                })

            # Check for small click targets — genuine UX issue
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
                        "is_site_bug": True,
                    })

            try:
                await page.wait_for_timeout(600)
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
                    "is_site_bug": True,
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

    return _make_result(persona, steps, all_errors, dead_ends, findings,
                       form_test_results, tool_limitations, task_completed,
                       session_start, final_url, len(steps))


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


def _make_result(persona, steps, errors, dead_ends, findings, form_test_results,
                 tool_limitations, completed, start_time, final_url, step_count):
    time_spent = int((time.time() - start_time) * 1000)

    # Filter findings to only genuine site bugs
    real_findings = [f for f in findings if f.get("is_site_bug", True)]

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
        "findings": real_findings,
        "form_test_results": form_test_results,
        "tool_limitations": tool_limitations,
        "errors": errors,
        "dead_ends": dead_ends,
        "final_url": final_url,
        "steps_taken": step_count,
        "issues_found": len(real_findings),
        "tool_limitation_count": len(tool_limitations),
    }


# ---------------------------------------------------------------------------
# Local execution
# ---------------------------------------------------------------------------

async def run_agent_local(url: str, persona: dict, site_context: dict) -> dict:
    from google import genai
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return _make_result(persona, [], ["GEMINI_API_KEY not set"], [], [], [], [], False, time.time(), url, 0)
    client = genai.Client(api_key=api_key)
    return await _agent_loop(url, persona, site_context, client)


async def run_swarm_local(url: str, personas: list[dict], site_context: dict) -> list[dict]:
    tasks = [run_agent_local(url, persona, site_context) for persona in personas]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    final = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            final.append(_make_result(personas[i], [], [f"Agent exception: {str(result)[:300]}"], [], [], [], [], False, time.time(), url, 0))
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
    for step in result.get("steps", []):
        step.pop("screenshot_b64", None)
    print(json.dumps(result, indent=2, default=str))
