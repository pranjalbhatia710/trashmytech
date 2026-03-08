"""
annotator.py — Annotate screenshots with Gemini vision bounding boxes

Uses Gemini vision to mark:
- RED boxes: Elements with problems (too small, missing labels, broken)
- GREEN boxes: Elements that work well (good contrast, proper size, accessible)
- YELLOW boxes: Warnings

Model returns coordinates normalized to 0-1000. We convert to pixels and
draw with Pillow.
"""

import os
import json
import asyncio
import base64
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

from llm_client import get_client, MODEL_FAST

ANNOTATION_MODEL = MODEL_FAST

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
- Max 8 annotations per screenshot to keep it readable
- If you can't locate an element mentioned in findings, skip it

Return ONLY a JSON array. No markdown. No explanation.

Example output:
[
  {"box_2d": [120, 340, 160, 520], "label": "Button too small: 28x20px", "type": "problem"},
  {"box_2d": [50, 100, 90, 400], "label": "Clear navigation", "type": "good"},
  {"box_2d": [200, 50, 350, 300], "label": "Image missing alt text", "type": "problem"}
]"""

COLORS = {
    "problem": {
        "box": (239, 68, 68),
        "fill": (239, 68, 68, 50),
        "text_bg": (220, 38, 38, 230),
        "text": (255, 255, 255),
    },
    "good": {
        "box": (34, 197, 94),
        "fill": (34, 197, 94, 40),
        "text_bg": (22, 163, 74, 230),
        "text": (255, 255, 255),
    },
    "warning": {
        "box": (234, 179, 8),
        "fill": (234, 179, 8, 45),
        "text_bg": (202, 138, 4, 230),
        "text": (255, 255, 255),
    },
}

# Rate limiting semaphore (10 RPM = 1 every 6s)
_annotation_semaphore = asyncio.Semaphore(1)


def _get_client():
    return get_client()


def _load_font(size: int):
    """Try to load a bold font at the given size, falling back gracefully."""
    paths = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _draw_annotations(img: Image.Image, annotations: list[dict]) -> Image.Image:
    """Draw thick, visible bounding boxes and labels on an image."""
    draw = ImageDraw.Draw(img, "RGBA")
    width, height = img.size

    # Scale font/border to image size — bigger images get bigger annotations
    scale = max(width, height) / 1000
    border_width = max(3, int(3 * scale))
    font_size = max(14, int(14 * scale))
    label_pad = max(5, int(5 * scale))
    corner_len = max(12, int(16 * scale))

    font = _load_font(font_size)

    for ann in annotations:
        try:
            box = ann["box_2d"]
            label = ann.get("label", "")
            ann_type = ann.get("type", "problem")
            colors = COLORS.get(ann_type, COLORS["problem"])

            # Convert 0-1000 normalized coords to pixels
            y_min = int(box[0] / 1000 * height)
            x_min = int(box[1] / 1000 * width)
            y_max = int(box[2] / 1000 * height)
            x_max = int(box[3] / 1000 * width)

            # Clamp
            x_min = max(0, min(x_min, width - 1))
            x_max = max(x_min + 1, min(x_max, width))
            y_min = max(0, min(y_min, height - 1))
            y_max = max(y_min + 1, min(y_max, height))

            # Semi-transparent fill
            draw.rectangle([x_min, y_min, x_max, y_max], fill=colors["fill"])

            # Thick border
            for i in range(border_width):
                draw.rectangle(
                    [x_min - i, y_min - i, x_max + i, y_max + i],
                    outline=colors["box"],
                )

            # Corner brackets for extra visibility
            bw = border_width
            c = colors["box"]
            # Top-left
            draw.line([(x_min - bw, y_min - bw), (x_min - bw + corner_len, y_min - bw)], fill=c, width=bw + 1)
            draw.line([(x_min - bw, y_min - bw), (x_min - bw, y_min - bw + corner_len)], fill=c, width=bw + 1)
            # Top-right
            draw.line([(x_max + bw - corner_len, y_min - bw), (x_max + bw, y_min - bw)], fill=c, width=bw + 1)
            draw.line([(x_max + bw, y_min - bw), (x_max + bw, y_min - bw + corner_len)], fill=c, width=bw + 1)
            # Bottom-left
            draw.line([(x_min - bw, y_max + bw), (x_min - bw + corner_len, y_max + bw)], fill=c, width=bw + 1)
            draw.line([(x_min - bw, y_max + bw - corner_len), (x_min - bw, y_max + bw)], fill=c, width=bw + 1)
            # Bottom-right
            draw.line([(x_max + bw - corner_len, y_max + bw), (x_max + bw, y_max + bw)], fill=c, width=bw + 1)
            draw.line([(x_max + bw, y_max + bw - corner_len), (x_max + bw, y_max + bw)], fill=c, width=bw + 1)

            # Label with pill-shaped background
            if label:
                text_bbox = draw.textbbox((0, 0), label, font=font)
                text_w = text_bbox[2] - text_bbox[0]
                text_h = text_bbox[3] - text_bbox[1]

                label_y = y_min - text_h - label_pad * 2 - bw - 2
                if label_y < 0:
                    label_y = y_max + bw + 2
                label_x = x_min

                # Pill shape with rounded corners
                pill_rect = [
                    label_x,
                    label_y,
                    label_x + text_w + label_pad * 2,
                    label_y + text_h + label_pad * 2,
                ]
                radius = min(6, (text_h + label_pad * 2) // 2)
                draw.rounded_rectangle(pill_rect, radius=radius, fill=colors["text_bg"])

                draw.text(
                    (label_x + label_pad, label_y + label_pad),
                    label,
                    fill=colors["text"],
                    font=font,
                )

        except (KeyError, IndexError, ValueError):
            continue

    return img


async def annotate_screenshot(
    screenshot_b64: str,
    findings: list[dict],
    page_url: str = "",
) -> str:
    """
    Send screenshot + findings to Gemini, get bounding boxes,
    draw them, return annotated image as base64.
    """
    # Filter to real findings only
    real_findings = [
        f for f in findings
        if f.get("type") != "tool_limitation"
        and f.get("is_site_bug", True)
    ]

    if not real_findings:
        return screenshot_b64

    img_bytes = base64.b64decode(screenshot_b64)
    img = Image.open(BytesIO(img_bytes))

    findings_text = "\n".join([
        f"- [{f.get('type', 'issue')}] {f.get('title', '')}: {f.get('detail', f.get('description', ''))}"
        for f in real_findings[:8]
    ])

    async with _annotation_semaphore:
        try:
            client = _get_client()
            img_b64_url = f"data:image/jpeg;base64,{screenshot_b64}"
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=ANNOTATION_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"{ANNOTATION_PROMPT}\n\nPage: {page_url}\n\nFindings:\n{findings_text}",
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": img_b64_url, "detail": "high"},
                            },
                        ],
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
                max_completion_tokens=1500,
            )

            raw = response.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1]
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()

            parsed = json.loads(raw)
            # Handle both {"annotations": [...]} and bare [...]
            annotations = parsed if isinstance(parsed, list) else parsed.get("annotations", [])
            if not isinstance(annotations, list):
                return screenshot_b64

            # Rate limit
            await asyncio.sleep(2)

        except Exception as e:
            print(f"Annotation failed: {e}")
            return screenshot_b64

    # Draw annotations
    annotated = _draw_annotations(img, annotations)

    buf = BytesIO()
    annotated.save(buf, format="JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode()


async def annotate_overview_screenshot(
    screenshot_b64: str,
    all_findings: list[dict],
    page_url: str = "",
) -> str:
    """
    Create a hero annotated screenshot for the top of the report.
    Shows top 3 problems + top 2 strengths.
    """
    severity_order = {"CRITICAL": 0, "critical": 0, "HIGH": 1, "major": 1,
                      "MEDIUM": 2, "moderate": 2, "LOW": 3, "minor": 3}

    problems = sorted(
        [f for f in all_findings if f.get("is_site_bug", True) and f.get("type") != "tool_limitation"],
        key=lambda f: severity_order.get(f.get("severity", f.get("type", "LOW")), 4),
    )[:4]

    strengths = [f for f in all_findings if f.get("type") == "strength"][:2]

    combined = problems + strengths
    if not combined:
        return screenshot_b64

    return await annotate_screenshot(screenshot_b64, combined, page_url)
