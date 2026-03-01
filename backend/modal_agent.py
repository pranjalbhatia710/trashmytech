"""trashmy.tech — Modal serverless agent execution.

Deploy with: modal deploy modal_agent.py
Test with: modal run modal_agent.py
"""

import modal
import os

# Modal app definition
app = modal.App("trashmytech-agents")

# Image with all dependencies
agent_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "google-generativeai",
        "playwright",
        "Pillow",
    )
    .run_commands("playwright install chromium", "playwright install-deps")
)


@app.function(
    image=agent_image,
    timeout=120,
    memory=1024,
    secrets=[modal.Secret.from_name("trashmytech-secrets")],
)
def run_agent_on_modal(url: str, persona: dict, site_context: dict) -> dict:
    """Run a single agent on Modal's serverless infrastructure."""
    import asyncio
    import json
    import time
    import traceback
    import random
    import base64
    import io
    from PIL import Image

    ADVERSARIAL_INPUTS = [
        "Robert'); DROP TABLE users;--",
        "<script>alert('xss')</script>",
        "' OR '1'='1",
        "<img src=x onerror=alert(1)>",
        "A" * 500,
        "",
        "not-an-email",
        "-1",
        "null",
        "undefined",
        "../../etc/passwd",
        "99999999999999999999",
    ]

    SYSTEM_PROMPT_TEMPLATE = """\
You are role-playing as a REAL person testing a website.

YOUR IDENTITY:
- Name: {name}
- Age: {age}
- Description: {description}
- Browsing style: {task_style}

BEHAVIORAL RULES:
{behavioral_rules}

You will be given the page's visible text and interactive elements.
Respond with ONLY valid JSON:
{{"action": "click|type|scroll|back|tab|stuck|done", "target": "element text or selector", "value": "text to type or empty", "reasoning": "one sentence"}}
"""

    def build_rules(p):
        mods = p.get("behavioral_modifiers", {})
        rules = []
        if mods.get("keyboard_only"):
            rules.append("You can ONLY use 'tab' and 'type' actions.")
        if mods.get("skips_text"):
            rules.append("You NEVER read long text. Scan for buttons and click.")
        if mods.get("reads_everything"):
            rules.append("You read every piece of text carefully before acting.")
        if mods.get("input_strategy") == "adversarial":
            rules.append("Enter malicious inputs: SQL injection, XSS payloads.")
        if mods.get("input_strategy") == "minimal":
            rules.append("Type bare minimum, skip optional fields.")
        if mods.get("double_clicks"):
            rules.append("You double-click everything.")
        return "\n".join(f"- {r}" for r in rules) or "- Act naturally."

    async def run():
        import google.generativeai as genai
        from playwright.async_api import async_playwright

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return {"agent_id": persona["id"], "persona": persona, "outcome": "blocked",
                    "errors": ["GEMINI_API_KEY not set"], "steps": [], "findings": [],
                    "form_test_results": [], "task_completed": False, "total_time_ms": 0,
                    "dead_ends": [], "steps_taken": 0, "issues_found": 0}

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")

        session_start = time.time()
        steps = []
        findings = []
        form_test_results = []
        errors = []
        dead_ends = []
        task_completed = False

        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            name=persona.get("name", "Unknown"),
            age=persona.get("age", "unknown"),
            description=persona.get("description", ""),
            task_style=persona.get("task_style", "normal"),
            behavioral_rules=build_rules(persona),
        )

        pw = await async_playwright().start()
        viewport = persona.get("viewport", {"width": 1280, "height": 720})
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport=viewport)
        page = await context.new_page()

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(1500)
        except Exception as e:
            errors.append(f"Navigation failed: {str(e)[:200]}")
            await browser.close()
            await pw.stop()
            return _build_result(persona, steps, errors, dead_ends, findings,
                                form_test_results, False, session_start, url, 0)

        mods = persona.get("behavioral_modifiers", {})

        for step_num in range(10):
            # Extract page state
            try:
                visible_text = await page.evaluate(
                    """() => {
                        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                        let t = ''; while (walk.nextNode()) { const s = walk.currentNode.textContent.trim(); if (s) t += s + ' '; }
                        return t.slice(0, 2000);
                    }"""
                )
            except Exception:
                visible_text = ""

            try:
                elements = await page.evaluate(
                    """() => {
                        const els = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [tabindex]');
                        return Array.from(els).slice(0, 50).map((el, i) => {
                            const r = el.getBoundingClientRect();
                            return { index: i, tag: el.tagName.toLowerCase(), type: el.getAttribute('type')||'',
                                     text: (el.innerText||'').trim().slice(0,80), aria_label: el.getAttribute('aria-label')||'',
                                     placeholder: el.getAttribute('placeholder')||'', href: (el.getAttribute('href')||'').slice(0,120),
                                     name: el.getAttribute('name')||'', id: el.id||'',
                                     width: Math.round(r.width), height: Math.round(r.height) };
                        });
                    }"""
                )
            except Exception:
                elements = []

            el_lines = "\n".join(
                f"[{e['index']}] <{e['tag']}> text=\"{e.get('text','')}\" size={e.get('width',0)}x{e.get('height',0)}"
                for e in elements
            ) or "(none)"

            user_prompt = f"URL: {page.url}\nTEXT:\n{visible_text}\nELEMENTS:\n{el_lines}\nStep {step_num+1}/10."

            # Ask LLM
            try:
                resp = await asyncio.wait_for(
                    asyncio.to_thread(model.generate_content, system_prompt + "\n\n" + user_prompt,
                                      generation_config={"temperature": 0.7, "max_output_tokens": 300}),
                    timeout=30,
                )
                raw = resp.text.strip()
                if raw.startswith("```"): raw = raw.split("\n", 1)[-1]
                if raw.endswith("```"): raw = raw[:-3]
                decision = json.loads(raw.strip())
            except Exception:
                decision = {"action": "stuck", "target": "", "value": "", "reasoning": "LLM error"}

            # Screenshot
            try:
                raw_bytes = await page.screenshot(type="jpeg", quality=50)
                img = Image.open(io.BytesIO(raw_bytes))
                w, h = img.size
                if w > 600:
                    img = img.resize((600, int(h * 600 / w)), Image.LANCZOS)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=50)
                screenshot = base64.b64encode(buf.getvalue()).decode()
            except Exception:
                screenshot = None

            # Execute
            action = decision.get("action", "stuck")
            target = decision.get("target", "")
            value = decision.get("value", "")
            target_size = {"width": 0, "height": 0}
            executed = True
            error = None

            try:
                if action == "click":
                    handle = await page.query_selector(f"text={target}") if target else None
                    if not handle and target:
                        handle = await page.query_selector(f"[aria-label='{target}']")
                    if handle:
                        box = await handle.bounding_box()
                        if box: target_size = {"width": round(box["width"]), "height": round(box["height"])}
                        if mods.get("double_clicks"):
                            await handle.dblclick(timeout=5000)
                        else:
                            await handle.click(timeout=5000)
                    else:
                        executed = False
                        error = f"Not found: {target}"
                elif action == "type":
                    handle = await page.query_selector(f"text={target}") if target else None
                    if not handle and target:
                        handle = await page.query_selector(f"[placeholder='{target}']")
                    if not handle and target:
                        handle = await page.query_selector(f"[name='{target}']")
                    if handle:
                        await handle.click(timeout=5000)
                        if mods.get("input_strategy") == "adversarial":
                            value = random.choice(ADVERSARIAL_INPUTS)
                        await handle.fill(value, timeout=5000)
                    else:
                        executed = False
                        error = f"Input not found: {target}"
                elif action == "scroll":
                    await page.evaluate(f"window.scrollBy(0, {'300' if target != 'up' else '-300'})")
                elif action == "back":
                    await page.go_back(timeout=10000)
                elif action == "tab":
                    await page.keyboard.press("Tab")
            except Exception as e:
                executed = False
                error = str(e)[:200]

            steps.append({
                "step_number": step_num + 1,
                "action": action,
                "target_element": target[:60],
                "value": value[:60],
                "reasoning": decision.get("reasoning", ""),
                "target_size_px": target_size,
                "result": "success" if executed else (error or "failed"),
                "page_url_after": page.url,
                "screenshot_b64": screenshot,
                "timestamp_ms": int((time.time() - session_start) * 1000),
            })

            if not executed:
                dead_ends.append(f"Step {step_num+1}: {error}")

            if action == "done":
                task_completed = True
                break
            if action == "stuck":
                dead_ends.append(f"Stuck: {decision.get('reasoning','')}")
                break

            await page.wait_for_timeout(500)

        await browser.close()
        await pw.stop()

        return _build_result(persona, steps, errors, dead_ends, findings,
                            form_test_results, task_completed, session_start, page.url if not task_completed else url, len(steps))

    def _build_result(persona, steps, errors, dead_ends, findings, form_test_results, completed, start, final_url, count):
        t = int((time.time() - start) * 1000)
        if completed: outcome = "completed"
        elif dead_ends: outcome = "blocked"
        else: outcome = "struggled"
        return {
            "agent_id": persona.get("id"),
            "persona": {"id": persona.get("id"), "name": persona.get("name"),
                        "age": persona.get("age"), "category": persona.get("category"),
                        "description": persona.get("description")},
            "task_completed": completed, "outcome": outcome, "total_time_ms": t,
            "steps": steps, "findings": findings, "form_test_results": form_test_results,
            "errors": errors, "dead_ends": dead_ends, "final_url": final_url,
            "steps_taken": count, "issues_found": len(findings) + len(dead_ends),
        }

    return asyncio.run(run())


def run_agent_remote(url: str, persona: dict, site_context: dict) -> dict:
    """Callable from main.py — spawns a Modal function."""
    return run_agent_on_modal.remote(url, persona, site_context)


# CLI test
@app.local_entrypoint()
def main():
    result = run_agent_on_modal.remote(
        "https://example.com",
        {"id": "test", "name": "Test", "age": 30, "category": "behavioral",
         "description": "Test persona", "task_style": "normal",
         "viewport": {"width": 1280, "height": 720}, "behavioral_modifiers": {}},
        {},
    )
    for step in result.get("steps", []):
        step.pop("screenshot_b64", None)
    import json
    print(json.dumps(result, indent=2))
