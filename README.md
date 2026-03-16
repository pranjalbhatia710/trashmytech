# trashmy.tech

Paste a URL. 12 AI personas stress-test your site in 60 seconds. Get a scored report with exactly what to fix.

**[trashmy.tech](https://trashmy.tech)**

---

## What is this?

We ship fast. But who's actually testing? trashmy.tech lets you paste any URL and instantly see how real users would experience it — accessibility issues, broken flows, SEO gaps, security holes, and content problems.

One free analysis per visitor. $5 one-time payment for unlimited.

## How it works

1. **Paste a URL**, click "Trash It"
2. **12 AI personas launch in parallel** — each a real Playwright browser instance. A blind user on a screen reader. A skeptic looking for trust signals. Googlebot checking crawlability. A chaos agent breaking forms.
3. **Scoring engine** calculates a deterministic 0-100 score across 6 categories
4. **Report generates** with annotated screenshots, ranked fixes, and a copy-paste prompt for ChatGPT/Claude to implement the fixes

Results are **deterministic** — same site always gets the same score. Reports are cached for 7 days.

## Features

- **40 persona types** across 7 categories: accessibility, demographic, security, usability, chaos, content/SEO
- **6-category scoring**: Accessibility (25%), SEO (20%), Performance (20%), Content (15%), Security (10%), UX (10%)
- **Hard caps**: No HTTPS = max 40/100. Critical a11y failure = max 50 accessibility score
- **Lite mode**: Near-zero API cost using only free checks (SSL, DNS, robots.txt, axe-core)
- **Full mode**: Google PageSpeed, Mozilla Observatory, Safe Browsing integration
- **Real-time streaming**: WebSocket updates as agents crawl, test, and find issues
- **Auth + payments**: NextAuth.js (Google OAuth), Stripe ($5 one-time)
- **Caching**: Redis + PostgreSQL, 7-day TTL, domain normalization for deterministic results

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, Tailwind CSS v4, Framer Motion, Three.js, Recharts |
| Backend | FastAPI, WebSockets, asyncio |
| Browser agents | Playwright (local or Modal for scaling) |
| AI | Gemini 2.0 Flash (personas, report generation) |
| Accessibility | axe-core |
| Auth | NextAuth.js, JWT, Google OAuth |
| Payments | Stripe (one-time $5) |
| Database | PostgreSQL (Supabase/Neon), Redis (Upstash) |
| Deploy | Vercel (frontend), Render/Railway (backend) |

## Getting started

### Prerequisites

- Node.js 18+
- Python 3.11+
- A [Gemini API key](https://aistudio.google.com/apikey)

### 1. Clone and install

```bash
git clone https://github.com/pranjalbhatia710/trashmytech.git
cd trashmytech

# Frontend
npm install

# Backend
cd backend
pip install -r requirements.txt
playwright install chromium
```

### 2. Configure environment

**Backend** — create `backend/.env`:

```env
GEMINI_API_KEY=your-gemini-key
ANALYSIS_MODE=lite
HEADLESS=true
AGENT_COUNT=12

# Optional (for persistence):
# DATABASE_URL=postgresql://user:pass@host:5432/trashmytech
# REDIS_URL=redis://default:token@host:6379

# Optional (for auth):
# JWT_SECRET=your-random-secret
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# STRIPE_PRICE_ID=price_...
```

**Frontend** — create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000

# Optional (for auth):
# NEXTAUTH_URL=http://localhost:3000
# NEXTAUTH_SECRET=your-random-secret
# GOOGLE_CLIENT_ID=your-google-client-id
# GOOGLE_CLIENT_SECRET=your-google-client-secret
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 3. Run

```bash
# Terminal 1 — Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste a URL, hit **Trash It**.

### Minimum setup

Only `GEMINI_API_KEY` is required. Everything else (database, Redis, auth, Stripe) is optional and degrades gracefully — the app works without them.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (localhost:3000)                            │
│  Next.js + React + Tailwind + Framer Motion          │
└──────────┬──────────────────────────────┬───────────┘
           │ REST                         │ WebSocket
           ▼                              ▼
┌─────────────────────────────────────────────────────┐
│  FastAPI Backend (localhost:8000)                     │
│                                                      │
│  POST /v1/tests         → create analysis            │
│  WS   /ws/{test_id}     → stream live progress       │
│  GET  /v1/tests/{id}    → get results                │
│  GET  /v1/recent        → recently analyzed sites     │
│                                                      │
│  Pipeline:                                           │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────┐  │
│  │ 1. Crawl │→ │ 2. Swarm │→ │3.Score │→ │4.Save │  │
│  │Playwright│  │12 agents │  │  Pure   │  │PG+Redis│ │
│  │ axe-core │  │  Gemini  │  │functions│  │       │  │
│  └──────────┘  └──────────┘  └────────┘  └───────┘  │
│                                                      │
│  External APIs (full mode only):                     │
│  PageSpeed · Observatory · Safe Browsing · SSL · DNS │
└─────────────────────────────────────────────────────┘
```

## Analysis modes

| Mode | Cost | What runs | Use case |
|------|------|-----------|----------|
| `lite` | ~$0.01/analysis | Playwright + axe-core + Gemini Flash + free checks (SSL, DNS, robots.txt) | Development, demos |
| `full` | ~$0.05/analysis | Everything above + Google PageSpeed + Mozilla Observatory + Safe Browsing | Production |

Set via `ANALYSIS_MODE=lite` or `ANALYSIS_MODE=full` in `backend/.env`.

## Scoring

All scores are **deterministic** — pure functions, no AI calls, no randomness. Same input = same output.

| Category | Weight | Data sources |
|----------|--------|-------------|
| Accessibility | 25% | axe-core violations, Lighthouse a11y, persona testing |
| SEO | 20% | Meta tags, structured data, robots.txt, sitemap, AI bot access |
| Performance | 20% | PageSpeed (full) or agent-measured load times (lite) |
| Content | 15% | Readability, trust signals, value proposition clarity |
| Security | 10% | SSL, DNS, headers, Observatory (full), HTTPS check |
| UX | 10% | Persona task completion, mobile testing, form usability |

**Hard caps:**
- Site flagged by Safe Browsing → overall max **15**
- No HTTPS → overall max **40**
- Critical accessibility failure → accessibility max **50**

## Deployment

### Frontend → Vercel

Push to GitHub. Vercel auto-deploys from `main` branch. Set env var:

```
NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com
```

### Backend → Render

1. New Web Service → connect GitHub repo
2. Root directory: `backend`
3. Runtime: Docker
4. Add env vars: `GEMINI_API_KEY`, `HEADLESS=true`, `ANALYSIS_MODE=lite`, `AGENT_COUNT=12`

### Database → Supabase (optional)

Free tier (500MB). Set `DATABASE_URL` on Render. Migrations run automatically on startup.

### Cache → Upstash (optional)

Free tier (10K commands/day). Set `REDIS_URL` on Render.

## API reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/tests` | POST | Create analysis `{"url": "...", "mode": "standard"}` |
| `/ws/{test_id}` | WS | Stream live progress |
| `/v1/tests/{test_id}` | GET | Get test status + report |
| `/v1/tests/{test_id}/report` | GET | Get report only |
| `/v1/recent?limit=6` | GET | Recently analyzed sites |
| `/v1/stats` | GET | Aggregate stats |
| `/v1/health` | GET | Health check |
| `/v1/auth/register` | POST | Register (email/password) |
| `/v1/auth/login` | POST | Login, returns JWT |
| `/v1/auth/me` | GET | Current user (requires JWT) |

## Project structure

```
trashmytech/
├── app/                    # Next.js pages
│   ├── page.tsx            # Landing page
│   ├── test/[id]/page.tsx  # Live dashboard + report
│   ├── api/auth/           # NextAuth routes
│   └── api/stripe/         # Stripe checkout + webhook
├── components/             # React components
│   ├── url-input.tsx       # URL input with validation
│   ├── auth-modal.tsx      # Auth + payment modal
│   └── ui/                 # Score gauge, toast, counters
├── lib/                    # Config, auth helpers
├── backend/
│   ├── main.py             # FastAPI + WebSocket orchestration
│   ├── pipeline.py         # 4-phase pipeline (crawl→swarm→score→persist)
│   ├── agent.py            # Gemini-powered persona engine
│   ├── scoring.py          # Deterministic scoring (pure functions)
│   ├── report.py           # Report generation
│   ├── personas.py         # 35 base personas
│   ├── personas_content_seo.py  # 5 content/SEO personas
│   ├── crawler.py          # Playwright + axe-core
│   ├── external_apis.py    # PageSpeed, Observatory, etc.
│   ├── analysis_lite.py    # Lite mode config
│   ├── quick_wins.py       # Fix recommendations
│   ├── auth/               # User auth + Stripe webhooks
│   ├── db/                 # PostgreSQL schema + queries
│   ├── cache/              # Redis caching layer
│   └── services/           # Persistence service
└── render.yaml             # Render deployment config
```

## Built at HackIllinois 2026

Solo project. Started 15 hours into the hackathon after the original team dropped out. Won first place.

## License

MIT
