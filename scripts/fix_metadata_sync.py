import json
import subprocess
import os
from pathlib import Path

SONGS_JSON = Path.home() / "Projects/music-player/public/songs.json"

def get_yt_metadata(url):
    print(f"  Fetching: {url}...")
    try:
        # Fetch clean metadata using yt-dlp
        cmd = [
            "yt-dlp",
            "--print", "%(artist)s|%(track)s|%(uploader)s|%(title)s",
            "--no-warnings",
            "--skip-download",
            url
        ]
        # moderate timeout to avoid hanging
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        
        if result.returncode == 0:
            parts = result.stdout.strip().split("|")
            if len(parts) >= 4:
                artist, track, uploader, title = parts
                
                # Logic to determine best artist/title
                # 1. Use official metadata tags if present (artist/track)
                # 2. Fallback to parsing "Artist - Title" string from video title
                # 3. Fallback to Uploader as Artist
                
                final_artist = artist if artist and artist != "NA" else None
                final_title = track if track and track != "NA" else title
                
                if not final_artist:
                    # Try splitting title "Artist - Track"
                    if " - " in title:
                        final_artist, final_title = title.split(" - ", 1)
                    else:
                        final_artist = uploader
                
                # Cleanup " - Topic"
                if final_artist and final_artist.endswith(" - Topic"):
                    final_artist = final_artist.replace(" - Topic", "")
                    
                return final_artist.strip(), final_title.strip()
                
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
        # Check if we need to fix this entry
        current_artist = song.get("meta", {}).get("artist")
        title = song.get("title", "")
        
        needs_fix = (
            not current_artist or 
            current_artist in ["Unknown Artist", "Unknown"] or 
            title in ["Unknown Title", ""]
        )
        
        if needs_fix:
            print(f"[{i+1}/{len(songs)}] Fixing metadata for: {title}")
            artist, track = get_yt_metadata(song["url"])
            
            if artist:
                if "meta" not in song: song["meta"] = {}
                
                old_artist = song["meta"].get("artist", "None")
                song["meta"]["artist"] = artist
                
                # Only update title if the fetched one looks like a real track name, 
                # not a full youtube filename
                if track:
                    song["meta"]["track_official"] = track
                
                print(f"  -> Updated: {old_artist} -> {artist}")
                print(f"  -> Title: {track if track else title}")
                updates += 1
            else:
                print("  -> Could not fetch metadata.")
        
    if updates > 0:
        with open(SONGS_JSON, "w") as f:
            json.dump(songs, f, indent=2)
        print(f"\nSUCCESS: Updated {updates} songs in songs.json")
    else:
        print("\nNo metadata updates needed.")

if __name__ == "__main__":
    main()
