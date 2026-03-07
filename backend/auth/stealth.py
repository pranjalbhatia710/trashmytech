"""Stealth patches for Playwright — makes browser automation undetectable."""

from playwright_stealth import Stealth

_stealth = Stealth()


async def apply_stealth(page) -> None:
    """Apply anti-detection patches to a Playwright page.

    Patches navigator.webdriver, chrome.runtime, WebGL fingerprint,
    plugins array, languages, and other detectable properties.

    Call this immediately after context.new_page().
    """
    await _stealth.apply_stealth_async(page)
