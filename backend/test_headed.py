"""Launch 5 headed browser agents so you can watch them work in real time."""

import asyncio
import os
import sys

# Force headed mode
os.environ["HEADLESS"] = "false"

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from agent import run_agent_local
from personas import sample_personas


async def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"
    print(f"\n🚀 Launching 5 headed agents against: {url}\n")

    # Get 5 diverse personas
    personas = sample_personas(5)
    for i, p in enumerate(personas):
        print(f"  Agent {i+1}: {p['name']} ({p['category']}) — {p['description'][:60]}")

    site_context = {"page_title": "Test", "links_count": 0, "forms_count": 0, "has_h1": True}

    # Launch all 5 concurrently — each opens a visible browser window
    print(f"\n⏳ Opening 5 browser windows...\n")
    tasks = [
        run_agent_local(url, persona, site_context)
        for persona in personas
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    print(f"\n{'='*60}")
    print(f"RESULTS")
    print(f"{'='*60}")
    for persona, result in zip(personas, results):
        if isinstance(result, Exception):
            print(f"  ❌ {persona['name']}: CRASHED — {result}")
        else:
            steps = result.get("steps_taken", 0)
            issues = result.get("issues_found", 0)
            errors = result.get("errors", [])
            print(f"  {'✅' if not errors else '⚠️'} {persona['name']}: {steps} steps, {issues} issues found")
            if errors:
                for e in errors[:2]:
                    print(f"     → {str(e)[:100]}")


if __name__ == "__main__":
    asyncio.run(main())
