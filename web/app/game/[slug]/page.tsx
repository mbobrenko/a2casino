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

type Launch = { type: "iframe" | "originals"; url?: string; game: Game };

export default function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const { me, ready } = useMe();
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [error, setError] = useState("");

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

  if (ready && !me) {
    return <div className="panel"><h2>Log in to play</h2><Link className="btn" href="/login">Log in</Link></div>;
  }
  return (
    <>
      <h1>{launch?.game.title ?? "Loading…"}</h1>
      {error && <p className="error">{error}</p>}
      {launch && <BetRulesNotice game={launch.game} />}
      {launch?.type === "iframe" && <iframe className="frame" src={launch.url} title={launch.game.title} />}
      {launch?.type === "originals" && <Original slug={launch.game.slug} />}
    </>
  );
}

function Original({ slug }: { slug: string }) {
  if (slug === "crash") return <Crash />;
  if (slug === "mines") return <Mines />;
  if (slug === "plinko") return <Plinko />;
  return <Dice />;
}
