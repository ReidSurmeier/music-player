"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Song {
  arena_id: number;
  title: string;
  yt_id: string;
  url: string;
  description: string;
  thumbnail: string;
  categories: string[];
}

interface Column {
  id: string;
  label: string;
  songs: Song[];
}

const CATEGORY_ORDER = [
  "edible","fruit","dessert","people","floral","gemstones",
  "location","alcohol","animal","plants","nature","metals",
  "elements","artifact","fabric","time","mid","pale",
  "light","dark","deep","red","yellow","pink","orange",
  "purple","green","blue","brown","white","gray",
  "threewords","twowords","oneword",
];

const LABEL_MAP: Record<string,string> = {
  threewords:"Three Words", twowords:"Two Words", oneword:"One Word",
};

// Colors sampled from reidsurmeier.garden/fj09304u2.png (IRC client screenshot)
// Palette: dark purple title, lavender sidebar, IRC username colors (green/red/blue/teal/orange)
const CAT_BG: Record<string,string> = {
  edible:     "#CC6600", // IRC orange/brown username
  fruit:      "#008000", // IRC green username
  dessert:    "#FF69B4", // emote pink/magenta
  people:     "#DCD0E8", // sidebar lavender
  floral:     "#E8E0F0", // light lavender sidebar
  gemstones:  "#FFD700", // moderator gold icon
  location:   "#000080", // dark navy blue username
  alcohol:    "#8FBC8F", // muted IRC green
  animal:     "#CC6600", // orange/brown
  plants:     "#008000", // green
  nature:     "#008080", // teal/cyan username
  metals:     "#C0C0C0", // tab bar silver gray
  elements:   "#D4D0C8", // menu bar light gray
  artifact:   "#F0F0F0", // window off-white
  fabric:     "#DCD0E8", // lavender
  time:       "#4B0082", // title bar dark purple (light text needed)
  mid:        "#800080", // IRC purple username
  pale:       "#F0F0F0", // window off-white
  light:      "#FFFFFF", // white
  dark:       "#3A0066", // deep title-bar purple (light text needed)
  deep:       "#000080", // dark blue
  red:        "#CC0000", // IRC red username
  yellow:     "#FFD700", // gold
  pink:       "#FF69B4", // pink
  orange:     "#CC6600", // orange
  purple:     "#800080", // IRC purple
  green:      "#008000", // IRC green
  blue:       "#0000CD", // IRC blue username
  brown:      "#8B4513", // emote brown hair
  white:      "#F0F0F0", // off-white
  gray:       "#A0A0A0", // scrollbar gray
  threewords: "#E8E0F0", // light lavender
  twowords:   "#DCD0E8", // lavender
  oneword:    "#C8C0D8", // slightly deeper lavender
};

function catLabel(id: string) {
  return LABEL_MAP[id] || (id.charAt(0).toUpperCase() + id.slice(1));
}

// Dark bg colors that need white text on the pill
const DARK_CATS = new Set(["time","dark","deep","blue","green","location","purple","red","brown","mid"]);

function pillStyle(catId: string, available: boolean): React.CSSProperties {
  if (!available) return {};
  const bg = CAT_BG[catId] || "#ddd";
  const dark = DARK_CATS.has(catId);
  return {
    backgroundColor: bg,
    color: dark ? "#f0f0f0" : "#000",
  };
}

function cleanTitle(title: string) {
  return title
    .replace(/ - YouTube$/i,"")
    .replace(/\s*\(Official[^)]*\)/gi,"")
    .replace(/\s*\[Official[^)]*\]/gi,"")
    .replace(/\s*\|.*$/,"")
    .trim()
    .slice(0, 52);
}

function fmtTime(sec: number) {
  if (!isFinite(sec) || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2,"0")}`;
}

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sidebarRef = useRef<HTMLUListElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const detailsRefs = useRef<Record<string, HTMLDetailsElement | null>>({});
  // Ref always holds latest currentSong — avoids stale closure in setTimeout
  const currentSongRef = useRef<Song | null>(null);

  const [songs, setSongs] = useState<Song[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [queue, setQueue] = useState<Song[]>([]); // current column's song list for next/prev
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [allOpen, setAllOpen] = useState(false);
  const [errored, setErrored] = useState<Set<string>>(new Set());

  // Load songs — no HEAD check, just load all
  useEffect(() => {
    fetch("/music-player/songs.json")
      .then(r => r.json())
      .then((data: Song[]) => {
        setSongs(data);
        const colMap: Record<string, Song[]> = {};
        data.forEach(song => {
          const cat = (song.categories || ["gray"])[0];
          if (!colMap[cat]) colMap[cat] = [];
          colMap[cat].push(song);
        });
        setColumns(
          CATEGORY_ORDER
            .filter(cat => colMap[cat]?.length)
            .map(cat => ({ id: cat, label: catLabel(cat), songs: colMap[cat] }))
        );
      });
  }, []);

  // ── Play a song ──────────────────────────────────────────────────
  const playSong = useCallback((song: Song, colSongs?: Song[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Update queue for next/prev
    if (colSongs) setQueue(colSongs);

    // Close all pills, open this one
    Object.values(detailsRefs.current).forEach(el => { if (el) el.open = false; });
    const det = detailsRefs.current[song.yt_id];
    if (det) det.open = true;

    audio.src = `/music-player/audio/${song.yt_id}.mp3`;
    audio.load();
    audio.play().catch(err => {
      console.warn("Play failed:", err);
      setIsPlaying(false);
    });

    setCurrentSong(song);
    currentSongRef.current = song;
    setIsPlaying(true);
    setCurrentTime(0);
    setDuration(0);

    // Scroll sidebar to song
    const li = sidebarRef.current?.querySelector(`[data-ytid="${song.yt_id}"]`) as HTMLElement;
    li?.scrollIntoView({ block: "nearest" });

    // Scroll content to column
    const cat = (song.categories || ["gray"])[0];
    const col = colRefs.current[cat];
    if (col && contentRef.current) {
      contentRef.current.scrollTo({ left: col.offsetLeft - 4, behavior: "smooth" });
    }
  }, []);

  // ── Next / Prev ───────────────────────────────────────────────────
  const playNext = useCallback(() => {
    if (!currentSong || queue.length === 0) return;
    const idx = queue.findIndex(s => s.yt_id === currentSong.yt_id);
    const next = queue.slice(idx + 1).find(s => !errored.has(s.yt_id));
    if (next) playSong(next, queue);
    else setIsPlaying(false);
  }, [currentSong, queue, errored, playSong]);

  const playPrev = useCallback(() => {
    if (!currentSong || queue.length === 0) return;
    const idx = queue.findIndex(s => s.yt_id === currentSong.yt_id);
    const prev = [...queue.slice(0, idx)].reverse().find(s => !errored.has(s.yt_id));
    if (prev) playSong(prev, queue);
  }, [currentSong, queue, errored, playSong]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    if (audio.paused) audio.play().catch(console.warn);
    else audio.pause();
  }, [currentSong]);

  // ── Seek ──────────────────────────────────────────────────────────
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = Number(e.target.value);
    audio.currentTime = t;
    setCurrentTime(t);
  };

  // ── Toggle all details ─────────────────────────────────────────
  const toggleAll = () => {
    const next = !allOpen;
    setAllOpen(next);
    Object.values(detailsRefs.current).forEach(el => { if (el) el.open = next; });
  };

  // ── Summary click — intercept native toggle to avoid cascade ──
  // onToggle fires for EVERY programmatic .open= change, causing infinite loops.
  // Instead: e.preventDefault() stops the browser toggle, we manage state manually.
  const handleSummaryClick = useCallback((
    e: React.MouseEvent,
    song: Song,
    colSongs: Song[]
  ) => {
    e.preventDefault();
    const det = detailsRefs.current[song.yt_id];
    if (!det) return;

    if (det.open) {
      // Collapse this pill and pause
      det.open = false;
      if (currentSongRef.current?.yt_id === song.yt_id) {
        audioRef.current?.pause();
      }
    } else {
      // Close every other pill (no onToggle fires — we own the state)
      Object.values(detailsRefs.current).forEach(el => {
        if (el && el !== det) el.open = false;
      });
      det.open = true;
      playSong(song, colSongs);
    }
  }, [playSong]);

  // ── Sidebar hover — exact nagizin behavior ──────────────────────
  // onMouseEnter/Leave (not Over/Out) so child elements don't retrigger
  // currentSongRef avoids stale closure inside setTimeout
  const onSidebarEnter = useCallback((el: HTMLLIElement, song: Song) => {
    if (currentSongRef.current?.yt_id === song.yt_id) return;
    const color = CAT_BG[(song.categories || ["gray"])[0]] || "#ddd";
    el.style.backgroundColor = color;
  }, []);

  const onSidebarLeave = useCallback((el: HTMLLIElement, song: Song) => {
    setTimeout(() => {
      // Only reset if this song isn't currently playing
      if (currentSongRef.current?.yt_id !== song.yt_id) {
        el.style.backgroundColor = "";
      }
    }, 2000);
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") { e.preventDefault(); togglePlayPause(); }
      if (e.code === "ArrowRight") playNext();
      if (e.code === "ArrowLeft") playPrev();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [togglePlayPause, playNext, playPrev]);

  // ── Window resize reload (nagizin behavior) ────────────────────
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const h = () => { clearTimeout(t); t = setTimeout(() => location.reload(), 300); };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const cat = currentSong ? (currentSong.categories || ["gray"])[0] : null;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* ── AUDIO ELEMENT ─────────────────────────────────────────── */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={playNext}
        onError={() => {
          if (currentSongRef.current) {
            setErrored(prev => new Set([...prev, currentSongRef.current!.yt_id]));
            playNext();
          }
        }}
        style={{ display: "none" }}
      />

      {/* ── TITLE BAR ─────────────────────────────────────────────── */}
      <section className="titleContainer">
        <a href="#"><h1>♫⋆｡ Reid's ‧₊˚♪⊹₊⋆ Playlists ˚♬ ﾟ.</h1></a>

        <button id="toggle-button" onClick={toggleAll}>
          {allOpen ? "Hide All" : "View All"}
        </button>

        {/* Transport controls */}
        <div className="transport">
          <button className="transport-btn" onClick={playPrev} title="Previous (←)">⏮</button>
          <button className="transport-btn play-pause" onClick={togglePlayPause} title="Play/Pause (Space)">
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button className="transport-btn" onClick={playNext} title="Next (→)">⏭</button>
        </div>

        {/* Now playing info + progress */}
        {currentSong ? (
          <div className="live-bar">
            <span className="live-title">
              {cleanTitle(currentSong.title)}
              {cat && <span className="live-cat"> [{catLabel(cat)}]</span>}
            </span>
            <span className="live-time">{fmtTime(currentTime)}</span>
            <input
              className="progress-slider"
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              style={{ "--pct": `${progress}%` } as React.CSSProperties}
            />
            <span className="live-time">{fmtTime(duration)}</span>
          </div>
        ) : (
          <span className="nowPlaying">Nothing playing. Click a song to begin.</span>
        )}
      </section>

      {/* ── SIDEBAR — master track list ───────────────────────────── */}
      <ul className="colorList" ref={sidebarRef}>
        {songs.map(song => {
          const songCat = (song.categories || ["gray"])[0];
          const isActive = currentSong?.yt_id === song.yt_id;
          const isErr = errored.has(song.yt_id);
          return (
            <li
              key={song.yt_id}
              data-ytid={song.yt_id}
              className={isActive ? "playing" : ""}
              style={isErr ? { opacity: 0.3, cursor: "default" } : {}}
              onClick={() => {
                if (isErr) return;
                const col = columns.find(c => c.id === songCat);
                playSong(song, col?.songs);
              }}
              onMouseEnter={e => !isErr && onSidebarEnter(e.currentTarget as HTMLLIElement, song)}
              onMouseLeave={e => !isErr && onSidebarLeave(e.currentTarget as HTMLLIElement, song)}
            >
              <table><tbody><tr>
                <td title={cleanTitle(song.title)}>{cleanTitle(song.title)}</td>
                <td>{catLabel(songCat)}</td>
                <td>{isErr ? "×" : isActive && isPlaying ? "⏸" : ""}</td>
              </tr></tbody></table>
            </li>
          );
        })}
      </ul>

      {/* ── CONTENT — horizontal columns ──────────────────────────── */}
      <section className="content" ref={contentRef}>
        <div
          id="categoryContainer"
          style={{ width: `${columns.length * 250}px` }}
        >
          {columns.map(col => (
            <div
              key={col.id}
              className={`category ${col.id}`}
              ref={el => { colRefs.current[col.id] = el; }}
            >
              <h2>{col.label}</h2>
              {col.songs.map(song => {
                const isActive = currentSong?.yt_id === song.yt_id;
                const isErr = errored.has(song.yt_id);
                return (
                  <details
                    key={song.yt_id}
                    className={isErr ? "unavailable" : ""}
                    style={pillStyle(col.id, !isErr)}
                    ref={el => { detailsRefs.current[song.yt_id] = el; }}
                  >
                    <summary
                      onClick={e => !isErr && handleSummaryClick(e, song, col.songs)}
                    >
                      <span className="play-icon">
                        {isActive && isPlaying ? "⏸" : ""}
                      </span>
                      {cleanTitle(song.title)}
                    </summary>
                    <figure>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={song.thumbnail}
                        alt={cleanTitle(song.title)}
                        loading="lazy"
                      />
                      {song.description && (
                        <figcaption>{song.description.slice(0, 120)}</figcaption>
                      )}
                    </figure>
                  </details>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
