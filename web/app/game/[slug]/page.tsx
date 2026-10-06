"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, Game } from "@/lib/api";
import { balanceChanged, useMe } from "@/lib/useMe";
import Dice from "@/components/Dice";
import Crash from "@/components/originals/Crash";
import Mines from "@/components/originals/Mines";
import Plinko from "@/components/originals/Plinko";
import BetRulesNotice from "@/components/BetRulesNotice";
import OriginalsInfo from "@/components/originals/OriginalsInfo";
import GameHeader from "@/components/GameHeader";

type Launch = { type: "iframe" | "originals"; url?: string; game: Game };

export default function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const { me, ready } = useMe();
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [error, setError] = useState("");
  // Logged out: show the game's header from the public catalogue above the log-in prompt.
  const [preview, setPreview] = useState<Game | null>(null);

  useEffect(() => {
    if (!me) return;
    api<Launch>(`/api/games/${slug}/launch`, {}).then(setLaunch).catch((e) => setError(e.message));
  }, [slug, me?.id]);

  // The provider's game posts a message after each spin; refresh the balance in the header.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "balance") balanceChanged(); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (!ready || me) return;
    api<{ games: Game[] }>("/api/games").then((d) => setPreview(d.games.find((g) => g.slug === slug) ?? null)).catch(() => {});
  }, [ready, me, slug]);

  if (ready && !me) {
    return (
      <>
        {preview && <GameHeader game={preview} />}
        <div className="panel"><h2>Log in to play</h2><Link className="btn" href="/login">Log in</Link></div>
      </>
    );
  }
  return (
    <>
      {launch ? <GameHeader game={launch.game} /> : <div className="game-head skeleton shimmer" />}
      {error && <p className="error">{error}</p>}
      {launch && <BetRulesNotice game={launch.game} />}
      {launch?.type === "iframe" && <iframe className="frame" src={launch.url} title={launch.game.title} />}
      {launch?.type === "originals" && <OriginalsInfo game={launch.game} />}
      {launch?.type === "originals" && <Original game={launch.game} />}
    </>
  );
}

function Original({ game }: { game: Game }) {
  const rtp = game.rtp ?? 99;
  const maxWin = game.max_win ?? 0;
  if (game.slug === "crash") return <Crash rtp={rtp} maxWin={maxWin} />;
  if (game.slug === "mines") return <Mines rtp={rtp} maxWin={maxWin} />;
  if (game.slug === "plinko") return <Plinko rtp={rtp} maxWin={maxWin} />;
  return <Dice rtp={rtp} maxWin={maxWin} />;
}
