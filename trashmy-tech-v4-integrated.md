# trashmy.tech -- Integrated System Design v4
## Everything Ties Together

---

## THE CORE LOOP

Every test run collects structured data. That data feeds Gemini as a reasoning model to produce calibrated, evidence-based ratings. The report is not a summary -- it's an integrated document where every claim links to a screenshot, every rating links to measured data, and every persona's story connects to specific elements on the page.

```
URL IN
  |
  v
CRAWL (Playwright) --> raw site data (DOM, forms, links, accessibility violations, screenshot)
  |
  v
ASSIGN TASKS (Gemini 2.5 Flash, thinking enabled) --> each persona gets a specific goal
  |
  v
15 PARALLEL AGENTS (Modal) --> each collects structured session data:
  - screenshots at every step
  - element sizes measured in pixels  
  - timing data per action in milliseconds
  - console errors with stack traces
  - network responses with status codes
  - form validation responses verbatim
  - focus order sequence
  - dead ends with exact element that blocked them
  |
  v
ALL DATA AGGREGATED --> structured JSON with every measurement
  |
  v
GEMINI 2.5 FLASH (thinking enabled, structured output) -->
  - Reasons through all 15 sessions + crawler data
  - Produces calibrated scores with cited evidence
  - Writes persona narratives referencing specific screenshots by step number
  - Generates per-category ratings (accessibility, security, usability, mobile, performance)
  - Every rating has a confidence level and the data points that informed it
  |
  v
INTEGRATED REPORT
  - Scores backed by data
  - Persona stories with inline screenshots
  - Issue cards with screenshot evidence
  - Category breakdowns with pass/fail per persona
  - "Would [persona] recommend this site?" verdict per persona
```

---

## DATA SCHEMA -- WHAT EVERY RUN COLLECTS

### From the Crawler:
```python
{
    "url": str,
    "title": str,
    "load_time_ms": int,
    "pages_found": [{"url": str, "text": str}],       # up to 30
    "forms": [{
        "action": str,
        "method": str,
        "fields": [{"name": str, "type": str, "label": str, 
                     "placeholder": str, "required": bool, "aria_label": str}]
    }],
    "buttons": [{"text": str, "type": str, "width_px": int, "height_px": int}],
    "links": [{"text": str, "href": str}],
    "images": {"total": int, "missing_alt": int, "alt_texts": [str]},
    "headings": [{"level": int, "text": str}],          # heading hierarchy
    "meta": {
        "has_h1": bool, "has_description": bool, "has_viewport": bool,
        "has_favicon": bool, "has_skip_nav": bool, "has_lang_attr": bool,
        "charset": str
    },
    "accessibility": {
        "violations": [{"id": str, "impact": str, "description": str, 
                        "help_url": str, "nodes_count": int}],
        "passes": int,
        "incomplete": int
    },
    "console_errors": [str],
    "screenshot_b64": str                                # full page baseline
}
```

### From Each Agent Session:
```python
{
    "persona": {
        "id": str, "name": str, "age": int, "category": str,
        "description": str, "backstory": str
    },
    "task_assigned": str,                                # what Gemini told them to do
    "task_completed": bool,
    "outcome": "completed" | "struggled" | "blocked" | "crashed_site",
    "total_time_ms": int,
    "steps": [{
        "step_number": int,
        "action": str,                                   # "click", "type", "tab", "scroll", "back"
        "target_element": str,                           # text content or selector
        "target_size_px": {"width": int, "height": int}, # measured size
        "result": str,                                   # what happened
        "page_url_after": str,
        "screenshot_b64": str,                           # JPEG, 800px wide
        "timestamp_ms": int,                             # ms since session start
        "console_errors_new": [str],
        "network_errors_new": [{"url": str, "status": int}]
    }],
    "findings": [{
        "type": "critical" | "major" | "minor" | "info" | "pass",
        "category": "accessibility" | "security" | "usability" | "mobile" | "performance",
        "title": str,
        "detail": str,
        "evidence_step": int,                            # which step's screenshot proves this
        "measured_value": str,                            # "28x28px", "4.2s", "no alt text"
        "expected_value": str                             # "44x44px", "<3s", "descriptive alt text"
    }],
    "form_test_results": [{                              # only for chaos agents
        "input_type": str,                               # "sql_injection", "xss", etc.
        "input_value": str,
        "field_name": str,
        "accepted": bool,                                # did the form accept it?
        "server_error": bool,                            # did the server 500?
        "reflected_in_page": bool,                       # XSS check
        "error_message": str                             # what the form said back
    }],
    "keyboard_audit": {                                  # only for keyboard personas
        "total_focusable_elements": int,
        "focus_order": [str],                            # sequence of element descriptions
        "focus_traps": [{"element": str, "loop_count": int}],
        "unreachable_elements": [str],
        "skip_nav_present": bool,
        "escape_closes_modals": bool
    },
    "mobile_audit": {                                    # only for mobile personas
        "horizontal_overflow": bool,
        "smallest_tap_target_px": int,
        "fixed_header_height_percent": float,
        "viewport_meta_present": bool,
        "text_size_min_px": int
    }
}
```

This data structure is what Gemini receives. Every field is measurable, citeable, and can be referenced in the report. No vague assessments. Numbers.

---

## GEMINI AS A REASONING MODEL

Use Gemini 2.5 Flash with thinking enabled. This lets the model reason through the data before producing ratings, which results in more calibrated scores.

### The Rating Call:

```python
from google import genai
from google.genai.types import GenerateContentConfig, ThinkingConfig

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=prompt,
    config=GenerateContentConfig(
        response_mime_type="application/json",
        thinking_config=ThinkingConfig(thinking_budget=8192),
        # Let Gemini think through the data before answering
    )
)
```

### What the Prompt Contains:

The full crawler output + all 15 session summaries (findings, timing, outcomes -- not the screenshots themselves, those are too large). The prompt asks Gemini to reason through the evidence and produce:

```python
{
    "overall_score": int,                    # 0-100
    "score_reasoning": str,                  # 2-3 sentences explaining why this score
    "confidence": float,                     # 0-1, how much data informed this
    
    "category_scores": {
        "accessibility": {
            "score": int,                    # 0-100
            "reasoning": str,
            "key_evidence": [str],           # specific data points
            "personas_affected": [str]       # persona IDs
        },
        "security": { ... },                 # input validation, server errors
        "usability": { ... },                # completion rates, confusion, dead ends
        "mobile": { ... },                   # responsive, tap targets, layout
        "performance": { ... }               # load time, interaction speed
    },
    
    "executive_summary": str,                # 3-4 sentences, direct, evidence-based
    
    "persona_verdicts": [{
        "persona_id": str,
        "persona_name": str,
        "would_recommend": bool,             # would this persona recommend the site?
        "narrative": str,                    # 3-5 sentences telling their story
        "key_moment_step": int,              # the screenshot that captures their experience
        "time_spent_seconds": float,
        "outcome": str,
        "primary_barrier": str | null        # what stopped them, if anything
    }],
    
    "top_issues": [{
        "rank": int,
        "title": str,
        "severity": "critical" | "major" | "minor",
        "category": str,
        "description": str,
        "evidence": {
            "persona_id": str,
            "step": int,                     # screenshot reference
            "measured": str,                 # the actual data point
            "expected": str                  # what it should be
        },
        "affected_personas": [str],
        "fix": str,
        "impact_estimate": str               # "affects ~X% of users based on persona coverage"
    }],
    
    "chaos_test_summary": {
        "inputs_tested": int,
        "inputs_rejected": int,
        "inputs_accepted_incorrectly": int,
        "server_errors": int,
        "xss_vulnerabilities": int,
        "worst_finding": str
    },
    
    "what_works": [{                         # not just what's broken -- what's good
        "title": str,
        "detail": str,
        "personas_who_benefited": [str]
    }],
    
    "what_doesnt_work": [{
        "title": str,
        "detail": str,
        "personas_who_suffered": [str]
    }],
    
    "recommendations": [str, str, str]       # top 3 ordered by impact
}
```

### Gemini System Instruction:

```
You are the analysis engine for trashmy.tech, a website testing tool that deploys 
AI personas to test real websites.

You will receive structured test data from a crawler and 15 persona sessions. 
Your job is to reason through this data and produce accurate, calibrated ratings.

RATING PRINCIPLES:
- Every score must be justified by specific data points from the test results.
- Do not infer problems that aren't evidenced in the data. If something wasn't 
  tested, say so rather than guessing.
- Scores should be calibrated: a site that loads fast, has clean forms, and works 
  for most personas but has 10 accessibility violations might be a 65. A site where 
  4 personas are completely blocked and the server crashes on adversarial input is a 25.
- Use the thinking step to reason about edge cases and weigh conflicting signals 
  before committing to a score.

NARRATIVE PRINCIPLES:
- Persona stories must reference specific actions and elements from the test data.
  "Margaret clicked the element labeled 'Sign In' three times" not "Margaret had trouble."
- Reference screenshot steps by number so the frontend can display the right image.
- The "would_recommend" verdict should reflect whether this persona could accomplish 
  a basic task on the site. If they couldn't find the signup form, they would not recommend it.

WHAT WORKS:
- Always include what works well. If the mobile layout is clean, say so. If forms 
  have good validation, say so. Real audits acknowledge strengths, not just weaknesses.
  This makes the report credible.

WHAT DOESN'T WORK:
- Be specific. Not "accessibility needs improvement" but "12 images missing alt text, 
  heading hierarchy skips from h1 to h4, no skip-navigation link, 3 focus traps in 
  the navigation menu."

Respond with valid JSON matching the provided schema.
```

---

## THE REPORT UI -- INTEGRATED DESIGN

No emojis anywhere. Use initials in circles (like avatar placeholders) or small category icons drawn with SVG.

### Persona Avatars:
Instead of emoji or OpenMoji, each persona gets a two-letter initial circle:
```
MH  (Margaret Huang) -- 32px circle, category-colored border
JO  (James Okafor)
PS  (Priya Sharma)
...
```

Accessibility personas: left border in a muted blue (#3b82f6)
Chaos agents: left border in a warm gray (#6b7280)
Demographic personas: left border in a muted teal (#14b8a6)
Behavioral personas: left border in a muted purple (#8b5cf6)

This avoids emojis entirely and looks intentionally designed rather than decorated.

---

## COMPLETE UI PROMPT -- GIVE THIS TO CURSOR

This is the single, comprehensive prompt that produces the entire frontend. It describes every screen, every state, every interaction, and how data flows through the interface.

```
Build the complete frontend for trashmy.tech using Next.js 14 App Router 
and Tailwind CSS. This is a website testing tool that deploys AI personas 
to stress-test any URL. The frontend has 3 states on 2 pages.

IMPORTANT DESIGN RULES:
- No emojis anywhere in the UI. Not in text, not as icons, nowhere.
- No gradient backgrounds.
- No glassmorphism or frosted glass effects.
- No rounded corners over 6px.
- No decorative animations that don't communicate state changes.
- No purple-to-blue color schemes.
- Two fonts only: JetBrains Mono (data, labels, navigation) and 
  DM Sans (body text, narratives, descriptions). Both from Google Fonts.
- Left-aligned text everywhere. No centered paragraphs.
- The site should look like a professional research tool, not a 
  startup landing page.

COLOR SYSTEM (Tailwind custom config):
  bg-base: #08090d          (page background)
  bg-surface: #0f1117       (cards, panels)
  bg-elevated: #181b25      (hover, active states)
  border-default: #252a3a   (borders)
  border-focus: #3d4560     (focused elements)
  text-primary: #d4d7e0     (main text)
  text-secondary: #7a8099   (labels, metadata)
  text-muted: #4a506a       (disabled, placeholder)
  
  status-pass: #22c55e
  status-fail: #ef4444
  status-warn: #eab308
  status-info: #3b82f6
  
  accent-accessibility: #3b82f6
  accent-chaos: #6b7280
  accent-demographic: #14b8a6
  accent-behavioral: #8b5cf6

PERSONA AVATARS:
Each persona has a 2-letter initial (e.g., "MH" for Margaret Huang).
Render as a 32px circle with bg-surface, 2px border colored by 
category (accessibility=blue, chaos=gray, demographic=teal, behavioral=purple),
JetBrains Mono 11px text-secondary centered inside.

=============================================================
PAGE 1: HOME (app/page.tsx)
=============================================================

Top bar: "trashmy.tech" in JetBrains Mono 14px text-secondary, left-aligned,
padding 24px. No other nav items.

Center content (vertically centered, max-width 520px, left-aligned):

Line 1: "find out what's actually wrong" in DM Sans 28px semibold text-primary.
Line 2: "with your website" same style, same line if fits, next line if not.

Gap 16px.

Paragraph: "15 AI personas test your site the way real humans do. 
A retired teacher with failing vision. A keyboard-only user recovering 
from a stroke. A chaos agent submitting SQL injection in your name field.
You get the full report in 60 seconds." DM Sans 15px text-secondary, 
line-height 1.7, max-width 480px.

Gap 32px.

Input row: one line containing:
- Text input: full width minus button, height 44px, bg-surface, 
  border 1px border-default, radius 4px, JetBrains Mono 14px text-primary,
  placeholder "https://yoursite.com" in text-muted. On focus: border-focus.
- Button: "test" in JetBrains Mono 13px, uppercase, letter-spacing 0.5px,
  bg-surface, border 1px border-default, radius 4px, height 44px, 
  padding 0 20px. Hover: bg-elevated. Active: scale 0.98.
  The button is not colorful. It's the same surface color as the input.

Gap 48px.

Four inline items showing what's tested. No cards, no boxes. 
Just four text groups in a row (or 2x2 on mobile):
Each one:
  Label: "accessibility" | "chaos" | "demographics" | "behavior"
  in JetBrains Mono 11px, uppercase, letter-spacing 1px, 
  colored by category accent color.
  Description: "can they read it" | "can they break it" | 
  "does it work for everyone" | "how do they actually use it"
  in DM Sans 13px text-muted.

No border, no background. Just typography.

Bottom of page: "built at hackillinois 2026" in JetBrains Mono 11px text-muted.

On submit: validate URL has http/https. POST to {BACKEND_URL}/api/test.
Get back {test_id}. Navigate to /test/{test_id}.

=============================================================
PAGE 2: TEST (app/test/[id]/page.tsx)
=============================================================

This page connects to WebSocket at {BACKEND_URL}/ws/{test_id}.
It goes through 3 phases based on WebSocket messages.

----------- PHASE 1: SCANNING (5-10 seconds) -----------

Full page, vertically centered content.

"scanning" in JetBrains Mono 12px text-secondary, uppercase, letter-spacing 2px.
Below: the URL in JetBrains Mono 14px text-primary.
Below: a thin line (1px height, bg-elevated) that fills from left to right 
over 5 seconds. Not animated with CSS keyframes -- actually controlled by 
WebSocket updates as the crawler discovers elements.

As crawler data arrives, stats appear below the line, one at a time:
"12 pages" then "3 forms" then "24 buttons" then "47 violations"
Each in JetBrains Mono 13px text-secondary. They fade in (opacity 0 to 1, 200ms).

When crawling completes: pause 500ms, then transition to phase 2.

----------- PHASE 2: TESTING (30-45 seconds) -----------

Two-column layout. Left 55%, right 45%. Gap 1px border-default between them.

LEFT COLUMN: BROWSER VIEW

Tab bar at top: horizontal scroll, no wrap. Each tab is:
  [initial circle 20px] [name] [status dot]
  JetBrains Mono 12px. Active tab: text-primary, bottom border 2px text-primary.
  Inactive tabs: text-muted.
  Status dots: 6px circles. Waiting=text-muted. Running=status-pass (pulsing opacity). 
  Done=status-pass (solid). Failed=status-fail. Stuck=status-warn.

Main area below tabs:
  If selected agent is WAITING: 
    "waiting to deploy" in JetBrains Mono 12px text-muted, centered.
  
  If selected agent is RUNNING or COMPLETE:
    Top: their latest screenshot displayed as an image, max-width 100%, 
    bg-surface behind it, 4px radius. The screenshot should fill the 
    available width. Aspect ratio preserved.
    
    Below screenshot: step log.
    Each step is one line:
    "[1]  clicked 'Sign Up'  -->  /signup  2.1s"
    JetBrains Mono 11px text-secondary. Current step in text-primary.
    Steps that found issues have a small status-fail dot before them.
    
    If they have findings, show them below the step log:
    Each finding: severity bar (3px left border, colored by severity) +
    title in JetBrains Mono 12px + detail in DM Sans 12px text-secondary.

As agents complete, their data arrives via WebSocket. If the user is 
viewing that agent's tab, the screenshot and steps update live. 
New screenshots fade in (opacity transition 200ms).

RIGHT COLUMN: OVERVIEW

Top section: counters
  "15 agents" in JetBrains Mono 12px text-muted
  "{done}/15 complete" in JetBrains Mono 12px text-primary
  "{issues} issues" in JetBrains Mono 12px, colored status-fail if >10, 
  status-warn if >0, text-secondary if 0.
  
  Elapsed: "00:34" ticking every second, JetBrains Mono 12px text-muted.

Middle section: agent list (scrollable)
  Each agent is a row:
    [initial circle 24px with category border] 
    [name, JetBrains Mono 12px]
    [outcome text, right-aligned]
  
  Outcome text:
    Waiting: "waiting" in text-muted
    Running: "step 3/5" in text-secondary
    Completed: "3.1s" in status-pass + small checkmark
    Blocked: "blocked" in status-fail
    Struggled: "struggled" in status-warn
  
  Clicking a row switches the left column to that agent's tab.
  
  Sort order: running agents first, then blocked, then struggled, 
  then completed, then waiting.

Bottom section: live event log
  Scrollable container, max-height 200px, bg-base.
  Each line: 
  "[00:04]  Margaret Huang -- cannot find signup button"
  JetBrains Mono 11px. Timestamp in text-muted. Name in text-secondary.
  Event text colored by type (fail/warn/pass/info).
  New events prepend at top. Smooth scroll.

Full-width at the very bottom: thin progress bar.
  Height 2px. bg-elevated background. Fill color transitions:
  <30% done: status-fail. 30-70%: status-warn. >70%: status-pass.

----------- PHASE 3: REPORT (after all agents complete) -----------

The two-column layout fades out (opacity 0, 300ms).
The report fades in (opacity 0 to 1, 300ms).

Report is a single-column layout, max-width 720px, centered.

--- SCORE BLOCK ---

Left-aligned. Not centered.

Score number: JetBrains Mono 56px bold. Color by value 
(<30: status-fail, 30-60: status-warn, >60: status-pass).
The number counts up from 0 on appear (increment every 20ms, decelerate).
"/100" next to it in JetBrains Mono 24px text-muted.

Below: confidence indicator. "high confidence" | "moderate confidence" | 
"low confidence" in JetBrains Mono 11px text-muted, based on Gemini's 
confidence value. Below that: 
"15 personas tested  --  {issues} issues found  --  {time}s"
JetBrains Mono 12px text-secondary.

Below: score reasoning from Gemini. DM Sans 15px text-primary, line-height 1.7.

--- CATEGORY SCORES ---

A row of 5 compact score blocks (or wrapping on mobile):
Each block:
  Category name: JetBrains Mono 11px uppercase, letter-spacing 1px, 
  colored by category type.
  Score: JetBrains Mono 24px, colored by value.
  /100 in 12px text-muted.
  One-line reasoning below in DM Sans 12px text-secondary, max 2 lines, 
  overflow ellipsis.

Categories: ACCESSIBILITY  |  SECURITY  |  USABILITY  |  MOBILE  |  PERFORMANCE

--- EXECUTIVE SUMMARY ---

Horizontal rule (1px border-default).
Section label: "summary" JetBrains Mono 11px uppercase text-muted letter-spacing 2px.
Gemini's executive summary: DM Sans 16px text-primary, line-height 1.7.
Max 4 sentences.

--- WHAT WORKS / WHAT DOESN'T ---

Two sections side by side (or stacked on mobile):

Left: "what works" label in JetBrains Mono 11px uppercase status-pass.
List of items from Gemini's what_works array. Each item:
  Title in DM Sans 14px text-primary.
  Detail in DM Sans 13px text-secondary.
  "benefited: Margaret, Jayden, Aiko" in JetBrains Mono 11px text-muted.
  Separated by 16px.

Right: "what doesn't" label in JetBrains Mono 11px uppercase status-fail.
Same format, using what_doesnt_work data.
  "affected: James, Priya, Lin" in JetBrains Mono 11px text-muted.

This is THE differentiator. Real audits acknowledge what's good, not just 
what's broken. This makes the report trustworthy.

--- PERSONA VERDICTS ---

Section label: "persona results" JetBrains Mono 11px uppercase text-muted.

A table-like layout (not an actual <table>). Each persona is a row:

  [initial circle 28px]  [name, age]  [outcome badge]  [time]  [would recommend?]

  Name: DM Sans 14px text-primary. Age in text-secondary.
  Outcome: small pill badge -- "completed" (status-pass bg at 10% opacity, status-pass text),
    "struggled" (status-warn), "blocked" (status-fail), "crashed site" (status-fail).
  Time: JetBrains Mono 12px text-secondary. "3.1s" or "4m 12s" or "--" if blocked.
  Would recommend: "yes" in status-pass or "no" in status-fail. JetBrains Mono 12px.

Clicking a row expands it to show:
  
  1. The narrative (Gemini-generated, 3-5 sentences). DM Sans 14px text-primary, 
     line-height 1.7. This narrative references specific actions and elements.
  
  2. Screenshot gallery: a horizontal scrollable row of this persona's 
     step screenshots. Each screenshot is ~180px wide, radius 4px, 
     border 1px border-default. Below each: step description in 
     JetBrains Mono 10px text-muted: "Step 3: clicked 'Sign In'"
     Clicking a screenshot opens it larger (lightbox overlay, bg-base 
     at 90% opacity, image centered, max-width 80vw, click outside to close).
  
  3. Findings from this persona: same severity-bordered cards as in phase 2.
     Each finding shows measured value vs expected value:
     "28 x 28 px  (expected: 44 x 44 px minimum)"
     JetBrains Mono 12px. Measured in text-primary, expected in text-muted.

  4. Primary barrier (if blocked/struggled): one line in DM Sans 14px,
     status-fail or status-warn colored.

--- TOP ISSUES ---

Section label: "top issues" JetBrains Mono 11px uppercase text-muted.

Ordered by rank (from Gemini). Each issue is a card:

  bg-surface, border 1px border-default, radius 4px, padding 20px.
  Left border: 3px, colored by severity (critical=status-fail, major=status-warn, minor=text-muted).

  Row 1: Severity badge ("CRITICAL" in JetBrains Mono 10px uppercase, 
  bg of severity color at 10% opacity, severity color text, padding 2px 8px, 
  radius 2px) + category badge (same style but category color) + rank number.
  
  Row 2: Issue title in DM Sans 16px text-primary.
  
  Row 3: Description in DM Sans 14px text-secondary, line-height 1.6.
  
  Row 4: Evidence block (bg-elevated, radius 4px, padding 12px):
    If there's a screenshot reference, show the screenshot at ~300px wide,
    with caption: "Step {n} from {persona_name}'s session" JetBrains Mono 11px text-muted.
    Below: "measured: {value}  expected: {value}" JetBrains Mono 12px.
  
  Row 5: Affected personas as initial circles in a row.
  
  Row 6: Fix recommendation in DM Sans 14px text-primary, 
  bg-elevated padding 12px radius 4px. Preceded by "fix:" in 
  JetBrains Mono 11px uppercase text-muted.

  Row 7: Impact estimate: "affects approximately X% of users based on 
  persona coverage" DM Sans 13px text-secondary.

--- ACCESSIBILITY AUDIT ---

Section label: "accessibility" JetBrains Mono 11px uppercase accent-accessibility.

Compact data display. No charts.

  Total violations: JetBrains Mono 24px text-primary. "/violations" in text-muted.
  
  Breakdown:
    "critical    3" 
    "serious    12"
    "moderate   18"
    "minor      14"
  JetBrains Mono 13px. Labels left-aligned, numbers right-aligned in a 
  fixed-width column. Severity label colored by severity.
  
  Specific stats:
    "12 images missing alt text"
    "8 form inputs missing labels"
    "3 color contrast failures"
    "0 skip-navigation links"
    "heading hierarchy: h1 > h4 (skipped h2, h3)"
  JetBrains Mono 12px text-secondary. Each on its own line.

--- CHAOS TEST RESULTS ---

Section label: "security" JetBrains Mono 11px uppercase accent-chaos.

Compact summary:
  "{tested} inputs tested  {rejected} rejected  {accepted} accepted incorrectly"
  JetBrains Mono 13px. "accepted incorrectly" in status-fail if > 0.
  
  "{server_errors} server errors  {xss} XSS vulnerabilities"
  Same style.
  
  If there were serious findings, show the worst one:
  "worst finding: {description}" DM Sans 14px text-primary.

--- ACTIONS ---

Horizontal rule.

Three text links in a row:
  "test another site" --> navigates to /
  "share results" --> copies current URL to clipboard, shows "copied" for 2s
  "print report" --> triggers window.print()
JetBrains Mono 12px text-secondary, underline on hover. No buttons.

--- FOOTER ---

"trashmy.tech  --  hackillinois 2026" JetBrains Mono 11px text-muted.
Padding 48px bottom.

=============================================================
RESPONSIVE BEHAVIOR
=============================================================

Mobile (< 768px):
- Phase 2: stack columns vertically. Browser view on top, overview below.
  Tab bar horizontal scrollable.
- Report: category scores wrap to 2-3 per row.
  What works / what doesn't stack vertically.
  Persona table becomes cards.
  Screenshot galleries scroll horizontally.

Tablet (768-1024px):
- Phase 2: keep two columns but 50/50 split.
- Report: everything works at 720px max-width.

=============================================================
WEBSOCKET MESSAGE HANDLING
=============================================================

Connect on page load: new WebSocket(`${WS_URL}/ws/${testId}`)

Store state in React:
  phase: "scanning" | "testing" | "report"
  crawlData: object | null
  agents: Map<string, AgentState> where AgentState = {
    persona: object,
    status: "waiting" | "running" | "complete" | "blocked" | "stuck",
    steps: array,
    screenshots: array,
    findings: array,
    outcome: string,
    time_ms: number
  }
  selectedAgentId: string (for browser view tab)
  events: array (for live log)
  report: object | null

Message handlers:
  phase=crawling, status=started --> set phase "scanning"
  phase=crawling, status=complete --> store crawlData, show stats
  phase=planning, status=complete --> initialize agent map with persona data, 
    all status "waiting", set phase "testing", auto-select first agent
  phase=swarming, agent_id, status=running --> update agent status
  phase=swarming, agent_id, status=complete --> update agent with full result 
    data (steps, screenshots, findings, outcome), add event to log
  phase=reporting, status=complete --> store report, set phase "report"

When a new agent completes:
  1. Update their entry in the agents map
  2. Add an event line to the log based on their outcome
  3. If the user has that agent's tab selected, the browser view updates
  4. Increment the done counter and issue counter

=============================================================
ENVIRONMENT
=============================================================

Create lib/config.ts:
  export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"

Use Next.js App Router. Tailwind CSS. No other UI libraries except 
framer-motion for the score counter animation. Install:
  next, react, react-dom, tailwindcss, framer-motion

Google Fonts: add JetBrains Mono and DM Sans to the layout via next/font.
```

---

## BACKEND CHANGES FROM V3

### report.py -- Updated for Reasoning

```python
from google import genai
from google.genai.types import GenerateContentConfig, ThinkingConfig

async def generate_report(site_map: dict, sessions: list[dict]) -> dict:
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    # Build the comprehensive prompt with all collected data
    prompt = build_report_prompt(site_map, sessions)
    
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=GenerateContentConfig(
            response_mime_type="application/json",
            thinking_config=ThinkingConfig(thinking_budget=8192),
        )
    )
    
    report = json.loads(response.text)
    
    # Attach screenshot references -- the frontend needs to know which 
    # session and step number to pull each screenshot from
    report["sessions_summary"] = [
        {
            "persona_id": s["persona"]["id"],
            "persona_name": s["persona"]["name"],
            "screenshots": [
                {"step": step["step_number"], "description": step["result"], 
                 "screenshot_b64": step["screenshot_b64"]}
                for step in s["steps"]
            ]
        }
        for s in sessions
    ]
    
    return report
```

### agent.py -- Screenshots Include Measured Data

Every step now measures element sizes, timing, and other quantitative data alongside the screenshot. This is what makes the report evidence-based rather than narrative-based.

### main.py -- WebSocket Streams Agent Results With Screenshots

When an agent completes, the WebSocket message includes their screenshots. This is a lot of data per message (5-8 JPEG screenshots at ~30-50KB each), so compress screenshots to quality 50 and 600px wide.

---

## WHAT MAKES THIS "SOMETHING PEOPLE WANT"

The report answers the question every developer and product manager has after shipping: "does this actually work for people who aren't me?"

Lighthouse tells you your contrast ratio. trashmy.tech tells you Margaret, 68, with macular degeneration, couldn't find your signup button.

axe-core tells you there are 47 violations. trashmy.tech tells you James, 74, pressed Tab 47 times and never reached the form.

Unit tests tell you the form submits. trashmy.tech tells you the form also submits when you put SQL injection in the name field.

The "what works / what doesn't work" split is critical. Real users don't just want to hear what's broken. They want to know: is this usable? For whom? The persona verdicts ("would Margaret recommend this site? no.") turn abstract metrics into human answers.

The collected data per run builds toward something larger: if you test 100 sites, you can calibrate what "good" looks like. The score isn't arbitrary -- it's relative to real behavioral testing data.
