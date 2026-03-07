"""Auth profile manager — save/load browser login sessions."""

import json
import os
from pathlib import Path
from typing import Optional

PROFILES_DIR = Path(__file__).parent.parent / "auth_profiles"


def _ensure_dir():
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)


def list_profiles() -> list[dict]:
    """Return list of saved auth profiles with metadata."""
    _ensure_dir()
    profiles = []
    for f in PROFILES_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            profiles.append({
                "name": f.stem,
                "url": data.get("_meta", {}).get("url", "unknown"),
                "created_at": data.get("_meta", {}).get("created_at"),
            })
        except Exception:
            profiles.append({"name": f.stem, "url": "unknown", "created_at": None})
    return profiles


def load_storage_state(name: str) -> Optional[dict]:
    """Load a saved storage_state dict by profile name. Returns None if not found."""
    path = PROFILES_DIR / f"{name}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        # Remove our metadata before passing to Playwright
        data.pop("_meta", None)
        return data
    except Exception:
        return None


def save_storage_state(name: str, state: dict, url: str = "") -> Path:
    """Save a storage_state dict to a profile file."""
    import time
    _ensure_dir()
    state["_meta"] = {"url": url, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
    path = PROFILES_DIR / f"{name}.json"
    path.write_text(json.dumps(state, indent=2))
    return path


def delete_profile(name: str) -> bool:
    """Delete a saved profile. Returns True if deleted, False if not found."""
    path = PROFILES_DIR / f"{name}.json"
    if path.exists():
        path.unlink()
        return True
    return False


async def create_auth_profile(name: str, url: str) -> dict:
    """Launch a real Chrome browser for manual login, then save the session.

    Uses the system Chrome installation (not Playwright's Chromium) so that
    sites like Google don't block the login as "insecure browser".
    The user logs in manually, then closes the browser to save.
    """
    from playwright.async_api import async_playwright
    import tempfile

    # Use real Chrome so Google/etc. don't block login
    chrome_paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",  # macOS
        "/usr/bin/google-chrome",  # Linux
        "/usr/bin/google-chrome-stable",  # Linux alt
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",  # Windows
    ]
    chrome_path = None
    for p in chrome_paths:
        if os.path.exists(p):
            chrome_path = p
            break

    pw = await async_playwright().start()
    tmp_profile = tempfile.mkdtemp(prefix="auth_profile_")

    launch_kwargs = {
        "headless": False,
        "args": [
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-blink-features=AutomationControlled",
        ],
    }
    if chrome_path:
        launch_kwargs["executable_path"] = chrome_path

    # Use persistent context so Chrome gets a real user-data-dir
    context = await pw.chromium.launch_persistent_context(
        tmp_profile, **launch_kwargs
    )

    page = context.pages[0] if context.pages else await context.new_page()
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)

    # Wait for the user to close the browser (5 min timeout)
    try:
        await page.wait_for_event("close", timeout=300_000)
    except Exception:
        pass

    # Save the storage state (cookies, localStorage, etc.)
    try:
        state = await context.storage_state()
    except Exception:
        state = {"cookies": [], "origins": []}

    path = save_storage_state(name, state, url)

    try:
        await context.close()
    except Exception:
        pass
    await pw.stop()

    return {"name": name, "url": url, "path": str(path)}
