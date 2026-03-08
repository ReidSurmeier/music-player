import json
import os
import sys
import subprocess
import requests
from pathlib import Path

# Paths
SONGS_JSON = Path.home() / "Projects/music-player/public/songs.json"
OUTPUT_DIR = Path("/mnt/movies/OpenclawOutput/dvd-covers")
NANO_SCRIPT = Path.home() / ".npm-global/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py"
TEMP_DIR = Path.home() / "Projects/music-player/temp_covers"

# Configuration
GEMINI_KEY = "AIzaSyDsmZJrTd59rEoGhliQ1ErvJ2iqKeuQzGA"

def ensure_dirs():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

def load_songs():
    with open(SONGS_JSON, "r") as f:
        return json.load(f)

def download_image(url, filename):
    try:
        response = requests.get(url, stream=True, timeout=10)
        response.raise_for_status()
        filepath = TEMP_DIR / filename
        with open(filepath, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return str(filepath)
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return None

def generate_cover(song, image_path=None):
    arena_id = song.get("arena_id", "unknown")
    title = song.get("title", "Unknown Title")
    artist = song.get("meta", {}).get("artist", "Unknown Artist")
    label = song.get("meta", {}).get("label", "Unknown Label")
    
    # Clean filename
    safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
    output_filename = f"arena_{arena_id}_{safe_title}.png"
    output_path = OUTPUT_DIR / output_filename

    # Construct Prompt
    prompt = (
        f"A photorealistic, high-resolution flat top-down scan of a retro DVD/GameCube/PS2 style game disc for the album '{title}' by '{artist}'. "
        f"The disc design features the provided album art integrated seamlessly onto the surface. "
        f"Typography includes the artist name '{artist}', the record label '{label}', and the archive ID '{arena_id}' in an early 2000s gaming font style. "
        f"The overall aesthetic is a clean, professional disc scan with subtle lighting and texture. "
        f"Do not include fake console branding, use the artist's logo or a generic music icon if needed. "
        f"Maintain the original album art's integrity but adapt it to the circular disc format."
    )

    cmd = [
        "python3", str(NANO_SCRIPT),
        "--prompt", prompt,
        "--filename", str(output_path),
        "--api-key", GEMINI_KEY,
        "--resolution", "2K"
    ]
    
    if image_path:
        cmd.extend(["--input-image", image_path])

    try:
        subprocess.run(cmd, check=True)
        print(f"Generated cover for {title} (ID: {arena_id}) at {output_path}")
        return str(output_path)
    except subprocess.CalledProcessError as e:
        print(f"Failed to generate cover for {title}: {e}")
        return None

def main():
    ensure_dirs()
    songs = load_songs()
    
    print(f"Found {len(songs)} songs to process.")
    
    for song in songs:
        title = song.get("title")
        print(f"\nProcessing: {title}")
        
        # Determine image source (try to find better art if possible, else use existing thumbnail)
        # Ideally we'd search web here, but for now let's use the provided thumbnail or fallback
        # In a real scenario, we'd add web search logic.
        image_url = song.get("thumbnail") # Fallback to YouTube thumbnail for now
        
        local_image = None
        if image_url:
            local_image = download_image(image_url, f"{song['arena_id']}_thumb.jpg")
            
        if local_image:
            generate_cover(song, local_image)
        else:
            print(f"No image found for {title}, skipping generation.")

if __name__ == "__main__":
    main()
