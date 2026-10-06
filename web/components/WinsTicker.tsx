"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import GameThumb from "@/components/GameThumb";
import Icon from "@/components/Icons";

type Round = { id: number; game: string; slug: string; emoji: string; color: string; bet: number; win: number; status: string; created_at: string };

/**
 * The logged-in player's own latest wins, from their bet history (/api/rounds). There is no public
 * feed of other players' wins, so nothing here is invented: no wins, no ticker.
 */
export default function WinsTicker({ playerId }: { playerId: string }) {
  const [wins, setWins] = useState<Round[]>([]);
  useEffect(() => {
    api<{ items: Round[] }>("/api/rounds?limit=60")
      .then((d) => setWins(d.items.filter((r) => r.win > r.bet && r.status === "settled").slice(0, 16)))
      .catch(() => setWins([]));
  }, [playerId]);
  if (wins.length === 0) return null;

  const moving = wins.length >= 5;
  const item = (r: Round, k: string) => (
    <Link key={k} href={`/game/${r.slug}`} className="win-item" tabIndex={k.startsWith("b") ? -1 : undefined}>
      <GameThumb slug={r.slug} emoji={r.emoji} color={r.color} size={27} />
      <span className="win-game">{r.game}</span>
      <span className="win-amt">+{money(r.win)}</span>
      {r.bet > 0 && <span className="win-x">{(r.win / r.bet).toFixed(2)}×</span>}
    </Link>
  );
  return (
    <section className="wins" aria-label="Your recent wins">
      <div className="wins-label"><span className="live-dot" /><Icon name="trophy" size={16} />Your recent wins</div>
      <div className={"wins-track" + (moving ? " moving" : "")}>
        <div className="wins-strip">
          <div className="wins-group">{wins.map((r) => item(r, "a" + r.id))}</div>
          {moving && <div className="wins-group" aria-hidden="true">{wins.map((r) => item(r, "b" + r.id))}</div>}
        </div>
      </div>
    </section>
  );
}
