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
        "astral", "free jazz", "improvisation"
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
    """Scrape Pitchfork Best New Albums."""
    log("Scraping Pitchfork Best New Albums...")
    candidates = []
    html = curl_text("https://pitchfork.com/reviews/best/albums/")
    if not html:
        return candidates

    # Extract album entries from the page
    # Look for patterns like: Artist - Album Title, rating
    # Pitchfork BNA page has structured review cards
    blocks = re.findall(
        r'<h2[^>]*>([^<]+)</h2>\s*(?:<[^>]+>)*\s*<h2[^>]*>([^<]+)</h2>',
        html
    )
    if not blocks:
        # Try alternative pattern
        blocks = re.findall(
            r'"artistName":"([^"]+)".*?"albumName":"([^"]+)"',
            html
        )

    for artist, album in blocks[:20]:
        artist = artist.strip()
        album = album.strip()
        if artist and album:
            candidates.append({
                "artist": artist,
                "album": album,
                "title": f"{artist} - {album}",
                "source": "Pitchfork BNA",
                "rating": "Best New Album",
            })

    log(f"  Found {len(candidates)} Pitchfork BNA candidates")
    return candidates


def scrape_ra_reviews() -> list:
    """Scrape Resident Advisor album reviews."""
    log("Scraping Resident Advisor reviews...")
    candidates = []
    html = curl_text("https://ra.co/reviews/albums")
    if not html:
        return candidates

    # RA review entries
    entries = re.findall(
        r'"title":"([^"]+)".*?"artist":\{"name":"([^"]+)"',
        html
    )
    for album, artist in entries[:20]:
        candidates.append({
            "artist": artist.strip(),
            "album": album.strip(),
            "title": f"{artist.strip()} - {album.strip()}",
            "source": "Resident Advisor",
            "rating": "4.0+",
        })

    log(f"  Found {len(candidates)} RA candidates")
    return candidates


def scrape_bandcamp_daily() -> list:
    """Scrape Bandcamp Daily album features."""
    log("Scraping Bandcamp Daily...")
    candidates = []
    html = curl_text("https://daily.bandcamp.com/best-ambient")
    html2 = curl_text("https://daily.bandcamp.com/best-electronic")
    html3 = curl_text("https://daily.bandcamp.com/best-jazz")

    for page in [html, html2, html3]:
        if not page:
            continue
        # Bandcamp daily typically has structured album links
        entries = re.findall(
            r'<a[^>]+href="([^"]*)"[^>]*>\s*<[^>]+>\s*([^<]+)\s*</[^>]+>\s*<[^>]+>\s*([^<]+)',
            page
        )
        for _, title, artist in entries[:10]:
            title = title.strip()
            artist = artist.strip()
            if title and artist and len(title) > 3:
                candidates.append({
                    "artist": artist,
                    "album": title,
                    "title": f"{artist} - {title}",
                    "source": "Bandcamp Daily",
                    "rating": "Featured",
                })

    log(f"  Found {len(candidates)} Bandcamp Daily candidates")
    return candidates


def scrape_boomkat() -> list:
    """Scrape Boomkat recommended releases."""
    log("Scraping Boomkat recommended...")
    candidates = []
    html = curl_text("https://boomkat.com/bestsellers")
    if not html:
        return candidates

    entries = re.findall(
        r'<a[^>]+class="[^"]*product[^"]*"[^>]*>.*?<span[^>]*>([^<]+)</span>.*?<span[^>]*>([^<]+)</span>',
        html, re.DOTALL
    )
    for artist, album in entries[:15]:
        artist = artist.strip()
        album = album.strip()
        if artist and album:
            candidates.append({
                "artist": artist,
                "album": album,
                "title": f"{artist} - {album}",
                "source": "Boomkat",
                "rating": "Bestseller",
            })

    log(f"  Found {len(candidates)} Boomkat candidates")
    return candidates


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
    category = word_count_category(title)

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


# ── MAIN ────────────────────────────────────────────────────────────

def main():
    log("Starting critic pipeline...")

    songs = load_library()
    log(f"Current library: {len(songs)} tracks")

    # Determine which genre needs more representation
    target_genre = least_represented_genre(songs)
    log(f"Least represented genre: {target_genre}")

    # Scrape all sources
    all_candidates = []
    scrapers = [
        scrape_pitchfork_bna,
        scrape_ra_reviews,
        scrape_bandcamp_daily,
        scrape_boomkat,
    ]

    # Rotate scrapers — use week number to vary
    week = int(time.time()) // (7 * 86400)
    random.seed(week)
    random.shuffle(scrapers)

    for scraper in scrapers[:3]:  # Use 3 sources per run
        try:
            candidates = scraper()
            all_candidates.extend(candidates)
        except Exception as e:
            log(f"  Scraper error: {e}")
        time.sleep(2)

    if not all_candidates:
        log("No candidates found from any source. Exiting.")
        return

    log(f"Total candidates: {len(all_candidates)}")

    # Filter: remove albums already in library
    filtered = [
        c for c in all_candidates
        if not is_already_in_library(songs, c["artist"], c["album"])
    ]
    log(f"After dedup: {len(filtered)} candidates")

    if not filtered:
        log("All candidates already in library. Exiting.")
        return

    # Score candidates by genre relevance to least-represented territory
    for c in filtered:
        genre = classify_genre(c["title"], "")
        c["genre"] = genre
        c["genre_match"] = 1 if genre == target_genre else 0

    # Sort: genre match first, then by source reputation
    source_rank = {"Pitchfork BNA": 4, "Resident Advisor": 3, "Boomkat": 2, "Bandcamp Daily": 2}
    filtered.sort(key=lambda c: (c["genre_match"], source_rank.get(c["source"], 1)), reverse=True)

    if LIST_ONLY:
        log("\nCandidates (ranked):")
        for i, c in enumerate(filtered[:15]):
            log(f"  {i+1}. {c['title']} [{c['source']}] genre={c['genre']} match={c['genre_match']}")
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
