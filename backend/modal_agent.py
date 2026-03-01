"""trashmy.tech — Modal serverless agent execution.

Bundles local backend code into the container image so Modal agents
use the same smart clicking + failure classification pipeline.

Deploy with: modal deploy modal_agent.py
Test with:   modal run modal_agent.py
"""

import modal
import pathlib

# Modal app definition
app = modal.App("trashmytech-agents")

BACKEND_DIR = pathlib.Path(__file__).parent

# Image with all dependencies + local code
agent_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "google-genai",
        "playwright",
        "Pillow",
        "aiohttp",
    )
    .run_commands(
        "playwright install chromium",
        "playwright install-deps",
    )
    .add_local_dir(
        BACKEND_DIR,
        remote_path="/root/backend",
        copy=True,
        ignore=["__pycache__", "*.pyc", ".env"],
    )
)


@app.function(
    image=agent_image,
    timeout=180,
    memory=2048,
    secrets=[modal.Secret.from_name("trashmytech-secrets")],
    max_containers=20,
)
def run_agent_on_modal(url: str, persona: dict, site_context: dict) -> dict:
    """Run a single agent on Modal using the full smart clicking pipeline."""
    import sys
    sys.path.insert(0, "/root/backend")

    import asyncio
    from agent import run_agent_local

    return asyncio.run(run_agent_local(url, persona, site_context))


def run_agent_remote(url: str, persona: dict, site_context: dict) -> dict:
    """Callable from main.py — looks up the deployed function and calls it."""
    fn = modal.Function.from_name("trashmytech-agents", "run_agent_on_modal")
    return fn.remote(url, persona, site_context)


# CLI test
@app.local_entrypoint()
def main():
    import json

    result = run_agent_on_modal.remote(
        "https://example.com",
        {
            "id": "test", "name": "Test Agent", "age": 30,
            "category": "behavioral", "description": "Test persona",
            "task_style": "normal",
            "viewport": {"width": 1280, "height": 720},
            "behavioral_modifiers": {},
        },
        {},
    )
    for step in result.get("steps", []):
        step.pop("screenshot_b64", None)
    print(json.dumps(result, indent=2))
