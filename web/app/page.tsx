"use client";
import { useEffect, useState } from "react";
import { api, Game } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import BannerCarousel, { Banner } from "@/components/BannerCarousel";
import GameTile, { TileSkeleton } from "@/components/GameTile";
import GameRow from "@/components/GameRow";
import WinsTicker from "@/components/WinsTicker";
import Icon from "@/components/Icons";

type Facet = { code: string; title: string; games: number };
type Lobby = {
  banners: Banner[]; categories: Facet[]; providers: Facet[];
  popular: Game[]; new: Game[]; recommended: Game[]; recent: Game[];
};

// Hue for a provider's monogram, stable per code.
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export default function LobbyPage() {
  const { me, ready } = useMe();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [games, setGames] = useState<Game[] | null>(null);
  const [cat, setCat] = useState("");
  const [studio, setStudio] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  // api() attaches the player token itself, so recommended/recent become personal once logged in.
  useEffect(() => {
    if (!ready) return;
    api<Lobby>("/api/lobby").then(setLobby).catch((e) => setError(e.message));
  }, [ready, me?.id]);

  // Debounce typing in the search box.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (cat) p.set("category", cat);
    if (studio) p.set("studio", studio);
    api<{ games: Game[] }>("/api/games" + (p.toString() ? "?" + p : ""))
      .then((d) => live && setGames(d.games))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [query, cat, studio]);

  const studios: Record<string, string> = {};
  lobby?.providers.forEach((p) => { studios[p.code] = p.title; });
  const total = lobby?.categories.reduce((s, c) => s + c.games, 0) ?? 0;
  const filtered = !!(query || cat || studio);
  const loading = !lobby;
  const originals = filtered ? undefined : games?.filter((g) => g.provider === "originals");

  return (
    <>
      {lobby ? <BannerCarousel banners={lobby.banners} /> : <div className="carousel skeleton shimmer" />}

      {me && <WinsTicker playerId={me.id} />}

      <div className="lobby-bar">
        <div className="tabs scroll" role="tablist" aria-label="Categories">
          <button role="tab" aria-selected={cat === ""} className={"tab" + (cat === "" ? " active" : "")} onClick={() => setCat("")}>
            <Icon name="all" size={16} />Lobby {total > 0 && <span className="count">{total}</span>}
          </button>
          {lobby?.categories.filter((c) => c.games > 0).map((c) => (
            <button key={c.code} role="tab" aria-selected={cat === c.code} className={"tab" + (cat === c.code ? " active" : "")} onClick={() => setCat(c.code)}>
              <Icon name={c.code} size={16} />{c.title} <span className="count">{c.games}</span>
            </button>
          ))}
        </div>
        <label className="search-wrap">
          <Icon name="search" size={17} />
          <input className="search" type="search" placeholder="Search games or studios" aria-label="Search games"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {lobby && lobby.providers.length > 0 && (
        <div className="chips" aria-label="Studios">
          {lobby.providers.map((p) => (
            <button key={p.code} className={"chip" + (studio === p.code ? " active" : "")} aria-pressed={studio === p.code}
              onClick={() => setStudio(studio === p.code ? "" : p.code)}>
              <span className="chip-mono" style={{ background: `hsl(${hue(p.code)} 70% 55%)` }}>{p.title.charAt(0)}</span>
              {p.title} <span className="count">{p.games}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {!filtered && (
        <>
          {(loading || (originals && originals.length > 0)) && (
            <GameRow title="A2 Originals" icon="bolt" size="lg" games={loading ? undefined : originals} studios={studios} loading={loading}
              sub={<span className="fair-chip"><Icon name="shield" size={13} />Provably fair · up to 99% RTP</span>} />
          )}
          {me && lobby && <GameRow title="Continue playing" icon="clock" games={lobby.recent} studios={studios} />}
          <GameRow title={me ? "Recommended for you" : "Recommended"} icon="sparkle" games={lobby?.recommended} studios={studios} loading={loading} />
          <GameRow title="Popular" icon="fire" games={lobby?.popular} studios={studios} loading={loading} />
          {lobby && <GameRow title="New releases" icon="star" games={lobby.new} studios={studios} />}
        </>
      )}

      <section className="section">
        <div className="section-head">
          <h2><span className="h-icon"><Icon name={filtered ? "search" : "grid"} size={18} /></span>{filtered ? "Results" : "All games"}</h2>
          {games && <span className="muted count-pill">{games.length}</span>}
          {filtered && (
            <button className="link-btn" onClick={() => { setCat(""); setStudio(""); setQ(""); }}>Clear filters</button>
          )}
        </div>
        {games && games.length === 0 && <p className="muted empty">No games found. Try a different search or filters.</p>}
        <div className="grid">
          {games
            ? games.map((g) => <GameTile key={g.id} game={g} studio={studios[g.studio]} />)
            : Array.from({ length: 12 }, (_, i) => <TileSkeleton key={i} />)}
        </div>
      </section>
    </>
  );
}
