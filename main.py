import json
import os
import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from scraper import scrape_arxiv

app = FastAPI(title="State of Research")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request Models ────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    max_papers: int = 50
    category: str = "cs"


class Paper(BaseModel):
    id: str
    title: str
    abstract: str
    authors: str
    date: str
    link: str
    subjects: list[str] = []


class AnalyzeRequest(BaseModel):
    query: str
    papers: list[Paper]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.post("/api/search")
async def search(request: SearchRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    try:
        papers = scrape_arxiv(
            query=request.query.strip(),
            max_papers=request.max_papers,
            category=request.category,
        )
        return {"papers": papers, "count": len(papers), "query": request.query}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY environment variable is not set.",
        )

    papers_for_analysis = request.papers[:35]

    papers_text = "\n\n---\n\n".join(
        [
            f"**{p.title}**\n"
            f"Date: {p.date}\n"
            f"Authors: {p.authors}\n"
            f"Link: {p.link}\n"
            f"Abstract: {p.abstract}"
            for p in papers_for_analysis
        ]
    )

    prompt = f"""You are a world-class research analyst and technology futurist. \
I have gathered {len(request.papers)} of the most recent research papers from arxiv \
on the topic: **"{request.query}"**.

Here are the papers (ordered most-recent first):

{papers_text}

---

Please write a comprehensive, intellectually rigorous narrative analysis of this \
research landscape. Your audience is technically literate but wants the big picture — \
not a list of paper summaries, but a synthesized story of where this field stands and \
where it is going.

Use exactly this structure with these markdown headers:

## State of the Art

What has actually been achieved? What are the dominant paradigms, leading methods, \
and benchmark results that define where the field stands today? What problems are \
now considered largely solved or commoditized?

## Active Research Frontiers

What are the hottest unsolved problems researchers are actively attacking right now? \
What new techniques and architectures are emerging from the papers? What patterns do \
you see across multiple papers that signal a rising trend?

## Competing Paradigms & Open Debates

Where is the community divided? What fundamental assumptions are being challenged? \
Are there competing schools of thought with genuine trade-offs? What are the \
unresolved theoretical or empirical tensions?

## Where the Field Is Converging

Based on the trajectory visible in these papers, what convergences or paradigm shifts \
seem imminent? What does the collective direction of research suggest about where the \
next major breakthroughs will come from?

## Real-World Impact: The Next 3–5 Years

Be bold, specific, and concrete. Given current research momentum, what will change \
in the real world by 2028–2030? Which industries face disruption? What new \
products and capabilities will emerge? What risks or second-order effects should \
society prepare for? Anchor your predictions in the evidence from the papers above.

---

Write in a flowing, authoritative narrative style — not bullet points within sections, \
but well-developed paragraphs. Reference specific papers by title where they \
illustrate a key point. Make this analysis worth reading for someone who wants to \
deeply understand this field."""

    def generate():
        try:
            client = anthropic.Anthropic()
            with client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
            yield "data: [DONE]\n\n"
        except anthropic.AuthenticationError:
            yield f"data: {json.dumps({'error': 'Invalid ANTHROPIC_API_KEY. Please check your environment.'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/health")
async def health():
    has_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return {"status": "ok", "api_key_configured": has_key}


# ── Static files ──────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
