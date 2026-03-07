# trashmy.tech

Paste a URL. 50 AI personas attack your site in 60 seconds. Get a report that tells you exactly what to fix.

**[trashmy.tech](https://trashmy.tech)**

---

## What is this?

User testing should be the gold standard. But we ship so fast now — a founder deploys at 2am and it's live before anyone's tested it. Why can't testing keep up with shipping?

trashmy.tech lets you paste any URL and instantly see how real people would experience it. What's working, what's broken, who's getting left behind.

## How it works

You paste a URL and optionally describe your target audience ("college students applying for financial aid, mostly on phones"). Then three things happen:

### 1. 50 personas launch in parallel
Each one is a real browser instance running on [Modal](https://modal.com), not a simulation. A 68-year-old woman zooming to 200%. A blind developer on a screen reader. A chaos agent injecting SQL into every form field. A 13-year-old on a cracked iPhone SE. 20 of these are our permanent testing crew. The other 30 are generated specifically for YOUR audience using Gemini.

### 2. AI readability audit
Not Google SEO — AI SEO. We check if ChatGPT, Claude, and Perplexity can even access your content by auditing `robots.txt` for 12 AI-specific bots, checking for `llms.txt`, evaluating structured data, and scoring how extractable and citable your content is. Lighthouse gives you a Google score. We give you an AI score.

### 3. A report that actually helps
Score out of 100, six category breakdowns, annotated screenshots with red bounding boxes pointing to exact problems ("Button: 1x44px, below WCAG minimum"), persona verdicts, and ranked fixes. The last section generates a complete prompt with all your audit data baked in — copy it, paste it into ChatGPT or Claude, get code-level fix instructions immediately.

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, React 19, Tailwind CSS, Framer Motion |
| Backend | FastAPI, WebSockets |
| Browser agents | Playwright, Modal (50 parallel containers) |
| AI | Gemini 3.1 Pro (report generation), Gemini 3 Flash (personas, annotations) |
| Accessibility | axe-core |
| Image annotation | Pillow |

## Getting started

### Prerequisites

- Node.js 18+
- Python 3.10+
- A [Gemini API key](https://ai.google.dev/)
- A [Modal](https://modal.com) account (for parallel browser agents)

### Frontend

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Backend

```bash
cd backend
pip install -r requirements.txt
playwright install
```

Create `backend/.env`:

```
GEMINI_API_KEY=your_key_here
USE_MODAL=true
AGENT_COUNT=30
HEADLESS=false
```

Run the server:

```bash
uvicorn main:app --reload --port 8000
```

### Full stack

With both running, open `localhost:3000`, paste a URL, and hit **Trash it**.

## Architecture

```
browser (localhost:3000)
  │
  ├── POST /v1/tests          → creates test, returns test_id
  └── WS   /ws/{test_id}      → streams agent progress in real-time
                                    │
                                    ├── 50 Modal containers (Playwright browsers)
                                    ├── Gemini: generate 30 custom personas
                                    ├── Gemini: annotate screenshots
                                    ├── Gemini: generate final report
                                    └── axe-core: accessibility audit
```

## Built at HackIllinois 2026

Solo project. Started 15 hours into the hackathon after the original team dropped out.
