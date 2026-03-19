"""trashmy.tech — DSPy modules replacing raw Gemini API calls.

All LLM interactions go through typed DSPy signatures for:
- Structured, validated outputs (no manual JSON parsing)
- Automatic retries on parse failures
- Chain-of-thought reasoning for better accuracy
- Grounded outputs tied to input data
"""

import os
import dspy
import pydantic
from typing import Literal, Optional

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_configured = False

def ensure_configured():
    """Lazy-configure DSPy with Gemini. Called once on first use."""
    global _configured
    if _configured:
        return
    api_key = os.getenv("GEMINI_API_KEY", "")
    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    lm = dspy.LM(
        f"gemini/{model}",
        api_key=api_key,
        max_tokens=4000,
        temperature=0.3,
    )
    dspy.configure(lm=lm, adapter=dspy.JSONAdapter())
    _configured = True


def get_report_lm():
    """Get a higher-token LM for report generation."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    mode = os.getenv("ANALYSIS_MODE", "lite")
    model = "gemini-2.0-flash" if mode == "lite" else os.getenv("GEMINI_MODEL_PRO", "gemini-2.0-flash")
    return dspy.LM(
        f"gemini/{model}",
        api_key=api_key,
        max_tokens=16000,
        temperature=0.2,
    )


# ---------------------------------------------------------------------------
# 1. Brand Keyword Extraction
# ---------------------------------------------------------------------------

class BrandExtractor(dspy.Signature):
    """Extract the brand or company name from a URL. Return only the single most recognizable brand name."""
    url: str = dspy.InputField(desc="Full URL to extract brand from")
    keyword: str = dspy.OutputField(desc="Single brand/company name, max 10 chars, uppercase, no special chars")


_brand_extractor = None

def extract_brand(url: str, fallback: str = "SITE") -> str:
    """Extract brand keyword from URL using DSPy."""
    ensure_configured()
    global _brand_extractor
    if _brand_extractor is None:
        _brand_extractor = dspy.Predict(BrandExtractor)
    try:
        result = _brand_extractor(url=url)
        kw = result.keyword.strip().strip('"\'.,!?:').upper()
        if kw and len(kw) <= 14 and " " not in kw:
            return kw
        return fallback
    except Exception:
        return fallback


# ---------------------------------------------------------------------------
# 2. Site Preview Analysis
# ---------------------------------------------------------------------------

class SitePreview(dspy.Signature):
    """Analyze a website's HTML and provide a structured preview. Be specific and concise. Base all observations on the actual HTML content provided."""
    url: str = dspy.InputField(desc="URL being analyzed")
    page_html: str = dspy.InputField(desc="First 8000 chars of page HTML")

    site_name: str = dspy.OutputField(desc="Name or title of the site")
    description: str = dspy.OutputField(desc="One sentence describing what this site does")
    audience: str = dspy.OutputField(desc="Target audience in one sentence")
    observations: list[str] = dspy.OutputField(desc="Exactly 3 brief UX/accessibility/performance observations grounded in the HTML")


_site_previewer = None

def preview_site(url: str, page_html: str) -> dict:
    """Generate site preview using DSPy."""
    ensure_configured()
    global _site_previewer
    if _site_previewer is None:
        _site_previewer = dspy.ChainOfThought(SitePreview)
    try:
        result = _site_previewer(url=url, page_html=page_html[:8000])
        return {
            "site_name": result.site_name,
            "description": result.description,
            "audience": result.audience,
            "observations": result.observations[:3],
        }
    except Exception as e:
        return {"site_name": url, "description": str(e)[:100], "audience": "unknown", "observations": []}


# ---------------------------------------------------------------------------
# 3. Report Narrative Generation
# ---------------------------------------------------------------------------

class PersonaVerdictModel(pydantic.BaseModel):
    persona_id: str
    name: str
    outcome: Literal["completed", "struggled", "blocked", "not_tested"]
    would_recommend: bool
    trust_level: Literal["high", "medium", "low", "none"]
    narrative: str
    key_quote: str
    emotional_journey: str
    form_verdict: str
    function_verdict: str
    purpose_verdict: str
    primary_barrier: Optional[str] = None
    notable_moments: Optional[str] = None
    issues_encountered: list[str] = []


class TopIssueModel(pydantic.BaseModel):
    title: str
    severity: Literal["critical", "major", "moderate", "minor"]
    category: str
    detail: str
    affected_personas: list[str] = []
    fix: Optional[str] = None


class ReportNarrative(dspy.Signature):
    """Generate a professional website audit report narrative from testing data.

    CRITICAL RULES:
    - Every claim must reference specific data from the test results
    - Quote persona names and their actual experiences
    - Reference specific axe-core violations by ID
    - Reference actual page elements, URLs, and metrics
    - Do NOT invent data not present in the inputs
    - The overall_score is pre-calculated — explain WHY it is what it is, don't recalculate
    """
    test_data: str = dspy.InputField(desc="JSON with crawl data, persona sessions, scores, and external API data")
    overall_score: float = dspy.InputField(desc="Pre-calculated deterministic score (0-100)")
    letter_grade: str = dspy.InputField(desc="Pre-calculated letter grade")

    score_reasoning: str = dspy.OutputField(desc="2-3 sentences explaining WHY the site scored this grade, referencing specific category scores")
    confidence: Literal["high", "moderate", "low"] = dspy.OutputField()
    executive_summary: str = dspy.OutputField(desc="3-4 sentence summary for a busy CEO")

    category_details: dict[str, str] = dspy.OutputField(desc="Dict mapping category name to 2-3 sentences with specific data. Keys: accessibility, seo, performance, security, content, ux")

    form_analysis: str = dspy.OutputField(desc="2-3 paragraphs on visual design, typography, colors, spacing. Quote persona reactions.")
    function_analysis: str = dspy.OutputField(desc="2-3 paragraphs on functionality — links, forms, navigation. Quote persona experiences.")
    purpose_analysis: str = dspy.OutputField(desc="2-3 paragraphs on whether the site achieves its goal. Quote persona verdicts.")

    what_works: list[dict] = dspy.OutputField(desc="List of dicts with 'title', 'detail', 'benefited' (persona names)")
    what_doesnt_work: list[dict] = dspy.OutputField(desc="List of dicts with 'title', 'detail', 'personas_who_suffered' (persona names)")

    persona_verdicts: list[PersonaVerdictModel] = dspy.OutputField()
    top_issues: list[TopIssueModel] = dspy.OutputField(desc="Top 5 issues ordered by severity")

    accessibility_audit: dict = dspy.OutputField(desc="Dict with total_violations, critical, serious, moderate, minor_count, images_missing_alt, details (list of strings)")
    recommendations: list[str] = dspy.OutputField(desc="Top 5 actionable recommendations ordered by impact")


_report_generator = None

def generate_narrative(test_data: str, overall_score: float, letter_grade: str) -> dict:
    """Generate report narrative using DSPy ChainOfThought."""
    ensure_configured()
    global _report_generator
    if _report_generator is None:
        module = dspy.ChainOfThought(ReportNarrative)
        module.set_lm(get_report_lm())
        _report_generator = module

    result = _report_generator(
        test_data=test_data,
        overall_score=overall_score,
        letter_grade=letter_grade,
    )

    return {
        "score_reasoning": result.score_reasoning,
        "confidence": result.confidence,
        "thirty_second_summary": result.executive_summary,
        "category_details": result.category_details,
        "form_analysis": result.form_analysis,
        "function_analysis": result.function_analysis,
        "purpose_analysis": result.purpose_analysis,
        "whats_good": result.what_works,
        "whats_bad": result.what_doesnt_work,
        "persona_verdicts": [v.model_dump() for v in result.persona_verdicts] if isinstance(result.persona_verdicts, list) and result.persona_verdicts and hasattr(result.persona_verdicts[0], 'model_dump') else result.persona_verdicts,
        "top_issues": [i.model_dump() for i in result.top_issues] if isinstance(result.top_issues, list) and result.top_issues and hasattr(result.top_issues[0], 'model_dump') else result.top_issues,
        "accessibility_audit": result.accessibility_audit,
        "recommendations": result.recommendations,
    }


# ---------------------------------------------------------------------------
# 4. Fix Prompt Generation
# ---------------------------------------------------------------------------

class FixPromptGenerator(dspy.Signature):
    """Generate a complete, actionable prompt that a developer can paste into ChatGPT or Claude to get code-level fixes for the website issues found.

    The prompt must:
    - Reference the specific URL
    - List concrete issues with evidence
    - Be organized by priority (critical first)
    - Include the scores and what needs improvement
    - Be ready to copy-paste with no editing needed
    """
    url: str = dspy.InputField()
    score: str = dspy.InputField(desc="Overall score and grade")
    top_issues: str = dspy.InputField(desc="JSON list of top issues")
    recommendations: str = dspy.InputField(desc="JSON list of recommendations")
    accessibility_data: str = dspy.InputField(desc="Accessibility violations summary")

    fix_prompt: str = dspy.OutputField(desc="Complete developer-ready prompt, 500-1500 words")


_fix_generator = None

def generate_fix_prompt(url: str, score: str, top_issues: str, recommendations: str, accessibility_data: str) -> str:
    """Generate fix prompt using DSPy."""
    ensure_configured()
    global _fix_generator
    if _fix_generator is None:
        _fix_generator = dspy.ChainOfThought(FixPromptGenerator)

    try:
        result = _fix_generator(
            url=url,
            score=score,
            top_issues=top_issues,
            recommendations=recommendations,
            accessibility_data=accessibility_data,
        )
        return result.fix_prompt
    except Exception as e:
        return f"Fix prompt generation failed: {e}"


# ---------------------------------------------------------------------------
# 5. Agent Decision Making (replaces raw Gemini in agent loop)
# ---------------------------------------------------------------------------

class AgentDecision(dspy.Signature):
    """You are an AI persona testing a website. Based on the current page state, decide what action to take next.

    Available actions: click, type, scroll, navigate, go_back, press_tab, done, stuck
    - click: click an element (set target to element text/label)
    - type: type into an input (set target to input label, value to text)
    - scroll: scroll the page (set value to 'down' or 'up')
    - navigate: go to a URL (set value to the URL)
    - done: you've completed your testing task
    - stuck: you can't proceed further
    """
    persona_context: str = dspy.InputField(desc="Persona name, description, and testing goals")
    page_state: str = dspy.InputField(desc="Current URL, visible text, and interactive elements")
    step_info: str = dspy.InputField(desc="Current step number and max steps")

    action: Literal["click", "type", "scroll", "navigate", "go_back", "press_tab", "done", "stuck"] = dspy.OutputField()
    target: str = dspy.OutputField(desc="Element to interact with (text, label, or selector)")
    value: str = dspy.OutputField(desc="Value for type/scroll/navigate actions, empty string otherwise")
    reasoning: str = dspy.OutputField(desc="Brief explanation of why this action was chosen")
    finding: Optional[str] = dspy.OutputField(desc="Any UX/accessibility/content issue noticed on this page, or null if none")


_agent_decider = None

def get_agent_decision(persona_context: str, page_state: str, step_info: str) -> dict:
    """Get next agent action using DSPy."""
    ensure_configured()
    global _agent_decider
    if _agent_decider is None:
        _agent_decider = dspy.Predict(AgentDecision)

    result = _agent_decider(
        persona_context=persona_context,
        page_state=page_state,
        step_info=step_info,
    )

    return {
        "action": result.action,
        "target": result.target,
        "value": result.value,
        "reasoning": result.reasoning,
        "finding": result.finding if result.finding else None,
    }


# ---------------------------------------------------------------------------
# 6. Emotional Journey Scoring
# ---------------------------------------------------------------------------

class EmotionalScore(pydantic.BaseModel):
    stage: str  # e.g. "landing", "navigation", "checkout"
    confusion: int  # 1-10
    trust: int  # 1-10
    frustration: int  # 1-10
    delight: int  # 1-10
    intent_to_return: int  # 1-10


class EmotionalJourney(dspy.Signature):
    """Score a persona's emotional journey through a website at each stage of their session.
    Base scores ONLY on the actual session data — what they clicked, where they got stuck, what errors they hit."""
    persona_name: str = dspy.InputField()
    persona_description: str = dspy.InputField()
    session_transcript: str = dspy.InputField(desc="JSON session steps with actions, errors, and outcomes")

    stages: list[EmotionalScore] = dspy.OutputField(desc="Emotional scores at each stage of the journey, ordered chronologically")
    overall_sentiment: str = dspy.OutputField(desc="One sentence summary of the emotional arc")


_emotional_journey_scorer = None

def score_emotional_journey(persona_name: str, persona_description: str, session_transcript: str) -> dict:
    """Score the emotional journey of a persona through their session."""
    ensure_configured()
    global _emotional_journey_scorer
    if _emotional_journey_scorer is None:
        _emotional_journey_scorer = dspy.ChainOfThought(EmotionalJourney)

    try:
        result = _emotional_journey_scorer(
            persona_name=persona_name,
            persona_description=persona_description,
            session_transcript=session_transcript,
        )
        stages = result.stages
        if isinstance(stages, list) and stages and hasattr(stages[0], 'model_dump'):
            stages = [s.model_dump() for s in stages]
        return {
            "stages": stages,
            "overall_sentiment": result.overall_sentiment,
        }
    except Exception as e:
        return {
            "stages": [],
            "overall_sentiment": f"Could not score emotional journey: {str(e)[:100]}",
        }


# ---------------------------------------------------------------------------
# 7. User Voice Panel
# ---------------------------------------------------------------------------

class UserVoice(dspy.Signature):
    """Generate a first-person verbatim response as if this persona just finished testing the site.
    Write in their actual voice — frustrated, confused, delighted, whatever the data shows.
    MUST reference specific things they encountered during their session."""
    persona_name: str = dspy.InputField()
    persona_age: str = dspy.InputField()
    persona_description: str = dspy.InputField()
    session_summary: str = dspy.InputField(desc="What they did, where they got stuck, what worked")
    outcome: str = dspy.InputField(desc="completed, struggled, or blocked")

    verbatim_feedback: str = dspy.OutputField(desc="3-5 sentences in first person. Raw, emotional, specific.")
    one_word_feeling: str = dspy.OutputField(desc="Single word: frustrated, confused, delighted, indifferent, angry, etc.")


_user_voice_generator = None

def generate_user_voice(persona_name: str, persona_age: str, persona_description: str,
                        session_summary: str, outcome: str) -> dict:
    """Generate first-person verbatim feedback for a persona."""
    ensure_configured()
    global _user_voice_generator
    if _user_voice_generator is None:
        _user_voice_generator = dspy.Predict(UserVoice)

    try:
        result = _user_voice_generator(
            persona_name=persona_name,
            persona_age=persona_age,
            persona_description=persona_description,
            session_summary=session_summary,
            outcome=outcome,
        )
        return {
            "verbatim_feedback": result.verbatim_feedback,
            "one_word_feeling": result.one_word_feeling.strip().lower(),
        }
    except Exception as e:
        return {
            "verbatim_feedback": f"Could not generate feedback: {str(e)[:100]}",
            "one_word_feeling": "unknown",
        }


# ---------------------------------------------------------------------------
# 8. The One Thing
# ---------------------------------------------------------------------------

class TheOneThing(dspy.Signature):
    """Synthesize all testing data into a single actionable sentence.
    This is the MOST important takeaway — the one fix that would have the biggest impact.
    Be specific. Reference the actual data."""
    overall_score: float = dspy.InputField()
    top_issues: str = dspy.InputField(desc="JSON top issues from the analysis")
    persona_outcomes: str = dspy.InputField(desc="Summary of how personas performed")
    quick_wins: str = dspy.InputField(desc="JSON quick wins ranked by impact")

    one_thing: str = dspy.OutputField(desc="One bold sentence. No jargon. Specific. Actionable.")


_one_thing_generator = None

def generate_one_thing(overall_score: float, top_issues: str, persona_outcomes: str,
                       quick_wins: str) -> str:
    """Generate the single most important takeaway sentence."""
    ensure_configured()
    global _one_thing_generator
    if _one_thing_generator is None:
        _one_thing_generator = dspy.Predict(TheOneThing)

    try:
        result = _one_thing_generator(
            overall_score=overall_score,
            top_issues=top_issues,
            persona_outcomes=persona_outcomes,
            quick_wins=quick_wins,
        )
        return result.one_thing.strip()
    except Exception as e:
        return f"Could not generate the one thing: {str(e)[:100]}"


# ---------------------------------------------------------------------------
# 9. Workflow Detection
# ---------------------------------------------------------------------------

class WorkflowDetector(dspy.Signature):
    """Analyze a website's structure to determine what type of site it is and what user workflows should be tested.
    Base this ONLY on the actual page data — links, forms, buttons, text content."""
    page_title: str = dspy.InputField()
    page_url: str = dspy.InputField()
    links_summary: str = dspy.InputField(desc="First 50 links found on the page")
    forms_summary: str = dspy.InputField(desc="Forms found on the page")
    buttons_summary: str = dspy.InputField(desc="Buttons found on the page")
    visible_text_snippet: str = dspy.InputField(desc="First 2000 chars of visible text")

    site_type: str = dspy.OutputField(desc="One of: ecommerce, saas, portfolio, blog, news, social, government, education, healthcare, other")
    primary_workflow: str = dspy.OutputField(desc="The main thing users come here to DO, e.g. 'browse products and purchase', 'sign up for free trial', 'read articles'")
    workflow_steps: list[str] = dspy.OutputField(desc="Ordered list of 4-8 steps a user would take to complete the primary workflow, e.g. ['land on homepage', 'search for product', 'view product page', 'add to cart', 'go to checkout', 'enter shipping info', 'enter payment', 'confirm order']")
    secondary_workflows: list[str] = dspy.OutputField(desc="2-3 other important workflows, e.g. ['contact support', 'read reviews', 'compare products']")
    drop_off_risk_points: list[str] = dspy.OutputField(desc="3-5 steps where users are most likely to abandon, e.g. ['checkout page — payment form too complex', 'signup — too many required fields']")


_workflow_detector = None

def detect_workflows(page_title: str, page_url: str, links_summary: str,
                     forms_summary: str, buttons_summary: str,
                     visible_text: str) -> dict:
    """Detect site type and primary workflow using DSPy."""
    ensure_configured()
    global _workflow_detector
    if _workflow_detector is None:
        _workflow_detector = dspy.ChainOfThought(WorkflowDetector)

    try:
        result = _workflow_detector(
            page_title=page_title,
            page_url=page_url,
            links_summary=links_summary,
            forms_summary=forms_summary,
            buttons_summary=buttons_summary,
            visible_text_snippet=visible_text[:2000],
        )
        return {
            "site_type": result.site_type,
            "primary_workflow": result.primary_workflow,
            "workflow_steps": result.workflow_steps,
            "secondary_workflows": result.secondary_workflows,
            "drop_off_risk_points": result.drop_off_risk_points,
        }
    except Exception as e:
        return {
            "site_type": "other",
            "primary_workflow": "browse the site",
            "workflow_steps": ["land on homepage", "explore navigation", "view content", "leave"],
            "secondary_workflows": [],
            "drop_off_risk_points": [f"Could not detect workflows: {str(e)[:100]}"],
        }


# ---------------------------------------------------------------------------
# 10. Funnel Drop-off Analysis
# ---------------------------------------------------------------------------

class FunnelAnalysis(dspy.Signature):
    """Analyze where users drop off in the primary workflow funnel.
    This is the most actionable insight — exactly which step loses the most users and why."""
    site_type: str = dspy.InputField()
    primary_workflow: str = dspy.InputField()
    workflow_steps: str = dspy.InputField(desc="JSON list of expected workflow steps")
    agent_results_summary: str = dspy.InputField(desc="JSON summary of each agent's progress through the workflow")

    funnel_stages: list[dict] = dspy.OutputField(desc="List of dicts, each with 'step', 'attempted' (count), 'completed' (count), 'drop_off_rate' (percent), 'primary_blockers' (list of strings)")
    biggest_drop_off: str = dspy.OutputField(desc="Which step has the highest drop-off and why, in one sentence")
    conversion_estimate: str = dspy.OutputField(desc="What percentage of users would likely complete the full workflow based on the data")


_funnel_analyzer = None

def analyze_funnel(site_type: str, primary_workflow: str,
                   workflow_steps: str, agent_results_summary: str) -> dict:
    """Analyze funnel drop-off across agent results using DSPy."""
    ensure_configured()
    global _funnel_analyzer
    if _funnel_analyzer is None:
        module = dspy.ChainOfThought(FunnelAnalysis)
        module.set_lm(get_report_lm())
        _funnel_analyzer = module

    try:
        result = _funnel_analyzer(
            site_type=site_type,
            primary_workflow=primary_workflow,
            workflow_steps=workflow_steps,
            agent_results_summary=agent_results_summary,
        )
        return {
            "funnel_stages": result.funnel_stages,
            "biggest_drop_off": result.biggest_drop_off,
            "conversion_estimate": result.conversion_estimate,
        }
    except Exception as e:
        return {
            "funnel_stages": [],
            "biggest_drop_off": f"Could not analyze funnel: {str(e)[:100]}",
            "conversion_estimate": "unknown",
        }


# ---------------------------------------------------------------------------
# 11. Consolidated Executive Report
# ---------------------------------------------------------------------------

class ConsolidatedReport(dspy.Signature):
    """Synthesize all analysis data into a tight, consolidated executive report.
    This replaces scattered findings with a single narrative that tells the complete story.
    Write for a founder who has 2 minutes to understand what's wrong with their site."""
    site_type: str = dspy.InputField()
    overall_score: float = dspy.InputField()
    the_one_thing: str = dspy.InputField()
    funnel_analysis: str = dspy.InputField(desc="JSON funnel drop-off data")
    category_scores: str = dspy.InputField(desc="JSON scores per category")
    top_issues: str = dspy.InputField(desc="JSON top issues")
    persona_outcomes_summary: str = dspy.InputField()

    executive_narrative: str = dspy.OutputField(desc="3-4 paragraph narrative telling the complete story: what this site is, who it serves, what's working, what's broken, and exactly what to fix first. Reference specific data.")
    grade_justification: str = dspy.OutputField(desc="2 sentences explaining why this grade, not higher or lower")
    risk_assessment: str = dspy.OutputField(desc="One sentence: what happens if they don't fix the top issue")
    competitive_position: str = dspy.OutputField(desc="One sentence comparing this site's quality to typical sites in its category")


_consolidated_reporter = None

def generate_consolidated_report(site_type: str, overall_score: float,
                                 the_one_thing: str, funnel_analysis: str,
                                 category_scores: str, top_issues: str,
                                 persona_outcomes_summary: str) -> dict:
    """Generate a consolidated executive report using DSPy."""
    ensure_configured()
    global _consolidated_reporter
    if _consolidated_reporter is None:
        module = dspy.ChainOfThought(ConsolidatedReport)
        module.set_lm(get_report_lm())
        _consolidated_reporter = module

    try:
        result = _consolidated_reporter(
            site_type=site_type,
            overall_score=overall_score,
            the_one_thing=the_one_thing,
            funnel_analysis=funnel_analysis,
            category_scores=category_scores,
            top_issues=top_issues,
            persona_outcomes_summary=persona_outcomes_summary,
        )
        return {
            "executive_narrative": result.executive_narrative,
            "grade_justification": result.grade_justification,
            "risk_assessment": result.risk_assessment,
            "competitive_position": result.competitive_position,
        }
    except Exception as e:
        return {
            "executive_narrative": f"Could not generate consolidated report: {str(e)[:100]}",
            "grade_justification": "",
            "risk_assessment": "",
            "competitive_position": "",
        }
