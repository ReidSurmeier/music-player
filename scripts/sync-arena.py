#!/usr/bin/env python3
"""
sync-arena.py — Auto-sync Are.na sound__ channel → music player

1. Fetches all YouTube videos from Are.na channel
2. Compares against existing songs.json
3. For any new songs:
   a. Downloads audio with yt-dlp (max 80MB)
   b. Categorizes with Gemini
   c. Gets clean metadata (album/year/label) with Gemini
4. Updates songs.json
5. git commit + push → triggers GitHub Pages redeploy

Run via heartbeat or manually:
  python3 ~/Projects/music-player/scripts/sync-arena.py
"""

import json, subprocess, os, sys, re
from pathlib import Path

MUSIC_DIR = Path.home() / "Projects/music-player"
SONGS_JSON = MUSIC_DIR / "public/songs.json"
AUDIO_DIR  = MUSIC_DIR / "public/audio"
GEMINI_KEY = "AIzaSyDsmZJrTd59rEoGhliQ1ErvJ2iqKeuQzGA"
ARENA_SLUG = "sound-dfweaenwiru"
BLOCKLIST_JSON = Path(__file__).parent / "blocklist.json"  # songs to never auto-add

CATEGORY_ORDER = [
    "edible","fruit","dessert","people","floral","gemstones",
    "location","alcohol","animal","plants","nature","metals",
    "elements","artifact","fabric","time","mid","pale",
    "light","dark","deep","red","yellow","pink","orange",
    "purple","green","blue","brown","white","gray",
    "threewords","twowords","oneword",
]

def log(msg): print(f"[sync-arena] {msg}", flush=True)

def curl_json(url):
    r = subprocess.run(["curl","-s", url], capture_output=True, text=True)
    return json.loads(r.stdout)

def gemini(prompt):
    payload = json.dumps({"contents":[{"parts":[{"text":prompt}]}]})
    r = subprocess.run([
        "curl","-s","-X","POST",
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}",
        "-H","Content-Type: application/json","-d",payload
    ], capture_output=True, text=True)
    resp = json.loads(r.stdout)
    text = resp["candidates"][0]["content"]["parts"][0]["text"].strip()
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"): text = text[4:]
        text = text.split("```")[0]
    return text.strip()

def fetch_arena_songs():
    """Fetch all YouTube blocks from Are.na channel."""
    all_songs = []
    for page in range(1, 6):  # max 500 songs
        data = curl_json(f"https://api.are.na/v2/channels/{ARENA_SLUG}?per=100&page={page}")
        blocks = data.get("contents", [])
        if not blocks:
            break
        for b in blocks:
            src = (b.get("source") or {})
            url = src.get("url","") or ""
            if "youtube" not in url.lower() and "youtu.be" not in url.lower():
                continue
            vid_id = ""
            if "v=" in url:
                vid_id = url.split("v=")[1].split("&")[0]
            elif "youtu.be/" in url:
                vid_id = url.split("youtu.be/")[1].split("?")[0]
            if not vid_id:
                continue
            all_songs.append({
                "arena_id": b["id"],
                "title": b.get("title","") or "",
                "yt_id": vid_id,
                "url": url,
                "description": (b.get("description") or "")[:300],
                "thumbnail": f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
            })
        if len(blocks) < 100:
            break
    return all_songs

def word_count_category(title):
    """Categorize by word count in song title: oneword / twowords / threewords."""
    import re
    t = re.sub(r'\s*[-\u2013]\s*YouTube\s*$', '', title, flags=re.IGNORECASE)
    t = re.sub(r'\[.*?\]', '', t)
    t = re.sub(r'\(.*?\)', '', t)
    if ' - ' in t:
        parts = [p.strip() for p in t.split(' - ') if p.strip()]
        t = parts[-1] if parts else t
    t = t.strip()
    filler = {'&', 'x', 'X', 'feat.', 'ft.', 'b2b'}
    words = [w for w in t.split() if w and w not in filler]
    n = len(words)
    if n <= 1:
        return 'oneword'
    elif n == 2:
        return 'twowords'
    else:
        return 'threewords'

def categorize_songs(new_songs):
    """Categorize new songs by title word count into oneword/twowords/threewords."""
    return {s['yt_id']: [word_count_category(s['title'])] for s in new_songs}

def get_metadata(new_songs):
    """Use Gemini to extract album/year/label for new songs."""
    if not new_songs:
        return {}
    songs_list = "\n".join([
        f"{i+1}. [{s['yt_id']}] {s['title'][:70]} | {s['description'][:150]}"
        for i,s in enumerate(new_songs)
    ])
    prompt = f"""Extract music metadata for these songs. Use your knowledge if description is insufficient.
Songs:
{songs_list}
Return ONLY JSON: [{{"yt_id":"ID","album":"Album or null","year":"YYYY or null","label":"Label or null"}}]"""
    try:
        result = gemini(prompt)
        metas = json.loads(result)
        return {m["yt_id"]: {"album":m.get("album"),"year":m.get("year"),"label":m.get("label")} for m in metas}
    except Exception as e:
        log(f"Gemini metadata error: {e}")
        return {}

def download_song(yt_id):
    """Download audio with yt-dlp. Returns True if successful."""
    out_path = AUDIO_DIR / f"{yt_id}.mp3"
    if out_path.exists():
        log(f"  Already downloaded: {yt_id}")
        return True
    log(f"  Downloading: {yt_id} ...")
    result = subprocess.run([
        "yt-dlp",
        "--max-filesize","80M",
        "-x","--audio-format","mp3","--audio-quality","5",
        "-o", str(AUDIO_DIR / f"{yt_id}.%(ext)s"),
        f"https://www.youtube.com/watch?v={yt_id}",
        "--no-playlist","--quiet","--no-warnings"
    ], capture_output=True, text=True)
    success = out_path.exists()
    if not success:
        log(f"  Download failed or exceeded 80MB: {yt_id}")
    return success

def main():
    log("Starting Are.na sync...")

    # Load existing songs
    existing = json.loads(SONGS_JSON.read_text()) if SONGS_JSON.exists() else []
    existing_ids = {s["yt_id"] for s in existing}
    log(f"Existing songs: {len(existing)}")

    # Fetch from Are.na
    arena_songs = fetch_arena_songs()
    log(f"Are.na songs: {len(arena_songs)}")

    # Load blocklist (songs manually removed — never auto-readd)
    blocklist = set()
    if BLOCKLIST_JSON.exists():
        blocklist = set(json.loads(BLOCKLIST_JSON.read_text()))
    log(f"Blocklist: {len(blocklist)} songs")

    # Find new ones (not in existing, not in blocklist)
    new_songs = [s for s in arena_songs if s["yt_id"] not in existing_ids and s["yt_id"] not in blocklist]
    # Also find removed ones (in existing but not in Are.na)
    arena_ids = {s["yt_id"] for s in arena_songs}
    removed = [s for s in existing if s["yt_id"] not in arena_ids]

    if not new_songs and not removed:
        log("No changes detected.")
        return 0

    if new_songs:
        log(f"New songs found: {len(new_songs)}")
        for s in new_songs:
            log(f"  + {s['title'][:60]}")

        # Categorize + metadata via Gemini
        cat_map  = categorize_songs(new_songs)
        meta_map = get_metadata(new_songs)

        # Download audio
        for s in new_songs:
            s["categories"] = cat_map.get(s["yt_id"], ["gray"])
            s["meta"]       = meta_map.get(s["yt_id"], {})
            download_song(s["yt_id"])

        existing.extend(new_songs)

    if removed:
        log(f"Removed from Are.na: {len(removed)}")
        for s in removed:
            log(f"  - {s['title'][:60]}")
        existing = [s for s in existing if s["yt_id"] in arena_ids]

    # Save updated songs.json
    SONGS_JSON.write_text(json.dumps(existing, indent=2))
    log(f"songs.json updated: {len(existing)} songs")

    # Git commit + push
    os.chdir(MUSIC_DIR)
    new_mp3s = [str(AUDIO_DIR / f"{s['yt_id']}.mp3") for s in new_songs]
    files_to_add = [str(SONGS_JSON)] + [p for p in new_mp3s if Path(p).exists()]

    subprocess.run(["git","add"] + files_to_add, check=True)

    changed = subprocess.run(
        ["git","diff","--staged","--quiet"], capture_output=True
    ).returncode != 0

    if changed:
        msg_parts = []
        if new_songs:   msg_parts.append(f"+{len(new_songs)} songs")
        if removed:     msg_parts.append(f"-{len(removed)} removed")
        commit_msg = f"sync: Are.na auto-update ({', '.join(msg_parts)})"
        subprocess.run(["git","commit","-m",commit_msg], check=True)
        subprocess.run(["git","push"], check=True)
        log(f"Pushed: {commit_msg}")
        # Notify
        subprocess.run([
            "openclaw","system","event",
            "--text", f"SOUND__ updated: {commit_msg} — redeploying",
            "--mode","now"
        ], capture_output=True)
    else:
        log("No git changes to commit.")

    return len(new_songs)

if __name__ == "__main__":
    added = main()
    sys.exit(0)
