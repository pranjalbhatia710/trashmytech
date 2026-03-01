"""trashmy.tech — 20 AI user personas for website stress-testing."""

import random

PERSONAS = [
    # ── ACCESSIBILITY (5) ──────────────────────────────────────
    {
        "id": "A1", "name": "Margaret", "age": 68,
        "category": "accessibility",
        "description": "Retired teacher with low vision who zooms everything to 200%",
        "avatar_emoji": "👵", "task_style": "slow_careful",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 2000, "misclick_rate": 0.15,
            "reads_everything": True, "skips_text": False,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 60000, "double_clicks": False,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },
    {
        "id": "A2", "name": "James", "age": 74,
        "category": "accessibility",
        "description": "Veteran who navigates entirely with keyboard — no mouse",
        "avatar_emoji": "⌨️", "task_style": "keyboard_nav",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 800, "misclick_rate": 0.0,
            "reads_everything": True, "skips_text": False,
            "keyboard_only": True, "input_strategy": "normal",
            "patience_threshold_ms": 45000, "double_clicks": False,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },
    {
        "id": "A3", "name": "Priya", "age": 31,
        "category": "accessibility",
        "description": "Blind software engineer who relies on screen reader and ARIA labels",
        "avatar_emoji": "🧑‍🦯", "task_style": "screen_reader",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 600, "misclick_rate": 0.0,
            "reads_everything": True, "skips_text": False,
            "keyboard_only": True, "input_strategy": "normal",
            "patience_threshold_ms": 30000, "double_clicks": False,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },
    {
        "id": "A4", "name": "Carlos", "age": 45,
        "category": "accessibility",
        "description": "Colorblind designer (deuteranopia) who can't distinguish red/green",
        "avatar_emoji": "🎨", "task_style": "visual_check",
        "viewport": {"width": 1440, "height": 900},
        "behavioral_modifiers": {
            "click_delay_ms": 400, "misclick_rate": 0.05,
            "reads_everything": False, "skips_text": False,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 30000, "double_clicks": False,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },
    {
        "id": "A5", "name": "Lin", "age": 52,
        "category": "accessibility",
        "description": "Motor-impaired user with shaky hands and high misclick rate",
        "avatar_emoji": "🤲", "task_style": "careful_clicks",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 1500, "misclick_rate": 0.25,
            "reads_everything": False, "skips_text": False,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 45000, "double_clicks": True,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },

    # ── DEMOGRAPHIC (5) ────────────────────────────────────────
    {
        "id": "D1", "name": "Jayden", "age": 13,
        "category": "demographic",
        "description": "Teenager who clicks lightning-fast and never reads anything",
        "avatar_emoji": "👦", "task_style": "speed_scan",
        "viewport": {"width": 390, "height": 844},
        "behavioral_modifiers": {
            "click_delay_ms": 100, "misclick_rate": 0.08,
            "reads_everything": False, "skips_text": True,
            "keyboard_only": False, "input_strategy": "minimal",
            "patience_threshold_ms": 8000, "double_clicks": False,
            "uses_back_button": True, "refreshes_randomly": False,
        },
    },
    {
        "id": "D2", "name": "Fatima", "age": 35,
        "category": "demographic",
        "description": "Non-native English speaker confused by idioms and jargon",
        "avatar_emoji": "🌐", "task_style": "confused_reader",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 900, "misclick_rate": 0.10,
            "reads_everything": True, "skips_text": False,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 40000, "double_clicks": False,
            "uses_back_button": True, "refreshes_randomly": False,
        },
    },
    {
        "id": "D3", "name": "Aiko", "age": 22,
        "category": "demographic",
        "description": "Mobile-first user in Tokyo on a small phone screen",
        "avatar_emoji": "📱", "task_style": "mobile_thumb",
        "viewport": {"width": 375, "height": 812},
        "behavioral_modifiers": {
            "click_delay_ms": 200, "misclick_rate": 0.12,
            "reads_everything": False, "skips_text": True,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 15000, "double_clicks": False,
            "uses_back_button": True, "refreshes_randomly": False,
        },
    },
    {
        "id": "D4", "name": "Pat", "age": 35,
        "category": "demographic",
        "description": "Parent holding a baby in one hand, tapping with the other",
        "avatar_emoji": "👶", "task_style": "one_handed",
        "viewport": {"width": 390, "height": 844},
        "behavioral_modifiers": {
            "click_delay_ms": 700, "misclick_rate": 0.20,
            "reads_everything": False, "skips_text": True,
            "keyboard_only": False, "input_strategy": "minimal",
            "patience_threshold_ms": 12000, "double_clicks": False,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },
    {
        "id": "D5", "name": "Sam", "age": 65,
        "category": "demographic",
        "description": "Retiree on a tablet who taps slowly and reads every word",
        "avatar_emoji": "📖", "task_style": "slow_reader",
        "viewport": {"width": 1024, "height": 1366},
        "behavioral_modifiers": {
            "click_delay_ms": 1200, "misclick_rate": 0.08,
            "reads_everything": True, "skips_text": False,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 60000, "double_clicks": False,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },

    # ── CHAOS (5) ──────────────────────────────────────────────
    {
        "id": "C1", "name": "BackButtonBenny", "age": None,
        "category": "chaos",
        "description": "Mashes the back button after every other action",
        "avatar_emoji": "⬅️", "task_style": "chaotic",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 300, "misclick_rate": 0.05,
            "reads_everything": False, "skips_text": True,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 20000, "double_clicks": False,
            "uses_back_button": True, "refreshes_randomly": False,
        },
    },
    {
        "id": "C2", "name": "FormAnarchist", "age": None,
        "category": "chaos",
        "description": "Puts SQL injection, emojis, and garbage into every form field",
        "avatar_emoji": "💣", "task_style": "adversarial",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 200, "misclick_rate": 0.0,
            "reads_everything": False, "skips_text": True,
            "keyboard_only": False, "input_strategy": "adversarial",
            "patience_threshold_ms": 30000, "double_clicks": False,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },
    {
        "id": "C3", "name": "SpeedRunner", "age": None,
        "category": "chaos",
        "description": "Tries to complete every flow as fast as humanly possible",
        "avatar_emoji": "⚡", "task_style": "speed_run",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 50, "misclick_rate": 0.10,
            "reads_everything": False, "skips_text": True,
            "keyboard_only": False, "input_strategy": "minimal",
            "patience_threshold_ms": 5000, "double_clicks": False,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },
    {
        "id": "C4", "name": "DoubleClickDan", "age": None,
        "category": "chaos",
        "description": "Double-clicks absolutely everything including links and buttons",
        "avatar_emoji": "🖱️", "task_style": "double_click",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 300, "misclick_rate": 0.05,
            "reads_everything": False, "skips_text": False,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 20000, "double_clicks": True,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },
    {
        "id": "C5", "name": "RageQuitter", "age": None,
        "category": "chaos",
        "description": "Gives up after 3 seconds of waiting for anything",
        "avatar_emoji": "😤", "task_style": "impatient",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 150, "misclick_rate": 0.05,
            "reads_everything": False, "skips_text": True,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 3000, "double_clicks": False,
            "uses_back_button": True, "refreshes_randomly": True,
        },
    },

    # ── BEHAVIORAL (5) ─────────────────────────────────────────
    {
        "id": "B1", "name": "TheSkeptic", "age": 40,
        "category": "behavioral",
        "description": "Checks the privacy policy and terms before doing anything",
        "avatar_emoji": "🔍", "task_style": "cautious",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 600, "misclick_rate": 0.02,
            "reads_everything": True, "skips_text": False,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 45000, "double_clicks": False,
            "uses_back_button": True, "refreshes_randomly": False,
        },
    },
    {
        "id": "B2", "name": "TheExplorer", "age": 28,
        "category": "behavioral",
        "description": "Clicks every link and visits every page before taking action",
        "avatar_emoji": "🧭", "task_style": "explorer",
        "viewport": {"width": 1440, "height": 900},
        "behavioral_modifiers": {
            "click_delay_ms": 500, "misclick_rate": 0.03,
            "reads_everything": False, "skips_text": False,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 60000, "double_clicks": False,
            "uses_back_button": True, "refreshes_randomly": False,
        },
    },
    {
        "id": "B3", "name": "TheMinimalist", "age": 33,
        "category": "behavioral",
        "description": "Does the absolute minimum — skips every optional field",
        "avatar_emoji": "✂️", "task_style": "minimal",
        "viewport": {"width": 1280, "height": 720},
        "behavioral_modifiers": {
            "click_delay_ms": 300, "misclick_rate": 0.02,
            "reads_everything": False, "skips_text": True,
            "keyboard_only": False, "input_strategy": "minimal",
            "patience_threshold_ms": 20000, "double_clicks": False,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },
    {
        "id": "B4", "name": "ConfusedParent", "age": 55,
        "category": "behavioral",
        "description": "Trying to sign up on behalf of their kid, confused by everything",
        "avatar_emoji": "😵", "task_style": "confused",
        "viewport": {"width": 1024, "height": 768},
        "behavioral_modifiers": {
            "click_delay_ms": 1200, "misclick_rate": 0.15,
            "reads_everything": True, "skips_text": False,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 30000, "double_clicks": True,
            "uses_back_button": True, "refreshes_randomly": False,
        },
    },
    {
        "id": "B5", "name": "PowerUser", "age": 25,
        "category": "behavioral",
        "description": "Uses keyboard shortcuts, Ctrl+F, and expects everything to be fast",
        "avatar_emoji": "💻", "task_style": "power_user",
        "viewport": {"width": 1920, "height": 1080},
        "behavioral_modifiers": {
            "click_delay_ms": 150, "misclick_rate": 0.01,
            "reads_everything": False, "skips_text": True,
            "keyboard_only": False, "input_strategy": "normal",
            "patience_threshold_ms": 5000, "double_clicks": False,
            "uses_back_button": False, "refreshes_randomly": False,
        },
    },
]

ADVERSARIAL_INPUTS = [
    "Robert'); DROP TABLE users;--",
    "🍕🍕🍕",
    "<script>alert('xss')</script>",
    "",
    "not-an-email",
    "0000000000",
    "A" * 500,
    "-1",
    "null",
    "undefined",
    "' OR '1'='1",
    "<img src=x onerror=alert(1)>",
    "test@test.com\nBcc: spam@evil.com",
    "../../etc/passwd",
    "99999999999999999999",
]


def sample_personas(n: int = 15) -> list[dict]:
    """Pick n personas ensuring at least 1 per category."""
    categories = ["accessibility", "demographic", "chaos", "behavioral"]
    selected = []

    for cat in categories:
        pool = [p for p in PERSONAS if p["category"] == cat]
        selected.append(random.choice(pool))

    remaining = [p for p in PERSONAS if p not in selected]
    extra = min(n - len(selected), len(remaining))
    if extra > 0:
        selected.extend(random.sample(remaining, extra))

    random.shuffle(selected)
    return selected[:n]
