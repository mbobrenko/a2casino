"use client";
// RTP and max win of an A2 Original, as configured now (from the game catalogue). Every result also
// carries the RTP and the cap it was played with.
import Link from "next/link";
import { Game, money } from "@/lib/api";

export default function OriginalsInfo({ game }: { game: Game }) {
  const rtp = game.rtp ?? 99;
  return (
    <p className="rule-note" role="note">
      <b>RTP {rtp}%</b> (house edge {(100 - rtp).toFixed(0)}%), the same for every player and fixed for this game
      {game.max_win ? <> · <b>Maximum win {money(game.max_win)} per bet</b>: a win above it is paid at {money(game.max_win)}, and a stake above it is not accepted</> : null}.{" "}
      <Link href="/legal/game-rules#section-3">Game rules</Link>
    </p>
  );
}
