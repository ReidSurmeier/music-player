"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface SongMeta {
  album: string | null;
  year: string | null;
  label: string | null;
}
interface SongGradient {
  from: string;
  to: string;
  hue: number;
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
  gradient?: SongGradient;
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

// Per-song gradient: each song gets a unique two-stop gradient
// Fallback to category color if no gradient stored
function pillStyle(song: Song, available: boolean): React.CSSProperties {
  if (!available) return { opacity: 0.4 };
  if (song.gradient) {
    const { from, to, hue } = song.gradient;
    // Use white text for dark hues (purple, blue, green, red ranges)
    const darkHue = (hue >= 180 && hue <= 320) || hue >= 340 || hue <= 20;
    const sat = parseInt(from.slice(1,3), 16);
    const isDark = sat < 130;
    const grad = "linear-gradient(135deg, " + from + " 0%, " + to + " 100%)";
    return {
      background: grad,
      color: isDark ? "#f5f0e8" : "#1E1814",
    };
  }
  return { backgroundColor: CAT_BG[song.categories?.[0] || "gray"] || "#ddd" };
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
  const canvasRef = useRef<HTMLCanvasElement>(null);   // waveform history
  const barCanvasRef = useRef<HTMLCanvasElement>(null); // frequency bars
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animFrameRef = useRef<number>(0);
  // Ring buffer of recent waveform snapshots for stacked history viz
  const waveHistoryRef = useRef<Float32Array[]>([]);

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
    fetch("/songs.json")
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
      analyser.fftSize = 2048;        // time-domain waveform
      analyser.smoothingTimeConstant = 0.5;
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
    const analyser = analyserRef.current;

    // ── 1. WAVEFORM HISTORY (stacked traces, slim-border canvas) ──────────
    const waveCanvas = canvasRef.current;
    if (waveCanvas) {
      const ctx = waveCanvas.getContext("2d");
      if (ctx) {
        const W = waveCanvas.width;
        const H = waveCanvas.height;
        const N_HISTORY = 10;
        ctx.clearRect(0, 0, W, H);

        if (analyser) {
          const wave = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(wave);
          const hist = waveHistoryRef.current;
          hist.push(wave);
          if (hist.length > N_HISTORY) hist.shift();

          for (let hi = 0; hi < hist.length; hi++) {
            const progress = hi / Math.max(hist.length - 1, 1);
            const opacity = 0.05 + progress * 0.20;
            const yShift = (hist.length - 1 - hi) * 1.2;
            ctx.beginPath();
            ctx.strokeStyle = "rgba(0,0,0," + opacity + ")";
            ctx.lineWidth = progress > 0.8 ? 1.2 : 0.8;
            const slice = hist[hi];
            const step = Math.ceil(slice.length / W);
            for (let x = 0; x < W; x++) {
              let sum = 0;
              for (let s = 0; s < step; s++) sum += (slice[x * step + s] ?? 0);
              const y = H / 2 + (sum / step) * (H / 2) * 0.82 + yShift;
              x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        } else {
          // Idle drift
          const t = Date.now() / 4000;
          ctx.beginPath();
          ctx.strokeStyle = "rgba(0,0,0,0.08)";
          ctx.lineWidth = 1;
          for (let x = 0; x < W; x++) {
            const ph = (x / W) * Math.PI * 3 + t;
            const y = H / 2 + Math.sin(ph) * H * 0.18 + Math.sin(ph * 0.5) * H * 0.07;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.beginPath();
          ctx.strokeStyle = "rgba(0,0,0,0.04)";
          for (let x = 0; x < W; x++) {
            const ph = (x / W) * Math.PI * 2.3 + t * 0.7 + 1.2;
            const y = H / 2 + Math.sin(ph) * H * 0.11;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    }

    // ── 2. FREQUENCY BARS (classic 20-bar visualizer) ────────────────────
    const barCanvas = barCanvasRef.current;
    if (barCanvas) {
      const bctx = barCanvas.getContext("2d");
      if (bctx) {
        const W = barCanvas.width;
        const H = barCanvas.height;
        bctx.clearRect(0, 0, W, H);

        if (analyser) {
          // Use a separate smaller FFT for bar display
          const bins = 64;
          const freq = new Uint8Array(bins);
          analyser.getByteFrequencyData(freq);
          const start = 2, end = 22, count = end - start;
          const gap = 1;
          const barW = Math.floor((W - gap * (count - 1)) / count);
          for (let i = 0; i < count; i++) {
            const val = freq[start + i] / 255;
            const barH = Math.max(1, Math.round(val * H));
            const x = i * (barW + gap);
            const opacity = 0.08 + val * 0.22;
            bctx.fillStyle = "rgba(0,0,0," + opacity + ")";
            bctx.fillRect(x, H - barH, barW, barH);
          }
        } else {
          // Idle: flat baseline
          bctx.fillStyle = "rgba(0,0,0,0.05)";
          bctx.fillRect(0, H - 1, W, 1);
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(drawVisualizer);
  }, []);

  // Draw loop always runs — shows idle wave when nothing plays, live waveform when playing
  useEffect(() => {
    if (isPlaying) audioCtxRef.current?.resume();
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(drawVisualizer);
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

    audio.src = `/audio/${song.yt_id}.mp3`;
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

        {/* Waveform history — slim outlined border */}
        <div style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 3,
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
        }}>
          <canvas ref={canvasRef} width={160} height={22} style={{ display: "block" }} />
        </div>
        {/* Frequency bars */}
        <canvas
          ref={barCanvasRef}
          width={80}
          height={22}
          style={{ flexShrink: 0, display: "block" }}
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
                    style={pillStyle(song, !isErr)}
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
