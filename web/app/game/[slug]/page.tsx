"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, Game } from "@/lib/api";
import { balanceChanged, useMe } from "@/lib/useMe";
import Dice from "@/components/Dice";

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
    return <div className="panel"><h2>Войдите, чтобы играть</h2><Link className="btn" href="/login">Войти</Link></div>;
  }
  return (
    <>
      <h1>{launch?.game.title ?? "Загрузка…"}</h1>
      {error && <p className="error">{error}</p>}
      {launch?.type === "iframe" && <iframe className="frame" src={launch.url} title={launch.game.title} />}
      {launch?.type === "originals" && <Dice />}
    </>
  );
}
