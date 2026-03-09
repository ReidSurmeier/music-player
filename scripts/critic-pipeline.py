#!/usr/bin/env python3
"""
critic-pipeline.py — Automated album discovery from cultural critics

Scrapes reputable music publications for highly-rated albums that match
the library's genre fingerprint. Fully automatic: finds, downloads, and
deploys one album per week.

Sources (rotating weekly):
  - Pitchfork Best New Albums
  - Resident Advisor (RA) album reviews (4.0+)
  - The Wire magazine recommendations
  - Bandcamp Daily album features
  - Boomkat recommended releases

Genre territories (balanced):
  1. Deep House / Garage / UKG
  2. Downtempo / Trip-Hop / Ambient
  3. Experimental / Spiritual Jazz-Electronics
  4. Left-Field / Textural Electronic
  5. DJ Mixes / Cultural Curations

Usage:
  python3 critic-pipeline.py              # Find + add one album
  python3 critic-pipeline.py --dry-run    # Preview without adding
  python3 critic-pipeline.py --list       # Show candidates only
"""

import json, os, sys, subprocess, re, time, random, hashlib
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.parse import quote_plus

REPO = Path(__file__).resolve().parent.parent
SONGS_JSON = REPO / "public" / "songs.json"
AUDIO_DIR = REPO / "public" / "audio"
COVERS_DIR = REPO / "public" / "dvd-covers"

DRY_RUN = "--dry-run" in sys.argv
LIST_ONLY = "--list" in sys.argv

# Genre keywords for classification
GENRE_MAP = {
    "deep_house_garage": [
        "deep house", "garage", "uk garage", "ukg", "house music",
        "detroit house", "nyc house", "todd edwards", "chopped",
        "soulful house", "micro house", "minimal house"
    ],
    "downtempo_ambient": [
        "downtempo", "trip-hop", "trip hop", "ambient", "chill",
        "lounge", "dub", "electronica", "chillout", "balearic",
        "new age", "fourth world"
    ],
    "spiritual_jazz_electronic": [
        "spiritual jazz", "cosmic jazz", "nu jazz", "jazz fusion",
        "modular synth", "avant-garde jazz", "london jazz",
        "astral", "free jazz", "improvisation", "jazz guitar",
        "jazz", "saxophone", "trumpet", "piano trio", "quartet",
        "modal", "post-bop", "sun ra", "pharoah", "coltrane"
    ],
    "leftfield_electronic": [
        "folktronica", "idm", "glitch", "experimental electronic",
        "art pop", "abstract", "textural", "indietronica",
        "post-dubstep", "left-field", "leftfield"
    ],
    "dj_mix_curation": [
        "dj mix", "compilation", "mix cd", "sound system",
        "boiler room", "radio show", "curated", "selector"
    ],
}

# Category assignment based on word count in title
def word_count_category(title: str) -> str:
    words = len(re.findall(r'\b\w+\b', title))
    if words <= 2:
        return "oneword" if words <= 1 else "twowords"
    return "threewords"


def log(msg):
    print(f"[critic-pipeline] {msg}", flush=True)


def curl_text(url: str, timeout: int = 15) -> str:
    """Fetch URL as text."""
    req = Request(url, headers={"User-Agent": "MusicCriticBot/1.0"})
    try:
        with urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        log(f"  fetch error: {e}")
        return ""


def load_library():
    """Load current songs.json."""
    with open(SONGS_JSON) as f:
        return json.load(f)


def genre_balance(songs: list) -> dict:
    """Count how many songs fall in each genre territory."""
    counts = {g: 0 for g in GENRE_MAP}
    for s in songs:
        title = s["title"].lower()
        desc = s.get("description", "").lower()
        text = f"{title} {desc}"
        for genre, keywords in GENRE_MAP.items():
            if any(kw in text for kw in keywords):
                counts[genre] += 1
                break
    return counts


def least_represented_genre(songs: list) -> str:
    """Find which genre territory needs more representation."""
    counts = genre_balance(songs)
    return min(counts, key=counts.get)


def classify_genre(title: str, description: str = "") -> str:
    """Classify an album into a genre territory."""
    text = f"{title} {description}".lower()
    scores = {}
    for genre, keywords in GENRE_MAP.items():
        scores[genre] = sum(1 for kw in keywords if kw in text)
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "leftfield_electronic"


# ── SCRAPERS ────────────────────────────────────────────────────────

def scrape_pitchfork_bna() -> list:
    """Scrape Pitchfork album reviews via RSS, then fetch each page for artist name."""
    log("Scraping Pitchfork album reviews (RSS + page titles)...")
    candidates = []
    rss = curl_text("https://pitchfork.com/feed/feed-album-reviews/rss")
    if not rss:
        return candidates

    items = re.findall(r'<item>(.*?)</item>', rss, re.DOTALL)
    for item in items[:15]:  # Limit to 15 to avoid too many fetches
        link_m = re.search(r'<link>([^<]+)</link>', item)
        if not link_m:
            continue

        link = link_m.group(1).strip()

        # Fetch the review page to get "Artist: Album" from <title>
        page = curl_text(link)
        if not page:
            continue

        title_tag = re.search(r'<title>([^<]+)</title>', page)
        if not title_tag:
            continue

        # Format: "Artist: Album Album Review | Pitchfork"
        raw = title_tag.group(1).strip()
        raw = re.sub(r'\s*\|?\s*Pitchfork\s*$', '', raw)
        raw = re.sub(r'\s*Album Review\s*$', '', raw)

        parts = raw.split(": ", 1)
        if len(parts) == 2:
            artist = parts[0].strip()
            album = parts[1].strip()
        else:
            continue

        # Get description from RSS item for genre classification
        desc_m = re.search(r'<description>([^<]+)</description>', item)
        desc = desc_m.group(1).strip() if desc_m else ""

        if artist and album and len(album) > 1:
            candidates.append({
                "artist": artist,
                "album": album,
                "title": f"{artist} - {album}",
                "source": "Pitchfork",
                "rating": "Album Review",
                "description": desc,
            })

        time.sleep(0.5)  # Be polite

    log(f"  Found {len(candidates)} Pitchfork candidates")
    return candidates


def scrape_bandcamp_daily() -> list:
    """Scrape Bandcamp Daily via RSS — album reviews and best-of lists."""
    log("Scraping Bandcamp Daily (RSS)...")
    candidates = []
    rss = curl_text("https://daily.bandcamp.com/feed")
    if not rss:
        return candidates

    items = re.findall(r'<item>(.*?)</item>', rss, re.DOTALL)
    for item in items[:30]:
        title_m = re.search(r'<title>([^<]+)</title>', item)
        cats = re.findall(r'<category>([^<]+)</category>', item)
        if not title_m:
            continue

        raw_title = title_m.group(1).strip()
        cats_lower = [c.lower() for c in cats]

        # Only use "Album of the Day" and "Essential Releases" and specific best-of lists
        # that match our genres
        dominated_cats = {"album of the day", "essential releases",
                          "best ambient", "best electronic", "best jazz",
                          "best experimental"}
        if not any(c in dominated_cats for c in cats_lower):
            continue

        # Parse "Artist, \"Album Title\"" format
        m = re.match(r'^(.+?),\s*["\u201c](.+?)["\u201d]', raw_title)
        if m:
            artist = m.group(1).strip()
            album = m.group(2).strip()
            # Skip compilations like "Various Artists"
            if artist.lower() in ("various artists", "various"):
                continue
            candidates.append({
                "artist": artist,
                "album": album,
                "title": f"{artist} - {album}",
                "source": "Bandcamp Daily",
                "rating": ", ".join(cats[:2]),
            })

    log(f"  Found {len(candidates)} Bandcamp Daily candidates")
    return candidates


def scrape_the_quietus() -> list:
    """Scrape The Quietus via RSS."""
    log("Scraping The Quietus (RSS)...")
    candidates = []
    rss = curl_text("https://thequietus.com/feed")
    if not rss:
        return candidates

    items = re.findall(r'<item>(.*?)</item>', rss, re.DOTALL)
    for item in items[:25]:
        title_m = re.search(r'<title>([^<]+)</title>', item)
        if not title_m:
            continue
        raw = title_m.group(1).strip()
        # Quietus review format: "Artist – Album"
        parts = re.split(r'\s*[-–—]\s*', raw, 1)
        if len(parts) == 2 and len(parts[0]) > 1 and len(parts[1]) > 1:
            candidates.append({
                "artist": parts[0].strip(),
                "album": parts[1].strip(),
                "title": raw,
                "source": "The Quietus",
                "rating": "Review",
            })

    log(f"  Found {len(candidates)} Quietus candidates")
    return candidates


def scrape_the_wire() -> list:
    """Scrape The Wire via RSS."""
    log("Scraping The Wire (RSS)...")
    candidates = []
    rss = curl_text("https://www.thewire.co.uk/rss")
    if not rss:
        return candidates

    items = re.findall(r'<item>(.*?)</item>', rss, re.DOTALL)
    for item in items[:30]:
        title_m = re.search(r'<title>([^<]+)</title>', item)
        desc_m = re.search(r'<description>([^<]+)</description>', item)
        if not title_m:
            continue
        raw = title_m.group(1).strip()
        desc = desc_m.group(1).strip() if desc_m else ""

        # Wire titles are often "Artist: Album" or just article titles
        # Skip non-review articles
        if any(skip in raw.lower() for skip in [
            "presents", "adventures in sound", "mix:", "wire mix",
            "playlist:", "against the grain", "below the radar",
            "premiere:", "read an extract", "unlimited editions",
            "reviewed", "wire "
        ]):
            continue

        parts = re.split(r'\s*[:–—]\s*', raw, 1)
        if len(parts) == 2 and len(parts[0]) > 1 and len(parts[1]) > 1:
            candidates.append({
                "artist": parts[0].strip(),
                "album": parts[1].strip(),
                "title": raw,
                "source": "The Wire",
                "rating": "Featured",
            })

    log(f"  Found {len(candidates)} Wire candidates")
    return candidates


def scrape_fact_magazine() -> list:
    """Scrape FACT Magazine via RSS."""
    log("Scraping FACT Magazine (RSS)...")
    candidates = []
    rss = curl_text("https://www.factmag.com/feed/")
    if not rss:
        return candidates

    items = re.findall(r'<item>(.*?)</item>', rss, re.DOTALL)
    for item in items[:15]:
        title_m = re.search(r'<title>([^<]+)</title>', item)
        if not title_m:
            continue
        raw = title_m.group(1).strip()
        # Clean HTML entities
        raw = raw.replace("&#8217;", "'").replace("&#038;", "&").replace("&amp;", "&")

        # FACT titles: "Artist's Album title..." — hard to parse
        # Look for "'s " pattern
        m = re.match(r"^(.+?)'s\s+(.+?)(?:\s+launches|\s+opens|\s+extended|\s+presents|\s+explores)", raw)
        if m:
            candidates.append({
                "artist": m.group(1).strip(),
                "album": m.group(2).strip(),
                "title": raw,
                "source": "FACT Magazine",
                "rating": "Featured",
            })

    log(f"  Found {len(candidates)} FACT candidates")
    return candidates


def scrape_ra_reviews() -> list:
    """Scrape Resident Advisor via web search for recent top-rated album reviews."""
    log("Scraping Resident Advisor (via web search)...")
    candidates = []

    # Search for recent RA reviews
    search_url = "https://www.google.com/search?q=site:ra.co+%22album+review%22+2026&num=10"
    html = curl_text(search_url)
    if not html:
        # Fallback: try RA's GraphQL API
        try:
            import json as _json
            gql = '{"query":"{ reviews(type: ALBUM, first: 10) { edges { node { title artist { name } } } } }"}'
            req = Request("https://ra.co/graphql", data=gql.encode(),
                         headers={"User-Agent": "MusicCriticBot/1.0", "Content-Type": "application/json"})
            with urlopen(req, timeout=10) as r:
                data = _json.loads(r.read())
                for edge in data.get("data", {}).get("reviews", {}).get("edges", []):
                    node = edge["node"]
                    candidates.append({
                        "artist": node["artist"]["name"],
                        "album": node["title"],
                        "title": f"{node['artist']['name']} - {node['title']}",
                        "source": "Resident Advisor",
                        "rating": "Review",
                    })
        except Exception:
            pass

    log(f"  Found {len(candidates)} RA candidates")
    return candidates


def scrape_nts_picks() -> list:
    """NTS doesn't have a good album review RSS — skip for now."""
    log("Scraping NTS Radio... (no reliable RSS, skipping)")
    return []


def scrape_juno_best() -> list:
    """Juno Records — JS-rendered, skip for now."""
    log("Scraping Juno Records... (JS-rendered, skipping)")
    return []


def scrape_dj_mag() -> list:
    """DJ Mag — JS-rendered, skip for now."""
    log("Scraping DJ Mag... (JS-rendered, skipping)")
    return []


# ── YOUTUBE SEARCH ──────────────────────────────────────────────────

def find_youtube_full_album(artist: str, album: str) -> dict | None:
    """Search YouTube for the full album and return video info."""
    query = quote_plus(f"{artist} {album} full album")
    url = f"https://www.youtube.com/results?search_query={query}"
    html = curl_text(url)
    if not html:
        return None

    # Extract video IDs and titles from search results
    videos = re.findall(r'"videoId":"([^"]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"', html)
    if not videos:
        videos = re.findall(r'/watch\?v=([^"&]{11}).*?title="([^"]+)"', html)

    for vid_id, title in videos[:5]:
        title_lower = title.lower()
        # Prefer results with "full album" or "full ep" in title
        if "full album" in title_lower or "full ep" in title_lower or album.lower() in title_lower:
            # Check duration — we want albums (>15 min)
            return {"yt_id": vid_id, "title": title}

    # Fallback: just use first result
    if videos:
        return {"yt_id": videos[0][0], "title": videos[0][1]}

    return None


# ── ADD TO LIBRARY ──────────────────────────────────────────────────

def is_already_in_library(songs: list, artist: str, album: str) -> bool:
    """Check if album is already in the library."""
    check = f"{artist} {album}".lower()
    for s in songs:
        if artist.lower() in s["title"].lower() or album.lower() in s["title"].lower():
            return True
    return False


def download_audio(yt_id: str) -> bool:
    """Download audio from YouTube."""
    out_path = AUDIO_DIR / f"{yt_id}.mp3"
    if out_path.exists():
        return True

    log(f"  Downloading audio: {yt_id}")
    r = subprocess.run(
        ["yt-dlp", "-x", "--audio-format", "mp3", "--audio-quality", "0",
         "-o", str(out_path).replace(".mp3", ".%(ext)s"),
         f"https://www.youtube.com/watch?v={yt_id}"],
        capture_output=True, timeout=300
    )
    return out_path.exists()


def download_thumbnail(yt_id: str, arena_id: int) -> bool:
    """Download YouTube thumbnail as cover art."""
    out_path = COVERS_DIR / f"arena_{arena_id}.webp"
    if out_path.exists():
        return True

    for res in ["maxresdefault", "hqdefault"]:
        url = f"https://img.youtube.com/vi/{yt_id}/{res}.jpg"
        tmp = "/tmp/critic_thumb.jpg"
        r = subprocess.run(["curl", "-sL", "-o", tmp, "-w", "%{http_code}", url],
                           capture_output=True, text=True)
        if r.stdout.strip() == "200" and os.path.getsize(tmp) > 1000:
            subprocess.run(["python3", "-c", f"""
from PIL import Image
img = Image.open('{tmp}')
w, h = img.size
s = min(w, h)
left = (w - s) // 2
top = (h - s) // 2
img = img.crop((left, top, left + s, top + s))
img = img.resize((800, 800), Image.LANCZOS)
img.save('{out_path}', 'WEBP', quality=80)
"""], capture_output=True)
            return out_path.exists()

    return False


def check_file_size(yt_id: str) -> bool:
    """Check if audio file is under 95MB. If not, split it."""
    path = AUDIO_DIR / f"{yt_id}.mp3"
    if not path.exists():
        return False

    size = path.stat().st_size
    if size <= 95_000_000:
        return True  # Fine as-is

    # Need to split
    log(f"  File too large ({size // 1048576}MB), splitting...")
    dur_r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True
    )
    duration = float(dur_r.stdout.strip())
    mid = duration / 2

    p1 = AUDIO_DIR / f"{yt_id}_pt1.mp3"
    p2 = AUDIO_DIR / f"{yt_id}_pt2.mp3"
    subprocess.run(["ffmpeg", "-y", "-i", str(path), "-t", str(mid), "-c", "copy", str(p1)], capture_output=True)
    subprocess.run(["ffmpeg", "-y", "-i", str(path), "-ss", str(mid), "-c", "copy", str(p2)], capture_output=True)
    path.unlink()

    return True  # Caller will need to handle the split in songs.json


def add_to_library(candidate: dict, yt_info: dict, songs: list) -> list:
    """Add album to songs.json and return updated list."""
    yt_id = yt_info["yt_id"]
    title = f"{candidate['artist']} - {candidate['album']}"
    category = "zerowords"  # Critic pipeline additions always go in Zero Words row

    # Generate a stable arena_id from the yt_id
    arena_id = int(hashlib.md5(yt_id.encode()).hexdigest()[:8], 16)

    # Check if file was split
    pt1 = AUDIO_DIR / f"{yt_id}_pt1.mp3"
    if pt1.exists():
        # Add two entries
        for part, suffix in [(1, "_pt1"), (2, "_pt2")]:
            songs.append({
                "arena_id": arena_id,
                "title": f"{title} (Part {part})",
                "yt_id": f"{yt_id}{suffix}",
                "url": f"https://www.youtube.com/watch?v={yt_id}",
                "description": f"Added by critic pipeline. Source: {candidate['source']} ({candidate['rating']})",
                "thumbnail": f"https://img.youtube.com/vi/{yt_id}/hqdefault.jpg",
                "categories": [category],
                "meta": {"album": candidate["album"], "year": None, "label": candidate["source"]},
                "gradient": {"from": "#888", "to": "#aaa", "hue": random.randint(0, 360)},
            })
    else:
        songs.append({
            "arena_id": arena_id,
            "title": title,
            "yt_id": yt_id,
            "url": f"https://www.youtube.com/watch?v={yt_id}",
            "description": f"Added by critic pipeline. Source: {candidate['source']} ({candidate['rating']})",
            "thumbnail": f"https://img.youtube.com/vi/{yt_id}/hqdefault.jpg",
            "categories": [category],
            "meta": {"album": candidate["album"], "year": None, "label": candidate["source"]},
            "gradient": {"from": "#888", "to": "#aaa", "hue": random.randint(0, 360)},
        })

    return songs


def git_commit_push(title: str, source: str):
    """Commit and push changes."""
    subprocess.run(["git", "add", "-A"], cwd=str(REPO), capture_output=True)
    msg = f"feat(critic): add {title}\n\nSource: {source}\nAdded automatically by critic-pipeline.py"
    subprocess.run(["git", "commit", "-m", msg], cwd=str(REPO), capture_output=True)
    subprocess.run(["git", "push"], cwd=str(REPO), capture_output=True, timeout=120)
    log(f"  Committed and pushed: {title}")


# ── LIBRARY ANALYSIS ────────────────────────────────────────────────

def extract_library_fingerprint(songs: list) -> dict:
    """Build a fingerprint of the library — artists, labels, sonic descriptors."""
    artists = set()
    labels = set()
    for s in songs:
        t = s["title"]
        if " - " in t:
            artists.add(t.split(" - ")[0].strip())
        elif " | " in t:
            artists.add(t.split(" | ")[0].strip())
        meta = s.get("meta", {})
        if meta.get("label"):
            labels.add(meta["label"])

    # Clean up artist names — remove suffixes
    clean_artists = set()
    for a in artists:
        a = re.sub(r'\s*(feat\.?|ft\.?|A\.K\.A|aka)\s.*', '', a, flags=re.IGNORECASE).strip()
        a = re.sub(r'\s*\(.*?\)', '', a).strip()
        a = re.sub(r'\s*\[.*?\]', '', a).strip()
        if len(a) > 2:
            clean_artists.add(a)

    return {
        "artists": clean_artists,
        "labels": labels,
        # Sonic descriptors — hand-curated from the actual library
        "descriptors": [
            "deep house", "uk garage", "ambient", "downtempo",
            "spiritual jazz", "experimental electronic", "dub",
            "trip hop", "folktronica", "minimal", "detroit techno",
            "sound system", "boiler room", "modular synth",
        ],
        # Reference artists for search queries (most representative)
        "reference_artists": [
            "Four Tet", "Todd Edwards", "Nala Sinephro", "Soul Capsule",
            "Kruder & Dorfmeister", "Brian Eno", "Octave One", "Zero 7",
            "Thievery Corporation", "The Orb", "Flying Lotus",
        ],
    }


def search_critic_recommendations(fingerprint: dict) -> list:
    """Search for critic recommendations based on library fingerprint.
    
    Strategy: Use web search to find reviews/lists from reputable publications
    that mention artists similar to what's in the library.
    """
    candidates = []
    seen_titles = set()

    # Pick 3-4 reference artists to search around (rotate weekly)
    week = int(time.time()) // (7 * 86400)
    random.seed(week)
    ref_artists = list(fingerprint["reference_artists"])
    random.shuffle(ref_artists)
    search_artists = ref_artists[:4]

    # Also pick 2 descriptors
    descs = list(fingerprint["descriptors"])
    random.shuffle(descs)
    search_descs = descs[:2]

    # Search queries — find critics talking about music like ours
    queries = []
    for artist in search_artists:
        queries.append(f'"{artist}" "if you like" OR "fans of" OR "similar to" OR "recommended" album 2024 OR 2025 OR 2026')
        queries.append(f'"{artist}" album review site:pitchfork.com OR site:ra.co OR site:thequietus.com OR site:thewire.co.uk')
    for desc in search_descs:
        queries.append(f'best {desc} albums 2025 2026 site:pitchfork.com OR site:ra.co OR site:bandcamp.com')

    BRAVE_KEY = "BSAT5A6h4P9Jyhl-TJOQ-l2DgzMfUXF"

    for query in queries[:6]:  # Limit to 6 searches
        log(f"  Searching: {query[:80]}...")
        search_url = f"https://api.search.brave.com/res/v1/web/search?q={quote_plus(query)}&count=5"
        req = Request(search_url, headers={
            "Accept": "application/json",
            "X-Subscription-Token": BRAVE_KEY,
        })
        try:
            with urlopen(req, timeout=10) as r:
                import json as _json
                data = _json.loads(r.read())
                results = [(
                    w.get("title", ""),
                    w.get("description", ""),
                    w.get("url", "")
                ) for w in data.get("web", {}).get("results", [])]
        except Exception as e:
            log(f"    Search error: {e}")
            time.sleep(2)
            continue

        for title, snippet, url in results[:5]:
            title = re.sub(r'<[^>]+>', '', title).strip()
            snippet = re.sub(r'<[^>]+>', '', snippet).strip()

            # Try to extract "Artist - Album" from the result title
            # Common patterns: "Artist: Album Review", "Artist - Album | Publication"
            for sep in [": ", " - ", " – ", " — "]:
                if sep in title:
                    parts = title.split(sep, 1)
                    artist_candidate = parts[0].strip()
                    album_candidate = re.sub(r'\s*(Album Review|Review|\| .*|· .*)$', '', parts[1]).strip()

                    # Skip if it's one of our existing artists
                    if artist_candidate.lower() in {a.lower() for a in fingerprint["artists"]}:
                        continue

                    # Skip if too short or looks like a publication name
                    if len(artist_candidate) < 2 or len(album_candidate) < 2:
                        continue
                    skip_names = {
                        "pitchfork", "ra", "the wire", "the quietus", "bandcamp", "fact",
                        "reddit", "r/electronicmusic", "r/music", "r/ifyoulikeblank",
                        "the 100 best", "the 40 best", "the 50 best", "top 55", "best albums",
                        "edm", "npr", "kcsb", "inverted audio", "tickets", "concerts",
                        "r/electronicmusic on reddit", "r/music on reddit",
                    }
                    if artist_candidate.lower() in skip_names:
                        continue
                    # Skip Reddit threads, best-of lists, concert pages, announcements
                    combined = f"{title} {snippet} {url}".lower()
                    if any(skip in combined for skip in [
                        "reddit.com", "reddit", "r/", "concert", "ticket",
                        "tour dates", "live tour", "best albums of 20",
                        "best of 20", "top albums", "top 50", "top 100",
                        "top 55", "announces", "kcsb", "edm.com",
                        "songkick", "setlist", "festival",
                    ]):
                        continue
                    # Must look like a real album review or recommendation
                    # Skip if album_candidate contains "KCSB", "FM", "announces", etc.
                    if any(skip in album_candidate.lower() for skip in [
                        "kcsb", " fm", "announces", "first album in",
                    ]):
                        continue

                    key = f"{artist_candidate}|{album_candidate}".lower()
                    if key not in seen_titles:
                        seen_titles.add(key)
                        # Determine which publication this came from
                        source = "Web Search"
                        for pub, domain in [
                            ("Pitchfork", "pitchfork.com"),
                            ("Resident Advisor", "ra.co"),
                            ("The Quietus", "thequietus.com"),
                            ("The Wire", "thewire.co.uk"),
                            ("Bandcamp Daily", "bandcamp.com"),
                        ]:
                            if domain in url.lower() or domain in title.lower() or domain in snippet.lower():
                                source = pub
                                break

                        candidates.append({
                            "artist": artist_candidate,
                            "album": album_candidate,
                            "title": f"{artist_candidate} - {album_candidate}",
                            "source": source,
                            "rating": "Critic Recommendation",
                            "description": snippet[:200],
                            "search_context": query[:60],
                        })
                    break

        time.sleep(2)

    return candidates


# ── MAIN ────────────────────────────────────────────────────────────

def main():
    log("Starting critic pipeline...")

    songs = load_library()
    log(f"Current library: {len(songs)} tracks")

    # Build library fingerprint
    fingerprint = extract_library_fingerprint(songs)
    log(f"Library artists: {len(fingerprint['artists'])}")
    log(f"Reference artists for search: {', '.join(fingerprint['reference_artists'][:4])}")

    # PHASE 1: Search for recommendations based on library fingerprint
    log("\n── Phase 1: Searching for critic recommendations based on your library ──")
    search_candidates = search_critic_recommendations(fingerprint)
    log(f"Found {len(search_candidates)} search-based candidates")

    # PHASE 2: Also check RSS feeds for recent reviews that overlap with our sonic world
    log("\n── Phase 2: Checking RSS feeds for relevant recent reviews ──")
    rss_candidates = []
    scrapers = [
        scrape_pitchfork_bna,
        scrape_bandcamp_daily,
        scrape_the_quietus,
        scrape_the_wire,
    ]
    for scraper in scrapers:
        try:
            candidates = scraper()
            # Filter RSS candidates — only keep ones that have sonic overlap
            for c in candidates:
                text = f"{c['title']} {c.get('description', '')}".lower()
                # Check if any of our descriptors or reference artists appear
                has_overlap = any(d in text for d in fingerprint["descriptors"])
                has_artist_ref = any(a.lower() in text for a in fingerprint["reference_artists"])
                if has_overlap or has_artist_ref:
                    c["description"] = c.get("description", "")
                    rss_candidates.append(c)
        except Exception as e:
            log(f"  Scraper error: {e}")
        time.sleep(1)

    log(f"Found {len(rss_candidates)} relevant RSS candidates")

    # Combine
    all_candidates = search_candidates + rss_candidates
    if not all_candidates:
        log("No candidates found. Exiting.")
        return

    log(f"\nTotal candidates: {len(all_candidates)}")

    # Filter: remove albums already in library
    filtered = [
        c for c in all_candidates
        if not is_already_in_library(songs, c["artist"], c["album"])
    ]
    log(f"After dedup: {len(filtered)} candidates")

    if not filtered:
        log("All candidates already in library. Exiting.")
        return

    # Classify genre for logging
    for c in filtered:
        c["genre"] = classify_genre(c["title"], c.get("description", ""))

    # Rank by: source reputation + whether it came from a library-based search
    source_rank = {
        "Pitchfork": 5, "Resident Advisor": 5, "The Wire": 4,
        "The Quietus": 3, "Bandcamp Daily": 3, "FACT Magazine": 3,
        "Web Search": 2,
    }
    # Search-based candidates get a bonus because they're already contextually relevant
    for c in filtered:
        c["score"] = source_rank.get(c["source"], 1)
        if c.get("search_context"):
            c["score"] += 3  # Bonus for being found via library-based search

    filtered.sort(key=lambda c: c["score"], reverse=True)

    if LIST_ONLY:
        log("\nCandidates (ranked):")
        for i, c in enumerate(filtered[:15]):
            ctx = f" (via: {c['search_context'][:40]})" if c.get("search_context") else ""
            log(f"  {i+1}. {c['title']} [{c['source']}, score={c['score']}] genre={c['genre']}{ctx}")
        return

    # Try candidates until we find one available on YouTube
    for c in filtered[:10]:
        log(f"Trying: {c['title']} [{c['source']}]")

        yt_info = find_youtube_full_album(c["artist"], c["album"])
        if not yt_info:
            log(f"  No YouTube result found, skipping")
            continue

        log(f"  Found: {yt_info['title']} ({yt_info['yt_id']})")

        if DRY_RUN:
            log(f"  [DRY RUN] Would add: {c['title']}")
            return

        # Download audio
        if not download_audio(yt_info["yt_id"]):
            log(f"  Download failed, skipping")
            continue

        # Check file size / split if needed
        check_file_size(yt_info["yt_id"])

        # Generate arena_id and download cover
        arena_id = int(hashlib.md5(yt_info["yt_id"].encode()).hexdigest()[:8], 16)
        download_thumbnail(yt_info["yt_id"], arena_id)

        # Add to library
        songs = add_to_library(c, yt_info, songs)
        with open(SONGS_JSON, "w") as f:
            json.dump(songs, f, indent=2)

        # Commit and push
        git_commit_push(c["title"], c["source"])

        log(f"✓ Added: {c['title']} from {c['source']}")
        return

    log("No suitable album found on YouTube. Try again next week.")


if __name__ == "__main__":
    main()
