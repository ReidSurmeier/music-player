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

// Ordered category list (nagizin order)
const CATEGORY_ORDER = [
  "edible", "fruit", "dessert", "people", "floral", "gemstones",
  "location", "alcohol", "animal", "plants", "nature", "metals",
  "elements", "artifact", "fabric", "time", "mid", "pale",
  "light", "dark", "deep", "red", "yellow", "pink", "orange",
  "purple", "green", "blue", "brown", "white", "gray",
  "threewords", "twowords", "oneword",
];

const LABEL_MAP: Record<string, string> = {
  threewords: "Three Words",
  twowords: "Two Words",
  oneword: "One Word",
};

function categoryLabel(id: string): string {
  return LABEL_MAP[id] || (id.charAt(0).toUpperCase() + id.slice(1));
}

// Muted accent colors per category for hover effect
const CAT_COLORS: Record<string, string> = {
  edible: "#f5deb3", fruit: "#ffa07a", dessert: "#ffe4e1", people: "#deb887",
  floral: "#ffe4e1", gemstones: "#e6e6fa", location: "#b0e0e6", alcohol: "#c0a080",
  animal: "#d2b48c", plants: "#90ee90", nature: "#98fb98", metals: "#c0c0c0",
  elements: "#e0e0e0", artifact: "#f5f5dc", fabric: "#faf0e6", time: "#fffacd",
  mid: "#d3d3d3", pale: "#f8f8ff", light: "#fffff0", dark: "#696969",
  deep: "#4682b4", red: "#fa8072", yellow: "#ffd700", pink: "#ffb6c1",
  orange: "#ffdab9", purple: "#dda0dd", green: "#90ee90", blue: "#add8e6",
  brown: "#d2b48c", white: "#f5f5f5", gray: "#d3d3d3", threewords: "#e8e8e8",
  twowords: "#efefef", oneword: "#f8f8f8",
};

export default function MusicPlayer() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [allExpanded, setAllExpanded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sidebarRef = useRef<HTMLUListElement | null>(null);

  // Load songs and check which MP3s are available
  useEffect(() => {
    fetch("/music-player/songs.json")
      .then((r) => r.json())
      .then(async (data: Song[]) => {
        // Check availability via HEAD request
        const checked = await Promise.all(
          data.map(async (song) => {
            try {
              const res = await fetch(`/music-player/audio/${song.yt_id}.mp3`, {
                method: "HEAD",
              });
              return { ...song, available: res.ok };
            } catch {
              return { ...song, available: false };
            }
          })
        );
        setSongs(checked);

        // Build columns
        const colMap: Record<string, Song[]> = {};
        checked.forEach((song) => {
          const cats = song.categories || ["gray"];
          // Place song in ALL its categories
          cats.forEach((cat) => {
            if (!colMap[cat]) colMap[cat] = [];
            colMap[cat].push(song);
          });
        });

        const cols: Column[] = CATEGORY_ORDER.filter((cat) => colMap[cat]?.length > 0).map(
          (cat) => ({ id: cat, label: categoryLabel(cat), songs: colMap[cat] })
        );
        setColumns(cols);
      });
  }, []);

  const playSong = useCallback((song: Song) => {
    if (!song.available) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = `/music-player/audio/${song.yt_id}.mp3`;
      audioRef.current.play().catch(() => {});
    }
    setCurrentSong(song);
    setIsPlaying(true);

    // Scroll sidebar to this song
    if (sidebarRef.current) {
      const li = sidebarRef.current.querySelector(`[data-id="${song.yt_id}"]`) as HTMLElement;
      if (li) li.scrollIntoView({ block: "nearest" });
    }
    // Scroll content to this song's column
    const cat = song.categories[0];
    const col = columnRefs.current[cat];
    if (col) col.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, []);

  const playNext = useCallback(() => {
    if (!currentSong) return;
    const cat = currentSong.categories[0];
    const col = columns.find((c) => c.id === cat);
    if (!col) return;
    const idx = col.songs.findIndex((s) => s.yt_id === currentSong.yt_id);
    const next = col.songs.slice(idx + 1).find((s) => s.available);
    if (next) playSong(next);
    else setIsPlaying(false);
  }, [currentSong, columns, playSong]);

  // Setup audio element
  useEffect(() => {
    const audio = new Audio();
    audio.onended = playNext;
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  // Re-bind onended when playNext changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.onended = playNext;
  }, [playNext]);

  // Hover color effect on sidebar items (matching original nagizin behavior)
  const handleSidebarHover = (el: HTMLLIElement, song: Song, entering: boolean) => {
    if (currentSong?.yt_id === song.yt_id) return;
    const cat = song.categories[0];
    const color = CAT_COLORS[cat] || "#e0e0e0";
    if (entering) {
      el.style.backgroundColor = color;
    } else {
      setTimeout(() => {
        if (currentSong?.yt_id !== song.yt_id) el.style.backgroundColor = "";
      }, 2000);
    }
  };

  // Hover color effect on play items
  const handleItemHover = (el: HTMLDivElement, cat: string, entering: boolean) => {
    const color = CAT_COLORS[cat] || "#e0e0e0";
    if (entering) {
      el.style.backgroundColor = color;
    } else {
      setTimeout(() => {
        if (!el.classList.contains("active")) el.style.backgroundColor = "";
      }, 2000);
    }
  };

  const toggleAll = () => setAllExpanded((v) => !v);

  const shortTitle = (title: string) =>
    title.replace(/ - YouTube$/, "").replace(/ \(Official.*\)/, "").slice(0, 60);

  return (
    <>
      {/* Hidden audio element placeholder */}
      <div style={{ display: "none" }} />

      {/* Title Bar */}
      <section className="titleContainer">
        <a href="#"><h1>SOUND__</h1></a>
        <span className={`nowPlaying ${currentSong ? "active" : ""}`}>
          {currentSong
            ? `${isPlaying ? "⏸" : "▶"} ${shortTitle(currentSong.title)}`
            : "Nothing playing."}
        </span>
        <button id="toggle-button" onClick={toggleAll}>
          {allExpanded ? "Hide All" : "View All"}
        </button>
      </section>

      {/* Sidebar — master track list */}
      <ul className="colorList" ref={sidebarRef}>
        {songs.map((song) => (
          <li
            key={song.yt_id}
            data-id={song.yt_id}
            className={currentSong?.yt_id === song.yt_id ? "playing" : ""}
            style={!song.available ? { opacity: 0.35, cursor: "default" } : {}}
            onClick={() => playSong(song)}
            onMouseOver={(e) =>
              song.available && handleSidebarHover(e.currentTarget as HTMLLIElement, song, true)
            }
            onMouseOut={(e) =>
              song.available && handleSidebarHover(e.currentTarget as HTMLLIElement, song, false)
            }
          >
            <span className="track-title">{shortTitle(song.title)}</span>
            <span className="track-cat">{song.categories.join(", ")}</span>
          </li>
        ))}
      </ul>

      {/* Content area — horizontal columns */}
      <section className="content">
        <div id="categoryContainer">
          {columns.map((col) => (
            <div
              key={col.id}
              className={`category ${col.id}`}
              ref={(el) => { columnRefs.current[col.id] = el; }}
            >
              <h2>{col.label}</h2>
              {col.songs.length === 0 && <div className="category-empty" />}
              {col.songs.map((song) => {
                const isActive = currentSong?.yt_id === song.yt_id;
                return (
                  <div
                    key={`${col.id}-${song.yt_id}`}
                    className={`play-item${isActive ? " active" : ""}${!song.available ? " unavailable" : ""}`}
                    onClick={() => playSong(song)}
                    onMouseOver={(e) =>
                      song.available && handleItemHover(e.currentTarget as HTMLDivElement, col.id, true)
                    }
                    onMouseOut={(e) =>
                      song.available && handleItemHover(e.currentTarget as HTMLDivElement, col.id, false)
                    }
                  >
                    <span className="play-indicator">
                      {isActive && isPlaying ? "⏸" : song.available ? "" : ""}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="song-thumb"
                      src={song.thumbnail}
                      alt=""
                      loading="lazy"
                    />
                    <div className="song-info">
                      <div className="song-title">{shortTitle(song.title)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* Window resize reload (matching original) */}
      <ResizeReloader />
    </>
  );
}

function ResizeReloader() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => location.reload(), 300);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return null;
}
