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

// ── Color families: each category maps to a base hue.
// Songs within the same column stay in the same hue family (±15°),
// but each song gets a unique variation via yt_id hash.
const CAT_HUE: Record<string, number> = {
  // warm / orange family
  edible: 28, animal: 28, brown: 28, yellow: 38, orange: 28,
  // green family
  fruit: 130, alcohol: 125, plants: 135, nature: 140, green: 130,
  // blue / steel family
  gemstones: 215, location: 218, metals: 210, elements: 210,
  nature2: 215, mid: 210, twowords: 215,
  // lavender / purple family
  people: 265, floral: 270, light: 260, pink: 305, purple: 285, threewords: 265,
  // blue deep family
  deep: 225, blue: 225,
  // red family
  red: 5,
  // cream / warm neutral family
  dessert: 42, artifact: 40, fabric: 40, pale: 45, white: 48, oneword: 42,
  // silver / grey family
  metals2: 210, gray: 210,
  // dark / muted
  time: 20, dark: 18,
};
// Explicit lookup (overrides above where needed)
const CAT_HUE_MAP: Record<string, number> = {
  edible:47, fruit:128, dessert:42, people:265, floral:270,
  gemstones:215, location:218, alcohol:125, animal:32, plants:132,
  nature:140, metals:210, elements:208, artifact:40, fabric:44,
  time:20, mid:210, pale:45, light:260, dark:18, deep:225,
  red:5, yellow:38, pink:305, orange:28, purple:285, green:128,
  blue:222, brown:30, white:48, gray:210,
  threewords:265, twowords:215, oneword:42,
};

function hashInt(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pillStyle(song: Song, available: boolean): React.CSSProperties {
  if (!available) return { opacity: 0.4 };

  const catId = song.categories?.[0] || "gray";
  const baseHue = CAT_HUE_MAP[catId] ?? 210;
  const hash = hashInt(song.yt_id);

  // Variation within the family: ±14° hue, so songs in same column
  // are clearly related but individually distinct
  const hueShift = (hash % 29) - 14;
  const h1 = (baseHue + hueShift + 360) % 360;
  const h2 = (h1 + 18) % 360;

  // Saturation: low-medium (25–42%), all muted/washed
  const sat1 = 25 + (hash % 17);
  const sat2 = sat1 + 5;

  // Lightness: high (78–87%), keeps everything soft
  const l1 = 78 + ((hash >> 4) % 9);
  const l2 = l1 - 7;

  // Dark category: invert lightness
  const isDarkCat = catId === "dark" || catId === "time";
  if (isDarkCat) {
    const ds = 6 + (hash % 10);
    const dl = 38 + ((hash >> 3) % 14);
    return {
      background: "linear-gradient(135deg,hsl(" + h1 + "," + ds + "%," + dl + "%) 0%,hsl(" + h2 + "," + (ds+4) + "%," + (dl-7) + "%) 100%)",
      color: "#e8e8e8",
    };
  }

  return {
    background: "linear-gradient(135deg,hsl(" + h1 + "," + sat1 + "%," + l1 + "%) 0%,hsl(" + h2 + "," + sat2 + "%," + l2 + "%) 100%)",
    color: "#555",
  };
}

function catLabel(id: string) {
  return LABEL_MAP[id] || (id.charAt(0).toUpperCase() + id.slice(1));
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
    const catId = (song.categories || ["gray"])[0];
    const baseHue = CAT_HUE_MAP[catId] ?? 210;
    const color = "hsl(" + baseHue + ",30%,80%)";
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
