import json
import os
import sys
import subprocess
import requests
import time
from pathlib import Path

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)

# Config
SONGS_JSON = Path.home() / "Projects/music-player/public/songs.json"
OUTPUT_DIR = Path("/mnt/movies/OpenclawOutput/dvd-covers")
TEMP_DIR = Path.home() / "Projects/music-player/temp_covers"
NANO_SCRIPT = Path.home() / ".npm-global/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py"
GEMINI_KEY = "AIzaSyDsmZJrTd59rEoGhliQ1ErvJ2iqKeuQzGA"

def ensure_dirs():
    print(f"Checking output directory: {OUTPUT_DIR}")
    if not OUTPUT_DIR.exists():
        print(f"Creating {OUTPUT_DIR}")
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Test write
    test_file = OUTPUT_DIR / ".write_test"
    try:
        test_file.touch()
        test_file.unlink()
        print("  -> Write access OK")
    except Exception as e:
        print(f"  -> ERROR: Cannot write to output directory: {e}")
        sys.exit(1)

    TEMP_DIR.mkdir(parents=True, exist_ok=True)

def download_image(url, filename):
    try:
        if not url: return None
        filepath = TEMP_DIR / filename
        
        # Always redownload to ensure fresh
        if filepath.exists(): filepath.unlink()
        
        # Use curl for simplicity
        subprocess.run(["curl", "-s", "-L", url, "-o", str(filepath)], check=True, timeout=15)
        return str(filepath)
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return None

def generate_cover(song):
    arena_id = song.get("arena_id", "unknown")
    title = song.get("title", "Unknown Title")
    meta = song.get("meta", {})
    artist = meta.get("artist", "Unknown Artist")
    
    # Clean filename
    safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()[:50]
    output_filename = f"arena_{arena_id}_{safe_title}.png"
    output_path = OUTPUT_DIR / output_filename
    
    if output_path.exists():
        print(f"Skipping {title} (already exists)")
        return str(output_path)

    # Get input image (thumbnail)
    image_url = song.get("thumbnail")
    local_image = download_image(image_url, f"{arena_id}_thumb.jpg")
    
    if not local_image:
        print(f"Skipping {title} (no image source)")
        return None

    # Strict Approved Prompt
    prompt = (
        f"A photorealistic flat top-down scan of a retro manufacturing DVD/GameCube style disc for the album '{title}' by '{artist}'. "
        f"The disc design features the full album art integrated as a full-bleed surface print (like Katamari/Animal Crossing discs), covering the entire surface. "
        f"TYPOGRAPHY MATCHING: Analyze the existing typography on the input album art. Use a font for the artist/title text on the disc that matches or complements that style (e.g., if handwritten, use similar script; if bold sans-serif, use that). "
        f"CENTER HOLE SAFETY: Keep all text AWAY from the center spindle hole (inner 20% diameter). Place text in the outer ring or top/bottom sectors. Do NOT overlap text with the center hole. "
        f"AESTHETIC: Early 2000s manufacturing aesthetic. Silver/mirror finish visible only on the inner ring. High quality product photography scan. "
        f"Include the Archive ID '{arena_id}' in small technical type near the edge. "
        f"NO generic music icons. Use only the artist's logo or clean text."
    )
    
    if len(artist) > 30:
        prompt += f" Note: The artist string '{artist}' may contain extra text. Extract ONLY the actual artist name for the cover design."

    print(f"Generating cover for: {artist} - {title}")
    
    cmd = [
        "python3", str(NANO_SCRIPT),
        "--prompt", prompt,
        "--filename", str(output_path),
        "--api-key", GEMINI_KEY,
        "--resolution", "2K",
        "--input-image", local_image
    ]

    try:
        # Capture output to prevent silence, but print it
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        print(f"  -> Saved to {output_path}")
        return str(output_path)
    except subprocess.CalledProcessError as e:
        print(f"  -> Failed: {e}")
        return None

def main():
    ensure_dirs()
    if not SONGS_JSON.exists():
        print(f"Error: {SONGS_JSON} not found")
        return

    with open(SONGS_JSON, "r") as f:
        songs = json.load(f)
    
    print(f"Processing {len(songs)} songs...")
    
    for i, song in enumerate(songs):
        print(f"\n[{i+1}/{len(songs)}] Processing...")
        generate_cover(song)
        # small delay to avoid rate limits
        time.sleep(2)

if __name__ == "__main__":
    main()
