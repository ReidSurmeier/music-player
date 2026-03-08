#!/usr/bin/env python3
"""DVD Cover Generator v2 — research-driven, faithful transplant approach."""

import json
import subprocess
import time
import sys
import os
import re
import urllib.request
from pathlib import Path

SONGS_JSON = Path.home() / "Projects/music-player/public/songs.json"
OUTPUT_DIR = Path("/mnt/movies/OpenclawOutput/DVD new")
TEMP_DIR = Path.home() / "Projects/music-player/temp_covers"
HERO_REF = Path.home() / "Projects/music-player/hero-refs/katamari_disc.jpg"
NANO_SCRIPT = Path.home() / ".npm-global/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py"
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyDsmZJrTd59rEoGhliQ1ErvJ2iqKeuQzGA")
DISCOGS_API = "https://api.discogs.com"

LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 999

def download_thumb(url, arena_id):
    path = TEMP_DIR / f"{arena_id}_thumb.jpg"
    if path.exists():
        return path
    try:
        urllib.request.urlretrieve(url, str(path))
        return path
    except Exception as e:
        print(f"  Failed to download thumbnail: {e}")
        return None

def search_discogs(artist, title):
    """Search Discogs for release info."""
    try:
        clean_artist = re.sub(r'\s*\[.*?\]', '', artist).split('·')[0].strip()
        clean_title = re.sub(r'\s*-\s*YouTube$', '', title).strip()
        clean_title = re.sub(r'\s*\(.*?\)', '', clean_title).strip()
        
        query = f"{clean_artist} {clean_title}"[:80]
        url = f"{DISCOGS_API}/database/search?q={urllib.parse.quote(query)}&type=release&per_page=1"
        
        req = urllib.request.Request(url, headers={"User-Agent": "OpenClawDVDGen/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            results = data.get("results", [])
            if results:
                r = results[0]
                # Get full release details
                release_url = r.get("resource_url")
                if release_url:
                    req2 = urllib.request.Request(release_url, headers={"User-Agent": "OpenClawDVDGen/1.0"})
                    with urllib.request.urlopen(req2, timeout=10) as resp2:
                        return json.loads(resp2.read())
        return None
    except Exception as e:
        print(f"  Discogs search failed: {e}")
        return None

import urllib.parse

def analyze_and_prompt(song, thumb_path, discogs_info):
    """Build a tailored prompt based on the source image and metadata."""
    arena_id = song["arena_id"]
    title = song.get("title", "Unknown")
    meta = song.get("meta", {})
    artist = meta.get("artist", "Unknown Artist")
    
    # Clean up artist/title
    clean_artist = re.sub(r'\s*\[.*?\]', '', artist).split('·')[0].strip()
    clean_title = re.sub(r'\s*-\s*YouTube$', '', title).strip()
    
    # Extract label info from discogs
    label_name = ""
    catalog_no = f"ARC-{arena_id}"
    year = ""
    country = "US"
    
    if discogs_info:
        labels = discogs_info.get("labels", [])
        if labels:
            label_name = labels[0].get("name", "").replace(r" (\d+)", "")
            # Clean discogs disambiguation numbers
            label_name = re.sub(r'\s*\(\d+\)$', '', label_name)
            cat = labels[0].get("catno", "")
            if cat and cat != "none":
                catalog_no = cat
        year = str(discogs_info.get("year", ""))
        country = discogs_info.get("country", "US")
    
    copyright_year = year if year else ""
    made_in = "UK" if country in ("UK", "Europe", "Germany", "France") else "US" if country == "US" else country
    
    prompt = f"""EDIT THIS IMAGE — do NOT generate a new image. You are EDITING the provided input photograph.

You have been given ONE input image. It is a photograph/scan related to the music release "{clean_title}" by {clean_artist} ({label_name}{f', {year}' if year else ''}, catalog: {catalog_no}).

MANDATORY: The input image MUST appear in your output. If I cannot see the input image's actual content (its actual photograph, its actual colors, its actual subjects) in your output, you have FAILED. Do NOT replace it with something else. Do NOT generate new imagery. The input image IS the artwork.

EDIT TASK: Crop/mask the input image into a circular CD disc shape and add CD manufacturing details around it.

STEP BY STEP:
1. Take the input image EXACTLY as it is. Crop it into a perfect circle (CD disc shape). The image fills the entire printable disc surface edge-to-edge.
2. If the input has black letterbox bars (top/bottom), exclude those from the crop — use only the actual content area.
3. The EXACT colors, subjects, text, typography, layout, and texture of the input image must be visible and unchanged on the disc surface.
4. Add a standard CD center hole in the exact center with clear polycarbonate hub ring.
5. Add a silver mirror band between hub and printed area with tiny etched text: "IFPI L{str(arena_id)[-3:]} · {catalog_no} · MADE IN {made_in} · {arena_id}"
6. Add thin silver rim bevel around the outer edge.
7. Place the disc on a pure white background with a subtle shadow beneath.

CRITICAL LAYOUT RULES:
- The CENTER HOLE must be SMALL — standard CD size. It should NOT be so large that it cuts into faces, key artwork, or important visual elements. Keep the hole proportionally small.
- ALL text and branding must stay in the OUTER ring area or on the mirror band. Text must NEVER overlap with or go near the center hole.
- If the image contains a person's face or body, compose the crop so their face is NOT cut off by the center hole. Shift the image content outward if needed so faces remain fully visible.
- Keep text AWAY from the center — use the outer 20% of the disc for any added text.

ADDITIONAL TEXT to print on the disc (only if NOT already present on the source image):
- "{catalog_no}" — small, outer edge area{f'{chr(10)}- "© {copyright_year} {label_name}" — tiny, outer edge' if label_name else ''}
- "Arena Archive No. {arena_id}" — tiny on mirror band

DO NOT add label text if label is unknown. DO NOT write "Independent" or any placeholder or made-up label name. If there is no known label, simply omit it.

DO NOT generate AI people or faces. If the source image shows a person (DJ, artist, etc), preserve THEIR actual appearance from the photograph. Do NOT replace them with an AI-generated person. If the source image does NOT show a person, do NOT add one.

Text style must match the source — if vintage, use vintage feel. If modern, use clean sans-serif. Match the text color to what already exists on the source. Do NOT use bright clean white text on dark/vintage artwork.

OUTPUT: 1:1 square, single CD disc, white background, flat-lay studio photo from above.
ONE disc only. The input image's content MUST be recognizable on the disc surface."""

    return prompt

def generate_cover(song, index, total):
    arena_id = song["arena_id"]
    title = song.get("title", "Unknown")
    meta = song.get("meta", {})
    artist = meta.get("artist", "Unknown")
    
    clean_artist = re.sub(r'\s*\[.*?\]', '', artist).split('·')[0].strip()[:40]
    clean_title = re.sub(r'\s*-\s*YouTube$', '', title).strip()
    safe_name = "".join(c for c in f"{clean_artist}_{clean_title}" if c.isalnum() or c in (' ', '-', '_')).strip()[:60]
    output_path = OUTPUT_DIR / f"arena_{arena_id}_{safe_name}.png"
    
    if output_path.exists():
        print(f"[{index}/{total}] Skipping {clean_title} (exists)")
        return True
    
    print(f"\n[{index}/{total}] {clean_title} by {clean_artist}")
    
    # Download thumbnail
    thumb = download_thumb(song.get("thumbnail", ""), arena_id)
    if not thumb:
        print("  SKIP: no thumbnail")
        return False
    
    # Research on Discogs
    print(f"  Researching on Discogs...")
    discogs_info = search_discogs(artist, title)
    if discogs_info:
        labels = discogs_info.get("labels", [])
        label = labels[0]["name"] if labels else "?"
        print(f"  Found: {label}, {discogs_info.get('year', '?')}")
    else:
        print(f"  No Discogs match, using defaults")
    
    # Build prompt
    prompt = analyze_and_prompt(song, thumb, discogs_info)
    
    # Generate
    print(f"  Generating...")
    cmd = [
        "uv", "run", str(NANO_SCRIPT),
        "--prompt", prompt,
        "--filename", str(output_path),
        "--resolution", "2K",
        "-i", str(thumb),
    ]
    
    env = os.environ.copy()
    env["GEMINI_API_KEY"] = GEMINI_KEY
    
    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=120)
        if result.returncode == 0:
            print(f"  ✅ Saved: {output_path.name}")
            return True
        else:
            print(f"  ❌ Failed: {result.stderr[-200:]}")
            return False
    except subprocess.TimeoutExpired:
        print(f"  ❌ Timeout")
        return False

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    
    with open(SONGS_JSON) as f:
        songs = json.load(f)
    
    total = min(len(songs), LIMIT)
    print(f"Generating DVD covers for {total} songs → {OUTPUT_DIR}\n")
    
    success = 0
    for i, song in enumerate(songs[:LIMIT], 1):
        ok = generate_cover(song, i, total)
        if ok:
            success += 1
        time.sleep(3)  # rate limit
    
    print(f"\n{'='*40}")
    print(f"Done: {success}/{total} covers generated")

if __name__ == "__main__":
    main()
