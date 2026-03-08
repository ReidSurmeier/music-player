import json
import re
from pathlib import Path

SONGS_JSON = Path.home() / "Projects/music-player/public/songs.json"

def clean_title(title):
    # Remove junk like (Official Video), [Audio], etc.
    return re.sub(r'[\(\[][\w\s]+[\)\]]', '', title).strip()

def parse_description(desc):
    # Try to find "Song · Artist" pattern common in auto-generated descriptions
    match = re.search(r'^(.+?) · (.+?)(?:\n|$)', desc)
    if match:
        return match.group(2).strip(), match.group(1).strip()
    return None, None

def main():
    if not SONGS_JSON.exists():
        print("songs.json not found")
        return

    with open(SONGS_JSON, "r") as f:
        songs = json.load(f)
    
    updates = 0
    print(f"Scanning {len(songs)} songs...")
    
    for song in songs:
        title = song.get("title", "")
        desc = song.get("description", "")
        current_artist = song.get("meta", {}).get("artist")
        
        needs_fix = not current_artist or current_artist == "Unknown Artist"
        
        if needs_fix:
            new_artist = None
            new_track = None
            
            # 1. Try description parsing (YouTube Auto-Gen format)
            if desc:
                a, t = parse_description(desc)
                if a:
                    new_artist, new_track = a, t
            
            # 2. Try title parsing "Artist - Title"
            if not new_artist and " - " in title:
                parts = title.split(" - ", 1)
                new_artist = parts[0].strip()
                new_track = clean_title(parts[1])
            
            # 3. Fallback: use title as track, mark artist for manual review
            if not new_artist:
                new_track = clean_title(title)
                # If we can't find artist, we skip generating cover later
                
            if new_artist:
                if "meta" not in song: song["meta"] = {}
                song["meta"]["artist"] = new_artist
                if new_track:
                    song["meta"]["track_official"] = new_track
                
                print(f"  Fixed: {new_artist} - {new_track}")
                updates += 1
                
    if updates > 0:
        with open(SONGS_JSON, "w") as f:
            json.dump(songs, f, indent=2)
        print(f"\nUpdated {updates} songs locally.")
    else:
        print("\nNo local updates found.")

if __name__ == "__main__":
    main()
