"use client";
import { useEffect, useState } from "react";
import { api, Game } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import BannerCarousel, { Banner } from "@/components/BannerCarousel";
import GameTile from "@/components/GameTile";

type Facet = { code: string; title: string; games: number };
type Lobby = {
  banners: Banner[]; categories: Facet[]; providers: Facet[];
  popular: Game[]; new: Game[]; recommended: Game[]; recent: Game[];
};

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

  const row = (title: string, list: Game[] | undefined, icon: string) =>
    list && list.length > 0 && (
      <section className="section">
        <div className="section-head"><h2>{icon} {title}</h2><span className="muted">{list.length}</span></div>
        <div className="hrow">
          {list.map((g) => <GameTile key={g.id} game={g} studio={studios[g.studio]} />)}
        </div>
      </section>
    );

  return (
    <>
      {lobby ? <BannerCarousel banners={lobby.banners} /> : <div className="carousel skeleton" />}

      <div className="lobby-bar">
        <div className="tabs scroll">
          <button className={"tab" + (cat === "" ? " active" : "")} onClick={() => setCat("")}>
            All <span className="count">{total}</span>
          </button>
          {lobby?.categories.filter((c) => c.games > 0).map((c) => (
            <button key={c.code} className={"tab" + (cat === c.code ? " active" : "")} onClick={() => setCat(c.code)}>
              {c.title} <span className="count">{c.games}</span>
            </button>
          ))}
        </div>
        <input className="search" type="search" placeholder="🔍 Search games" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {lobby && lobby.providers.length > 0 && (
        <div className="chips">
          {lobby.providers.map((p) => (
            <button key={p.code} className={"chip" + (studio === p.code ? " active" : "")}
              onClick={() => setStudio(studio === p.code ? "" : p.code)}>
              {p.title} <span className="count">{p.games}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {!filtered && lobby && (
        <>
          {me && row("Recently played", lobby.recent, "🕘")}
          {row("Recommended for you", lobby.recommended, "✨")}
          {row("A2 Originals · provably fair", games?.filter((g) => g.provider === "originals"), "⚡")}
          {row("Popular", lobby.popular, "🔥")}
          {row("New releases", lobby.new, "🆕")}
        </>
      )}

      <section className="section">
        <div className="section-head">
          <h2>{filtered ? "Results" : "All games"}</h2>
          {games && <span className="muted">{games.length}</span>}
          {filtered && (
            <button className="link-btn" onClick={() => { setCat(""); setStudio(""); setQ(""); }}>Clear filters</button>
          )}
        </div>
        {games && games.length === 0 && <p className="muted">No games found. Try a different search or filters.</p>}
        <div className="grid">
          {games?.map((g) => <GameTile key={g.id} game={g} studio={studios[g.studio]} />)}
        </div>
      </section>
    </>
  );
}
