"""trashmy.tech — AI agent engine using Gemini for browser-based user testing."""

import base64
import hashlib
import json
import asyncio
import logging
import os
import random
import time
import traceback

from personas import ADVERSARIAL_INPUTS

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt template
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_TEMPLATE = """\
{preamble}

YOUR IDENTITY:
- Name: {name}
- Age: {age}
- Description: {description}
- Browsing style: {task_style}

BEHAVIORAL RULES:
{behavioral_rules}

You will be given the page's visible text (possibly truncated) and a list of
interactive elements on the page. Each element has an index like [0], [1], etc.
Decide what action to take NEXT as this persona would.

Respond with ONLY valid JSON — no markdown fences, no extra text:
{{
  "action": "click|type|scroll|back|tab|stuck|done",
  "target": "element index like [3], visible text, ARIA label, or CSS selector",
  "value": "text to type (only for type action, otherwise empty string)",
  "reasoning": "one sentence from this persona's perspective explaining why"
}}

ACTIONS (pick exactly one):
- click  — click on a link, button, or interactive element. Set target to the
           element index (e.g. "[3]") or its visible text. Use this to navigate
           to new pages, submit forms, open menus, etc.
- type   — click on an input/textarea and type text into it. Set target to the
           input element and value to the text you want to enter.
- scroll — scroll the viewport. Set target to "up" or "down".
- back   — press the browser back button. Use when you hit a dead end.
- tab    — press Tab to move keyboard focus to the next element.
- stuck  — you truly cannot proceed (no relevant elements, page is broken).
- done   — you have finished exploring or completed all tasks.

IMPORTANT RULES:
- Prefer using element indices (e.g. "[3]") as targets — they are most reliable.
- Do NOT repeat the same failing action. If an action failed, try a different
  element or a different approach.
- Always make progress. Do not click the same link twice in a row.
- If you see a form, fill it out field by field using "type", then "click" submit.
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

    # Content / SEO task styles
    if task == "content_evaluator":
        rules.append(
            "You systematically evaluate content quality. Read ALL visible "
            "text. Check heading hierarchy (H1-H6), meta tags, structured "
            "data, image alt text, link health, and readability. Report "
            "specific counts and details for every check."
        )
    if task == "value_prop_tester":
        rules.append(
            "You evaluate first impressions ONLY. Look at above-the-fold "
            "content first — do NOT scroll until you have assessed what is "
            "visible. Judge H1 clarity, CTA specificity, and whether the "
            "site communicates its purpose within 5 seconds."
        )
    if task == "skeptic_reader":
        rules.append(
            "You are extremely skeptical. Hunt for trust signals: privacy "
            "policy, terms of service, contact info, about page, team "
            "members, physical address. Check if these pages are reachable "
            "within 2 clicks. Flag missing trust signals as red flags."
        )
    if task == "googlebot_simulator":
        rules.append(
            "You are an automated search engine crawler. Navigate to "
            "/robots.txt and /sitemap.xml first. Check canonical tags, "
            "meta robots directives, structured data, and internal linking. "
            "Evaluate whether content renders without JavaScript."
        )
    if task == "social_bot_simulator":
        rules.append(
            "You are an automated social media preview bot. Extract and "
            "evaluate Open Graph tags (og:title, og:description, og:image) "
            "and Twitter Card tags. Check if share preview images resolve. "
            "Rate the quality of social sharing previews."
        )

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
                return els.slice(0, 50).map((el, i) => ({
                    index: i,
                    tag: el.tagName.toLowerCase(),
                    type: el.getAttribute('type') || '',
                    text: (el.innerText || '').trim().slice(0, 80),
                    aria_label: el.getAttribute('aria-label') || '',
                    placeholder: el.getAttribute('placeholder') || '',
                    href: (el.getAttribute('href') || '').slice(0, 120),
                    name: el.getAttribute('name') || '',
                    id: el.id || '',
                }));
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
        lines.append(" ".join(parts))
    return "\n".join(lines) if lines else "(no interactive elements found)"


# ---------------------------------------------------------------------------
# Gemini LLM call
# ---------------------------------------------------------------------------

async def _ask_llm(model, system_prompt: str, user_prompt: str,
                   recent_actions: list[dict] | None = None) -> dict:
    """Call Gemini and parse JSON response.

    *recent_actions* is an optional list of the last 2-3 action records so the
    LLM has context about what it already tried (prevents repetition).
    """
    # Build a context section from recent actions
    history_section = ""
    if recent_actions:
        history_lines = []
        for rec in recent_actions[-3:]:
            status = "OK" if rec.get("executed") else f"FAILED ({rec.get('error', 'unknown')})"
            history_lines.append(
                f"  - {rec.get('action','?')} target=\"{rec.get('target','')}\" "
                f"value=\"{rec.get('value','')}\" => {status}"
            )
        history_section = (
            "\n\nYOUR RECENT ACTIONS (do NOT repeat failed ones):\n"
            + "\n".join(history_lines)
        )

    try:
        full_prompt = system_prompt + "\n\n" + user_prompt + history_section
        response = await asyncio.wait_for(
            asyncio.to_thread(
                model.generate_content,
                full_prompt,
                generation_config={"temperature": 0, "max_output_tokens": 300},
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


async def _execute_action(page, decision: dict, persona: dict, elements: list[dict], _adv_rng: random.Random | None = None) -> dict:
    action = decision.get("action", "stuck")
    target = decision.get("target", "")
    value = decision.get("value", "")
    mods = persona.get("behavioral_modifiers", {})
    result = {"executed": True, "error": None}
    click_delay = mods.get("click_delay_ms", 400) / 1000.0

    try:
        if action == "click":
            handle = await _find_element(page, target, elements)
            if handle:
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
                await asyncio.sleep(click_delay)
                await handle.click(timeout=5000)
                if mods.get("input_strategy") == "adversarial" and _adv_rng:
                    value = _adv_rng.choice(ADVERSARIAL_INPUTS)
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

async def _agent_loop(url: str, persona: dict, site_context: dict, model,
                      max_steps: int = 8, shared_browser=None,
                      on_step_screenshot=None) -> dict:
    from playwright.async_api import async_playwright

    session_start = time.time()
    actions_log: list[dict] = []
    dead_ends: list[str] = []
    all_errors: list[str] = []
    task_completed = False
    final_url = url
    _own_pw = None
    _own_browser = None

    # Deterministic RNG for adversarial inputs (seeded by persona + URL)
    adv_seed = int(hashlib.sha256(f"{persona.get('id', '')}:{url}".encode()).hexdigest(), 16) % (2**32)
    adv_rng = random.Random(adv_seed)

    # Bot personas (age=None) get an automated-agent preamble instead of
    # "REAL person" framing so the LLM acts as a crawler / bot correctly.
    age_val = persona.get("age")
    preamble = (
        "You are an automated bot crawling and analysing a website."
        if age_val is None
        else "You are role-playing as a REAL person testing a website."
    )

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        preamble=preamble,
        name=persona.get("name", "Unknown"),
        age=str(age_val) if age_val is not None else "automated",
        description=persona.get("description", ""),
        task_style=persona.get("task_style", "normal"),
        behavioral_rules=_build_behavioral_rules(persona),
    )

    # ── Workflow-aware prompting ──
    workflow_steps = site_context.get("workflow_steps")
    if workflow_steps and isinstance(workflow_steps, list) and len(workflow_steps) > 0:
        steps_text = "\n".join(f"  {i+1}. {step}" for i, step in enumerate(workflow_steps))
        system_prompt += (
            "\n\nPRIMARY WORKFLOW TO TEST:\n"
            f"Your primary goal is to complete this workflow:\n{steps_text}\n\n"
            "At each step, report: did you complete it? What blocked you? "
            "How did it make you feel? If you can't proceed to the next step, "
            "explain exactly why."
        )
    current_workflow_step = 0

    pw = None
    browser = None
    try:
        viewport = persona.get("viewport", {"width": 1280, "height": 720})
        if shared_browser:
            browser = shared_browser
        else:
            _own_pw = await async_playwright().start()
            browser = await _own_pw.chromium.launch(
                headless=os.getenv("HEADLESS", "true").lower() != "false"
            )
            _own_browser = browser
        context = await browser.new_context(
            viewport=viewport,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        )
        page = await context.new_page()

        # Collect console errors
        console_errors: list[str] = []
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text[:200]}") if msg.type in ("error", "warning") else None)

        # Navigate
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(1500)
        except Exception as e:
            all_errors.append(f"Navigation failed: {str(e)[:200]}")
            return _make_result(persona, [], all_errors, [], False, session_start, [], url, 0)

        # Track consecutive failures on same target for Problem 2
        _consecutive_fail_target: str | None = None
        _consecutive_fail_count: int = 0

        # Agent loop — up to max_steps steps
        for step in range(max_steps):
            state = await _extract_page_state(page)

            # Build workflow progress hint
            workflow_hint = ""
            if workflow_steps and isinstance(workflow_steps, list) and len(workflow_steps) > 0:
                if current_workflow_step < len(workflow_steps):
                    workflow_hint = (
                        f"\n\nWORKFLOW PROGRESS: You are on step {current_workflow_step + 1} "
                        f"of {len(workflow_steps)}: \"{workflow_steps[current_workflow_step]}\". "
                        f"Try to complete this step, then move to the next."
                    )
                else:
                    workflow_hint = "\n\nWORKFLOW PROGRESS: You have completed all workflow steps."

            user_prompt = (
                f"CURRENT URL: {page.url}\n\n"
                f"VISIBLE TEXT:\n{state['visible_text']}\n\n"
                f"INTERACTIVE ELEMENTS:\n{_format_elements(state['elements'])}\n\n"
                f"Step {step + 1} of {max_steps}. What do you do next?"
                f"{workflow_hint}"
            )

            # Pass recent action history so the LLM has context (Problem 2)
            decision = await _ask_llm(model, system_prompt, user_prompt,
                                      recent_actions=actions_log[-3:] if actions_log else None)

            # Problem 2: If we failed 2x in a row on the same target, force
            # the agent to try something different (scroll or pick another element)
            chosen_target = decision.get("target", "")
            if (
                _consecutive_fail_count >= 2
                and chosen_target == _consecutive_fail_target
                and decision.get("action") not in ("stuck", "done", "scroll", "back")
            ):
                # Override: force a scroll or back action to break the loop
                decision = {
                    "action": "scroll",
                    "target": "down",
                    "value": "",
                    "reasoning": "Forced scroll — previous action failed twice on the same target.",
                }

            action_record = {
                "step": step + 1,
                "url": page.url,
                "action": decision.get("action"),
                "target": decision.get("target", ""),
                "value": decision.get("value", ""),
                "reasoning": decision.get("reasoning", ""),
                "timestamp_ms": int((time.time() - session_start) * 1000),
                "workflow_step": current_workflow_step if workflow_steps else None,
            }

            exec_result = await _execute_action(page, decision, persona, state["elements"], _adv_rng=adv_rng)
            action_record["executed"] = exec_result["executed"]
            action_record["error"] = exec_result.get("error")

            # Track consecutive failures on same target (Problem 2)
            if not exec_result["executed"] and decision.get("action") not in ("stuck", "done"):
                if chosen_target == _consecutive_fail_target:
                    _consecutive_fail_count += 1
                else:
                    _consecutive_fail_target = chosen_target
                    _consecutive_fail_count = 1
            else:
                _consecutive_fail_target = None
                _consecutive_fail_count = 0

            # Problem 1: Track workflow progress based on successful action
            # execution rather than keyword overlap in reasoning text.
            # Each successfully executed action advances the workflow step
            # counter (capped at total steps). "done" and "navigate" (URL
            # changed) also count.
            if workflow_steps and current_workflow_step < len(workflow_steps):
                action_name = decision.get("action", "")
                url_changed = (page.url != action_record["url"])
                if exec_result["executed"] and action_name not in ("stuck",):
                    # Advance on: done, navigate (URL changed), or any
                    # successfully executed click/type/scroll/back/tab
                    if action_name == "done" or url_changed or action_name in ("click", "type"):
                        current_workflow_step = min(
                            current_workflow_step + 1, len(workflow_steps)
                        )

            if exec_result.get("error"):
                all_errors.append(f"Step {step + 1}: {exec_result['error']}")

            if not exec_result["executed"] and decision["action"] not in ("stuck", "done"):
                dead_ends.append(f"Step {step + 1}: Could not {decision['action']} '{decision.get('target', '')}'")

            # Wait for the page to settle BEFORE taking the screenshot (Problem 3)
            try:
                await page.wait_for_timeout(800)
            except Exception:
                pass

            # Capture screenshot after page has settled
            try:
                ss_bytes = await page.screenshot(type="jpeg", quality=40)
                ss_b64 = base64.b64encode(ss_bytes).decode()
                action_record["screenshot_b64"] = ss_b64
                if on_step_screenshot:
                    await on_step_screenshot(persona["id"], step + 1, ss_b64)
            except Exception as ss_err:
                logger.warning("Screenshot failed at step %d for %s: %s",
                               step + 1, persona.get("id", "?"), ss_err)

            actions_log.append(action_record)

            if decision["action"] == "done":
                task_completed = True
                break
            if decision["action"] == "stuck":
                dead_ends.append(f"Step {step + 1}: Persona got stuck — {decision.get('reasoning', '')}")
                break

        final_url = page.url
        all_errors.extend(console_errors)

    except Exception:
        all_errors.append(f"Agent crash: {traceback.format_exc()[:500]}")
    finally:
        try:
            if context: await context.close()
        except Exception: pass
        # Only close browser/playwright if we created them
        try:
            if _own_browser: await _own_browser.close()
        except Exception: pass
        try:
            if _own_pw: await _own_pw.stop()
        except Exception: pass

    return _make_result(persona, actions_log, all_errors, dead_ends, task_completed, session_start, console_errors, final_url, len(actions_log),
                        max_workflow_step=current_workflow_step if workflow_steps else None,
                        total_workflow_steps=len(workflow_steps) if workflow_steps else None)


def _make_result(persona, actions, errors, dead_ends, completed, start_time, console_errors, final_url, steps,
                  max_workflow_step=None, total_workflow_steps=None):
    result = {
        "agent_id": persona.get("id"),
        "persona": {
            "id": persona.get("id"),
            "name": persona.get("name"),
            "category": persona.get("category"),
            "description": persona.get("description"),
        },
        "actions": actions,
        "errors": errors,
        "console_errors": [e for e in errors if e.startswith("[")],
        "task_completed": completed,
        "time_spent_ms": int((time.time() - start_time) * 1000),
        "dead_ends": dead_ends,
        "final_url": final_url,
        "steps_taken": steps,
        "issues_found": len(errors) + len(dead_ends),
        # Always include workflow fields so the frontend never sees them missing
        "max_workflow_step": max_workflow_step if max_workflow_step is not None else 0,
        "total_workflow_steps": total_workflow_steps if total_workflow_steps is not None else 0,
    }
    return result


# ---------------------------------------------------------------------------
# Local execution (no Modal)
# ---------------------------------------------------------------------------

async def run_agent_local(url: str, persona: dict, site_context: dict,
                          on_step_screenshot=None, shared_browser=None,
                          max_steps: int = 8) -> dict:
    """Run a single persona test locally using Gemini."""
    import google.generativeai as genai

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return _make_result(persona, [], ["GEMINI_API_KEY not set"], [], False, time.time(), [], url, 0)

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")
    return await _agent_loop(url, persona, site_context, model,
                             max_steps=max_steps,
                             shared_browser=shared_browser,
                             on_step_screenshot=on_step_screenshot)


async def run_swarm_local(url: str, personas: list[dict], site_context: dict) -> list[dict]:
    """Run all persona tests concurrently."""
    tasks = [run_agent_local(url, persona, site_context) for persona in personas]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    final = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            final.append(_make_result(personas[i], [], [f"Agent exception: {str(result)[:300]}"], [], False, time.time(), [], url, 0))
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
    print(json.dumps(result, indent=2, default=str))
