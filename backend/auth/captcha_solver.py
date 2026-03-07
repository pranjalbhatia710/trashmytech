"""Captcha detection and solving via Capsolver API."""

import asyncio
import json
import os
from typing import Optional

import aiohttp

CAPSOLVER_API = "https://api.capsolver.com"


def _get_api_key() -> Optional[str]:
    return os.environ.get("CAPSOLVER_API_KEY")


async def detect_captcha(page) -> Optional[dict]:
    """Scan page for reCAPTCHA v2/v3, hCaptcha, or Turnstile. Returns detection dict or None."""
    try:
        detection = await page.evaluate("""() => {
            // reCAPTCHA v2
            const recaptchaV2 = document.querySelector('iframe[src*="recaptcha"], .g-recaptcha');
            if (recaptchaV2) {
                const siteKey = recaptchaV2.getAttribute('data-sitekey') ||
                    (recaptchaV2.src && new URL(recaptchaV2.src).searchParams.get('k')) || null;
                return { type: 'recaptcha_v2', site_key: siteKey };
            }

            // reCAPTCHA v3 (script-based)
            const recaptchaV3Script = document.querySelector('script[src*="recaptcha/api.js?render="]');
            if (recaptchaV3Script) {
                const src = recaptchaV3Script.getAttribute('src') || '';
                const match = src.match(/render=([^&]+)/);
                return { type: 'recaptcha_v3', site_key: match ? match[1] : null };
            }

            // hCaptcha
            const hcaptcha = document.querySelector('iframe[src*="hcaptcha"], .h-captcha');
            if (hcaptcha) {
                const siteKey = hcaptcha.getAttribute('data-sitekey') ||
                    (hcaptcha.src && new URL(hcaptcha.src).searchParams.get('sitekey')) || null;
                return { type: 'hcaptcha', site_key: siteKey };
            }

            // Cloudflare Turnstile
            const turnstile = document.querySelector('iframe[src*="challenges.cloudflare.com"], .cf-turnstile');
            if (turnstile) {
                const siteKey = turnstile.getAttribute('data-sitekey') || null;
                return { type: 'turnstile', site_key: siteKey };
            }

            return null;
        }""")
        return detection
    except Exception:
        return None


async def solve_captcha(page, detection: dict) -> dict:
    """Submit captcha to Capsolver API and inject the token."""
    api_key = _get_api_key()
    if not api_key:
        return {"solved": False, "error": "CAPSOLVER_API_KEY not set"}

    captcha_type = detection.get("type")
    site_key = detection.get("site_key")
    page_url = page.url

    if not site_key:
        return {"solved": False, "error": "Could not extract site_key"}

    # Map our detection type to Capsolver task types
    task_type_map = {
        "recaptcha_v2": "ReCaptchaV2TaskProxyLess",
        "recaptcha_v3": "ReCaptchaV3TaskProxyLess",
        "hcaptcha": "HCaptchaTaskProxyLess",
        "turnstile": "AntiTurnstileTaskProxyLess",
    }

    task_type = task_type_map.get(captcha_type)
    if not task_type:
        return {"solved": False, "error": f"Unsupported captcha type: {captcha_type}"}

    task = {
        "type": task_type,
        "websiteURL": page_url,
        "websiteKey": site_key,
    }

    if captcha_type == "recaptcha_v3":
        task["pageAction"] = "verify"
        task["minScore"] = 0.7

    try:
        async with aiohttp.ClientSession() as session:
            # Create task
            async with session.post(
                f"{CAPSOLVER_API}/createTask",
                json={"clientKey": api_key, "task": task},
            ) as resp:
                create_result = await resp.json()

            if create_result.get("errorId", 0) != 0:
                return {"solved": False, "error": create_result.get("errorDescription", "Unknown error")}

            task_id = create_result.get("taskId")
            if not task_id:
                return {"solved": False, "error": "No taskId returned"}

            # Poll for result (max 120s)
            for _ in range(60):
                await asyncio.sleep(2)
                async with session.post(
                    f"{CAPSOLVER_API}/getTaskResult",
                    json={"clientKey": api_key, "taskId": task_id},
                ) as resp:
                    result = await resp.json()

                status = result.get("status")
                if status == "ready":
                    solution = result.get("solution", {})
                    token = solution.get("gRecaptchaResponse") or solution.get("token") or solution.get("text")

                    if token:
                        # Inject the token into the page
                        await _inject_token(page, captcha_type, token)
                        return {"solved": True, "type": captcha_type, "token_length": len(token)}
                    return {"solved": False, "error": "No token in solution"}
                elif status == "failed":
                    return {"solved": False, "error": result.get("errorDescription", "Task failed")}

            return {"solved": False, "error": "Timeout waiting for solution"}
    except Exception as e:
        return {"solved": False, "error": str(e)[:200]}


async def _inject_token(page, captcha_type: str, token: str):
    """Inject solved captcha token into the page."""
    if captcha_type in ("recaptcha_v2", "recaptcha_v3"):
        await page.evaluate(f"""(token) => {{
            const textarea = document.getElementById('g-recaptcha-response');
            if (textarea) {{
                textarea.style.display = '';
                textarea.value = token;
            }}
            // Also try hidden textareas
            document.querySelectorAll('[name="g-recaptcha-response"]').forEach(el => {{
                el.value = token;
            }});
            // Trigger callback if available
            if (typeof window.___grecaptcha_cfg !== 'undefined') {{
                try {{
                    const clients = window.___grecaptcha_cfg.clients;
                    for (const key in clients) {{
                        const client = clients[key];
                        for (const prop in client) {{
                            const val = client[prop];
                            if (val && typeof val === 'object') {{
                                for (const p in val) {{
                                    if (val[p] && typeof val[p].callback === 'function') {{
                                        val[p].callback(token);
                                        return;
                                    }}
                                }}
                            }}
                        }}
                    }}
                }} catch(e) {{}}
            }}
        }}""", token)
    elif captcha_type == "hcaptcha":
        await page.evaluate(f"""(token) => {{
            const textarea = document.querySelector('[name="h-captcha-response"], [name="g-recaptcha-response"]');
            if (textarea) textarea.value = token;
            // Trigger hcaptcha callback
            if (typeof hcaptcha !== 'undefined') {{
                try {{ hcaptcha.getRespKey && hcaptcha.getRespKey(); }} catch(e) {{}}
            }}
        }}""", token)
    elif captcha_type == "turnstile":
        await page.evaluate(f"""(token) => {{
            const input = document.querySelector('[name="cf-turnstile-response"]');
            if (input) input.value = token;
            // Try Turnstile callback
            if (typeof turnstile !== 'undefined') {{
                try {{ turnstile.getResponse && turnstile.getResponse(); }} catch(e) {{}}
            }}
        }}""", token)


async def detect_and_solve_captcha(page) -> dict:
    """Convenience wrapper: detect captcha on page and solve if found.

    Returns:
        {"detected": False} if no captcha found
        {"detected": True, "solved": True/False, ...} with solve details
    """
    if not _get_api_key():
        return {"detected": False, "skipped": True, "reason": "No CAPSOLVER_API_KEY"}

    detection = await detect_captcha(page)
    if not detection:
        return {"detected": False}

    result = await solve_captcha(page, detection)
    return {"detected": True, **result}
