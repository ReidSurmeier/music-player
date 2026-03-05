"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface SongMeta {
  album: string | null;
  year: string | null;
  label: string | null;
}
interface Song {
  arena_id: number;
  title: string;
  yt_id: string;
  url: string;
  description: string;
  thumbnail: string;
  categories: string[];
  meta?: SongMeta;
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

// 10 colors directly from reidsurmeier.garden/fj09304u2.png
const P = {
  purple:  "#800080",
  red:     "#FF0000",
  blue:    "#0000FF",
  lavender:"#D4C5F9",
  cream:   "#F0E8D0",
  dark:    "#333333",
  steel:   "#6699CC",
  orange:  "#FF6600",
  green:   "#008000",
  silver:  "#C0C0C0",
};
const CAT_BG: Record<string,string> = {
  edible:    P.orange,  fruit:      P.green,  dessert:   P.cream,
  people:    P.lavender,floral:     P.lavender,gemstones: P.steel,
  location:  P.steel,  alcohol:    P.green,  animal:    P.orange,
  plants:    P.green,  nature:     P.steel,  metals:    P.silver,
  elements:  P.silver, artifact:   P.cream,  fabric:    P.cream,
  time:      P.dark,   mid:        P.silver, pale:      P.cream,
  light:     P.lavender,dark:      P.dark,   deep:      P.blue,
  red:       P.red,    yellow:     P.orange, pink:      P.lavender,
  orange:    P.orange, purple:     P.purple, green:     P.green,
  blue:      P.blue,   brown:      P.orange, white:     P.cream,
  gray:      P.silver, threewords: P.lavender,twowords: P.steel,
  oneword:   P.cream,
};

function catLabel(id: string) {
  return LABEL_MAP[id] || (id.charAt(0).toUpperCase() + id.slice(1));
}

// Dark bg colors that need white text on the pill
const DARK_CATS = new Set(["time","dark","deep","blue","green","purple","red"]);

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
  const currentSongRef = useRef<Song | null>(null);

  // Web Audio visualizer refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animFrameRef = useRef<number>(0);

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

  // ── Web Audio visualizer ─────────────────────────────────────────
  const setupAnalyser = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || sourceNodeRef.current) return; // only connect once
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;         // 32 frequency bins — Spotify-style bar count
      analyser.smoothingTimeConstant = 0.8;
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;
    } catch (e) {
      console.warn("AudioContext setup failed:", e);
    }
  }, []);

  const drawVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bins = analyser.frequencyBinCount; // 32
    const data = new Uint8Array(bins);
    analyser.getByteFrequencyData(data);

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Draw ~20 bars in the center frequency range (skip very low/high bins)
    const start = 2;
    const end = 22;
    const count = end - start;
    const gap = 1;
    const barW = Math.floor((W - gap * (count - 1)) / count);

    for (let i = 0; i < count; i++) {
      const val = data[start + i] / 255;
      const barH = Math.max(2, Math.round(val * H));
      const x = i * (barW + gap);
      const y = H - barH;
      // Color: same IRC dark purple from the palette
      ctx.fillStyle = val > 0.6 ? "#4B0082" : val > 0.3 ? "#800080" : "#DCD0E8";
      ctx.fillRect(x, y, barW, barH);
    }

    animFrameRef.current = requestAnimationFrame(drawVisualizer);
  }, []);

  // Start/stop draw loop with playback state
  useEffect(() => {
    if (isPlaying && analyserRef.current) {
      // Resume AudioContext if suspended (browser policy)
      audioCtxRef.current?.resume();
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(drawVisualizer);
    } else {
      cancelAnimationFrame(animFrameRef.current);
      // Draw flat line when paused
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, drawVisualizer]);

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

    // Setup Web Audio on first interaction (requires user gesture)
    setupAnalyser();

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
        <a href="#"><h1>♫⋆｡‧₊˚♪⊹₊⋆˚♬ ﾟ.</h1></a>

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

        {/* Visualizer canvas */}
        <canvas
          ref={canvasRef}
          width={80}
          height={22}
          style={{
            flexShrink: 0,
            display: currentSong && isPlaying ? "block" : "none",
            imageRendering: "pixelated",
          }}
        />

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
                      <figcaption>
                        {song.meta?.album && <span>{song.meta.album}</span>}
                        {song.meta?.year && <span> · {song.meta.year}</span>}
                        {song.meta?.label && <span> · {song.meta.label}</span>}
                        {!song.meta?.album && !song.meta?.year && !song.meta?.label && (
                          <span style={{color:"#999"}}>—</span>
                        )}
                      </figcaption>
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
