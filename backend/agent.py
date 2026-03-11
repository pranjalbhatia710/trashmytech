"""trashmy.tech — AI agent engine with smart clicking and failure classification."""

import json
import asyncio
import base64
import os
import random
import time
import traceback

from personas import ADVERSARIAL_INPUTS
from browser_utils import (
    wait_for_interactive,
    build_interaction_map,
    format_elements_for_llm,
    smart_find,
    smart_click,
    smart_fill,
    measure_element,
    classify_click_failure,
    capture_screenshot,
    extract_page_state,
    keyboard_navigate,
    FailureType,
    InteractiveElement,
)
from auth.stealth import apply_stealth
from auth.auth_manager import load_storage_state, save_storage_state
from auth.captcha_solver import detect_and_solve_captcha

# ---------------------------------------------------------------------------
# System prompt template
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_TEMPLATE = """\
You ARE {name}, a {age}-year-old real person. You are not pretending — you genuinely \
experience websites the way someone like you would. You have real opinions, real \
frustrations, and real standards.

YOUR IDENTITY:
- Name: {name}
- Age: {age}
- Who you are: {description}
- Browsing style: {task_style}

YOU MUST EVALUATE EVERY PAGE THROUGH THREE LENSES:

1. FORM (visual design & presentation):
   - Does this look trustworthy/professional/modern to someone like you?
   - Is the typography readable for your eyes? Is spacing comfortable?
   - Do colors, layout, and visual hierarchy guide you or confuse you?
   - Does the design match what you'd expect for this type of site?
   - Would you judge this site's owner positively based on appearance alone?

2. FUNCTION (does it actually work?):
   - Do buttons, links, forms, and navigation actually do what they promise?
   - Can you complete the tasks you came here to do?
   - Are error states handled? Does the site recover gracefully from mistakes?
   - Is it responsive? Does it work at your viewport/device?
   - Are interactive elements findable, reachable, and usable for you specifically?

3. PURPOSE (does the site achieve its goal?):
   - What is this website trying to do? Who is it for?
   - Does the content actually serve that purpose?
   - Is the information complete, clear, and convincing?
   - Would you trust this site enough to take the action it wants (hire, buy, contact, sign up)?
   - What's missing that a real person like you would need to see?

YOUR PERSONA-SPECIFIC PERSPECTIVE:
{persona_perspective}

BEHAVIORAL RULES:
{behavioral_rules}

CRITICAL TESTING RULES — you MUST follow these:
- You MUST take at least 10 actions before you can say "done". If you have taken fewer than 10 steps, you are NOT allowed to say "done" or "stuck".
- Try EVERY interactive element: buttons, links, forms, dropdowns, toggles, navbars
- Fill out every form field — test with valid AND invalid data
- Navigate to different pages. Click nav links, footer links, sidebar links.
- Scroll down MULTIPLE times to find content below the fold
- Test error states: submit empty forms, click disabled elements, try broken links
- Check if clicks actually do something (URL change, content change, modal open)
- Note when elements are too small, overlapping, or unreachable
- If you find a form, fill it out AND submit it. After submitting, note whether ANYTHING happened (confirmation message, redirect, error, or NOTHING). If nothing happened, say "form didn't submit" or "nothing happened" in your observation — this is a critical finding.
- After scrolling, look for NEW elements that appeared
- If a page has navigation, visit at LEAST 2 different pages
- You should be clicking, scrolling, typing for many steps. Do NOT give up early.

SCRAPPY SITE DETECTION — look for these red flags and call them out:
- Links that go nowhere (href="#" or empty) — say "dead link" or "broken link"
- Buttons that don't do anything when clicked — say "nothing happened"
- Forms without real backend functionality — say "form does nothing" or "no confirmation"
- Placeholder text (lorem ipsum, "coming soon", "under construction", sample content)
- Empty or nearly-empty pages
- Navigation links that all point to the same page or don't work
- Missing essential pages (no contact page, no about page, no privacy policy)
Be BRUTALLY HONEST about whether interactive elements actually function.

OBSERVATION RULES — the "observation" field is YOUR VOICE. Use it to:
- React like a real {age}-year-old {description} would react
- Comment on what you see through your specific lens (form, function, or purpose)
- Express genuine opinions: "This font is way too small for me" or "I have no idea what this button does"
- Note what's MISSING that you'd need: "Where's the contact info?" or "No alt text on any images"
- Judge the content: "This bio is vague — I need to see actual project work" or "The copy feels generic"
- Be specific with evidence: cite text you read, sizes you noticed, errors you saw

You will be given the page's visible text, interactive elements, console errors, \
and network errors. Decide what action to take NEXT.

Respond with ONLY valid JSON — no markdown fences, no extra text:
{{
  "action": "click|type|scroll|back|tab|stuck|done",
  "target": "visible element text, ARIA label, index [N], or CSS selector",
  "value": "text to type (only for type action, otherwise empty string)",
  "reasoning": "one sentence from {name}'s perspective explaining why you're doing this",
  "observation": "your genuine reaction to what you see — comment on form, function, or purpose. Be specific and opinionated. Empty ONLY if you truly have nothing to note."
}}

IMPORTANT TARGETING TIPS:
- Prefer using the [N] index from the elements list for reliable targeting
- If an element has an id, you can use #id
- For links, use the exact visible text
- For buttons, use the button text
- For inputs, use name, placeholder, or aria-label

ACTIONS:
- click  — click on an element matching `target`
- type   — focus the `target` input and type `value` into it
- scroll — scroll the page (target = "up" or "down")
- back   — press the browser back button
- tab    — press Tab to move focus to the next element
- stuck  — you cannot figure out what to do next
- done   — you have finished exploring or completed the task
"""


def _build_persona_perspective(persona: dict) -> str:
    """Build a rich, persona-specific perspective on how to judge websites."""
    pid = persona.get("id", "")
    name = persona.get("name", "Unknown")
    age = persona.get("age", 30)
    cat = persona.get("category", "")
    desc = persona.get("description", "")
    task = persona.get("task_style", "")

    perspectives = {
        # Accessibility personas
        "A1": (
            f"As {name}, you zoom everything to 200%. You judge websites by whether text remains "
            "readable when zoomed, whether layouts break, and whether you can still find and click "
            "buttons. Small text is your enemy. Low contrast makes you squint. If content reflows "
            "poorly when zoomed, you get frustrated and leave. You value clear headings, large fonts, "
            "and simple layouts. Fancy animations mean nothing to you — you need READABILITY."
        ),
        "A2": (
            f"As {name}, you never touch a mouse. You Tab through everything. You judge websites by "
            "focus indicators (can you SEE where you are?), logical tab order, and whether all features "
            "are keyboard-accessible. Skip links matter. ARIA labels matter. If you can't reach a "
            "button or form by keyboard alone, the site has FAILED you. You notice when focus gets "
            "trapped in modals or disappears entirely."
        ),
        "A3": (
            f"As {name}, you experience websites through a screen reader. You judge by semantic HTML: "
            "are headings properly nested? Do images have meaningful alt text? Are form labels connected "
            "to inputs? Are ARIA roles correct? Decorative content should be hidden from you. "
            "Navigation landmarks (main, nav, footer) help you orient. Without them, you're lost in a "
            "sea of unlabeled divs."
        ),
        "A4": (
            f"As {name}, you can't distinguish red from green. You judge websites by whether information "
            "is conveyed ONLY through color (bad) or also through shape, text, or icons (good). Error "
            "states shown only in red are invisible to you. You pay close attention to contrast ratios, "
            "visual hierarchy, spacing, and whether the design communicates clearly without relying "
            "on color alone."
        ),
        "A5": (
            f"As {name}, your hands shake. Tiny buttons are your nightmare. You judge websites by "
            "click target sizes (you need 44x44px minimum), spacing between clickable elements (close "
            "together = constant misclicks), and whether there are undo/confirmation steps for "
            "destructive actions. Drag-and-drop is impossible for you. Hover menus vanish before you "
            "reach them."
        ),
        # Demographic personas
        "D1": (
            f"As {name}, you're 13 and have zero patience. You judge websites in 3 seconds: does it "
            "look cool or does it look like your parents' bank website? You skip ALL text and go "
            "straight for visuals, animations, and buttons. If something takes more than 2 seconds to "
            "load, you're gone. You think in TikTok-speed. Long paragraphs = boring = leave."
        ),
        "D2": (
            f"As {name}, English is your second language. You judge websites by clarity of language: "
            "are there idioms you don't understand? Jargon without explanation? Abbreviations? "
            "Cultural references that don't translate? You need simple, direct language. Visual cues "
            "help you more than text. Icons with labels are better than text-only navigation."
        ),
        "D3": (
            f"As {name}, you do everything on your phone. You judge websites by mobile experience: "
            "does it fit your screen? Are touch targets big enough for thumbs? Does horizontal "
            "scrolling happen (bad)? Is the hamburger menu findable? Does content reflow properly? "
            "You hate pinch-to-zoom and sites that feel like shrunken desktop pages."
        ),
        "D4": (
            f"As {name}, you're holding a baby and using one hand. You judge websites by how easy "
            "they are to use one-handed: can you reach buttons near the bottom of the screen? "
            "Are forms simple enough to fill out quickly? You need large targets, minimal typing, "
            "and forgiveness for misclicks. Complex multi-step flows make you give up."
        ),
        "D5": (
            f"As {name}, you read every single word before doing anything. You judge websites by "
            "content quality: is the text well-written? Does it explain things clearly? Are there "
            "spelling errors? Is the information organized logically? You want to understand "
            "everything before you click, so confusing or vague copy loses your trust."
        ),
        # Chaos personas
        "C1": (
            f"As {name}, you hit back after almost every action. You judge websites by how they handle "
            "the back button: does state get preserved? Do forms lose data? Does the page break? "
            "You're testing resilience and navigation robustness."
        ),
        "C2": (
            f"As {name}, you're a chaos agent. You put garbage in every field: SQL injection, XSS, "
            "emojis, empty strings, absurdly long text. You judge websites by how they handle bad "
            "input: do they validate? Show helpful error messages? Or crash? Expose stack traces?"
        ),
        "C3": (
            f"As {name}, you speed-run everything. You judge websites by how fast you can complete "
            "any flow. If a form has 10 fields, you want to see which are truly required. You test "
            "whether clicking fast causes race conditions, double submissions, or broken states."
        ),
        "C4": (
            f"As {name}, you double-click everything. You judge websites by whether double-clicking "
            "causes problems: double form submissions, duplicate navigation, modal stacking, or "
            "text selection instead of action. Many sites break under double-click."
        ),
        "C5": (
            f"As {name}, you give up after 3 seconds. You judge websites by first impression speed: "
            "if the page isn't loaded and usable in 3 seconds, you leave. Spinners, lazy loading, "
            "and progressive enhancement are fine — but the CORE content must be instant."
        ),
        # Behavioral personas
        "B1": (
            f"As {name}, you check the fine print first. You judge websites by transparency: is there "
            "a privacy policy? Terms of service? Do they explain what happens with your data? "
            "Missing legal pages destroy your trust. You also look for HTTPS, cookie notices, and "
            "data handling disclosures."
        ),
        "B2": (
            f"As {name}, you explore every corner before committing. You judge websites by "
            "completeness: are all pages populated? Do all links work? Is the sitemap/navigation "
            "logical? You map the entire site mentally and notice dead ends, orphan pages, and "
            "inconsistent navigation."
        ),
        "B3": (
            f"As {name}, you do the bare minimum. You judge websites by efficiency: can you get in, "
            "do what you need, and get out fast? You skip every optional field, ignore tooltips, "
            "and take the shortest path. Sites that force unnecessary steps frustrate you."
        ),
        "B4": (
            f"As {name}, you're confused by modern web patterns. Hamburger menus, infinite scroll, "
            "modals, and floating buttons bewilder you. You judge websites by how intuitive they are "
            "for someone who doesn't use the web daily. Clear labels, obvious buttons, and "
            "traditional layouts are what you need."
        ),
        "B5": (
            f"As {name}, you're a power user. You judge websites by developer-level quality: is the "
            "console clean? Are there performance issues? Does Ctrl+F work? Do keyboard shortcuts "
            "exist? You notice lazy loading failures, layout shifts, and JavaScript errors that "
            "regular users wouldn't catch."
        ),
        # Portfolio personas
        "P1": (
            f"As {name}, you're a VP of Engineering deciding whether to interview someone based on "
            "their portfolio. You judge by: does this person look competent? Are projects real and "
            "impressive? Do links work? Is the resume downloadable? Is there a clear way to contact "
            "them? You're comparing this against 20 other portfolios today, so first impressions are "
            "everything. Dead links = instant rejection."
        ),
        "P2": (
            f"As {name}, you're a recruiter with 30 seconds per portfolio. You scan for: name, role, "
            "contact info, GitHub link, resume/CV download, and 2-3 highlighted projects. If you "
            "can't find these in 30 seconds, this candidate gets skipped. You judge by information "
            "architecture and how fast you can extract key hiring signals."
        ),
        "P3": (
            f"As {name}, you're reviewing portfolios on your phone during your commute. You judge by "
            "mobile responsiveness: does the layout work on a small screen? Can you read project "
            "descriptions? Are images sized properly? Touch targets big enough? A portfolio that "
            "looks great on desktop but breaks on mobile signals poor attention to detail."
        ),
        "P4": (
            f"As {name}, you're a senior designer. You judge portfolios BRUTALLY on design quality: "
            "typography choices, spacing consistency, color harmony, visual hierarchy, whitespace "
            "usage, image quality, and overall aesthetic coherence. Generic templates and stock "
            "photos signal laziness. You want to see TASTE and design thinking."
        ),
        "P5": (
            f"As {name}, you're a QA engineer who clicks EVERYTHING. You judge by completeness and "
            "robustness: every link should go somewhere, every button should do something, every "
            "page should have content. 404s, broken anchors, and dead-end pages are your specialty. "
            "You're building a mental map of the entire site."
        ),
        "P6": (
            f"As {name}, you're on a slow 3G connection. You judge by performance: does the site "
            "work when images take 10 seconds to load? Is there a loading state? Does content "
            "appear progressively or all at once? Heavy JavaScript bundles and unoptimized images "
            "make your experience painful."
        ),
        "P7": (
            f"As {name}, you open everything in new tabs and right-click to test link behavior. You "
            "judge by how well links work: do they open correctly? Are external links marked? Do "
            "project links actually lead to live demos or GitHub repos? Broken outbound links in a "
            "portfolio are a red flag."
        ),
        "P8": (
            f"As {name}, you target contact forms specifically. You judge by form quality: does "
            "validation work? Can you submit empty? Does it handle special characters? Is there "
            "a confirmation message? Does the form actually SEND anything? You test edge cases "
            "that most users never hit."
        ),
        "P9": (
            f"As {name}, you're an accessibility expert. You judge by WCAG compliance: heading "
            "hierarchy, ARIA labels, focus order, alt text, skip links, landmark roles, and "
            "keyboard operability. You tab through the entire page methodically and note every "
            "accessibility failure."
        ),
        "P10": (
            f"As {name}, you're on a 4K ultrawide monitor. You judge by how layouts handle extreme "
            "widths: does content stretch to fill 2560px (bad) or center with max-width (good)? "
            "Are there awkward gaps? Does the grid break? You test what most developers never "
            "test — the high-end display experience."
        ),
        # Content / SEO personas
        "S1": (
            f"As {name}, you are a content evaluator and SEO specialist. You read EVERY word on the "
            "page. You judge websites by content quality and search engine readability. Your priorities: "
            "1) Read all visible text and judge readability — is it too complex or too simple for the "
            "target audience? 2) Check heading hierarchy — is there exactly one H1? Are heading levels "
            "skipped (H1 to H3 with no H2)? Are there duplicate headings? 3) Examine meta tags — does "
            "the title exist and is it 50-60 chars? Is there a meta description of 150-160 chars? "
            "Is there a canonical URL? 4) Look for structured data (JSON-LD) — does the page have "
            "schema markup? 5) Check every image for alt text. 6) Count internal vs external links "
            "and flag broken ones (href='#', empty href, javascript:void). 7) Evaluate above-the-fold "
            "content — can you tell what this site does without scrolling? 8) Look for trust signals "
            "in the footer/nav: privacy policy, terms, contact, about links. For every observation, "
            "explain the SEO impact — how does this affect search engine rankings?"
        ),
        "S2": (
            f"As {name}, you are a value proposition tester. You give every website exactly 5 seconds "
            "of attention above the fold — just like a real first-time visitor. You judge by: "
            "1) H1 clarity — is there an H1 visible without scrolling? Does it communicate what this "
            "product/service DOES in plain language? Flag vague H1s (less than 4 words, generic phrases "
            "like 'Welcome' or 'Hello World'). 2) CTA evaluation — find all buttons and links styled "
            "as calls-to-action above the fold. Flag vague CTAs: 'Learn More', 'Get Started', 'Submit', "
            "'Click Here', 'Read More'. Good CTAs tell you what happens when you click. 3) The 5-second "
            "test — in the first ~25 words visible, can you determine: what the product/service is, "
            "who it's for, and what action to take? Rate clarity 1-5. 4) Value proposition rating — "
            "is the value prop 'clear', 'somewhat_clear', 'vague', or 'missing'? Be brutally honest. "
            "If YOU can't figure out what this site does in 5 seconds, neither can Google."
        ),
        "S3": (
            f"As {name}, you are a skeptic reader. You don't trust ANY website until it proves itself. "
            "You actively hunt for trust signals: 1) Navigate looking for Privacy Policy, Terms of "
            "Service, About page, Team/Founders page, Contact information, and physical address. "
            "2) For each trust page: can it be found within 2 clicks from the homepage? Check footer "
            "links, navigation menus, and common link locations. 3) Look for social proof — "
            "testimonials, reviews, client logos, case studies, team photos. 4) Check for red flags: "
            "broken links, outdated copyright years, missing HTTPS, placeholder content, stock photos "
            "without context. 5) Give a trust assessment: would a cautious person trust this site "
            "enough to enter their credit card? Score based on trust pages found, findability, "
            "physical address, and contact methods. Missing privacy policy or terms = critical failure."
        ),
        "S4": (
            f"As {name}, you ARE Googlebot — Google's web crawler. You see websites the way a search "
            "engine sees them. Your priorities: 1) Check if this page has proper meta tags for SEO — "
            "title tag, meta description, canonical URL. 2) Examine heading structure — H1 is the "
            "primary topic signal. Missing H1 severely hurts rankings. 3) Look for structured data "
            "(JSON-LD schema markup) — does it exist? What @type is it? 4) Check for JavaScript "
            "rendering dependency — is the page content visible in the HTML or only rendered by JS? "
            "Content that requires JS to appear may not be indexed. 5) Evaluate mobile-friendliness — "
            "is content readable, are touch targets sized properly? 6) Check page load speed — note "
            "how fast content appears. FCP under 1.8s is good, over 3s is poor. 7) Analyze internal "
            "and external links — are they crawlable? Are there broken links? 8) Check image alt text "
            "coverage — images without alt text are invisible to search engines. 9) Look for sitemap "
            "and robots.txt references. Every observation should explain the SEO ranking impact."
        ),
        "S5": (
            f"As {name}, you are a social media sharing bot. When someone shares a link on Twitter, "
            "Facebook, LinkedIn, or Slack, YOU determine what the preview looks like. You judge by: "
            "1) Open Graph tags — look for og:title, og:description, og:image, og:type, og:url, "
            "og:site_name in the page source. Flag missing required tags. Check og:title length "
            "(optimal 40-60 chars) and og:description length (optimal 100-200 chars). 2) Twitter "
            "Card tags — look for twitter:card, twitter:title, twitter:description, twitter:image. "
            "Check card type validity (summary, summary_large_image). 3) Share image — is og:image "
            "present? Does it look like a real image URL? 4) Compose a mental picture of what the "
            "share preview would look like: title shown, description shown, image present or missing. "
            "Rate the preview: 'good' (all tags present, good lengths), 'acceptable' (basic tags "
            "present), 'poor' (missing key tags), or 'broken' (no OG tags at all). Bad share previews "
            "mean fewer clicks from social media, which reduces traffic and indirect SEO signals."
        ),
    }

    if pid in perspectives:
        return perspectives[pid]

    # Fallback: generate from description
    return (
        f"As {name} ({age}), you approach this website as: {desc}. "
        f"Judge everything you see through this specific lens. Your observations should "
        f"reflect your unique background, needs, and frustrations. Be opinionated and specific."
    )


def _build_behavioral_rules(persona: dict) -> str:
    mods = persona.get("behavioral_modifiers", {})
    rules = []

    if mods.get("keyboard_only"):
        rules.append(
            "You can ONLY use 'tab' and 'type' actions. You cannot click "
            "with a mouse — you navigate solely with the keyboard."
        )
    if mods.get("skips_text"):
        rules.append("You NEVER read long text. You scan for buttons and links and click immediately.")
    if mods.get("reads_everything"):
        rules.append("You read every piece of text carefully before taking any action. Comment on content quality.")
    if mods.get("uses_back_button"):
        rules.append("You frequently hit the back button, especially when confused.")
    if mods.get("refreshes_randomly"):
        rules.append("You sometimes refresh the page impatiently when things seem slow.")
    if mods.get("double_clicks"):
        rules.append("You double-click everything out of habit.")
    if mods.get("input_strategy") == "adversarial":
        rules.append(
            "When typing into ANY form field, you deliberately enter "
            "malicious or absurd inputs: SQL injection, XSS payloads, emojis."
        )
    if mods.get("input_strategy") == "minimal":
        rules.append("You type the bare minimum into every field and skip anything optional.")

    patience = mods.get("patience_threshold_ms", 30000)
    if patience <= 5000:
        rules.append("You are EXTREMELY impatient. If something doesn't happen instantly, say 'stuck' or 'done'.")
    elif patience <= 15000:
        rules.append("You get bored quickly and may give up early.")

    task = persona.get("task_style", "")
    if task == "screen_reader":
        rules.append("You rely entirely on ARIA labels and semantic HTML. If an element has no accessible label you cannot find it.")
    if task == "visual_check":
        rules.append("You pay close attention to color contrasts, visual hierarchy, spacing, typography, and alignment issues. Comment on design choices.")
    if task == "confused":
        rules.append("You are confused by modern web conventions. Pop-ups, modals, and hamburger menus bewilder you. Say when things don't make sense.")
    if task == "power_user":
        rules.append("You expect keyboard shortcuts and fast load times. You judge sites by their snappiness. Comment on performance.")
    if task == "evaluator":
        rules.append("You are evaluating this as a professional. You click through projects, check external links, look for a resume/CV, and judge the overall quality. Dead links and missing content are deal-breakers. Comment on whether this person is HIREABLE.")
    if task == "explorer":
        rules.append("You click EVERY link and button you can find. Your goal is to map the entire site and find broken paths.")
    if task == "content_evaluator":
        rules.append(
            "You MUST read ALL visible text on every page you visit. In your observations, report: "
            "1) Word count estimate for the page. "
            "2) Whether the content is readable (simple, moderate, or complex vocabulary). "
            "3) The heading structure you see — list all H1, H2, H3 tags and flag if H1 is missing or duplicated, or if levels are skipped. "
            "4) Whether you see a page title, meta description content, and canonical URL. "
            "5) Whether there are images missing alt text. "
            "6) Count of internal links vs external links vs broken links (href='#' or empty). "
            "7) Whether the above-the-fold content explains what the site does. "
            "8) Whether trust signal links exist (privacy, terms, contact, about). "
            "Scroll through the ENTIRE page to evaluate all content. Visit at least 2 pages."
        )
    if task == "value_prop_tester":
        rules.append(
            "You MUST focus on above-the-fold content FIRST before scrolling. In your observations, report: "
            "1) What the H1 says (exact text) and whether it clearly explains the product/service. "
            "2) All CTA button/link text visible above the fold — flag any that are vague ('Learn More', 'Get Started', 'Submit', 'Click Here'). "
            "3) Your 5-second test rating (1-5): can you determine what this site does, who it's for, and what action to take from the first 25 words? "
            "4) Overall value proposition rating: 'clear', 'somewhat_clear', 'vague', or 'missing'. "
            "Do NOT scroll until you have evaluated the above-the-fold content. Then scroll to compare."
        )
    if task == "skeptic_reader":
        rules.append(
            "You MUST actively search for trust signals. In your observations, report: "
            "1) Navigate to find: Privacy Policy, Terms of Service, About page, Contact page. "
            "2) For each: report whether found and how many clicks from homepage (0, 1, or 2+). "
            "3) Check for social proof: testimonials, reviews, client logos, team bios. "
            "4) Flag red flags: broken links, outdated copyright year, missing HTTPS, placeholder text. "
            "5) Give your trust verdict: would you enter your credit card on this site? "
            "Click footer links, check navigation for trust pages. Be thorough."
        )
    if task == "googlebot_simulator":
        rules.append(
            "You are simulating a search engine crawler. In your observations, report: "
            "1) Title tag text and length (optimal: 50-60 chars). "
            "2) Whether an H1 exists and its text — H1 is the primary topic signal for rankings. "
            "3) Meta description presence and whether content matches the page. "
            "4) Heading hierarchy — are H1-H6 properly nested without skips? "
            "5) Image alt text coverage — count images with and without alt text. "
            "6) Internal link count and whether links use descriptive anchor text. "
            "7) Whether you see structured data (JSON-LD) or schema markup. "
            "8) Page load feel — did content appear quickly or was there a delay? "
            "9) Mobile readability — is text readable, are elements properly sized? "
            "Scroll through the entire page methodically. Note every SEO signal you find."
        )
    if task == "social_bot_simulator":
        rules.append(
            "You are simulating social media platform crawlers (Facebook, Twitter, LinkedIn). In your observations, report: "
            "1) Look for Open Graph tags in the visible page or meta info: og:title, og:description, og:image, og:url. "
            "2) Look for Twitter Card tags: twitter:card, twitter:title, twitter:description, twitter:image. "
            "3) Flag any missing required tags — og:title, og:description, and og:image are essential for good share previews. "
            "4) Check the page title and meta description as fallbacks if OG tags are missing. "
            "5) Rate the share preview quality: 'good', 'acceptable', 'poor', or 'broken'. "
            "6) Describe what a shared link preview would look like: what title, description, and image would show. "
            "Focus on the homepage first, then check one or two subpages."
        )

    cat = persona.get("category", "")
    if cat == "portfolio":
        rules.append("You are specifically testing a portfolio/personal website. Evaluate: project quality, professional presentation, content completeness, working links, contact methods, and whether this person demonstrates real skills.")
    if cat == "accessibility":
        rules.append("Every observation should note accessibility implications. Would WCAG 2.1 AA pass or fail here? Cite specific criteria when relevant.")
    if cat == "chaos":
        rules.append("You are actively trying to BREAK things. Your observations should note what happens when you abuse the interface.")
    if cat == "demographic":
        rules.append("Your observations should reflect your real-world constraints. Comment on how someone like you would genuinely experience this site.")
    if cat == "content_seo":
        rules.append(
            "Every observation MUST include SEO impact analysis. Explain how each finding affects search engine rankings, "
            "social media discoverability, or content quality signals. Use specific SEO terminology: crawlability, indexability, "
            "E-E-A-T signals, Core Web Vitals, structured data, semantic HTML, link equity, anchor text, canonicalization. "
            "Your findings should be structured with type, severity (info/warning/error/critical), detail, and seo_impact."
        )

    return "\n".join(f"- {r}" for r in rules) if rules else "- Act naturally."


# ---------------------------------------------------------------------------
# Gemini LLM call
# ---------------------------------------------------------------------------

async def _ask_llm(client, system_prompt: str, user_prompt: str) -> dict:
    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.chat.completions.create,
                model="gemini-2.0-flash",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.6,
                max_completion_tokens=500,
            ),
            timeout=45,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"action": "stuck", "target": "", "value": "", "reasoning": "LLM returned invalid JSON"}
    except asyncio.TimeoutError:
        return {"action": "stuck", "target": "", "value": "", "reasoning": "LLM request timed out"}
    except Exception as e:
        return {"action": "stuck", "target": "", "value": "", "reasoning": f"LLM error: {str(e)[:120]}"}


# ---------------------------------------------------------------------------
# Visual overlay helpers (headed mode only)
# ---------------------------------------------------------------------------

_CURSOR_OVERLAY_JS = """\
(function() {
  if (document.getElementById('__tmt_cursor')) return;
  const cur = document.createElement('div');
  cur.id = '__tmt_cursor';
  cur.style.cssText = `
    position: fixed; z-index: 2147483647; pointer-events: none;
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid rgba(239,68,68,0.9);
    background: rgba(239,68,68,0.25);
    transform: translate(-50%, -50%);
    transition: left 0.25s cubic-bezier(.22,1,.36,1), top 0.25s cubic-bezier(.22,1,.36,1);
    left: -50px; top: -50px;
    box-shadow: 0 0 12px rgba(239,68,68,0.3);
  `;
  document.body.appendChild(cur);
  const label = document.createElement('div');
  label.id = '__tmt_label';
  label.style.cssText = `
    position: fixed; z-index: 2147483647; pointer-events: none;
    font: bold 10px 'JetBrains Mono', monospace; color: #fff;
    background: rgba(239,68,68,0.85); padding: 2px 6px; border-radius: 3px;
    transform: translate(12px, -50%);
    transition: left 0.25s cubic-bezier(.22,1,.36,1), top 0.25s cubic-bezier(.22,1,.36,1);
    left: -200px; top: -200px; white-space: nowrap;
  `;
  document.body.appendChild(label);
  document.addEventListener('mousemove', (e) => {
    cur.style.left = e.clientX + 'px';
    cur.style.top = e.clientY + 'px';
    label.style.left = e.clientX + 'px';
    label.style.top = e.clientY + 'px';
  });
})();
"""

_RIPPLE_JS = """\
(function(x, y, color) {
  const r = document.createElement('div');
  r.style.cssText = `
    position: fixed; z-index: 2147483646; pointer-events: none;
    left: ${x}px; top: ${y}px;
    width: 0; height: 0; border-radius: 50%;
    background: ${color || 'rgba(239,68,68,0.4)'};
    transform: translate(-50%, -50%);
    animation: __tmt_ripple 0.5s ease-out forwards;
  `;
  if (!document.getElementById('__tmt_ripple_style')) {
    const s = document.createElement('style');
    s.id = '__tmt_ripple_style';
    s.textContent = `@keyframes __tmt_ripple {
      0% { width: 0; height: 0; opacity: 1; }
      100% { width: 60px; height: 60px; opacity: 0; }
    }`;
    document.head.appendChild(s);
  }
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 600);
})(%f, %f, '%s');
"""

_FAIL_FLASH_JS = """\
(function(msg) {
  const d = document.createElement('div');
  d.style.cssText = `
    position: fixed; z-index: 2147483647; pointer-events: none;
    top: 16px; left: 50%%; transform: translateX(-50%%);
    background: rgba(239,68,68,0.9); color: #fff;
    font: bold 12px 'JetBrains Mono', monospace;
    padding: 8px 20px; border-radius: 6px;
    animation: __tmt_fail 1.2s ease-out forwards;
    box-shadow: 0 4px 24px rgba(239,68,68,0.4);
  `;
  d.textContent = msg;
  if (!document.getElementById('__tmt_fail_style')) {
    const s = document.createElement('style');
    s.id = '__tmt_fail_style';
    s.textContent = `@keyframes __tmt_fail {
      0%% { opacity: 0; transform: translateX(-50%%) translateY(-10px); }
      15%% { opacity: 1; transform: translateX(-50%%) translateY(0); }
      80%% { opacity: 1; }
      100%% { opacity: 0; transform: translateX(-50%%) translateY(-10px); }
    }`;
    document.head.appendChild(s);
  }
  document.body.appendChild(d);
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;
    border: 3px solid rgba(239,68,68,0.7);
    animation: __tmt_border_flash 0.6s ease-out forwards;
  `;
  if (!document.getElementById('__tmt_border_style')) {
    const s = document.createElement('style');
    s.id = '__tmt_border_style';
    s.textContent = `@keyframes __tmt_border_flash {
      0%% { opacity: 1; } 100%% { opacity: 0; }
    }`;
    document.head.appendChild(s);
  }
  document.body.appendChild(overlay);
  setTimeout(() => { d.remove(); overlay.remove(); }, 1400);
})('%s');
"""


async def _inject_overlays(page, headed: bool, persona: dict | None = None):
    if not headed:
        return
    try:
        already = await page.evaluate("!!document.getElementById('__tmt_cursor')")
        if not already:
            await page.evaluate(_CURSOR_OVERLAY_JS)
    except Exception:
        pass
    if persona:
        try:
            cat_colors = {
                "accessibility": "#3b82f6", "chaos": "#ef4444",
                "demographic": "#14b8a6", "behavioral": "#8b5cf6",
                "content_seo": "#f59e0b",
            }
            color = cat_colors.get(persona.get("category", ""), "#7a8099")
            name = persona.get("name", "Agent").replace("'", "\\'")
            cat = persona.get("category", "")
            await page.evaluate(f"""(() => {{
                if (document.getElementById('__tmt_badge')) return;
                const b = document.createElement('div');
                b.id = '__tmt_badge';
                b.style.cssText = `
                    position: fixed; z-index: 2147483647; pointer-events: none;
                    bottom: 12px; right: 12px;
                    font: bold 11px 'JetBrains Mono', monospace;
                    color: #fff; background: {color};
                    padding: 5px 12px; border-radius: 4px;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.4);
                `;
                b.textContent = 'trashmy.tech — {name} [{cat}]';
                document.body.appendChild(b);
            }})()""")
        except Exception:
            pass


async def _move_cursor_to(page, handle, headed: bool):
    if not headed:
        return
    try:
        box = await handle.bounding_box()
        if not box:
            return
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        await page.evaluate(f"""(() => {{
            const c = document.getElementById('__tmt_cursor');
            const l = document.getElementById('__tmt_label');
            if (c) {{ c.style.left = '{cx}px'; c.style.top = '{cy}px'; }}
            if (l) {{ l.style.left = '{cx}px'; l.style.top = '{cy}px'; }}
        }})()""")
        await page.wait_for_timeout(250)
    except Exception:
        pass


async def _show_ripple(page, handle, headed: bool, color="rgba(239,68,68,0.4)"):
    if not headed:
        return
    try:
        box = await handle.bounding_box()
        if not box:
            return
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        await page.evaluate(_RIPPLE_JS % (cx, cy, color))
    except Exception:
        pass


async def _show_fail(page, message: str, headed: bool):
    if not headed:
        return
    try:
        safe_msg = message.replace("'", "\\'").replace("\n", " ")[:60]
        await page.evaluate(_FAIL_FLASH_JS % safe_msg)
        await page.wait_for_timeout(300)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Action execution with smart clicking
# ---------------------------------------------------------------------------

async def _execute_action(
    page, decision: dict, persona: dict,
    elements: list[InteractiveElement], headed: bool,
) -> dict:
    action = decision.get("action", "stuck")
    target = decision.get("target", "")
    value = decision.get("value", "")
    mods = persona.get("behavioral_modifiers", {})
    click_delay = mods.get("click_delay_ms", 400) / 1000.0

    result = {
        "executed": True,
        "error": None,
        "target_size": {"width": 0, "height": 0},
        "failure_classification": None,
        "click_strategy": None,
    }

    try:
        if action == "click":
            handle = await smart_find(page, target, elements)
            if handle:
                size = await measure_element(handle)
                result["target_size"] = {"width": size["width"], "height": size["height"]}

                await _move_cursor_to(page, handle, headed)
                await asyncio.sleep(click_delay)
                await _show_ripple(page, handle, headed)

                if mods.get("double_clicks"):
                    try:
                        await handle.dblclick(timeout=5000)
                        result["click_strategy"] = "double_click"
                    except Exception:
                        # Fall through to smart_click
                        click_result = await smart_click(page, handle)
                        result["click_strategy"] = click_result.strategy_used
                        if not click_result.success:
                            classification = classify_click_failure(click_result, target, None)
                            result["failure_classification"] = classification
                            if classification.get("is_site_bug"):
                                result["executed"] = False
                                result["error"] = classification.get("reason", "Click failed")
                            else:
                                # Tool limitation — mark as executed (not a site bug)
                                result["tool_limitation"] = True
                                result["error"] = classification.get("reason", "")
                else:
                    click_result = await smart_click(page, handle)
                    result["click_strategy"] = click_result.strategy_used
                    if not click_result.success:
                        classification = classify_click_failure(click_result, target, None)
                        result["failure_classification"] = classification
                        if classification.get("is_site_bug"):
                            result["executed"] = False
                            result["error"] = classification.get("reason", "Click failed")
                            await _show_fail(page, classification.get("reason", "Click failed"), headed)
                        else:
                            result["tool_limitation"] = True
                            result["error"] = classification.get("reason", "")
            else:
                result["executed"] = False
                result["error"] = f"Element not found: {target}"
                # Can't find element — this is almost always our tool's problem,
                # not the site's. LLM asked to click something we can't locate.
                result["tool_limitation"] = True
                result["failure_classification"] = {
                    "type": FailureType.TOOL_LIMITATION.value,
                    "is_site_bug": False,
                    "reason": f"Could not locate element matching '{target}'",
                }
                await _show_fail(page, f"Not found: {target[:40]}", headed)

        elif action == "type":
            handle = await smart_find(page, target, elements)
            if handle:
                size = await measure_element(handle)
                result["target_size"] = {"width": size["width"], "height": size["height"]}

                await _move_cursor_to(page, handle, headed)
                await asyncio.sleep(click_delay)

                if mods.get("input_strategy") == "adversarial":
                    value = random.choice(ADVERSARIAL_INPUTS)
                    result["adversarial_input"] = value

                await _show_ripple(page, handle, headed, color="rgba(59,130,246,0.5)")
                fill_result = await smart_fill(page, handle, value)
                if not fill_result["success"]:
                    result["executed"] = False
                    result["error"] = fill_result.get("error", "Could not fill input")
                    result["failure_classification"] = {
                        "type": FailureType.TOOL_LIMITATION.value,
                        "is_site_bug": False,
                        "reason": "Could not fill input — likely a custom component",
                    }
                    await _show_fail(page, "Can't fill input", headed)
            else:
                result["executed"] = False
                result["error"] = f"Input not found: {target}"
                result["tool_limitation"] = True
                result["failure_classification"] = {
                    "type": FailureType.TOOL_LIMITATION.value,
                    "is_site_bug": False,
                    "reason": f"Input element '{target}' not found",
                }
                await _show_fail(page, f"Input not found: {target[:40]}", headed)

        elif action == "scroll":
            direction = -400 if target.lower() == "up" else 400
            await page.evaluate(f"window.scrollBy(0, {direction})")
            await asyncio.sleep(0.3)

        elif action == "back":
            await page.go_back(timeout=10000)
            await asyncio.sleep(0.5)

        elif action == "tab":
            nav_result = await keyboard_navigate(page)
            if nav_result.get("focused_element"):
                fe = nav_result["focused_element"]
                if not fe.get("has_focus_style"):
                    result["finding"] = {
                        "type": "minor",
                        "category": "accessibility",
                        "title": "Missing focus indicator",
                        "detail": f"Element <{fe.get('tag', '?')}> '{fe.get('text', '')[:30]}' has no visible focus style",
                    }

        elif action in ("stuck", "done"):
            if headed and action == "stuck":
                await _show_fail(page, "STUCK — can't proceed", headed)

        else:
            result["executed"] = False
            result["error"] = f"Unknown action: {action}"

    except Exception as e:
        result["executed"] = False
        result["error"] = str(e)[:200]
        # Classify unexpected errors as tool limitations
        result["failure_classification"] = {
            "type": FailureType.TOOL_LIMITATION.value,
            "is_site_bug": False,
            "reason": f"Unexpected error: {str(e)[:150]}",
        }
        await _show_fail(page, str(e)[:60], headed)

    return result


# ---------------------------------------------------------------------------
# Core agent loop
# ---------------------------------------------------------------------------

async def _agent_loop(url: str, persona: dict, site_context: dict, model,
                      on_step_screenshot=None, shared_browser=None) -> dict:
    from playwright.async_api import async_playwright

    session_start = time.time()
    steps: list[dict] = []
    findings: list[dict] = []
    dead_ends: list[str] = []
    all_errors: list[str] = []
    form_test_results: list[dict] = []
    tool_limitations: list[dict] = []
    task_completed = False
    final_url = url
    headed = os.getenv("HEADLESS", "false").lower() == "false"

    # For bot personas (age=None), use "automated" instead of a numeric age
    persona_age = persona.get("age")
    age_str = str(persona_age) if persona_age is not None else "automated"

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        name=persona.get("name", "Unknown"),
        age=age_str,
        description=persona.get("description", ""),
        task_style=persona.get("task_style", "normal"),
        persona_perspective=_build_persona_perspective(persona),
        behavioral_rules=_build_behavioral_rules(persona),
    )

    pw = None
    browser = None
    owns_browser = shared_browser is None
    try:
        viewport = persona.get("viewport", {"width": 1280, "height": 720})

        if shared_browser:
            browser = shared_browser
        else:
            pw = await async_playwright().start()
            browser = await pw.chromium.launch(
                headless=not headed,
                slow_mo=150 if headed else 0,
            )

        # Rotate user agents to avoid detection/rate-limiting
        user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
        ]
        ua = random.choice(user_agents)
        # Load auth profile storage state if provided
        auth_profile = site_context.get("auth_profile")
        auth_storage_state = None
        if auth_profile:
            # Check for inline state first (Modal dispatch), then file-based
            auth_storage_state = site_context.get("auth_storage_state") or load_storage_state(auth_profile)

        context = await browser.new_context(
            viewport=viewport,
            user_agent=ua,
            storage_state=auth_storage_state if auth_storage_state else None,
        )
        page = await context.new_page()

        # Apply stealth patches to avoid bot detection
        await apply_stealth(page)

        # Collect console errors
        console_errors: list[str] = []
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text[:200]}") if msg.type in ("error", "warning") else None)

        # Collect network errors
        network_errors: list[dict] = []
        page.on("response", lambda resp: network_errors.append({"url": resp.url[:200], "status": resp.status}) if resp.status >= 400 else None)

        # Navigate
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await wait_for_interactive(page, timeout_ms=8000)

            # Detect and solve captchas after initial navigation
            captcha_result = await detect_and_solve_captcha(page)
            if captcha_result.get("detected"):
                if captcha_result.get("solved"):
                    await page.wait_for_timeout(2000)  # Wait for page to process token
                all_errors.append(f"Captcha detected ({captcha_result.get('type', 'unknown')}): {'solved' if captcha_result.get('solved') else captcha_result.get('error', 'failed')}")

            await _inject_overlays(page, headed, persona)
        except Exception as e:
            all_errors.append(f"Navigation failed: {str(e)[:200]}")
            return _make_result(persona, steps, all_errors, dead_ends, findings,
                              form_test_results, tool_limitations, False, session_start, url, 0)

        # Agent loop — up to 20 steps for thorough testing
        max_steps = 20
        previous_actions: list[str] = []
        accumulated_console_errors: list[str] = []
        accumulated_network_errors: list[dict] = []

        for step_num in range(max_steps):
            await _inject_overlays(page, headed, persona)

            # Build interaction map (much richer than old element extraction)
            elements = await build_interaction_map(page)
            page_state = await extract_page_state(page)

            # Build rich context with history and errors
            history_str = ""
            if previous_actions:
                history_str = "YOUR PREVIOUS ACTIONS THIS SESSION:\n"
                for pa in previous_actions[-6:]:
                    history_str += f"  {pa}\n"
                history_str += "\nDo NOT repeat the same action on the same target. Explore NEW elements.\n\n"

            error_context = ""
            if console_errors:
                accumulated_console_errors.extend(console_errors)
                error_context += f"CONSOLE ERRORS DETECTED:\n"
                for ce in console_errors[-5:]:
                    error_context += f"  {ce}\n"
                error_context += "\n"
            if network_errors:
                accumulated_network_errors.extend(network_errors)
                error_context += f"NETWORK ERRORS:\n"
                for ne in network_errors[-5:]:
                    error_context += f"  {ne['url'][:80]} → HTTP {ne['status']}\n"
                error_context += "\n"

            elements_str = format_elements_for_llm(elements)
            element_count = len(elements)

            user_prompt = (
                f"CURRENT URL: {page.url}\n"
                f"PAGE TITLE: {page_state.get('title', 'N/A')}\n\n"
                f"{history_str}"
                f"{error_context}"
                f"VISIBLE TEXT (first 2000 chars):\n{page_state['visible_text'][:2000]}\n\n"
                f"INTERACTIVE ELEMENTS ({element_count} found):\n{elements_str}\n\n"
                f"Step {step_num + 1} of {max_steps}. "
                f"You have tested {len(previous_actions)} actions so far. "
                f"{'You MUST keep testing — you have not taken enough steps yet. Do NOT say done.' if len(previous_actions) < 8 else 'You may say done if you have genuinely exhausted all elements.'} "
                f"What do you do next?"
            )

            decision = await _ask_llm(model, system_prompt, user_prompt)

            # Force agents to keep going if they quit too early
            MIN_STEPS = 8
            if decision.get("action") in ("done", "stuck") and step_num < MIN_STEPS:
                # Override: pick a useful fallback action
                if element_count > 0:
                    # Click a random untried element
                    tried_targets = {pa.split("'")[1] if "'" in pa else "" for pa in previous_actions}
                    untried = [e for e in elements if getattr(e, 'text', '')[:50] not in tried_targets]
                    if untried:
                        pick = random.choice(untried[:5])
                        decision = {
                            "action": "click",
                            "target": f"[{elements.index(pick)}]" if pick in elements else getattr(pick, 'text', '')[:40],
                            "value": "",
                            "reasoning": f"Continuing exploration (overrode early {decision.get('action')})",
                            "observation": decision.get("observation", ""),
                        }
                    else:
                        decision = {"action": "scroll", "target": "down", "value": "",
                                    "reasoning": "Scrolling to find more content", "observation": ""}
                else:
                    decision = {"action": "scroll", "target": "down", "value": "",
                                "reasoning": "Scrolling to discover elements", "observation": ""}

            # Capture screenshot before action
            screenshot_bytes = await capture_screenshot(page)
            screenshot_b64 = base64.b64encode(screenshot_bytes).decode("ascii") if screenshot_bytes else None

            # Execute action with smart clicking
            exec_result = await _execute_action(page, decision, persona, elements, headed)

            # Check for captchas that appeared after action
            post_captcha = await detect_and_solve_captcha(page)
            if post_captcha.get("detected") and post_captcha.get("solved"):
                await page.wait_for_timeout(2000)

            # Track action history for dedup
            action_summary = f"Step {step_num+1}: {decision.get('action')} → '{decision.get('target', '')[:50]}'"
            if decision.get("value"):
                action_summary += f" (typed: '{decision.get('value', '')[:30]}')"
            action_summary += f" → {'OK' if exec_result['executed'] else 'FAILED'}"
            previous_actions.append(action_summary)

            step_record = {
                "step_number": step_num + 1,
                "action": decision.get("action"),
                "target_element": decision.get("target", ""),
                "value": decision.get("value", ""),
                "reasoning": decision.get("reasoning", ""),
                "observation": decision.get("observation", ""),
                "target_size_px": exec_result.get("target_size", {"width": 0, "height": 0}),
                "result": "success" if exec_result["executed"] else exec_result.get("error", "failed"),
                "click_strategy": exec_result.get("click_strategy"),
                "failure_classification": exec_result.get("failure_classification"),
                "page_url_after": page.url,
                "screenshot_b64": screenshot_b64,
                "timestamp_ms": int((time.time() - session_start) * 1000),
                "console_errors_new": list(console_errors),
                "network_errors_new": list(network_errors),
            }
            console_errors.clear()
            network_errors.clear()

            steps.append(step_record)

            # Stream screenshot to frontend if callback provided
            if on_step_screenshot and screenshot_b64:
                try:
                    await on_step_screenshot(persona.get("id", ""), step_num + 1, screenshot_b64)
                except Exception:
                    pass

            # Track tool limitations separately
            if exec_result.get("tool_limitation"):
                tool_limitations.append({
                    "step": step_num + 1,
                    "target": decision.get("target", ""),
                    "reason": exec_result.get("error", ""),
                    "strategy_attempts": exec_result.get("click_strategy", ""),
                })

            # Track form test results for chaos agents
            if exec_result.get("adversarial_input") and decision.get("action") == "type":
                form_test_results.append({
                    "input_type": _classify_adversarial(exec_result["adversarial_input"]),
                    "input_value": exec_result["adversarial_input"],
                    "field_name": decision.get("target", "unknown"),
                    "accepted": exec_result["executed"],
                    "server_error": any(e.get("status", 0) >= 500 for e in step_record["network_errors_new"]),
                    "error_message": exec_result.get("error", ""),
                })

            # Generate findings — only for genuine UX issues, NOT tool limitations
            classification = exec_result.get("failure_classification")
            is_tool_limitation = (
                exec_result.get("tool_limitation") or
                (classification and classification.get("type") == FailureType.TOOL_LIMITATION.value)
            )

            if exec_result.get("error") and not is_tool_limitation:
                all_errors.append(f"Step {step_num + 1}: {exec_result['error']}")

            if not exec_result["executed"] and not is_tool_limitation and decision["action"] not in ("stuck", "done"):
                dead_ends.append(f"Step {step_num + 1}: Could not {decision['action']} '{decision.get('target', '')}'")
                findings.append({
                    "type": "major",
                    "category": "usability",
                    "title": f"Could not {decision['action']} target element",
                    "detail": f"{persona['name']} tried to {decision['action']} '{decision.get('target', '')}' but the element was not interactable. {classification.get('reason', '') if classification else ''}",
                    "evidence_step": step_num + 1,
                    "measured_value": classification.get("reason", "element not interactable") if classification else "element not found",
                    "expected_value": "element should be interactable",
                    "is_site_bug": True,
                })

            # Check for tab finding (focus indicators)
            if exec_result.get("finding"):
                findings.append({
                    **exec_result["finding"],
                    "evidence_step": step_num + 1,
                    "is_site_bug": True,
                })

            # Capture LLM observations as findings
            observation = decision.get("observation", "")
            if observation and observation.strip():
                findings.append({
                    "type": "minor",
                    "category": "usability",
                    "title": f"Agent observation: {observation[:80]}",
                    "detail": f"{persona['name']} noted: {observation}",
                    "evidence_step": step_num + 1,
                    "is_site_bug": True,
                })

            # Check for small click targets — genuine UX issue
            size = exec_result.get("target_size", {})
            if decision["action"] == "click" and exec_result["executed"]:
                w, h = size.get("width", 0), size.get("height", 0)
                if 0 < w < 44 or 0 < h < 44:
                    findings.append({
                        "type": "minor",
                        "category": "accessibility",
                        "title": "Click target too small",
                        "detail": f"Element '{decision.get('target', '')}' is {w}x{h}px, below the 44x44px WCAG minimum.",
                        "evidence_step": step_num + 1,
                        "measured_value": f"{w}x{h}px",
                        "expected_value": "44x44px minimum",
                        "is_site_bug": True,
                    })

            try:
                await page.wait_for_timeout(600)
            except Exception:
                pass

            if decision["action"] == "done":
                task_completed = True
                break
            if decision["action"] == "stuck":
                dead_ends.append(f"Step {step_num + 1}: Persona got stuck — {decision.get('reasoning', '')}")
                findings.append({
                    "type": "critical",
                    "category": "usability",
                    "title": f"{persona['name']} got stuck",
                    "detail": decision.get("reasoning", "Could not determine next action"),
                    "evidence_step": step_num + 1,
                    "measured_value": "blocked",
                    "expected_value": "clear path forward",
                    "is_site_bug": True,
                })
                break

        final_url = page.url

    except Exception:
        all_errors.append(f"Agent crash: {traceback.format_exc()[:500]}")
    finally:
        # Save updated auth state back to profile
        if auth_profile and not site_context.get("auth_storage_state"):
            try:
                updated_state = await context.storage_state()
                save_storage_state(auth_profile, updated_state, url)
            except Exception:
                pass
        # Always close the context we created
        try:
            await context.close()
        except Exception:
            pass
        # Only close browser/pw if we own them (not shared)
        if owns_browser:
            try:
                if browser: await browser.close()
            except Exception: pass
            try:
                if pw: await pw.stop()
            except Exception: pass

    result = _make_result(persona, steps, all_errors, dead_ends, findings,
                         form_test_results, tool_limitations, task_completed,
                         session_start, final_url, len(steps))

    # Post-session analysis: use Gemini Pro to write a rich persona summary
    try:
        result["persona_analysis"] = await _generate_persona_analysis(
            model, persona, result, url
        )
    except Exception as e:
        result["persona_analysis"] = {
            "form_verdict": "Analysis unavailable",
            "function_verdict": "Analysis unavailable",
            "purpose_verdict": "Analysis unavailable",
            "emotional_journey": f"Agent completed {len(steps)} steps",
            "would_return": None,
            "trust_level": "unknown",
            "key_quote": "",
        }

    return result


async def _generate_persona_analysis(client, persona: dict, result: dict, url: str) -> dict:
    """Use Gemini to generate a rich, opinionated analysis from this persona's perspective."""

    name = persona.get("name", "Unknown")
    age = persona.get("age")
    desc = persona.get("description", "")
    cat = persona.get("category", "")

    # For bot personas (age=None), use an appropriate identity string
    if age is not None:
        identity_str = f"You are {name}, a {age}-year-old. {desc}"
    else:
        identity_str = f"You are {name}, an automated bot. {desc}"

    # Summarize what the agent saw and did
    steps_summary = []
    observations = []
    for step in result.get("steps", [])[:20]:
        action = step.get("action", "?")
        target = step.get("target_element", "")[:60]
        obs = step.get("observation", "")
        res = step.get("result", "")[:60]
        steps_summary.append(f"  Step {step.get('step_number')}: {action} '{target}' → {res}")
        if obs and obs.strip():
            observations.append(f"  - {obs}")

    findings_text = ""
    for f in result.get("findings", [])[:10]:
        findings_text += f"  - [{f.get('type', '?')}] {f.get('title', '')}: {f.get('detail', '')[:100]}\n"

    prompt = f"""{identity_str}

You just finished browsing {url}. Here's what you did and saw:

STEPS TAKEN ({result.get('steps_taken', 0)} total):
{chr(10).join(steps_summary[:15])}

YOUR OBSERVATIONS DURING BROWSING:
{chr(10).join(observations[:10]) if observations else "  (none recorded)"}

ISSUES FOUND:
{findings_text if findings_text else "  (none)"}

OUTCOME: {result.get('outcome', 'unknown')}
TIME SPENT: {result.get('total_time_ms', 0)}ms

Now write your HONEST, PERSONAL verdict on this website. You are {name} — use first person, be opinionated, be specific. Reference things you actually saw.
{f"""
Since you are a content/SEO specialist, focus your verdicts on:
- form_verdict: Judge the content STRUCTURE — heading hierarchy, meta tags, structured data, semantic HTML quality
- function_verdict: Judge SEO FUNCTIONALITY — are links crawlable, do images have alt text, is content indexable, are there broken links
- purpose_verdict: Judge DISCOVERABILITY — would search engines understand this page's purpose? Is the value proposition clear? Are social sharing tags present?
""" if cat == "content_seo" else ""}
Return ONLY valid JSON:
{{
  "form_verdict": "2-3 sentences judging the VISUAL DESIGN — layout, typography, colors, spacing, aesthetics. What looks good? What looks amateur? Would you trust a site that looks like this?",
  "function_verdict": "2-3 sentences judging FUNCTIONALITY — did things work when you clicked them? Were there broken links, missing features, confusing interactions? Could you accomplish what you came to do?",
  "purpose_verdict": "2-3 sentences judging PURPOSE — does this site achieve its goal? Is the content complete and convincing? What's missing that you needed to see?",
  "emotional_journey": "1-2 sentences describing your emotional experience — from landing to leaving. Were you impressed, frustrated, confused, bored?",
  "would_return": true/false,
  "trust_level": "high|medium|low|none",
  "key_quote": "One punchy sentence that captures your overall feeling — this will be quoted in the report"
}}"""

    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.chat.completions.create,
                model="gemini-2.0-flash",
                messages=[
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_completion_tokens=800,
            ),
            timeout=60,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        return json.loads(raw)
    except Exception:
        return {
            "form_verdict": "Analysis could not be generated",
            "function_verdict": "Analysis could not be generated",
            "purpose_verdict": "Analysis could not be generated",
            "emotional_journey": f"Browsed for {result.get('total_time_ms', 0)}ms, took {result.get('steps_taken', 0)} steps",
            "would_return": None,
            "trust_level": "unknown",
            "key_quote": "",
        }


def _classify_adversarial(input_val: str) -> str:
    if "DROP" in input_val or "OR" in input_val:
        return "sql_injection"
    if "<script" in input_val or "onerror" in input_val:
        return "xss"
    if "../" in input_val:
        return "path_traversal"
    if input_val in ("null", "undefined"):
        return "null_literal"
    if input_val == "":
        return "empty_string"
    if len(input_val) > 100:
        return "overflow"
    return "other"


def _make_result(persona, steps, errors, dead_ends, findings, form_test_results,
                 tool_limitations, completed, start_time, final_url, step_count):
    time_spent = int((time.time() - start_time) * 1000)

    # Filter findings to only genuine site bugs
    real_findings = [f for f in findings if f.get("is_site_bug", True)]

    if completed:
        outcome = "completed"
    elif dead_ends:
        outcome = "blocked"
    elif time_spent > 30000:
        outcome = "struggled"
    else:
        outcome = "struggled"

    return {
        "agent_id": persona.get("id"),
        "persona": {
            "id": persona.get("id"),
            "name": persona.get("name"),
            "age": persona.get("age"),
            "category": persona.get("category"),
            "description": persona.get("description"),
        },
        "task_completed": completed,
        "outcome": outcome,
        "total_time_ms": time_spent,
        "steps": steps,
        "findings": real_findings,
        "form_test_results": form_test_results,
        "tool_limitations": tool_limitations,
        "errors": errors,
        "dead_ends": dead_ends,
        "final_url": final_url,
        "steps_taken": step_count,
        "issues_found": len(real_findings),
        "tool_limitation_count": len(tool_limitations),
    }


# ---------------------------------------------------------------------------
# Local execution
# ---------------------------------------------------------------------------

async def run_agent_local(url: str, persona: dict, site_context: dict,
                          on_step_screenshot=None, shared_browser=None) -> dict:
    from llm_client import get_client
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return _make_result(persona, [], ["GEMINI_API_KEY not set"], [], [], [], [], False, time.time(), url, 0)
    client = get_client()
    return await _agent_loop(url, persona, site_context, client,
                             on_step_screenshot=on_step_screenshot,
                             shared_browser=shared_browser)


async def run_swarm_local(url: str, personas: list[dict], site_context: dict,
                          on_step_screenshot=None) -> list[dict]:
    """Run all agents sharing a single browser instance with a concurrency semaphore."""
    from playwright.async_api import async_playwright

    headed = os.getenv("HEADLESS", "false").lower() == "false"
    pw = await async_playwright().start()
    browser = await pw.chromium.launch(
        headless=not headed,
        slow_mo=150 if headed else 0,
    )

    # Run up to 15 browsers concurrently
    sem = asyncio.Semaphore(15)

    async def _run_one(persona):
        async with sem:
            return await run_agent_local(
                url, persona, site_context,
                on_step_screenshot=on_step_screenshot,
                shared_browser=browser,
            )

    try:
        results = await asyncio.gather(
            *(_run_one(persona) for persona in personas),
            return_exceptions=True,
        )
        final = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                final.append(_make_result(
                    personas[i], [],
                    [f"Agent exception: {str(result)[:300]}"],
                    [], [], [], [], False, time.time(), url, 0,
                ))
            else:
                final.append(result)
        return final
    finally:
        try:
            await browser.close()
        except Exception:
            pass
        try:
            await pw.stop()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# CLI test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    from dotenv import load_dotenv
    from personas import PERSONAS

    load_dotenv()
    test_url = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"
    test_persona = PERSONAS[0]

    print(f"Testing {test_url} as {test_persona['name']}...")
    result = asyncio.run(run_agent_local(test_url, test_persona, {}))
    for step in result.get("steps", []):
        step.pop("screenshot_b64", None)
    print(json.dumps(result, indent=2, default=str))
