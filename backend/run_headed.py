"""Launch 3 headed browser agents so you can watch them work — lightweight version."""

import asyncio
import os
import sys

# Force headed mode and limit resources
os.environ["HEADLESS"] = "false"
os.environ["NUM_BROWSERS"] = "2"

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from agent import run_agent_local
from personas import sample_personas


async def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"
    agent_count = int(sys.argv[2]) if len(sys.argv) > 2 else 3

    print(f"\n  Launching {agent_count} headed agents against: {url}\n")

    personas = sample_personas(agent_count)
    for i, p in enumerate(personas):
        print(f"  Agent {i+1}: {p['name']} ({p['category']}) - {p['description'][:60]}")

    site_context = {
        "page_title": "Test",
        "links_count": 0,
        "forms_count": 0,
        "has_h1": True,
    }

    # Launch with shared browsers to keep things light
    from playwright.async_api import async_playwright

    print(f"\n  Opening 2 browser windows...\n")
    pw = await async_playwright().start()
    browsers = [
        await pw.chromium.launch(headless=False, slow_mo=100),
        await pw.chromium.launch(headless=False, slow_mo=100),
    ]

    # Distribute agents round-robin across the 2 browsers
    tasks = []
    for i, persona in enumerate(personas):
        browser = browsers[i % len(browsers)]
        tasks.append(
            run_agent_local(url, persona, site_context, shared_browser=browser)
        )

    results = await asyncio.gather(*tasks, return_exceptions=True)

    print(f"\n{'='*60}")
    print(f"RESULTS")
    print(f"{'='*60}")
    for persona, result in zip(personas, results):
        if isinstance(result, Exception):
            print(f"  X {persona['name']}: CRASHED - {result}")
        else:
            steps = result.get("steps_taken", 0)
            issues = result.get("issues_found", 0)
            errors = result.get("errors", [])
            print(f"  {'OK' if not errors else '!!'} {persona['name']}: {steps} steps, {issues} issues found")
            if errors:
                for e in errors[:2]:
                    print(f"     -> {str(e)[:100]}")

    # Cleanup
    for b in browsers:
        try:
            await b.close()
        except Exception:
            pass
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(main())
