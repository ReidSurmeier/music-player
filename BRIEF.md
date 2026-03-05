# SOUND__ Music Player — Build Brief

## What We're Building
A Next.js 16.1 music player that is a **pixel-perfect visual replica** of nagizin.xyz/htmlColorList/ — but instead of color categories, each column is a genre playlist of songs from an Are.na channel.

## Pixel-Perfect Strategy (CRITICAL)
The original site's CSS is in `public/nagizin-style.css` — use it as a **global CSS file verbatim** (adapted for Next.js). Copy the exact class names, measurements, borders, and font declarations. The fonts are in `public/fonts/*.woff`. This guarantees pixel-perfect match.

## Layout Structure (from nagizin.xyz)
```
┌──────────────────────────────────────────────────────────────────┐
│  TITLE BAR (.titleContainer) — fixed top, full width, 30px high  │
│  "SOUND__"  [▶ Now Playing: song title]   [▶▶ Next]             │
├──────────┬───────────────────────────────────────────────────────┤
│ SIDEBAR  │  CONTENT AREA (.content) — horizontally scrollable    │
│(.color   │                                                        │
│ List)    │  [column1]│[column2]│[column3]│[column4]│...          │
│ 248px    │  edible   │ deep    │ brown   │elements │...          │
│ fixed    │  ─────────│─────────│─────────│─────────│             │
│ left     │  • song1  │ • song1 │ • song1 │ • song1 │             │
│ scroll   │  • song2  │ • song2 │ • song2 │ • song2 │             │
│          │                                                        │
└──────────┴───────────────────────────────────────────────────────┘
```

## Exact CSS Values to Match
- Title bar: fixed, top:0, padding: 4px 8px, border-bottom: 1px solid #222, background: white, z-index: 1
- Sidebar: width 248px, position fixed, height calc(100vh - 30px), margin-top: 30px, border-right: 1px solid #222, overflow-y: scroll
- Columns: width 250px each, border-right: 1px dotted #222, height calc(100vh - 30px), overflow-y: scroll
- Category container: display flex, align-items stretch, overflow-x scroll, width = 250px * numColumns
- Font: "AUTHENTICSans-Condensed-90" (in public/fonts/)
- h2 headers: font-size 18px, padding 5px 5px 0 5px, border-bottom: 2px dotted #222, position sticky, top: 0, background: white
- body: overflow hidden
- Song items: like the original .colorList li — padding 5px 0 0 4px, border-bottom 1px solid #222, cursor pointer, font-size 0.8rem
- Hover on song: background color changes (use the song's thumbnail dominant color via CSS custom property), fades back after 2s (matching original behavior)
- Active/playing song: background black, color white

## The Sidebar (replaces color list)
The left sidebar (.colorList) becomes a **master track list** — all 62 songs listed. Each item:
- Shows song title + category badge
- Clicking scrolls the right panel to that song's column AND starts playing it
- Currently playing song gets black background + white text (same hover behavior as original)
- On hover: background fades to a muted color (category color-coded), fades back after 2s

## Column Structure  
Each column (`.category`) shows songs for one vibe category:
- h2 header: the category name (capitalize first letter) — sticky at top like original
- Each song: a `<div class="play-item">` (styled like original `details` element)
  - Shows: thumbnail (small, inline), song title, ▶ play indicator
  - Click: plays this song
  - Currently playing: black bg, white text, ⏸ indicator
  - Autoplay: when song ends → automatically play next song in same column

## Audio Playback
Songs are in `public/audio/{yt_id}.mp3` — use HTML5 `<audio>` element.
**IMPORTANT**: Some songs may not have downloaded yet (large albums). Fallback gracefully — if `public/audio/{yt_id}.mp3` doesn't exist, hide that song or show it as "unavailable".

At build time, check which MP3s exist in `public/audio/` and only include those songs.

Audio controls:
- Hidden `<audio>` element, controlled by JS
- Playing: show ⏸ indicator 
- Paused/stopped: show ▶ on hover (matching original `.play:hover::before` behavior)
- Autoplay next: `audio.onended` → find next song in current column → play it
- The title bar shows: `▶ Now Playing: [Song Title]` when a song is playing

## Title Bar Content
```
SOUND__    ▶ Now Playing: J Dilla - Bye.    [category: mid]
```
Left: site title "SOUND__" (h1, same style)
Middle: currently playing song info
Right: small toggle button (matching original button style — rounded, gray background)

## Data
Songs data is in `public/songs.json`. Each song has:
- `title`: song title
- `yt_id`: YouTube ID  
- `categories`: array of 1-2 category strings
- `thumbnail`: YouTube thumbnail URL

## Next.js Setup
- App Router (`app/` directory)
- `output: 'export'` in next.config.ts for GitHub Pages
- `basePath: '/music-player'` for GitHub Pages deployment
- Global CSS in `app/globals.css` — start with the content of `public/nagizin-style.css` and adapt
- Font declarations: update paths from `./woff/` to `/fonts/`
- Single page component: `app/page.tsx`

## GitHub Pages Config
Add to `next.config.ts`:
```ts
const nextConfig = {
  output: 'export',
  basePath: '/music-player',
  images: { unoptimized: true },
}
```

Add `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: out/
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Responsive Breakpoints (match original exactly)
- max-width 1155px: sidebar margin-top 52px, content margin-top 52px
- max-width 760px: sidebar becomes top bar (41% height, full width), content below
- max-width 499px: sidebar margin-top 58px

## Implementation Steps
1. Update `next.config.ts` with output export + basePath
2. Create `app/globals.css` — copy nagizin CSS verbatim, update font paths
3. Create `app/page.tsx` — main page component
4. Create `app/layout.tsx` — minimal layout importing globals.css
5. At build time / in the component, read `public/songs.json`  
6. Group songs by their primary category (first item in `categories` array)
7. Only include songs where `public/audio/{yt_id}.mp3` exists
8. Build the layout: title bar + sidebar track list + horizontal category columns
9. Wire up audio playback with autoplay chain

## Key Interaction Details (from original script.js behavior)
- Hover on sidebar item → `item.style.backgroundColor = categoryColor` → after 2s, fade back
- Click → plays song, updates title bar, scrolls column into view
- The toggle button in title bar: toggles showing/hiding song descriptions (like original toggle-button)
- Window resize → debounced reload (match original)

## File to check for which songs downloaded:
`public/audio/` — list .mp3 files that exist

When completely done, run:
openclaw system event --text "Done: SOUND__ music player built — ready for git push" --mode now
