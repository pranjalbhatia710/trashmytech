# trashmytech — Agentic Setup Guide

Follow these steps in order. After each section, verify success before continuing.
**Ask the user for any missing API keys or credentials before proceeding.**

---

## 0. Pre-flight: Ask the User for Keys

Before doing anything, ask the user to provide the following. Only `GEMINI_API_KEY` is required — the rest are optional.

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | **YES** | Powers all LLM calls (agents, reports, scoring) via Gemini OpenAI-compatible endpoint |
| `DATABASE_URL` | No | PostgreSQL connection string for persistence (app works fully without it) |
| `REDIS_URL` | No | Redis URL for caching (app works fully without it) |
| `CAPSOLVER_API_KEY` | No | Auto-solves CAPTCHAs on tested sites (reCAPTCHA, hCaptcha, Turnstile) |

Prompt the user like this:
> "I need your **GEMINI_API_KEY** to set up the backend. Do you also have a PostgreSQL DATABASE_URL, REDIS_URL, or CAPSOLVER_API_KEY? These are optional — the app runs fine without them."

---

## 1. System Prerequisites

Check and install if missing:

```bash
# Required runtimes
python3 --version   # Need 3.11+
node --version      # Need 18+
npm --version       # Comes with Node
```

If Python is missing, install via brew/apt. If Node is missing, install via nvm or brew/apt.

---

## 2. Clone the Repo

```bash
git clone <repo-url>
cd trashmytech
```

---

## 3. Frontend Setup (Next.js)

```bash
# From repo root (trashmytech/)
npm install
```

This installs: Next.js 16, React 19, Three.js, Framer Motion, Tailwind v4, shadcn/ui, Recharts, etc.

To verify:
```bash
npm run build
# or just:
npm run dev
# Frontend runs on http://localhost:3000
```

---

## 4. Backend Setup (Python / FastAPI)

```bash
cd backend

# Create and activate a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # or: venv\Scripts\activate on Windows

# Install Python dependencies
pip install -r requirements.txt
```

Key packages installed: FastAPI, uvicorn, Playwright, openai SDK (used as Gemini client), Pillow, httpx, asyncpg, upstash-redis, playwright-stealth.

---

## 5. Install Playwright Browsers

```bash
# Still inside backend/ with venv active
playwright install chromium
```

This downloads the Chromium binary that the AI agents use to browse websites. ~150MB download.

On Linux, you may also need system deps:
```bash
playwright install-deps chromium
```

---

## 6. Create the `.env` File

```bash
# Inside backend/
cp .env.example .env
```

Then edit `backend/.env` with the user's actual keys:

```env
GEMINI_API_KEY=<user's key here>
USE_MODAL=false
AGENT_COUNT=5

# OPTIONAL — app works without these
# DATABASE_URL=postgresql://user:password@localhost:5432/trashmytech
# REDIS_URL=redis://localhost:6379
# CAPSOLVER_API_KEY=<user's key if provided>
```

---

## 7. Verify Backend Starts

```bash
# Inside backend/ with venv active
python3 main.py
```

Expected output:
```
INFO server starting — agents=5, modal=False
Dashboard: http://localhost:8000/dash
INFO Uvicorn running on http://0.0.0.0:8000
```

Hit `http://localhost:8000/v1/health` — should return:
```json
{"status": "ok", "version": "2.0.0", "agent_count": 5, ...}
```

Kill the server after verifying (`Ctrl+C`).

---

## 8. Verify Headed Browser Agents Work

This is the core feature — AI personas opening real browser windows and testing websites.

```bash
# Inside backend/ with venv active
HEADLESS=false python3 run_headed.py "https://example.com" 3
```

Expected behavior:
- 2 Chromium windows open visibly on screen
- 3 AI agents (random personas) navigate the site, click around, test forms
- Terminal prints results when done

If you see `GEMINI_API_KEY not set` errors, the `.env` is not loaded — double-check the file.

---

## 9. Run the Full Stack (Frontend + Backend)

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd trashmytech/backend
source venv/bin/activate
python3 main.py
```

**Terminal 2 — Frontend:**
```bash
cd trashmytech
npm run dev
```

Then open `http://localhost:3000` in your browser. The frontend connects to the backend via WebSocket at `ws://localhost:8000/ws/<test_id>`.

---

## Architecture Overview

```
trashmytech/
├── app/                    # Next.js App Router (frontend)
│   ├── page.tsx            # Landing page
│   ├── compare/            # Side-by-side comparison page
│   └── test/               # Live test dashboard (WebSocket)
├── components/             # React components (shadcn/ui)
├── lib/                    # Frontend utilities
├── backend/
│   ├── main.py             # FastAPI server + WebSocket pipeline
│   ├── pipeline.py         # Crawl -> Swarm -> Score -> Report phases
│   ├── agent.py            # AI agent engine (LLM-driven browser automation)
│   ├── browser_utils.py    # Smart clicking (12 fallback strategies), axe-core
│   ├── crawler.py          # Initial page crawl + data extraction
│   ├── personas.py         # 35 AI user personas (accessibility, chaos, SEO, etc.)
│   ├── scoring.py          # Composite scoring algorithm
│   ├── report.py           # LLM report generation
│   ├── quick_wins.py       # Priority fix recommendations
│   ├── annotator.py        # Screenshot annotation with findings
│   ├── llm_client.py       # Gemini via OpenAI-compatible SDK
│   ├── external_apis.py    # PageSpeed, Observatory, SSL, DNS, etc.
│   ├── run_headed.py       # Lightweight headed browser runner (3 agents, 2 browsers)
│   ├── test_headed.py      # Original headed runner (5 agents, 5 browsers)
│   ├── auth/               # Stealth, CAPTCHA solving, session management
│   ├── db/                 # PostgreSQL schema + queries (asyncpg)
│   ├── cache/              # Redis/Upstash caching layer
│   └── services/           # Persistence + embedding generation
```

---

## Key Run Commands

| Command | What it does |
|---|---|
| `python3 run_headed.py "https://site.com" 3` | 3 visible browser agents, laptop-friendly |
| `python3 run_headed.py "https://site.com" 6` | 6 agents on 2 browsers |
| `python3 test_headed.py "https://site.com"` | 5 agents on 5 browsers (heavier) |
| `python3 main.py` | Full FastAPI server on :8000 |
| `npm run dev` | Next.js frontend on :3000 |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError` | Activate venv: `source backend/venv/bin/activate` |
| `GEMINI_API_KEY not set` | Check `backend/.env` exists and has the key |
| Playwright browser not found | Run `playwright install chromium` |
| Linux: browser fails to launch | Run `playwright install-deps chromium` |
| Database errors on startup | Normal if no PostgreSQL — app degrades gracefully |
| Redis errors on startup | Normal if no Redis — app degrades gracefully |
| Laptop gets hot with many agents | Use `run_headed.py` with 3 agents, not `test_headed.py` |
