# State of Research — Handoff Document

## What Was Built

A full-stack web app that scrapes arxiv for recent research papers on any topic and uses Claude AI to synthesize an expert narrative report.

**Stack:**
- **Backend:** Python + FastAPI (serves static files + API endpoints)
- **Scraper:** `requests` + `BeautifulSoup` hitting `arxiv.org/search/`
- **AI:** Claude `claude-sonnet-4-6` via Anthropic SDK, streamed via SSE
- **Frontend:** Vanilla HTML/CSS/JS (no build step), `marked.js` for markdown rendering

**Files:**
```
StateOfResearch/
├── main.py              # FastAPI app — /api/search, /api/analyze, /api/health
├── scraper.py           # arxiv HTML scraper
├── requirements.txt     # fastapi, uvicorn, anthropic, requests, beautifulsoup4
├── start.sh             # convenience launcher
└── static/
    ├── index.html       # Single-page app shell
    ├── style.css        # Dark theme UI
    └── app.js           # Search, paper rendering, SSE streaming
```

**How to run:**
```bash
export ANTHROPIC_API_KEY=your_key_here
bash start.sh
# Open http://localhost:8000
```

## What Works

- [x] arxiv scraping (cs category, 25–200 papers, most-recent-first)
- [x] Paper cards with title, date, authors, abstract snippet, arxiv link
- [x] Streaming Claude narrative via Server-Sent Events
- [x] Narrative covers: State of Art / Frontiers / Debates / Trajectory / 3–5 Year Impact
- [x] Quick-search chips for common topics (LLMs, LRMs, World Models, etc.)
- [x] Copy narrative to clipboard
- [x] API key health check badge
- [x] Responsive layout (two-panel: papers left, narrative right)

## Known Issues / Not Yet Done

- [ ] `__pycache__/` was accidentally committed — add `.gitignore`
- [ ] No `.env` support — API key must be set as env var manually
- [ ] Scraper only searches `cs` category (hardcoded in frontend call) — other categories like `stat`, `eess` exist but aren't exposed in the UI
- [ ] No pagination — only fetches first page of results (max 50 papers)
- [ ] No caching — every search hits arxiv live (slow, ~3–5s for 50 papers)
- [ ] No error retry on network failures
- [ ] `start.sh` — the `chmod +x` step was interrupted, may need to be re-run

## Suggested Next Steps (Priority Order)

### 1. Add `.gitignore` (quick fix)
```
__pycache__/
*.pyc
*.pyo
.env
.DS_Store
```

### 2. Add `.env` support
Install `python-dotenv`, load `.env` in `main.py` so the API key doesn't need to be exported manually every session.

### 3. Multi-category search
In the UI, add a dropdown to let users choose between `cs`, `stat`, `eess`, or `all`. Pass it through the `/api/search` endpoint (already supported in `scraper.py`).

### 4. Caching layer
Add simple in-memory or file-based caching (e.g. `diskcache` or a JSON file) so repeated searches for the same query don't re-scrape arxiv.

### 5. Re-analyze button
Allow the user to regenerate the narrative with a different focus prompt (e.g. "focus on industry impact" vs "focus on technical details").

### 6. Export options
Add buttons to download the narrative as a `.md` or `.pdf` file.

### 7. Paper detail modal
Clicking a paper card could open a modal with the full abstract and a direct link to the PDF.

### 8. Deploy
The app is ready to deploy on Render, Railway, or Fly.io. It needs:
- `ANTHROPIC_API_KEY` set as an environment variable
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

## Repo
https://github.com/aravindkk/StateOfResearch
