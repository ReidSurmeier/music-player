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
  available?: boolean;
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

const LABEL_MAP: Record<string, string> = {
  threewords: "Three Words",
  twowords: "Two Words",
  oneword: "One Word",
};

// Actual CSS named colors matching each category — used as pill background like nagizin
const CAT_BG: Record<string, string> = {
  edible: "BurlyWood",
  fruit: "Orange",
  dessert: "PeachPuff",
  people: "AliceBlue",
  floral: "Lavender",
  gemstones: "Turquoise",
  location: "Peru",
  alcohol: "Chartreuse",
  animal: "Tan",
  plants: "LawnGreen",
  nature: "MediumSeaGreen",
  metals: "Silver",
  elements: "Aqua",
  artifact: "AntiqueWhite",
  fabric: "Linen",
  time: "MediumSpringGreen",
  mid: "MediumAquaMarine",
  pale: "PaleGoldenRod",
  light: "LightYellow",
  dark: "DarkSlateGray",
  deep: "DeepSkyBlue",
  red: "Crimson",
  yellow: "Yellow",
  pink: "HotPink",
  orange: "DarkOrange",
  purple: "MediumPurple",
  green: "LimeGreen",
  blue: "CornflowerBlue",
  brown: "SaddleBrown",
  white: "WhiteSmoke",
  gray: "Gray",
  threewords: "LightSteelBlue",
  twowords: "LightBlue",
  oneword: "PowderBlue",
};

function catLabel(id: string) {
  return LABEL_MAP[id] || (id.charAt(0).toUpperCase() + id.slice(1));
}

function shortTitle(title: string) {
  return title
    .replace(/ - YouTube$/i, "")
    .replace(/\s*\(Official.*?\)/gi, "")
    .replace(/\s*\[Official.*?\]/gi, "")
    .replace(/\s*\|.*$/, "")
    .trim()
    .slice(0, 55);
}

export default function MusicPlayer() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sidebarRef = useRef<HTMLUListElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const detailsRefs = useRef<Record<string, HTMLDetailsElement | null>>({});

  useEffect(() => {
    fetch("/music-player/songs.json")
      .then((r) => r.json())
      .then(async (data: Song[]) => {
        const checked = await Promise.all(
          data.map(async (song) => {
            try {
              const res = await fetch(`/music-player/audio/${song.yt_id}.mp3`, { method: "HEAD" });
              return { ...song, available: res.ok };
            } catch {
              return { ...song, available: false };
            }
          })
        );
        setSongs(checked);

        // Group by primary category (first in array)
        const colMap: Record<string, Song[]> = {};
        checked.forEach((song) => {
          const cat = (song.categories || ["gray"])[0];
          if (!colMap[cat]) colMap[cat] = [];
          colMap[cat].push(song);
        });

        setColumns(
          CATEGORY_ORDER
            .filter((cat) => colMap[cat]?.length)
            .map((cat) => ({ id: cat, label: catLabel(cat), songs: colMap[cat] }))
        );
      });
  }, []);

  const playSong = useCallback((song: Song) => {
    if (!song.available) return;

    // Close all open details, open this one
    Object.values(detailsRefs.current).forEach((el) => {
      if (el) el.open = false;
    });
    const det = detailsRefs.current[song.yt_id];
    if (det) det.open = true;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = `/music-player/audio/${song.yt_id}.mp3`;
      audioRef.current.play().catch(() => {});
    }
    setCurrentSong(song);
    setIsPlaying(true);

    // Scroll sidebar
    const li = sidebarRef.current?.querySelector(`[data-id="${song.yt_id}"]`) as HTMLElement;
    li?.scrollIntoView({ block: "nearest" });

    // Scroll column into view
    const cat = (song.categories || ["gray"])[0];
    const col = colRefs.current[cat];
    if (col && contentRef.current) {
      const colLeft = col.offsetLeft;
      contentRef.current.scrollTo({ left: colLeft - 10, behavior: "smooth" });
    }
  }, []);

  const playNext = useCallback(() => {
    if (!currentSong) return;
    const cat = (currentSong.categories || ["gray"])[0];
    const col = columns.find((c) => c.id === cat);
    if (!col) return;
    const idx = col.songs.findIndex((s) => s.yt_id === currentSong.yt_id);
    const next = col.songs.slice(idx + 1).find((s) => s.available);
    if (next) playSong(next);
    else setIsPlaying(false);
  }, [currentSong, columns, playSong]);

  useEffect(() => {
    const audio = new Audio();
    audio.onended = playNext;
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audioRef.current = audio;
    return () => { audio.pause(); };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.onended = playNext;
  }, [playNext]);

  // Hover = color fill like nagizin, fade back after 2s
  const onSidebarEnter = (el: HTMLLIElement, song: Song) => {
    if (currentSong?.yt_id === song.yt_id) return;
    const cat = (song.categories || ["gray"])[0];
    el.style.backgroundColor = CAT_BG[cat] || "#e0e0e0";
  };
  const onSidebarLeave = (el: HTMLLIElement, song: Song) => {
    setTimeout(() => {
      if (currentSong?.yt_id !== song.yt_id) el.style.backgroundColor = "";
    }, 2000);
  };

  const [allOpen, setAllOpen] = useState(false);
  const toggleAll = () => {
    const next = !allOpen;
    setAllOpen(next);
    Object.values(detailsRefs.current).forEach((el) => {
      if (el) el.open = next;
    });
  };

  // Handle details toggle: if opened manually, play the song
  const handleDetailsToggle = (song: Song, el: HTMLDetailsElement) => {
    if (el.open) {
      playSong(song);
    } else if (currentSong?.yt_id === song.yt_id && audioRef.current) {
      audioRef.current.pause();
    }
  };

  // Resize reload — exact nagizin behavior
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const h = () => { clearTimeout(t); t = setTimeout(() => location.reload(), 300); };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  return (
    <>
      {/* ── TITLE BAR ── */}
      <section className="titleContainer">
        <a href="#"><h1>SOUND__</h1></a>
        <button id="toggle-button" onClick={toggleAll}>
          {allOpen ? "Hide All Descriptions" : "View All Descriptions"}
        </button>
        <span className={`nowPlaying${currentSong ? " active" : ""}`}>
          {currentSong
            ? `${isPlaying ? "⏸" : "▶"} ${shortTitle(currentSong.title)}`
            : "Nothing playing."}
        </span>
      </section>

      {/* ── SIDEBAR — master track list, styled like nagizin color list ── */}
      <ul className="colorList" ref={sidebarRef}>
        {songs.map((song) => {
          const cat = (song.categories || ["gray"])[0];
          const isActive = currentSong?.yt_id === song.yt_id;
          return (
            <li
              key={song.yt_id}
              data-id={song.yt_id}
              className={isActive ? "playing" : ""}
              style={!song.available ? { opacity: 0.4, cursor: "default" } : {}}
              onClick={() => playSong(song)}
              onMouseOver={(e) => song.available && onSidebarEnter(e.currentTarget as HTMLLIElement, song)}
              onMouseOut={(e) => song.available && onSidebarLeave(e.currentTarget as HTMLLIElement, song)}
            >
              <table>
                <tbody>
                  <tr>
                    <td title={shortTitle(song.title)}>{shortTitle(song.title)}</td>
                    <td>{catLabel(cat)}</td>
                    <td>{song.available ? "" : "–"}</td>
                  </tr>
                </tbody>
              </table>
            </li>
          );
        })}
      </ul>

      {/* ── CONTENT — horizontal columns ── */}
      {/* ref cast needed because section element type */}
      <section
        className="content"
        ref={contentRef}
      >
        {/* Explicit width = columns * 250px forces overflow-x scroll, same trick as nagizin */}
        <div
          id="categoryContainer"
          style={{ width: `${columns.length * 250}px` }}
        >
          {columns.map((col) => (
            <div
              key={col.id}
              className={`category ${col.id}`}
              ref={(el) => { colRefs.current[col.id] = el; }}
            >
              <h2>{col.label}</h2>
              {col.songs.map((song) => {
                const bg = CAT_BG[col.id] || "LightGray";
                const isActive = currentSong?.yt_id === song.yt_id;
                return (
                  <details
                    key={song.yt_id}
                    className={song.available ? "" : "unavailable"}
                    style={song.available ? { backgroundColor: bg } : {}}
                    ref={(el) => { detailsRefs.current[song.yt_id] = el; }}
                    onToggle={(e) => song.available && handleDetailsToggle(song, e.currentTarget)}
                  >
                    <summary>
                      <span className="play-icon">
                        {isActive && isPlaying ? "⏸" : ""}
                      </span>
                      {shortTitle(song.title)}
                    </summary>
                    <figure>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={song.thumbnail}
                        alt={shortTitle(song.title)}
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
