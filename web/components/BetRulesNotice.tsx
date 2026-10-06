"use client";
// Bonus rules shown above a game: the max bet while a bonus is active and how much of each bet
// counts towards wagering in this game.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Game, money } from "@/lib/api";
import type { PlayerBonus } from "@/lib/labels";

export default function BetRulesNotice({ game }: { game: Game }) {
  const [bonus, setBonus] = useState<PlayerBonus | null>(null);
  useEffect(() => {
    api<{ bonuses: PlayerBonus[] }>("/api/bonuses")
      .then((r) => setBonus(r.bonuses.find((b) => b.status === "active") ?? null))
      .catch(() => {});
  }, [game.slug]);

  const pct = game.wagering_contribution ?? 100;
  if (!bonus && pct === 100) return null;
  return (
    <p className="rule-note" role="note">
      {bonus && bonus.max_bet > 0 && (
        <><b>Bonus active: max bet {money(bonus.max_bet)}</b> per {game.provider === "originals" ? (game.slug === "dice" ? "roll" : "bet") : "spin or round"}. </>
      )}
      {pct === 100
        ? <>{game.title} counts 100% towards bonus wagering.</>
        : <>{game.title} counts <b>{pct}%</b> towards bonus wagering{bonus ? "" : " if you play with a bonus"}
          {pct > 0 && <> (a {money(1000)} bet adds {money(10 * pct)})</>}.</>}{" "}
      <Link href="/legal/bonus-terms#section-6">Bonus Terms</Link>
    </p>
  );
}
