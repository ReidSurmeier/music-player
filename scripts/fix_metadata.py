import json
import subprocess
import os
from pathlib import Path

SONGS_JSON = Path.home() / "Projects/music-player/public/songs.json"

def get_yt_metadata(url):
    try:
        # Fetch clean metadata using yt-dlp
        cmd = [
            "yt-dlp",
            "--print", "%(artist)s|%(track)s|%(uploader)s|%(title)s",
            "--no-warnings",
            url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            parts = result.stdout.strip().split("|")
            if len(parts) >= 4:
                artist, track, uploader, title = parts
                
                # Fallback logic if official artist/track tags are missing
                clean_artist = artist if artist and artist != "NA" else uploader
                clean_title = track if track and track != "NA" else title
                
                # Cleanup " - Topic" from auto-generated channels
                if clean_artist.endswith(" - Topic"):
                    clean_artist = clean_artist.replace(" - Topic", "")
                    
                return clean_artist, clean_title
        return None, None
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None, None

def main():
    with open(SONGS_JSON, "r") as f:
        songs = json.load(f)
    
    updates = 0
    print(f"Scanning {len(songs)} songs for missing metadata...")
    
    for song in songs:
        current_artist = song.get("meta", {}).get("artist")
        current_title = song.get("title")
        
        # If artist is missing or looks generic, fetch it
        if not current_artist or current_artist == "Unknown Artist":
            print(f"Fetching metadata for: {current_title} ({song['url']})")
            artist, track = get_yt_metadata(song["url"])
            
            if artist:
                if "meta" not in song: song["meta"] = {}
                song["meta"]["artist"] = artist
                # valid track name is usually better than the youtube title
                if track and track != current_title: 
                    song["meta"]["track_official"] = track
                
                print(f"  -> Found: {artist} - {track if track else current_title}")
                updates += 1
            else:
                print("  -> Failed to fetch metadata.")
                
    if updates > 0:
        with open(SONGS_JSON, "w") as f:
            json.dump(songs, f, indent=2)
        print(f"\nSaved {updates} metadata updates to songs.json")
    else:
        print("\nNo updates needed.")

if __name__ == "__main__":
    main()
