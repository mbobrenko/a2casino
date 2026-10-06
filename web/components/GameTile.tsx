"use client";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Game } from "@/lib/api";
import { tagText } from "@/lib/labels";
import { artSrc, titleVars } from "@/lib/gameArt";
import Icon from "@/components/Icons";

const tagIcon: Record<string, string> = { popular: "fire", "provably-fair": "shield", jackpot: "trophy" };

/**
 * A lobby tile: the game's cover art with its title on top. On devices with a mouse, hover/focus lifts
 * the tile, glows in the game's colour and shows a Play button; on touch, a tap opens the game.
 */
export default function GameTile({ game, studio, size }: { game: Game; studio?: string; size?: "lg" }) {
  const color = game.color || "#7c5cff";
  const [broken, setBroken] = useState(false);
  const src = broken ? null : artSrc(game.slug);
  const badges = (game.tags ?? []).filter((t) => tagText[t]);
  const studioName = studio ?? game.studio;
  const style = { "--c": color, ...titleVars(game.slug, color) } as CSSProperties;
  return (
    <Link href={`/game/${game.slug}`} className={"game" + (size ? " " + size : "") + (game.provider === "originals" ? " original" : "")}
      style={style} aria-label={`${game.title} by ${studioName}`}>
      <div className="art">
        {src ? (
          <img src={src} alt="" width={300} height={400} loading="lazy" decoding="async" onError={() => setBroken(true)} />
        ) : (
          <div className="art-fallback"><span className="emoji">{game.emoji || "🎮"}</span></div>
        )}
        <div className="art-text">
          <div className="art-title">{game.title}</div>
          <div className="art-studio">{studioName}</div>
        </div>
        <div className="badges">
          {game.is_new && <span className="gbadge new">New</span>}
          {badges.map((t) => (
            <span key={t} className={"gbadge " + t}>{tagIcon[t] && <Icon name={tagIcon[t]} size={10} />}<span className="gbadge-text">{tagText[t]}</span></span>
          ))}
        </div>
        <div className="play-layer" aria-hidden="true">
          <span className="play-btn"><Icon name="play" size={22} /></span>
          {game.rtp != null && <span className="rtp-chip">RTP {game.rtp}%</span>}
        </div>
        <span className="shine" aria-hidden="true" />
      </div>
    </Link>
  );
}

/** Placeholder tile while the lobby loads. */
export function TileSkeleton({ size }: { size?: "lg" }) {
  return <div className={"game skel" + (size ? " " + size : "")} aria-hidden="true"><div className="art" /></div>;
}
