import requests
from bs4 import BeautifulSoup
import urllib.parse


ARXIV_CATEGORIES = {
    "cs": "Computer Science",
    "stat": "Statistics",
    "eess": "Electrical Engineering & Systems Science",
    "q-bio": "Quantitative Biology",
}


def scrape_arxiv(query: str, max_papers: int = 50, category: str = "cs") -> list[dict]:
    """Scrape arxiv search results for a given query."""
    if category and category in ARXIV_CATEGORIES:
        base_url = f"https://arxiv.org/search/{category}"
    else:
        base_url = "https://arxiv.org/search/"

    # arxiv only accepts size values: 25, 50, 100, 200
    VALID_SIZES = [25, 50, 100, 200]
    size = min((s for s in VALID_SIZES if s >= max_papers), default=50)

    params = {
        "query": query,
        "searchtype": "all",
        "abstracts": "show",
        "order": "-announced_date_first",
        "size": size,
    }

    url = f"{base_url}?{urllib.parse.urlencode(params)}"

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    }

    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
    except requests.Timeout:
        raise Exception("Request to arxiv timed out. Please try again.")
    except requests.RequestException as e:
        raise Exception(f"Failed to fetch from arxiv: {str(e)}")

    soup = BeautifulSoup(response.text, "html.parser")

    # Check for no results
    no_results = soup.find("div", class_="is-warning")
    if no_results and "no results" in no_results.get_text(strip=True).lower():
        return []

    papers = []
    results = soup.find_all("li", class_="arxiv-result")

    for result in results:
        try:
            # Title
            title_elem = result.find("p", class_="title")
            title = title_elem.get_text(strip=True) if title_elem else "Unknown Title"

            # Abstract — prefer full, fall back to short
            abstract_elem = result.find("span", class_="abstract-full")
            if not abstract_elem:
                abstract_elem = result.find("span", class_="abstract-short")
            abstract = abstract_elem.get_text(strip=True) if abstract_elem else ""
            # Remove UI artifacts
            for artifact in ["▽ Less", "△ More", "[...]"]:
                abstract = abstract.replace(artifact, "")
            abstract = abstract.strip()

            # Authors
            authors_elem = result.find("p", class_="authors")
            authors = authors_elem.get_text(strip=True) if authors_elem else ""
            authors = authors.replace("Authors:", "").strip()

            # Date / submission info
            date_elem = result.find("p", class_="is-size-7")
            date = date_elem.get_text(strip=True) if date_elem else ""
            # Extract just the submitted date
            if "Submitted" in date:
                parts = date.split(";")
                date = parts[0].replace("Submitted", "").strip()

            # arxiv ID and canonical link
            link = ""
            arxiv_id = ""
            id_elem = result.find("p", class_="list-title")
            if id_elem:
                a_tag = id_elem.find("a")
                if a_tag:
                    href = a_tag.get("href", "")
                    link = (
                        f"https://arxiv.org{href}"
                        if href.startswith("/")
                        else href
                    )
                    arxiv_id = href.rstrip("/").split("/")[-1]

            # Subject tags
            subjects = []
            subject_span = result.find("span", class_="tag")
            if subject_span:
                subjects = [
                    s.get_text(strip=True)
                    for s in result.find_all("span", class_="tag")
                ]

            papers.append(
                {
                    "id": arxiv_id,
                    "title": title,
                    "abstract": abstract[:2500],
                    "authors": authors,
                    "date": date,
                    "link": link,
                    "subjects": subjects,
                }
            )
        except Exception:
            continue

    return papers
