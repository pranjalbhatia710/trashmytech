#!/usr/bin/env python3
"""
Gemini URL Context and Google Search Tools
===========================================

A single-file toolkit for agents and scripts to interact with Gemini's two
most powerful grounding tools:

  1. URL Context Tool  — fetch and analyze the live content of any web page
  2. Google Search Tool — run real-time Google searches and synthesize results
  3. Combined usage    — use both together for deep research and fact-checking

All methods return JSON-formatted strings. Parse them with json.loads() to get
a Python dict you can work with programmatically.

---------------------------------------------------------------------------
QUICK START FOR AGENTS
---------------------------------------------------------------------------

  from gemini_tools import GeminiTools
  import json

  # Step 1 — Create an instance (reads GEMINI_API_KEY from environment)
  tools = GeminiTools()

  # Step 2 — Call any method and parse the JSON response
  raw = tools.search("latest breakthroughs in fusion energy")
  data = json.loads(raw)

  # Step 3 — Use the result
  print(data)

---------------------------------------------------------------------------
SETUP
---------------------------------------------------------------------------

  pip install google-genai

  export GEMINI_API_KEY=your_api_key_here

  # Or pass the key directly:
  tools = GeminiTools(api_key="your_key_here")

---------------------------------------------------------------------------
MODEL CHOICE
---------------------------------------------------------------------------

  Two models are available:
    "pro"   → gemini-3-pro-preview   (default, slower but more capable)
    "flash" → gemini-3-flash-preview (faster, good for simpler tasks)

  tools = GeminiTools(model="flash")   # use the faster model

---------------------------------------------------------------------------
FULL METHOD REFERENCE
---------------------------------------------------------------------------

  URL CONTEXT (reads live web pages):
    analyze_url(url, question)                → answer a question about a page
    summarize_url(url)                        → summarize a page
    extract_data_from_url(url, prompt)        → pull structured data from a page
    compare_urls(urls_list, aspect)           → compare two or more pages

  GOOGLE SEARCH (real-time web search):
    search(query, additional_instructions)    → general web search
    research_topic(topic, depth)              → in-depth topic research
    fact_check(claim)                         → verify a claim with sources
    find_latest_news(topic, timeframe)        → recent news on a topic

  COMBINED (search + URL together):
    deep_research(topic, specific_urls)       → comprehensive research report
    url_with_context_search(url, query)       → analyze URL + search for context
    verify_url_claims(url)                    → cross-check a page's claims
    compare_search_vs_url(topic, url)         → web consensus vs. one source

---------------------------------------------------------------------------
"""

import os
import json
import argparse
from typing import Optional

from google import genai
from google.genai import types


class GeminiTools:
    """
    Wrapper around Gemini's URL Context and Google Search grounding tools.

    Every public method sends a prompt to Gemini with the appropriate tool(s)
    enabled and returns the model's response as a JSON string.

    Usage:
        tools = GeminiTools()                        # uses GEMINI_API_KEY env var
        tools = GeminiTools(api_key="sk-...")        # explicit key
        tools = GeminiTools(model="flash")           # faster model

    All responses are JSON strings. Use json.loads(result) to parse them.
    """

    # Available model aliases — pass "pro" or "flash" to __init__
    MODELS = {
        "pro": "gemini-3-pro-preview",    # more capable, slower
        "flash": "gemini-3-flash-preview", # faster, lighter
    }

    def __init__(self, api_key: Optional[str] = None, model: str = "pro"):
        """
        Initialize the Gemini client.

        Args:
            api_key: Gemini API key. If not provided, reads GEMINI_API_KEY env var.
            model: "pro" or "flash". Defaults to "pro".

        Examples:
            tools = GeminiTools()
            tools = GeminiTools(api_key="AIza...")
            tools = GeminiTools(model="flash")
            tools = GeminiTools(api_key="AIza...", model="flash")
        """
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError(
                "API key required. Set GEMINI_API_KEY environment variable "
                "or pass api_key parameter."
            )
        # Create the Gemini client — this is reused for every request
        self.client = genai.Client(api_key=self.api_key)
        # Resolve "pro"/"flash" alias to the full model ID, or use as-is
        self.model = self.MODELS.get(model, model)

    # ------------------------------------------------------------------
    # Private helpers — not intended for direct use by agents
    # ------------------------------------------------------------------

    def _create_tools(self, use_url_context: bool = True, use_google_search: bool = True) -> list:
        """
        Build the tools list to pass to GenerateContentConfig.

        Gemini tools are opt-in per request. This helper returns only the
        tools that are actually needed, keeping requests lean.

        Args:
            use_url_context:  Include the URL Context tool (reads web pages).
            use_google_search: Include the Google Search tool (live search).

        Returns:
            List of types.Tool objects ready for GenerateContentConfig.
        """
        tools = []
        if use_url_context:
            # URL Context lets Gemini fetch and read the content of any URL
            # mentioned in the prompt
            tools.append(types.Tool(url_context=types.UrlContext()))
        if use_google_search:
            # Google Search lets Gemini run real-time searches and ground its
            # answers in up-to-date web results
            tools.append(types.Tool(googleSearch=types.GoogleSearch()))
        return tools

    def _generate_content(
        self,
        prompt: str,
        use_url_context: bool = True,
        use_google_search: bool = True,
        thinking_level: str = "HIGH",
        response_mime_type: str = "application/json",
        stream: bool = True,
    ) -> str:
        """
        Core request method used by all public methods.

        Builds the request payload, fires it at the Gemini API, and returns
        the full response text (streamed by default so large responses don't
        time out).

        Args:
            prompt:             The full prompt text to send to Gemini.
            use_url_context:    Enable the URL Context tool for this request.
            use_google_search:  Enable the Google Search tool for this request.
            thinking_level:     How much reasoning Gemini applies before
                                answering — "LOW", "MEDIUM", or "HIGH".
                                HIGH gives the best results but is slower.
            response_mime_type: Format of the response. "application/json"
                                keeps output structured and parseable.
            stream:             Stream chunks as they arrive (True) vs wait
                                for the full response (False). Streaming is
                                recommended for longer responses.

        Returns:
            Raw response text from Gemini (JSON string in most cases).
        """
        # Wrap the prompt in the Content/Part structure the API expects
        contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=prompt)],
            ),
        ]

        tools = self._create_tools(use_url_context, use_google_search)

        # GenerateContentConfig bundles model behavior settings:
        #   - thinking_config: controls reasoning depth
        #   - tools: which grounding tools Gemini can use
        #   - response_mime_type: tells the model to format output as JSON
        config = types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=thinking_level,
            ),
            tools=tools,
            response_mime_type=response_mime_type,
        )

        if stream:
            return self._stream_response(contents, config)
        else:
            return self._sync_response(contents, config)

    def _stream_response(self, contents: list, config: types.GenerateContentConfig) -> str:
        """
        Stream the response chunk-by-chunk and return the full accumulated text.

        Streaming prevents timeout issues on long responses. Chunks arrive as
        they're generated; we concatenate them and return the whole string.
        """
        full_response = ""
        for chunk in self.client.models.generate_content_stream(
            model=self.model,
            contents=contents,
            config=config,
        ):
            if chunk.text:
                full_response += chunk.text
        return full_response

    def _sync_response(self, contents: list, config: types.GenerateContentConfig) -> str:
        """
        Wait for the complete response and return it all at once.

        Use this for short prompts where streaming overhead isn't worth it,
        or when you need a simple blocking call.
        """
        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )
        return response.text

    # ==================================================================
    # URL CONTEXT TOOL METHODS
    # These methods only enable the URL Context tool (no Google Search).
    # Use them when you already have a specific URL and want Gemini to
    # read and reason about its content.
    # ==================================================================

    def analyze_url(self, url: str, question: str) -> str:
        """
        Fetch a web page and answer a specific question about its content.

        Gemini will read the live page at `url` and answer `question` based
        on what it finds there — not from its training data.

        Args:
            url:      The full URL of the page to analyze.
                      Example: "https://docs.python.org/3/library/json.html"
            question: A natural-language question about the page content.
                      Example: "What are the main functions in this module?"

        Returns:
            JSON string with the answer and supporting details from the page.

        Examples:
            result = tools.analyze_url(
                url="https://docs.python.org/3/library/json.html",
                question="What does json.dumps() do and what are its key parameters?"
            )
            data = json.loads(result)

            result = tools.analyze_url(
                url="https://en.wikipedia.org/wiki/Python_(programming_language)",
                question="When was Python first released and who created it?"
            )
        """
        prompt = f"""Please analyze the content from this URL: {url}

Question: {question}

Provide a comprehensive answer based on the URL content."""
        return self._generate_content(prompt, use_url_context=True, use_google_search=False)

    def summarize_url(self, url: str) -> str:
        """
        Fetch a web page and return a structured summary of its content.

        Good for quickly understanding what a page is about without reading
        it yourself. Returns main topic, key points, and notable insights.

        Args:
            url: The full URL of the page to summarize.
                 Example: "https://arxiv.org/abs/2303.08774"

        Returns:
            JSON string with main topic, key points, important details, and
            notable insights extracted from the page.

        Examples:
            result = tools.summarize_url("https://www.anthropic.com/research")
            data = json.loads(result)
            print(data["key_points"])

            # Summarize a news article
            result = tools.summarize_url("https://example.com/news-article")

            # Summarize technical documentation
            result = tools.summarize_url("https://docs.python.org/3/")
        """
        prompt = f"""Please provide a comprehensive summary of the content at this URL: {url}

Include:
- Main topic/subject
- Key points
- Important details
- Any notable insights"""
        return self._generate_content(prompt, use_url_context=True, use_google_search=False)

    def extract_data_from_url(self, url: str, extraction_prompt: str) -> str:
        """
        Pull specific structured data out of a web page.

        Use this when you know exactly what information you need from a page —
        prices, names, dates, specs, etc. Returns a structured JSON object.

        Args:
            url:               The URL to extract data from.
            extraction_prompt: Plain-English description of what to extract.
                               Be specific for best results.

        Returns:
            JSON string containing the extracted data in a structured format.

        Examples:
            # Extract package metadata from PyPI
            result = tools.extract_data_from_url(
                url="https://pypi.org/project/requests/",
                extraction_prompt="Extract: version number, author, license, install command, and description"
            )

            # Extract pricing from a product page
            result = tools.extract_data_from_url(
                url="https://example.com/product",
                extraction_prompt="Extract the product name, price, availability, and key specifications"
            )

            # Extract contact info from a company page
            result = tools.extract_data_from_url(
                url="https://example.com/contact",
                extraction_prompt="Extract all contact methods: email, phone, address, social media links"
            )
        """
        prompt = f"""Extract the following information from this URL: {url}

What to extract: {extraction_prompt}

Return the extracted data in a structured JSON format."""
        return self._generate_content(prompt, use_url_context=True, use_google_search=False)

    def compare_urls(self, urls: list[str], comparison_aspect: str) -> str:
        """
        Fetch multiple web pages and compare them on a specific aspect.

        Gemini reads all provided URLs and produces a side-by-side analysis.
        Useful for comparing products, articles, documentation, or any pages
        covering the same topic.

        Args:
            urls:               List of URLs to compare (2 or more).
            comparison_aspect:  What to focus the comparison on.
                                Example: "pricing and features"

        Returns:
            JSON string with similarities, differences, and key insights
            across all compared pages.

        Examples:
            # Compare two AI company homepages
            result = tools.compare_urls(
                urls=["https://www.anthropic.com/", "https://openai.com/"],
                comparison_aspect="company mission, products, and safety approach"
            )

            # Compare two library documentation pages
            result = tools.compare_urls(
                urls=[
                    "https://docs.python.org/3/library/json.html",
                    "https://docs.python.org/3/library/pickle.html",
                ],
                comparison_aspect="use cases, performance, and security considerations"
            )

            # Compare multiple news sources on the same story
            result = tools.compare_urls(
                urls=["https://source1.com/story", "https://source2.com/story"],
                comparison_aspect="facts reported, tone, and conclusions drawn"
            )
        """
        urls_text = "\n".join(f"- {url}" for url in urls)
        prompt = f"""Compare the content from these URLs:
{urls_text}

Comparison aspect: {comparison_aspect}

Provide a detailed comparison highlighting similarities, differences, and key insights."""
        return self._generate_content(prompt, use_url_context=True, use_google_search=False)

    # ==================================================================
    # GOOGLE SEARCH TOOL METHODS
    # These methods only enable Google Search (no URL Context).
    # Use them when you need real-time information and don't have a
    # specific URL — Gemini will search and synthesize results for you.
    # ==================================================================

    def search(self, query: str, additional_instructions: str = "") -> str:
        """
        Run a Google search and get a synthesized, sourced answer.

        Gemini performs a real-time search, reads the top results, and
        returns a comprehensive response — not just a list of links.

        Args:
            query:                  The search query.
                                    Example: "best Python async frameworks 2024"
            additional_instructions: Optional extra guidance for how to
                                    process or format the results.
                                    Example: "Focus on performance benchmarks"

        Returns:
            JSON string with synthesized information and sources.

        Examples:
            # Basic search
            result = tools.search("Python 3.13 new features")
            data = json.loads(result)

            # Search with specific focus
            result = tools.search(
                query="electric vehicle charging infrastructure",
                additional_instructions="Focus on US market statistics and growth trends"
            )

            # Search for code examples
            result = tools.search(
                query="FastAPI authentication with JWT tokens",
                additional_instructions="Include working code examples"
            )
        """
        prompt = f"""Search for: {query}

{additional_instructions}

Provide comprehensive information based on the search results."""
        return self._generate_content(prompt, use_url_context=False, use_google_search=True)

    def research_topic(self, topic: str, depth: str = "comprehensive") -> str:
        """
        Conduct structured research on a topic using Google Search.

        Unlike a plain search, this method asks Gemini to produce a proper
        research summary with multiple perspectives, context, and citations.

        Args:
            topic: The subject to research.
                   Example: "transformer neural network architecture"
            depth: How thorough to be:
                   "brief"        — short overview, key points only
                   "moderate"     — detailed summary with context
                   "comprehensive"— full analysis with perspectives and
                                    implications (default)

        Returns:
            JSON string with research findings, organized by the depth level.

        Examples:
            # Quick overview
            result = tools.research_topic("WebAssembly", depth="brief")

            # Moderate depth for a planning document
            result = tools.research_topic(
                "microservices vs monolith architecture",
                depth="moderate"
            )

            # Deep dive for a report
            result = tools.research_topic(
                "CRISPR gene editing ethical implications",
                depth="comprehensive"
            )
            data = json.loads(result)
        """
        depth_instructions = {
            "brief": "Provide a concise overview with key points.",
            "moderate": "Provide a detailed summary with main findings and context.",
            "comprehensive": "Provide an in-depth analysis with detailed findings, "
            "context, implications, and multiple perspectives.",
        }

        prompt = f"""Research this topic: {topic}

{depth_instructions.get(depth, depth_instructions['comprehensive'])}

Include relevant sources and cite where information comes from."""
        return self._generate_content(prompt, use_url_context=False, use_google_search=True)

    def fact_check(self, claim: str) -> str:
        """
        Verify whether a claim is true, false, or partially true.

        Gemini searches for evidence supporting or contradicting the claim
        and returns a structured verdict with confidence level and sources.

        Args:
            claim: The statement to verify.
                   Example: "Python was first released in 1991"

        Returns:
            JSON string with:
              - verdict:    "true" | "false" | "partially_true" | "unverifiable"
              - explanation: detailed reasoning
              - sources:    list of sources consulted
              - confidence: how confident the model is in the verdict

        Examples:
            result = tools.fact_check("The Great Wall of China is visible from space")
            data = json.loads(result)
            print(data["verdict"])      # "false"
            print(data["explanation"])  # detailed debunking
            print(data["sources"])      # list of citations

            result = tools.fact_check("Python is the most popular programming language")
            data = json.loads(result)
            # verdict might be "partially_true" with context about different surveys
        """
        prompt = f"""Fact-check the following claim: "{claim}"

Please:
1. Verify if this claim is true, false, or partially true
2. Provide evidence supporting the verification
3. Cite reliable sources
4. Note any nuances or context

Return results in JSON format with:
- verdict: true/false/partially_true/unverifiable
- explanation: detailed explanation
- sources: list of sources used
- confidence: confidence level in the verdict"""
        return self._generate_content(prompt, use_url_context=False, use_google_search=True)

    def find_latest_news(self, topic: str, timeframe: str = "recent") -> str:
        """
        Search for recent news on a topic and return a structured summary.

        Uses Google Search to find fresh news articles, then summarizes
        the key developments in a structured format with sources.

        Args:
            topic:     The news topic to search for.
                       Example: "OpenAI GPT updates"
            timeframe: How recent to filter results:
                       "recent"     — last few days (default)
                       "today"      — today only
                       "this_week"  — past 7 days
                       "this_month" — past 30 days

        Returns:
            JSON string with headline summary, key developments, timeline,
            and sources.

        Examples:
            # Get recent AI news
            result = tools.find_latest_news("artificial intelligence", timeframe="recent")
            data = json.loads(result)

            # Today's tech news
            result = tools.find_latest_news("Apple", timeframe="today")

            # Monthly summary of a topic
            result = tools.find_latest_news("climate change policy", timeframe="this_month")
        """
        prompt = f"""Find the latest news about: {topic}

Timeframe: {timeframe}

Provide:
- Headline summary
- Key developments
- Timeline if relevant
- Sources

Format as a structured news summary."""
        return self._generate_content(prompt, use_url_context=False, use_google_search=True)

    # ==================================================================
    # COMBINED TOOL METHODS
    # These methods enable BOTH Google Search AND URL Context at the same
    # time. Use them for the most thorough research tasks where you want
    # Gemini to search the web AND read specific pages together.
    # ==================================================================

    def deep_research(
        self,
        topic: str,
        specific_urls: Optional[list[str]] = None,
    ) -> str:
        """
        Comprehensive research combining Google Search and URL analysis.

        The most powerful research method. Gemini searches for information,
        reads top sources, optionally reads specific URLs you provide, and
        synthesizes everything into a structured research report.

        Args:
            topic:         The research topic.
                           Example: "quantum computing practical applications"
            specific_urls: Optional list of URLs to analyze in depth alongside
                           the general search. Good for anchoring research
                           around authoritative sources you already trust.

        Returns:
            JSON string containing a structured research report with themes,
            findings, controversies, and citations.

        Examples:
            # General deep research (search only)
            result = tools.deep_research("transformer attention mechanisms")
            data = json.loads(result)

            # Research anchored to specific sources
            result = tools.deep_research(
                topic="AI safety alignment",
                specific_urls=[
                    "https://www.anthropic.com/research",
                    "https://openai.com/safety",
                ]
            )

            # Research a technical topic with a reference doc
            result = tools.deep_research(
                topic="Python asyncio best practices",
                specific_urls=["https://docs.python.org/3/library/asyncio.html"]
            )
        """
        # If specific URLs were provided, add them to the prompt so Gemini
        # knows to read those pages in addition to doing a general search
        urls_section = ""
        if specific_urls:
            urls_text = "\n".join(f"- {url}" for url in specific_urls)
            urls_section = f"""

Also analyze these specific URLs in depth:
{urls_text}"""

        prompt = f"""Conduct deep research on: {topic}

Please:
1. Search for comprehensive information
2. Analyze key sources found
3. Synthesize findings from multiple perspectives
4. Identify key themes and insights
5. Note any controversies or debates
6. Cite all sources{urls_section}

Provide a structured research report."""
        return self._generate_content(prompt, use_url_context=True, use_google_search=True)

    def url_with_context_search(self, url: str, context_query: str) -> str:
        """
        Analyze a URL while simultaneously searching for broader context.

        Useful when a page alone doesn't tell the whole story — Gemini reads
        the page AND searches for related information, then combines both
        into a single enriched response.

        Args:
            url:           The specific URL to analyze.
            context_query: A search query to provide broader context.
                           Example: "industry reaction and follow-up coverage"

        Returns:
            JSON string combining the URL's content with broader web context.

        Examples:
            # Understand a blog post in the context of its field
            result = tools.url_with_context_search(
                url="https://example.com/new-algorithm-post",
                context_query="related algorithms and prior art in this research area"
            )

            # Analyze a product page with market context
            result = tools.url_with_context_search(
                url="https://example.com/product",
                context_query="competitor products and market comparison"
            )

            # Read a news article with broader background
            result = tools.url_with_context_search(
                url="https://example.com/news-story",
                context_query="background history and expert opinions on this topic"
            )
        """
        prompt = f"""Analyze this URL: {url}

Also search for additional context about: {context_query}

Combine the URL analysis with the broader search context to provide a comprehensive response."""
        return self._generate_content(prompt, use_url_context=True, use_google_search=True)

    def verify_url_claims(self, url: str) -> str:
        """
        Read a web page and cross-verify its key claims against Google Search.

        Gemini reads the page, identifies the main claims being made, then
        independently searches for supporting or contradicting evidence for
        each one. Good for fact-checking articles or reports.

        Args:
            url: The URL of the page whose claims should be verified.
                 Example: "https://example.com/health-article"

        Returns:
            JSON string listing each claim with:
              - claim:               the specific claim made in the page
              - verification_status: "verified" | "refuted" | "unverifiable"
              - evidence:            supporting or contradicting evidence found
              - sources:             where the evidence came from

        Examples:
            # Verify claims in a health article
            result = tools.verify_url_claims("https://example.com/health-tips")
            data = json.loads(result)
            for claim in data["claims"]:
                print(f"{claim['claim']}: {claim['verification_status']}")

            # Fact-check a political or opinion piece
            result = tools.verify_url_claims("https://example.com/opinion-article")

            # Verify technical claims in a product announcement
            result = tools.verify_url_claims("https://example.com/product-launch")
        """
        prompt = f"""Analyze this URL and identify the key claims made: {url}

Then verify each claim by searching for supporting or contradicting evidence.

For each claim provide:
- The claim
- Verification status (verified/refuted/unverifiable)
- Evidence
- Sources

Return as structured JSON."""
        return self._generate_content(prompt, use_url_context=True, use_google_search=True)

    def compare_search_vs_url(self, topic: str, url: str) -> str:
        """
        Compare a specific URL's perspective on a topic against the broader web.

        Gemini searches Google for general information on the topic, then reads
        the specific URL, and produces a comparison: what does the URL say that
        the web doesn't, what does it miss, and how does it stack up overall?

        Args:
            topic: The topic to evaluate both sources on.
                   Example: "benefits of intermittent fasting"
            url:   A specific source to compare against general search results.
                   Example: "https://example.com/fasting-guide"

        Returns:
            JSON string with:
              - url_unique_info:    what the URL offers that general search doesn't
              - url_missing:        what the URL doesn't cover that the web does
              - perspective_diff:   how the URL's angle differs from mainstream
              - comprehensiveness:  which source is more thorough overall

        Examples:
            # Compare an opinionated blog post against general consensus
            result = tools.compare_search_vs_url(
                topic="best practices for REST API design",
                url="https://example.com/api-design-guide"
            )

            # Compare a company's claims against industry analysis
            result = tools.compare_search_vs_url(
                topic="GPT-4 capabilities and benchmarks",
                url="https://openai.com/gpt-4"
            )

            # Compare a Wikipedia article against other sources
            result = tools.compare_search_vs_url(
                topic="history of the internet",
                url="https://en.wikipedia.org/wiki/History_of_the_Internet"
            )
        """
        prompt = f"""Compare perspectives on this topic: {topic}

1. Search for general information and perspectives
2. Analyze this specific URL's perspective: {url}

Compare:
- How does the URL's perspective differ from general search results?
- What unique information does the URL provide?
- What's missing from the URL that general searches reveal?
- Which sources are more comprehensive?

Provide a detailed comparison."""
        return self._generate_content(prompt, use_url_context=True, use_google_search=True)


def create_demo_script():
    """Create a demo script showing all capabilities."""
    return '''#!/usr/bin/env python3
"""Demo script showing all Gemini URL and Search tools capabilities."""

import os
from gemini_tools import GeminiTools

# Initialize the tools
tools = GeminiTools()  # Uses GEMINI_API_KEY env var

print("=" * 60)
print("GEMINI URL CONTEXT & GOOGLE SEARCH TOOLS DEMO")
print("=" * 60)

# ==================== URL Context Examples ====================
print("\n" + "=" * 60)
print("1. URL CONTEXT TOOL EXAMPLES")
print("=" * 60)

# Example 1: Analyze URL
print("\n--- Analyzing URL ---")
tools.analyze_url(
    url="https://www.python.org/",
    question="What are the main features of Python highlighted on this page?"
)

# Example 2: Summarize URL
print("\n--- Summarizing URL ---")
tools.summarize_url(url="https://docs.python.org/3/")

# Example 3: Extract data
print("\n--- Extracting Data from URL ---")
tools.extract_data_from_url(
    url="https://pypi.org/project/google-genai/",
    extraction_prompt="Extract version number, author, license, and main features"
)

# Example 4: Compare URLs
print("\\n--- Comparing URLs ---")
tools.compare_urls(
    urls=[
        "https://www.anthropic.com/",
        "https://openai.com/",
    ],
    comparison_aspect="Company mission and main products"
)

# ==================== Google Search Examples ====================
print("\\n" + "=" * 60)
print("2. GOOGLE SEARCH TOOL EXAMPLES")
print("=" * 60)

# Example 1: Basic search
print("\\n--- Basic Search ---")
tools.search(
    query="Latest developments in AI 2024",
    additional_instructions="Focus on breakthrough technologies"
)

# Example 2: Research topic
print("\\n--- Research Topic ---")
tools.research_topic(topic="Quantum computing applications", depth="moderate")

# Example 3: Fact check
print("\\n--- Fact Checking ---")
tools.fact_check("Python is the most popular programming language in 2024")

# Example 4: Latest news
print("\\n--- Finding Latest News ---")
tools.find_latest_news(topic="Artificial Intelligence", timeframe="recent")

# ==================== Combined Tool Examples ====================
print("\\n" + "=" * 60)
print("3. COMBINED TOOL EXAMPLES")
print("=" * 60)

# Example 1: Deep research
print("\\n--- Deep Research ---")
tools.deep_research(
    topic="Large Language Models",
    specific_urls=[
        "https://www.anthropic.com/research",
    ]
)

# Example 2: URL with context search
print("\\n--- URL with Context Search ---")
tools.url_with_context_search(
    url="https://www.anthropic.com/",
    context_query="AI safety and responsible AI development"
)

# Example 3: Verify URL claims
print("\\n--- Verifying URL Claims ---")
tools.verify_url_claims(url="https://www.example.com/article")

# Example 4: Compare search vs URL
print("\\n--- Comparing Search vs URL ---")
tools.compare_search_vs_url(
    topic="Climate change solutions",
    url="https://www.example.com/climate-article"
)

print("\\n" + "=" * 60)
print("DEMO COMPLETE")
print("=" * 60)
'''


def main():
    """Main function with CLI interface."""
    parser = argparse.ArgumentParser(
        description="Gemini URL Context and Google Search Tools",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Analyze a URL
  python gemini_tools.py analyze-url "https://example.com" -q "What is this page about?"

  # Summarize a URL
  python gemini_tools.py summarize "https://example.com"

  # Search the web
  python gemini_tools.py search "latest AI developments"

  # Research a topic
  python gemini_tools.py research "quantum computing" --depth comprehensive

  # Fact-check a claim
  python gemini_tools.py fact-check "The Earth is flat"

  # Deep research with URL analysis
  python gemini_tools.py deep-research "AI safety" --urls "https://example.com/ai-safety"

  # Generate demo script
  python gemini_tools.py demo --output demo_script.py
        """,
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # URL Context commands
    analyze_parser = subparsers.add_parser("analyze-url", help="Analyze a URL")
    analyze_parser.add_argument("url", help="URL to analyze")
    analyze_parser.add_argument("-q", "--question", required=True, help="Question about the URL")

    summarize_parser = subparsers.add_parser("summarize", help="Summarize a URL")
    summarize_parser.add_argument("url", help="URL to summarize")

    extract_parser = subparsers.add_parser("extract", help="Extract data from a URL")
    extract_parser.add_argument("url", help="URL to extract from")
    extract_parser.add_argument("-p", "--prompt", required=True, help="What to extract")

    compare_parser = subparsers.add_parser("compare-urls", help="Compare multiple URLs")
    compare_parser.add_argument("urls", nargs="+", help="URLs to compare")
    compare_parser.add_argument("-a", "--aspect", required=True, help="Aspect to compare")

    # Google Search commands
    search_parser = subparsers.add_parser("search", help="Search the web")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("-i", "--instructions", default="", help="Additional instructions")

    research_parser = subparsers.add_parser("research", help="Research a topic")
    research_parser.add_argument("topic", help="Topic to research")
    research_parser.add_argument(
        "--depth",
        choices=["brief", "moderate", "comprehensive"],
        default="comprehensive",
        help="Research depth",
    )

    factcheck_parser = subparsers.add_parser("fact-check", help="Fact-check a claim")
    factcheck_parser.add_argument("claim", help="Claim to fact-check")

    news_parser = subparsers.add_parser("news", help="Find latest news")
    news_parser.add_argument("topic", help="News topic")
    news_parser.add_argument(
        "--timeframe",
        choices=["recent", "today", "this_week", "this_month"],
        default="recent",
        help="Timeframe for news",
    )

    # Combined commands
    deep_parser = subparsers.add_parser("deep-research", help="Deep research with URL analysis")
    deep_parser.add_argument("topic", help="Research topic")
    deep_parser.add_argument("--urls", nargs="*", help="Specific URLs to analyze")

    verify_parser = subparsers.add_parser("verify-url", help="Verify claims in a URL")
    verify_parser.add_argument("url", help="URL to verify")

    context_parser = subparsers.add_parser("url-context", help="Analyze URL with search context")
    context_parser.add_argument("url", help="URL to analyze")
    context_parser.add_argument("context", help="Context query to search")

    # Demo command
    demo_parser = subparsers.add_parser("demo", help="Generate demo script")
    demo_parser.add_argument("--output", "-o", help="Output file for demo script")

    parser.add_argument(
        "--model",
        choices=["pro", "flash"],
        default="pro",
        help="Model to use: 'pro' (gemini-3-pro-preview) or 'flash' (gemini-3-flash-preview). Default: pro",
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    # Initialize tools
    try:
        tools = GeminiTools(model=args.model)
    except ValueError as e:
        print(f"Error: {e}")
        return

    # Execute command
    result = None

    if args.command == "analyze-url":
        result = tools.analyze_url(args.url, args.question)
    elif args.command == "summarize":
        result = tools.summarize_url(args.url)
    elif args.command == "extract":
        result = tools.extract_data_from_url(args.url, args.prompt)
    elif args.command == "compare-urls":
        result = tools.compare_urls(args.urls, args.aspect)
    elif args.command == "search":
        result = tools.search(args.query, args.instructions)
    elif args.command == "research":
        result = tools.research_topic(args.topic, args.depth)
    elif args.command == "fact-check":
        result = tools.fact_check(args.claim)
    elif args.command == "news":
        result = tools.find_latest_news(args.topic, args.timeframe)
    elif args.command == "deep-research":
        result = tools.deep_research(args.topic, args.urls)
    elif args.command == "verify-url":
        result = tools.verify_url_claims(args.url)
    elif args.command == "url-context":
        result = tools.url_with_context_search(args.url, args.context)
    elif args.command == "demo":
        script_content = create_demo_script()
        if args.output:
            with open(args.output, "w") as f:
                f.write(script_content)
            print(f"Demo script written to {args.output}")
        else:
            print(script_content)
        return

    # Try to pretty print JSON results
    if result:
        try:
            parsed = json.loads(result)
            print(json.dumps(parsed, indent=2))
        except json.JSONDecodeError:
            print(result)


if __name__ == "__main__":
    main()
