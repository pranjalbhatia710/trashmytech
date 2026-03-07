# TWO PROMPTS FOR CLAUDE CODE

---

## PROMPT 1: Better Report Generation (Gemini System Prompt + Report Template)

Give this to Claude Code as the new Gemini system prompt and report structure.

---

### THE PROBLEM WITH THE CURRENT REPORT

The current report is:
- Too long and repetitive
- Persona results section is just a list of names with "struggled" / "blocked" -- says nothing useful
- Category scores are vague ("The site has major accessibility problems")
- "What Works / What Doesn't" is too wordy
- No visual hierarchy -- everything feels the same weight
- Tool limitations get mixed in with real failures making scores wrong
- The executive summary reads like a school essay

### THE NEW GEMINI SYSTEM PROMPT

Replace the current system prompt in `report.py`. This prompt is sent to **gemini-3.1-pro-preview** (Google's most advanced reasoning model, the max model) with thinking_level set to HIGH for calibrated scoring.

```python
GEMINI_REPORT_PROMPT = """You are the report engine for trashmy.tech. You produce concise, data-driven website audit reports.

VOICE: Direct. Clinical. Like a senior consultant who bills $500/hour and doesn't waste words. No filler. No "it appears that" or "it is worth noting." State facts and move on.

SCORING RULES:
- Only count findings with type "ux_failure" against the score. Findings with type "tool_limitation" mean our testing tool (Playwright) couldn't interact, NOT that the site is broken. A real user likely can use elements our tool cannot.
- axe-core violations are always real. Count them.
- Measured values are always real (element sizes, timing, contrast ratios). Count them.
- If >50% of agents hit tool_limitation, set confidence to "low" and say "partially tested" -- don't pretend you know the full picture.
- A polished site with only accessibility gaps: 65-85. A site with real navigation failures: 35-65. A total dumpster fire: 0-35.
- NEVER score below 40 based only on tool_limitation findings.

REPORT STRUCTURE (follow this exactly):

1. SCORE: Single number 0-100. One sentence explaining why. Confidence level.

2. THE THIRTY-SECOND VERSION: 2-3 sentences max. A busy CEO reads this and knows whether to panic or not. Reference the single most important finding and the single best thing about the site.

3. FIVE SCORES (one line each):
   - Accessibility: [score]/100 -- [one sentence with specific data point]
   - Security: [score]/100 -- [one sentence]
   - Usability: [score]/100 -- [one sentence]
   - Mobile: [score]/100 -- [one sentence]
   - Performance: [score]/100 -- [one sentence]

4. WHAT'S GOOD (2-4 bullets, each 1 sentence):
   Real things that work. Fast load? Clean layout? Good form validation? Say it. This makes the report credible. Always find something.

5. WHAT'S BROKEN (2-5 items, ranked by severity):
   Each item:
   - Severity tag: CRITICAL / HIGH / MEDIUM / LOW
   - One-line title
   - One-line description with measured evidence (e.g. "Store button is 1x44px, needs 44x44px")
   - Who it affects: list persona names
   - One-line fix

6. PERSONA VERDICTS (for each persona that ran):
   Format: [Name] -- [outcome: completed/struggled/blocked] -- [would recommend: yes/no]
   Then 1-2 sentences of narrative ONLY if something interesting happened. Skip boring completions. Focus on the dramatic moments: the keyboard user who pressed Tab 47 times and never reached the form. The chaos agent whose SQL injection returned a 500. The grandmother who couldn't find the signup button. If a persona completed normally with no issues, just say "completed without issues" and move on.

7. TOP 3 RECOMMENDATIONS (ordered by impact):
   Each: one sentence describing what to do + estimated user impact percentage

RULES FOR NARRATIVES:
- Reference specific step numbers and screenshots: "At step 4, Margaret clicked..." 
- Include measured values: "28x28px", "3.2 second load", "Tab pressed 12 times"
- If a persona was blocked by tool_limitation, say: "[Name] could not be fully tested due to testing tool limitations" -- do NOT write a dramatic narrative about the site being broken
- Keep persona narratives to 2 sentences max unless the persona found something genuinely critical
- Don't repeat the same finding across multiple personas -- mention it once, list all affected personas

OUTPUT: Valid JSON matching the schema. No markdown. No preamble."""
```

### THE NEW REPORT JSON SCHEMA

```python
REPORT_SCHEMA = {
    "overall_score": 0,  # 0-100
    "score_reasoning": "",  # 1 sentence
    "confidence": "",  # "high" | "moderate" | "low"
    
    "thirty_second_summary": "",  # 2-3 sentences for the CEO
    
    "category_scores": {
        "accessibility": {"score": 0, "one_liner": ""},
        "security": {"score": 0, "one_liner": ""},
        "usability": {"score": 0, "one_liner": ""},
        "mobile": {"score": 0, "one_liner": ""},
        "performance": {"score": 0, "one_liner": ""}
    },
    
    "whats_good": [
        # {"title": "", "detail": "", "benefited": ["Margaret", "Jayden"]}
    ],
    
    "whats_broken": [
        # {
        #     "severity": "CRITICAL",
        #     "title": "",
        #     "description": "",  # one line with measured evidence
        #     "affected_personas": ["Margaret", "James"],
        #     "fix": "",  # one line
        #     "screenshot_step": null  # step number for screenshot reference
        # }
    ],
    
    "persona_verdicts": [
        # {
        #     "persona_id": "",
        #     "name": "",
        #     "category": "",
        #     "outcome": "",  # completed / struggled / blocked / not_tested
        #     "would_recommend": true,
        #     "time_seconds": 0,
        #     "narrative": "",  # 1-2 sentences or "completed without issues"
        #     "key_screenshot_step": null
        # }
    ],
    
    "recommendations": [
        # {"rank": 1, "action": "", "impact": ""}
    ],
    
    "testing_notes": {
        "total_personas": 0,
        "fully_tested": 0,
        "partially_tested": 0,  # hit tool limitations
        "real_findings": 0,
        "tool_limitations": 0,
        "axe_violations": 0
    }
}
```

### WHAT THE REPORT SHOULD LOOK LIKE FOR APPLE.COM (example output)

```
SCORE: 72/100
"Well-built site with excellent performance but significant accessibility gaps, 
particularly missing alt text across all images."
Confidence: moderate (5 of 15 agents hit testing tool limitations)

THE THIRTY-SECOND VERSION:
Apple.com loads in 301ms and has a clean, responsive design that works well 
for most users. However, all 33 images are missing alt text, making the site 
largely invisible to screen reader users. Fix the alt text and you're at 85+.

ACCESSIBILITY:  45/100 -- 33 images missing alt text, Store button is 1x44px
SECURITY:       75/100 -- CSP headers present but console shows policy errors  
USABILITY:      80/100 -- Clean navigation, clear CTAs, logical page structure
MOBILE:         70/100 -- Responsive layout works but some tap targets are tight
PERFORMANCE:    95/100 -- 301ms initial load, optimized delivery

WHAT'S GOOD:
- Fast: 301ms load time puts it in the top 5% of websites
- Clean hierarchy: navigation is logical, CTAs are prominent
- Responsive: layout adapts properly to mobile viewports

WHAT'S BROKEN:
[CRITICAL] All images missing alt text
  33 of 33 images have no alt attribute. Screen readers can't describe any 
  product imagery. Affects: Priya, Margaret | Fix: Add descriptive alt text to every image

[MEDIUM] Store button too small  
  Click target measures 1x44px, below the 44x44px WCAG minimum.
  Affects: Lin, SpeedRunner | Fix: Add horizontal padding to reach 44px width

PERSONA VERDICTS:
Margaret (68, low vision) -- struggled -- no
  At 200% zoom, found the nav but couldn't distinguish 'Sign In' from 'Sign Up' 
  due to similar styling. Spent 40 seconds on a task that should take 5.

Priya (31, screen reader) -- blocked -- no
  Without alt text on any image, the page is a sequence of unlabeled graphics. 
  Navigation links were accessible but product content was invisible.

Jayden (13, mobile) -- completed -- yes
  Completed without issues.

SpeedRunner -- partially tested -- n/a
  Could not be fully tested due to testing tool limitations on click interactions.

RECOMMENDATIONS:
1. Add alt text to all 33 images -- affects 100% of screen reader users
2. Increase Store button to 44x44px minimum -- affects ~15% of users with motor impairments  
3. Differentiate Sign In vs Sign Up styling -- affects ~25% of new visitors
```

---

## PROMPT 2: Gemini Screenshot Annotation (Bounding Boxes on Failures/Successes)

Give this to Claude Code. It uses Gemini's native bounding box capability to annotate screenshots with visual markers showing exactly where problems are and what works.

---

### THE CONCEPT

After each agent takes a screenshot, we send it to Gemini with the agent's findings for that step. Gemini returns bounding box coordinates for problem areas (red) and good areas (green). We draw these annotations onto the screenshot using Pillow before storing it. The annotated screenshots go into the report so users can SEE exactly where the issue is.

This uses Gemini's spatial understanding -- it can look at a webpage screenshot and identify specific UI elements by coordinates. We use gemini-2.5-flash for this since one API key works across all Gemini models and we want the best accuracy for bounding box placement.

### THE CODE

Add this to `backend/annotator.py`:

```python
"""
annotator.py -- Annotate screenshots with Gemini bounding boxes

Uses Gemini's native bounding box detection to mark:
- RED boxes/arrows: Elements with problems (too small, missing labels, broken)
- GREEN boxes: Elements that work well (good contrast, proper size, accessible)
- YELLOW boxes: Elements that need attention (warnings)

Each annotation includes a short label explaining the issue.

Gemini returns coordinates normalized to 0-1000 on both axes.
We convert these to actual pixel coordinates and draw them with Pillow.
"""
import os
import json
import base64
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from google import genai
from google.genai import types


client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# MODEL STRATEGY:
# - gemini-3.1-pro-preview for report generation (1 call, needs max reasoning)
# - gemini-3-flash-preview for screenshot annotation (many calls, needs vision + speed)
# One API key from aistudio.google.com works for ALL models.
#
# FREE TIER LIMITS (as of Feb 2026):
#   gemini-3.1-pro-preview: 5 RPM, 100 RPD  (use sparingly -- report only)
#   gemini-3-flash-preview: 10 RPM, 250 RPD (use for annotations + task planning)
#
# For a single test run we need:
#   1 report call (Pro)  +  ~75 annotation calls (Flash)  +  1 task plan (Flash)
#   = 1 Pro call + ~76 Flash calls -- fits within free tier for ~3 test runs/day

REPORT_MODEL = "gemini-3.1-pro-preview"       # max reasoning for scored report
ANNOTATION_MODEL = "gemini-3-flash-preview"    # fast vision for bounding boxes
TASK_PLANNING_MODEL = "gemini-3-flash-preview" # fast reasoning for task plans


ANNOTATION_PROMPT = """You are a UX auditor annotating a screenshot of a website.

I will give you:
1. A screenshot of a webpage
2. A list of findings from an automated test of this page

Your job: identify the EXACT locations of elements mentioned in the findings and return bounding boxes.

For each finding, return a bounding box around the relevant UI element with:
- box_2d: [y_min, x_min, y_max, x_max] normalized to 0-1000
- label: short text (max 8 words) describing the issue or strength
- type: "problem" (red), "good" (green), or "warning" (yellow)

RULES:
- Only annotate elements you can actually SEE in the screenshot
- Be precise -- the box should tightly wrap the specific element, not a huge area
- For "too small" findings, draw the box around the small element
- For "missing alt text", draw the box around the image that's missing it
- For "good" findings (fast load, clear CTA), draw a box around what works
- Max 6 annotations per screenshot to keep it readable
- If you can't locate an element mentioned in findings, skip it

Return ONLY a JSON array. No markdown. No explanation.

Example output:
[
  {"box_2d": [120, 340, 160, 520], "label": "Button too small: 28x20px", "type": "problem"},
  {"box_2d": [50, 100, 90, 400], "label": "Clear navigation", "type": "good"},
  {"box_2d": [200, 50, 350, 300], "label": "Image missing alt text", "type": "problem"}
]"""


async def annotate_screenshot(
    screenshot_b64: str,
    findings: list[dict],
    page_url: str = ""
) -> str:
    """
    Send a screenshot + findings to Gemini, get bounding boxes back,
    draw them onto the image, return the annotated image as base64.
    
    Args:
        screenshot_b64: base64 JPEG of the screenshot
        findings: list of finding dicts from the agent step
        page_url: optional URL for context
    
    Returns:
        base64 JPEG of the annotated screenshot
    """
    # Decode the screenshot
    img_bytes = base64.b64decode(screenshot_b64)
    img = Image.open(BytesIO(img_bytes))
    width, height = img.size
    
    # Build the findings context
    findings_text = "\n".join([
        f"- [{f.get('type', 'unknown')}] {f.get('title', '')}: {f.get('detail', '')}"
        for f in findings
        if f.get('type') != 'tool_limitation'  # don't annotate tool failures
    ])
    
    if not findings_text.strip():
        # No real findings to annotate -- just return the original
        return screenshot_b64
    
    # Call Gemini with the image + findings
    try:
        response = client.models.generate_content(
            model=ANNOTATION_MODEL,  # gemini-3-flash-preview for speed + vision
            contents=[
                types.Part.from_text(
                    f"{ANNOTATION_PROMPT}\n\nPage: {page_url}\n\nFindings:\n{findings_text}"
                ),
                types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")
            ],
            config=types.GenerateContentConfig(
                temperature=0.2,  # low temp for precise coordinates
                response_mime_type="application/json",
            )
        )
        
        # Parse the bounding boxes
        annotations = json.loads(response.text)
        
    except Exception as e:
        print(f"Annotation failed: {e}")
        return screenshot_b64  # return original on failure
    
    # Draw annotations onto the image
    draw = ImageDraw.Draw(img, "RGBA")
    
    # Try to load a good font, fall back to default
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
    except:
        font = ImageFont.load_default()
        font_small = font
    
    COLORS = {
        "problem": {
            "box": (239, 68, 68),        # red
            "fill": (239, 68, 68, 40),    # red transparent
            "text_bg": (239, 68, 68, 200),
            "text": (255, 255, 255)
        },
        "good": {
            "box": (34, 197, 94),         # green
            "fill": (34, 197, 94, 30),    # green transparent
            "text_bg": (34, 197, 94, 200),
            "text": (255, 255, 255)
        },
        "warning": {
            "box": (234, 179, 8),         # yellow
            "fill": (234, 179, 8, 35),    # yellow transparent
            "text_bg": (234, 179, 8, 200),
            "text": (0, 0, 0)
        }
    }
    
    for ann in annotations:
        try:
            box = ann["box_2d"]  # [y_min, x_min, y_max, x_max] normalized 0-1000
            label = ann.get("label", "")
            ann_type = ann.get("type", "problem")
            colors = COLORS.get(ann_type, COLORS["problem"])
            
            # Convert normalized coords (0-1000) to actual pixels
            y_min = int(box[0] / 1000 * height)
            x_min = int(box[1] / 1000 * width)
            y_max = int(box[2] / 1000 * height)
            x_max = int(box[3] / 1000 * width)
            
            # Clamp to image bounds
            x_min = max(0, min(x_min, width - 1))
            x_max = max(0, min(x_max, width))
            y_min = max(0, min(y_min, height - 1))
            y_max = max(0, min(y_max, height))
            
            # Draw semi-transparent fill
            draw.rectangle([x_min, y_min, x_max, y_max], fill=colors["fill"])
            
            # Draw border (2px)
            for i in range(2):
                draw.rectangle(
                    [x_min - i, y_min - i, x_max + i, y_max + i],
                    outline=colors["box"]
                )
            
            # Draw label background + text above the box
            if label:
                # Measure text
                text_bbox = draw.textbbox((0, 0), label, font=font_small)
                text_w = text_bbox[2] - text_bbox[0]
                text_h = text_bbox[3] - text_bbox[1]
                padding = 4
                
                # Position label above the box, or below if too close to top
                label_y = y_min - text_h - padding * 2 - 2
                if label_y < 0:
                    label_y = y_max + 2
                
                label_x = x_min
                
                # Draw label background
                draw.rectangle(
                    [label_x, label_y, label_x + text_w + padding * 2, label_y + text_h + padding * 2],
                    fill=colors["text_bg"]
                )
                
                # Draw label text
                draw.text(
                    (label_x + padding, label_y + padding),
                    label,
                    fill=colors["text"],
                    font=font_small
                )
                
        except (KeyError, IndexError, ValueError) as e:
            print(f"Skipping bad annotation: {e}")
            continue
    
    # Encode back to base64 JPEG
    buffer = BytesIO()
    img.save(buffer, format="JPEG", quality=70)
    return base64.b64encode(buffer.getvalue()).decode()


async def annotate_overview_screenshot(
    screenshot_b64: str,
    all_findings: list[dict],
    page_url: str = ""
) -> str:
    """
    Create a comprehensive annotated overview of the page.
    
    This is the "hero" annotated screenshot that goes at the top of the report.
    It shows the most critical problems AND the best things about the page,
    all on one image.
    
    Takes the top 3 problems and top 2 strengths from all findings
    and annotates them on the crawler's baseline screenshot.
    """
    # Get top problems (real failures only, sorted by severity)
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    problems = sorted(
        [f for f in all_findings if f.get("type") == "ux_failure"],
        key=lambda f: severity_order.get(f.get("severity", "LOW"), 4)
    )[:3]
    
    # Get strengths
    strengths = [f for f in all_findings if f.get("type") == "strength"][:2]
    
    combined = problems + strengths
    
    if not combined:
        return screenshot_b64
    
    return await annotate_screenshot(screenshot_b64, combined, page_url)
```

### HOW TO INTEGRATE INTO THE AGENT PIPELINE

In `agent.py`, after each step where findings are generated:

```python
from .annotator import annotate_screenshot

# After taking a screenshot and collecting findings for this step:
raw_screenshot = await take_screenshot(page)

# Get findings from this step only
step_findings = [f for f in findings if f.get("evidence_step") == current_step]

if step_findings:
    # Annotate the screenshot with bounding boxes
    annotated_screenshot = await annotate_screenshot(
        raw_screenshot, 
        step_findings,
        page.url
    )
else:
    annotated_screenshot = raw_screenshot

steps.append({
    "step_number": current_step,
    "screenshot_b64": raw_screenshot,           # original for reference
    "annotated_screenshot_b64": annotated_screenshot,  # annotated for report
    ...
})
```

In `crawler.py`, after the initial crawl:

```python
from .annotator import annotate_overview_screenshot

# After crawling and getting axe-core results:
baseline_screenshot = await take_screenshot(page)

# Convert axe violations to finding format for annotation
axe_findings = []
for v in accessibility_results["violations"]:
    axe_findings.append({
        "type": "ux_failure",
        "severity": v["impact"].upper() if v["impact"] in ["critical", "serious"] else "MEDIUM",
        "title": v["description"],
        "detail": f"{v['nodes_count']} elements affected"
    })

# Add performance as a strength if good
if load_time_ms < 1000:
    axe_findings.append({
        "type": "strength",
        "title": "Fast page load",
        "detail": f"{load_time_ms}ms load time"
    })

annotated_overview = await annotate_overview_screenshot(
    baseline_screenshot,
    axe_findings,
    url
)

site_map["baseline_screenshot"] = baseline_screenshot
site_map["annotated_overview"] = annotated_overview
```

### FRONTEND: SHOWING ANNOTATED SCREENSHOTS

In the report, screenshots should toggle between raw and annotated:

```jsx
// In the persona verdict expanded view or top issues section:
const [showAnnotated, setShowAnnotated] = useState(true);

<div className="relative">
  <img 
    src={`data:image/jpeg;base64,${
      showAnnotated ? step.annotated_screenshot_b64 : step.screenshot_b64
    }`}
    alt={`Step ${step.step_number}: ${step.action}`}
    className="w-full rounded"
  />
  <button 
    onClick={() => setShowAnnotated(!showAnnotated)}
    className="absolute top-2 right-2 text-xs px-2 py-1 bg-black/60 text-white rounded"
  >
    {showAnnotated ? "Show original" : "Show annotations"}
  </button>
</div>
```

### API MODEL STRATEGY & RATE LIMITS

One GEMINI_API_KEY from aistudio.google.com works for ALL models. We use two models:

**gemini-3.1-pro-preview** (REPORT ONLY) -- Google's most advanced reasoning model
- Free tier: 5 RPM, 100 RPD
- Used for: the single report generation call (needs max reasoning for calibrated scoring)
- 1 call per test run

**gemini-3-flash-preview** (EVERYTHING ELSE) -- fast, great vision, high throughput
- Free tier: 10 RPM, 250 RPD
- Used for: screenshot annotation (~75 calls), task planning (1 call)
- ~76 calls per test run

**Budget per test run:** 1 Pro call + ~76 Flash calls
**Tests per day on free tier:** ~3 runs (76 x 3 = 228 Flash calls < 250 RPD)
**Rate pacing:** space Flash calls 6+ seconds apart to stay under 10 RPM

If hitting rate limits during demo, reduce annotation to top 3 screenshots per agent instead of all 5. That cuts Flash calls to ~46 per run.

```python
# In your code, add rate limiting:
import asyncio

async def rate_limited_annotate(screenshot_b64, findings, page_url, semaphore):
    """Annotate with rate limiting to stay under 10 RPM."""
    async with semaphore:
        result = await annotate_screenshot(screenshot_b64, findings, page_url)
        await asyncio.sleep(6)  # 10 RPM = 1 every 6 seconds
        return result

# Use with: semaphore = asyncio.Semaphore(1)
```

### WHAT THE ANNOTATED SCREENSHOTS LOOK LIKE

On Apple.com:
- RED box around the Store button labeled "Too small: 1x44px"
- RED boxes around product images labeled "Missing alt text"
- GREEN box around the navigation bar labeled "Clear navigation"
- GREEN box around the hero section labeled "Fast load: 301ms"

On a bad site:
- RED box around a tiny submit button labeled "12x18px, needs 44x44"
- RED box around an unlabeled input labeled "No label or placeholder"
- RED box around low-contrast text labeled "Contrast ratio: 2.1:1"
- YELLOW box around a form labeled "No validation on submit"

This is the demo killer. Judges see a screenshot with clear red/green annotations showing exactly what's wrong and what's right. No one else at the hackathon is doing this.
