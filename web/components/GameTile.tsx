import Link from "next/link";
import { Game } from "@/lib/api";
import { tagText } from "@/lib/labels";

// Tiles have no artwork: the game's colour becomes a gradient and its emoji the "cover".
export default function GameTile({ game, studio }: { game: Game; studio?: string }) {
  const color = game.color || "#7c5cff";
  const badges = (game.tags ?? []).filter((t) => tagText[t]);
  return (
    <Link href={`/game/${game.slug}`} className="game" title={game.title}>
      <div className="badges">
        {game.is_new && <span className="gbadge new">Новинка</span>}
        {badges.map((t) => <span key={t} className={"gbadge " + t}>{tagText[t]}</span>)}
      </div>
      <div className="art" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 35%, #0f0d1a))` }}>
        <span className="emoji">{game.emoji || "🎮"}</span>
      </div>
      <div className="info">
        <div className="title">{game.title}</div>
        <div className="meta">{studio ?? game.studio}{game.rtp ? ` · RTP ${game.rtp}%` : ""}</div>
      </div>
    </Link>
  );
}
