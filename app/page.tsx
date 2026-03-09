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

// ── Actual nagizin.xyz/htmlColorList/ colors, grouped by category.
// Each song picks 2 colors from its column's palette and gradients between
// their pastel versions — so every column has a recognizable color family.
const NC: Record<string, string[]> = {
  alcohol:    ["#7FFF00"],
  animal:     ["#F5F5DC","#FF7F50","#E9967A","#FFFFF0","#F08080","#FFA07A","#FA8072","#FFF5EE"],
  artifact:   ["#FAEBD7","#B22222","#B0C4DE","#FAF0E6","#FFE4B5","#FDF5E6","#B0E0E6","#4682B4"],
  blue:       ["#F0F8FF","#6495ED","#00BFFF","#1E90FF","#ADD8E6","#E0FFFF","#87CEFA","#B0C4DE","#4169E1","#87CEEB","#4682B4"],
  brown:      ["#A52A2A","#BC8F8F","#8B4513","#F4A460"],
  dark:       ["#00008B","#008B8B","#B8860B","#556B2F","#9932CC","#8B0000","#483D8B","#2F4F4F","#00CED1","#9400D3"],
  deep:       ["#FF1493","#00BFFF"],
  dessert:    ["#D2691E","#FFF8DC","#FF8C00","#F0FFF0","#FFFACD","#FFA500","#FFEFD5","#FFDAB9","#DDA0DD"],
  edible:     ["#FFE4C4","#FFEBCD","#D2691E","#FF7F50","#FFF8DC","#FF8C00","#E9967A","#F0FFF0","#FFA07A","#FFA500","#DA70D6","#EEE8AA"],
  elements:   ["#00FFFF","#7FFFD4","#66CDAA","#B22222"],
  fabric:     ["#FAF0E6","#FDF5E6"],
  floral:     ["#8A2BE2","#6495ED","#9932CC","#9400D3","#FFFAF0","#DAA520","#E6E6FA","#C71585","#DA70D6","#DB7093","#D8BFD8","#EE82EE"],
  fruit:      ["#556B2F","#FF8C00","#F0FFF0","#FFFACD","#00FF00","#32CD32","#808000","#FFA500","#FFEFD5","#FFDAB9"],
  gemstones:  ["#F0FFFF","#00CED1","#FFD700","#48D1CC","#AFEEEE","#C0C0C0","#40E0D0"],
  gray:       ["#A9A9A9","#2F4F4F","#696969","#808080","#D3D3D3","#708090"],
  green:      ["#7FFF00","#006400","#556B2F","#228B22","#008000","#90EE90","#32CD32","#3CB371","#808000","#98FB98","#2E8B57","#9ACD32"],
  light:      ["#ADD8E6","#F08080","#E0FFFF","#FAFAD2","#D3D3D3","#90EE90","#FFB6C1","#FFA07A","#87CEFA","#B0C4DE","#FFFFE0"],
  location:   ["#CD5C5C","#CD853F","#A0522D"],
  metals:     ["#483D8B","#2F4F4F","#778899","#B0C4DE","#C0C0C0","#708090","#4682B4"],
  mid:        ["#66CDAA","#0000CD","#BA55D3","#9370DB","#3CB371","#7B68EE","#00FA9A","#48D1CC","#C71585"],
  nature:     ["#00FFFF","#7FFFD4","#DEB887","#FF7F50","#8FBC8F","#228B22","#7CFC00","#3CB371","#87CEEB"],
  oneword:    ["#00FFFF","#F0FFFF","#F5F5DC","#FFE4C4","#FF7F50","#DC143C","#DCDCDC","#FFD700","#FFFFF0","#F0E68C","#E6E6FA","#FAF0E6","#DA70D6","#C0C0C0","#D2B48C","#40E0D0","#EE82EE"],
  orange:     ["#FF8C00","#FFA500"],
  pale:       ["#EEE8AA","#98FB98","#AFEEEE","#DB7093"],
  people:     ["#F0F8FF","#5F9EA0","#1E90FF","#DCDCDC","#FFDEAD","#4169E1"],
  pink:       ["#FF1493","#FF69B4","#FFB6C1","#FFC0CB"],
  plants:     ["#8A2BE2","#DEB887","#6495ED","#FFF8DC","#B8860B","#556B2F","#FF8C00","#DAA520","#F0FFF0","#E6E6FA","#7CFC00","#FFA07A","#DA70D6","#DB7093","#F5DEB3"],
  purple:     ["#9370DB","#800080","#663399"],
  red:        ["#DC143C","#8B0000","#C71585","#FF4500","#DB7093","#FF0000"],
  threewords: ["#B8860B","#556B2F","#8FBC8F","#483D8B","#2F4F4F","#00BFFF","#FAFAD2","#20B2AA","#87CEFA","#778899","#B0C4DE","#66CDAA","#3CB371","#7B68EE","#EEE8AA","#DB7093"],
  time:       ["#00FA9A","#191970","#00FF7F"],
  twowords:   ["#F0F8FF","#7FFFD4","#5F9EA0","#6495ED","#FFF8DC","#E9967A","#00CED1","#FF1493","#1E90FF","#FFFAF0","#F0FFF0","#FF69B4","#ADD8E6","#90EE90","#FFB6C1","#0000CD","#9370DB","#48D1CC","#98FB98","#AFEEEE","#B0E0E6","#9ACD32"],
  white:      ["#FAEBD7","#FFFAF0","#F8F8FF","#FFDEAD","#FFF5EE","#FFFAFA","#FFFFFF","#F5F5F5"],
  yellow:     ["#FAFAD2","#FFFFE0","#FFFF00","#9ACD32"],
};

function hashInt(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Convert hex to HSL, then shift toward pastel (high L, reduced S)
function hexToPastelHsl(hex: string, lBoost = 0): string {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0;
  const l = (max+min)/2;
  if (max !== min) {
    const d = max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    if (max===r) h=((g-b)/d+(g<b?6:0))/6;
    else if (max===g) h=((b-r)/d+2)/6;
    else h=((r-g)/d+4)/6;
  }
  // Pastelise: pull lightness toward 82%, cap saturation at 50%
  const newL = Math.round((l*100*0.35 + 82*0.65) + lBoost);
  const newS = Math.round(Math.min(s*100, 50));
  return "hsl("+Math.round(h*360)+","+newS+"%,"+newL+"%)";
}

function pillStyle(song: Song, available: boolean): React.CSSProperties {
  if (!available) return { opacity: 0.4 };

  const catId = song.categories?.[0] || "gray";
  const palette = NC[catId] ?? NC.gray;
  const hash = hashInt(song.yt_id);

  // Pick 2 distinct colors from this category's nagizin palette
  const c1 = palette[hash % palette.length];
  const c2 = palette[(hash >> 4) % palette.length] ?? c1;

  const isDarkCat = catId === "dark" || catId === "time";
  if (isDarkCat) {
    // Dark categories stay darker — smaller lightness boost
    return {
      background: "linear-gradient(135deg," + hexToPastelHsl(c1,-18) + " 0%," + hexToPastelHsl(c2,-20) + " 100%)",
      color: "#eee",
    };
  }

  return {
    background: "linear-gradient(135deg," + hexToPastelHsl(c1) + " 0%," + hexToPastelHsl(c2,5) + " 100%)",
    color: "#444",
  };
}

function songGradient(song: Song): string {
  const catId = song.categories?.[0] || "gray";
  const palette = NC[catId] ?? NC.gray;
  const hash = hashInt(song.yt_id);
  const c1 = palette[hash % palette.length];
  const c2 = palette[(hash >> 4) % palette.length] ?? c1;
  const isDarkCat = catId === "dark" || catId === "time";
  if (isDarkCat) {
    return `linear-gradient(160deg,${hexToPastelHsl(c1,-18)} 0%,${hexToPastelHsl(c2,-20)} 100%)`;
  }
  return `linear-gradient(160deg,${hexToPastelHsl(c1)} 0%,${hexToPastelHsl(c2,5)} 100%)`;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);      // waveform history (desktop)
  const barCanvasRef = useRef<HTMLCanvasElement>(null);   // frequency bars (desktop)
  const mobileVizRef = useRef<HTMLCanvasElement>(null);   // big mobile visualizer
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
  const [volume, setVolume] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const shuffleRef = useRef(false);

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

  // ── Sync volume to audio element ────────────────────────────────
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

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

    // ── 3. MOBILE VISUALIZER (large centered oscilloscope) ───────────────
    const mViz = mobileVizRef.current;
    if (mViz) {
      const mc = mViz.getContext("2d");
      if (mc) {
        const W = mViz.width;
        const H = mViz.height;
        mc.clearRect(0, 0, W, H);
        if (analyser) {
          const wave = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(wave);
          // Draw stacked waveform traces
          const N = 8;
          for (let hi = 0; hi < N; hi++) {
            const progress = hi / (N - 1);
            const opacity = 0.04 + progress * 0.22;
            const yShift = (N - 1 - hi) * 2.5;
            mc.beginPath();
            mc.strokeStyle = "rgba(0,0,0," + opacity + ")";
            mc.lineWidth = progress > 0.7 ? 1.5 : 0.9;
            const step = Math.ceil(wave.length / W);
            for (let x = 0; x < W; x++) {
              let sum = 0;
              for (let s = 0; s < step; s++) sum += (wave[x * step + s] ?? 0);
              // Older traces: compressed; newest: full amplitude
              const amp = (0.4 + progress * 0.55) * (H / 2) * 0.88;
              const y = H / 2 + (sum / step) * amp + yShift;
              x === 0 ? mc.moveTo(x, y) : mc.lineTo(x, y);
            }
            mc.stroke();
          }
          // Frequency bars across the bottom quarter
          const freq = new Uint8Array(64);
          analyser.getByteFrequencyData(freq);
          const count = 28, gap = 2, barW = Math.floor((W - gap * (count - 1)) / count);
          for (let i = 0; i < count; i++) {
            const val = freq[i + 2] / 255;
            const barH = Math.max(2, Math.round(val * H * 0.22));
            const x = i * (barW + gap);
            mc.fillStyle = "rgba(0,0,0," + (0.06 + val * 0.20) + ")";
            mc.fillRect(x, H - barH, barW, barH);
          }
        } else {
          // Idle: gentle sine drift
          const t = Date.now() / 3000;
          mc.beginPath();
          mc.strokeStyle = "rgba(0,0,0,0.08)";
          mc.lineWidth = 1.2;
          for (let x = 0; x < W; x++) {
            const ph = (x / W) * Math.PI * 3 + t;
            const y = H / 2 + Math.sin(ph) * H * 0.12 + Math.sin(ph * 0.5 + 1) * H * 0.05;
            x === 0 ? mc.moveTo(x, y) : mc.lineTo(x, y);
          }
          mc.stroke();
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
    if (shuffleRef.current) {
      const available = queue.filter(s => s.yt_id !== currentSong.yt_id && !errored.has(s.yt_id));
      if (available.length === 0) { setIsPlaying(false); return; }
      playSong(available[Math.floor(Math.random() * available.length)], queue);
    } else {
      const idx = queue.findIndex(s => s.yt_id === currentSong.yt_id);
      const next = queue.slice(idx + 1).find(s => !errored.has(s.yt_id));
      if (next) playSong(next, queue);
      else setIsPlaying(false);
    }
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
    const palette = NC[catId] ?? NC.gray;
    const color = hexToPastelHsl(palette[hashInt(song.yt_id) % palette.length]);
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
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [togglePlayPause]);

  // ── Window resize: update mobile viz canvas size ───────────────
  useEffect(() => {
    const update = () => {
      const c = mobileVizRef.current;
      if (c) { c.width = window.innerWidth; c.height = 20; }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
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
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          if (currentSongRef.current) {
            setErrored(prev => new Set([...prev, currentSongRef.current!.yt_id]));
          }
        }}
        style={{ display: "none" }}
      />

      {/* ── TITLE BAR ─────────────────────────────────────────────── */}
      <section className="titleContainer">
        {/* Grayscale gif — left corner */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://d2w9rnfcy7mm78.cloudfront.net/10483272/original_6c20fd1a010bb5c6e5df5789483d28e8.gif?1611983047?bc=0"
          alt=""
          className="title-gif"
        />

        <a href="#"><h1>♫⋆｡‧₊˚♪⊹₊⋆˚♬ ﾟ.</h1></a>

        {/* Transport controls — left, right after title */}
        <div className="transport">
          <button className="transport-btn play-pause" onClick={togglePlayPause} title="Play/Pause (Space)">
            {isPlaying
              ? <span className="soundbars"><span/><span/><span/><span/></span>
              : "▶"}
          </button>
        </div>

        {/* Volume control */}
        <div className="volume-control">
          <input
            className="volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={e => setVolume(Number(e.target.value))}
            style={{ "--vol": `${volume * 100}%` } as React.CSSProperties}
          />
        </div>

        <button id="toggle-button" onClick={toggleAll}>
          {allOpen ? "Hide All" : "View All"}
        </button>

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
                        src={`/dvd-covers/arena_${song.arena_id}.webp`}
                        alt={cleanTitle(song.title)}
                        loading="lazy"
                        decoding="async"
                        className={`dvd-cover${isActive && isPlaying ? " spinning" : ""}`}
                        onError={(e) => { (e.target as HTMLImageElement).src = song.thumbnail; }}
                        onMouseEnter={() => { if (isActive && isPlaying) audioRef.current?.pause(); }}
                        onMouseLeave={() => { if (isActive && audioRef.current?.paused) audioRef.current?.play().catch(() => {}); }}
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

      {/* ── MOBILE NOW PLAYING CARD ─────────────────────────────────
           border-radius: 50% — same as desktop pill elements.
           Shows album art + white figcaption, no scrubber.        ── */}
      <div
        className="mobile-now-card"
        style={currentSong ? { background: songGradient(currentSong) } : {}}
      >
        {currentSong ? (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/dvd-covers/arena_${currentSong.arena_id}.webp`}
              alt={cleanTitle(currentSong.title)}
              className={`dvd-cover${isPlaying ? " spinning" : ""}`}
              onError={(e) => { (e.target as HTMLImageElement).src = currentSong.thumbnail; }}
            />
            {/* white box: soundbars + title [cat] · times · meta */}
            <figcaption>
              <span className="mobile-fig-top">
                {isPlaying && <span className="soundbars"><span/><span/><span/><span/></span>}
                <span className="mobile-fig-title">
                  {cleanTitle(currentSong.title)}
                  {cat && <span className="mobile-card-cat"> [{catLabel(cat)}]</span>}
                </span>
                <span className="mobile-card-times">
                  {fmtTime(currentTime)}<span className="mobile-card-sep"> / </span>{fmtTime(duration)}
                </span>
              </span>
              {(currentSong.meta?.album || currentSong.meta?.year || currentSong.meta?.label) && (
                <span className="mobile-fig-meta">
                  {currentSong.meta?.album && <span>{currentSong.meta.album}</span>}
                  {currentSong.meta?.year && <span> · {currentSong.meta.year}</span>}
                  {currentSong.meta?.label && <span> · {currentSong.meta.label}</span>}
                </span>
              )}
            </figcaption>
          </figure>
        ) : (
          <div className="mobile-card-empty">tap a song to begin ♫</div>
        )}
      </div>

      {/* ── MOBILE TRANSPORT ROW ──────────────────────────────────── */}
      <div className="mobile-controls">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://d2w9rnfcy7mm78.cloudfront.net/10483272/original_6c20fd1a010bb5c6e5df5789483d28e8.gif?1611983047?bc=0"
          alt=""
          className="mobile-title-gif"
        />
        <h1 className="mobile-title-deco">♫⋆｡‧₊˚♪</h1>
        <button className="transport-btn play-pause" onClick={togglePlayPause}>
          {isPlaying ? "⏸" : "▶"}
        </button>

        <input
          className="volume-slider"
          type="range"
          min={0} max={1} step={0.01}
          value={volume}
          onChange={e => setVolume(Number(e.target.value))}
          style={{ "--vol": `${volume * 100}%` } as React.CSSProperties}
        />
      </div>
    </>
  );
}
