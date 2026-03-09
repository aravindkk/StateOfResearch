// ── State ─────────────────────────────────────────────────────────────────
let currentPapers = [];
let narrativeMarkdown = "";

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  checkHealth();

  // Enter key on main input
  document.getElementById("main-query-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") triggerSearch();
  });

  // Enter key on header input
  document.getElementById("header-query-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") triggerSearch();
  });

  // Configure marked options
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
});

// ── Health check ──────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    const badge = document.getElementById("api-status");
    if (data.api_key_configured) {
      badge.textContent = "API Connected";
      badge.className = "api-badge ok";
    } else {
      badge.textContent = "No API Key";
      badge.className = "api-badge error";
    }
  } catch {
    // ignore
  }
}

// ── Quick search chips ────────────────────────────────────────────────────
function quickSearch(query) {
  document.getElementById("main-query-input").value = query;
  triggerSearch();
}

// ── Main search trigger ───────────────────────────────────────────────────
async function triggerSearch() {
  // Get query from whichever input is active/visible
  const heroInput = document.getElementById("main-query-input");
  const headerInput = document.getElementById("header-query-input");

  let query = heroInput.value.trim() || headerInput.value.trim();
  if (!query) {
    highlightInput(heroInput);
    return;
  }

  // Sync both inputs
  heroInput.value = query;
  headerInput.value = query;

  // Show results section, hide hero
  showResultsSection(query);

  // Disable search buttons while running
  setSearching(true);

  try {
    // Step 1: Scrape papers
    updateNarrativeStatus("Fetching papers from arxiv...", false);
    const papers = await fetchPapers(query);

    if (papers.length === 0) {
      showNarrativeError(
        `No papers found for "${query}". Try a different search term.`
      );
      setSearching(false);
      return;
    }

    currentPapers = papers;
    renderPapers(papers);
    document.getElementById("results-count").textContent =
      `${papers.length} papers found`;

    // Step 2: Stream analysis
    updateNarrativeStatus("Generating analysis...", false);
    await streamAnalysis(query, papers);
  } catch (err) {
    showNarrativeError(err.message || "An unexpected error occurred.");
  } finally {
    setSearching(false);
  }
}

// ── Show results layout ───────────────────────────────────────────────────
function showResultsSection(query) {
  document.getElementById("hero").classList.add("hidden");
  document.getElementById("results").classList.remove("hidden");
  document.getElementById("header-search").classList.remove("hidden");

  document.getElementById("results-query-title").textContent =
    `"${query}"`;

  // Reset narrative
  narrativeMarkdown = "";
  document.getElementById("narrative-body").innerHTML = "";
  document.getElementById("narrative-body").classList.add("hidden");
  document.getElementById("narrative-loading").classList.remove("hidden");
  document.getElementById("narrative-error").classList.add("hidden");
  document.getElementById("copy-btn").classList.add("hidden");

  document.getElementById("papers-list").innerHTML = "";
  document.getElementById("paper-count-badge").textContent = "0";

  updateNarrativeStatus("Starting...", false);
}

// ── Fetch papers ──────────────────────────────────────────────────────────
async function fetchPapers(query) {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_papers: 50 }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Search failed (${res.status})`);
  }

  const data = await res.json();
  return data.papers || [];
}

// ── Render paper cards ────────────────────────────────────────────────────
function renderPapers(papers) {
  const list = document.getElementById("papers-list");
  list.innerHTML = "";
  document.getElementById("paper-count-badge").textContent = papers.length;
  document.getElementById("loading-count").textContent = papers.length;

  papers.forEach((paper, idx) => {
    const card = document.createElement("div");
    card.className = "paper-card";
    card.setAttribute("data-idx", idx);

    const shortAuthors = paper.authors
      ? truncateAuthors(paper.authors)
      : "Unknown authors";

    const snippetText = paper.abstract
      ? paper.abstract.slice(0, 140) + "..."
      : "";

    card.innerHTML = `
      <div class="paper-title">
        ${paper.link
          ? `<a href="${escapeHtml(paper.link)}" target="_blank" rel="noopener" title="${escapeHtml(paper.title)}">${escapeHtml(paper.title)}</a>`
          : escapeHtml(paper.title)
        }
      </div>
      <div class="paper-meta">
        ${paper.date ? `<span class="paper-date">${escapeHtml(paper.date)}</span>` : ""}
        <span class="paper-authors" title="${escapeHtml(paper.authors)}">${escapeHtml(shortAuthors)}</span>
      </div>
      ${snippetText ? `<div class="paper-abstract-snippet">${escapeHtml(snippetText)}</div>` : ""}
    `;

    list.appendChild(card);
  });
}

// ── Stream narrative ──────────────────────────────────────────────────────
async function streamAnalysis(query, papers) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, papers }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Analysis failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Switch to showing body
  document.getElementById("narrative-loading").classList.add("hidden");
  const bodyEl = document.getElementById("narrative-body");
  bodyEl.classList.remove("hidden");

  let hasError = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") break;

      try {
        const parsed = JSON.parse(raw);
        if (parsed.error) {
          showNarrativeError(parsed.error);
          hasError = true;
          break;
        }
        if (parsed.text) {
          narrativeMarkdown += parsed.text;
          bodyEl.innerHTML = marked.parse(narrativeMarkdown);
        }
      } catch {
        // skip malformed SSE lines
      }
    }

    if (hasError) break;
  }

  if (!hasError) {
    // Final render pass
    bodyEl.innerHTML = marked.parse(narrativeMarkdown);
    updateNarrativeStatus("Complete", true);
    document.getElementById("copy-btn").classList.remove("hidden");
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────
function updateNarrativeStatus(text, done) {
  const el = document.getElementById("narrative-status");
  el.textContent = text;
  el.className = "narrative-status" + (done ? " done" : "");
}

function showNarrativeError(msg) {
  document.getElementById("narrative-loading").classList.add("hidden");
  document.getElementById("narrative-body").classList.add("hidden");
  const errEl = document.getElementById("narrative-error");
  errEl.textContent = `Error: ${msg}`;
  errEl.classList.remove("hidden");
  updateNarrativeStatus("Failed", false);
}

function setSearching(active) {
  const mainBtn = document.getElementById("main-search-btn");
  const headerBtn = document.getElementById("header-search-btn");
  mainBtn.disabled = active;
  headerBtn.disabled = active;
  mainBtn.innerHTML = active
    ? `<span>Analyzing...</span>`
    : `<span>Analyze</span><span class="btn-arrow">→</span>`;
}

function highlightInput(input) {
  input.focus();
  input.style.outline = "2px solid var(--orange)";
  setTimeout(() => (input.style.outline = ""), 1500);
}

// ── Reset to home ─────────────────────────────────────────────────────────
function resetToHome() {
  document.getElementById("hero").classList.remove("hidden");
  document.getElementById("results").classList.add("hidden");
  document.getElementById("header-search").classList.add("hidden");
  document.getElementById("main-query-input").value = "";
  document.getElementById("header-query-input").value = "";
  narrativeMarkdown = "";
  currentPapers = [];
}

// ── Copy narrative ────────────────────────────────────────────────────────
async function copyNarrative() {
  if (!narrativeMarkdown) return;
  try {
    await navigator.clipboard.writeText(narrativeMarkdown);
    const btn = document.getElementById("copy-btn");
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy"), 2000);
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = narrativeMarkdown;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateAuthors(authors) {
  // Show first author + et al if there are many
  const parts = authors.split(",");
  if (parts.length > 2) {
    return parts[0].trim() + " et al.";
  }
  return authors;
}
