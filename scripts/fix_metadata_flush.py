import json
import subprocess
import os
import sys
from pathlib import Path

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)

SONGS_JSON = Path.home() / "Projects/music-player/public/songs.json"

def get_yt_metadata(url):
    print(f"  Fetching: {url}...")
    try:
        cmd = [
            "yt-dlp",
            "--print", "%(artist)s|%(track)s|%(uploader)s|%(title)s",
            "--no-warnings",
            "--skip-download",
            url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        
        if result.returncode == 0:
            parts = result.stdout.strip().split("|")
            if len(parts) >= 4:
                artist, track, uploader, title = parts
                
                # Logic: prefer Artist tag, fallback to Uploader, then Title parse
                final_artist = artist if artist and artist != "NA" else None
                final_track = track if track and track != "NA" else title
                
                if not final_artist:
                    if " - " in title:
                        parts = title.split(" - ", 1)
                        final_artist = parts[0].strip()
                        final_track = parts[1].strip()
                    else:
                        final_artist = uploader
                
                # Cleanup
                if final_artist and final_artist.endswith(" - Topic"):
                    final_artist = final_artist.replace(" - Topic", "")
                    
                return final_artist, final_track
                
    except Exception as e:
        print(f"  Error: {e}")
        
    return None, None

def main():
    if not SONGS_JSON.exists():
        print(f"Error: {SONGS_JSON} not found")
        return

    with open(SONGS_JSON, "r") as f:
        songs = json.load(f)
    
    updates = 0
    print(f"Scanning {len(songs)} songs...")
    
    for i, song in enumerate(songs):
        current_artist = song.get("meta", {}).get("artist")
        title = song.get("title", "")
        
        # Check if needs fix
        needs_fix = (
            not current_artist or 
            current_artist == "Unknown Artist" or 
            current_artist == "Unknown"
        )
        
        if needs_fix:
            print(f"[{i+1}/{len(songs)}] Fixing metadata for: {title}")
            artist, track = get_yt_metadata(song["url"])
            
            if artist:
                if "meta" not in song: song["meta"] = {}
                song["meta"]["artist"] = artist
                if track:
                    song["meta"]["track_official"] = track
                
                print(f"  -> Updated: {artist} - {track}")
                updates += 1
            else:
                print("  -> Could not fetch metadata.")
                
    if updates > 0:
        with open(SONGS_JSON, "w") as f:
            json.dump(songs, f, indent=2)
        print(f"\nSaved {updates} updates to songs.json")
    else:
        print("\nNo metadata updates needed.")

if __name__ == "__main__":
    main()
