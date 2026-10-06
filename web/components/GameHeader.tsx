"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { api, Game } from "@/lib/api";
import { artSrc } from "@/lib/gameArt";
import { tagText } from "@/lib/labels";
import GameThumb from "@/components/GameThumb";
import Icon from "@/components/Icons";

// Studio titles come from the lobby; cached for the session (they change rarely).
let studiosCache: Promise<Record<string, string>> | null = null;
const loadStudios = () =>
  (studiosCache ??= api<{ providers: { code: string; title: string }[] }>("/api/lobby")
    .then((d) => Object.fromEntries(d.providers.map((p) => [p.code, p.title])))
    .catch(() => { studiosCache = null; return {}; }));

/** Header of a game page: the cover, title, studio and key facts over a blurred copy of the art. */
export default function GameHeader({ game }: { game: Game }) {
  const [studios, setStudios] = useState<Record<string, string>>({});
  useEffect(() => { loadStudios().then(setStudios); }, []);
  const src = artSrc(game.slug);
  const tags = (game.tags ?? []).filter((t) => tagText[t]);
  return (
    <header className="game-head" style={{ "--c": game.color || "#7c5cff" } as CSSProperties}>
      {src && <img className="game-head-bg" src={src} alt="" width={300} height={400} aria-hidden="true" />}
      <GameThumb slug={game.slug} emoji={game.emoji} color={game.color} size={84} eager />
      <div className="game-head-text">
        <div className="game-head-studio">{studios[game.studio] ?? game.studio}</div>
        <h1>{game.title}</h1>
        <div className="game-head-chips">
          {game.rtp != null && <span className="hchip">RTP {game.rtp}%</span>}
          {game.is_new && <span className="gbadge new">New</span>}
          {tags.map((t) => <span key={t} className={"gbadge " + t}>{t === "provably-fair" && <Icon name="shield" size={10} />}{tagText[t]}</span>)}
        </div>
        {game.description && <p className="game-head-desc">{game.description}</p>}
      </div>
    </header>
  );
}
