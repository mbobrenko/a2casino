"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Game } from "@/lib/api";

const categoryNames: Record<string, string> = {
  "": "Все", slots: "Слоты", crash: "Краш", table: "Настольные", instant: "Инстант", dice: "Кости",
};
const art: Record<string, { icon: string; bg: string }> = {
  slots: { icon: "🎰", bg: "linear-gradient(135deg,#5b21b6,#db2777)" },
  crash: { icon: "🚀", bg: "linear-gradient(135deg,#0f766e,#22d3ee)" },
  table: { icon: "🎡", bg: "linear-gradient(135deg,#166534,#4ade80)" },
  instant: { icon: "🎟️", bg: "linear-gradient(135deg,#b45309,#facc15)" },
  dice: { icon: "🎲", bg: "linear-gradient(135deg,#1e3a8a,#7c5cff)" },
};

export default function Lobby() {
  const [games, setGames] = useState<Game[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cat, setCat] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ games: Game[]; categories: string[] }>("/api/games")
      .then((d) => { setGames(d.games); setCategories(d.categories); })
      .catch((e) => setError(e.message));
  }, []);

  const shown = games.filter((g) => !cat || g.category === cat);
  const present = new Set(games.map((g) => g.category));

  return (
    <>
      <section className="hero">
        <h1>Добро пожаловать в A2Casino</h1>
        <div>Слоты, настольные игры и кости с доказуемо честным результатом. Депозит картой или в USDT.</div>
      </section>
      <div className="tabs">
        {["", ...categories].filter((c) => !c || present.has(c)).map((c) => (
          <button key={c} className={"tab" + (cat === c ? " active" : "")} onClick={() => setCat(c)}>
            {categoryNames[c] ?? c}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {shown.map((g) => (
          <Link key={g.id} href={`/game/${g.slug}`} className="game">
            {g.is_new && <span className="badge">NEW</span>}
            <div className="art" style={{ background: art[g.category]?.bg }}>{art[g.category]?.icon ?? "🎮"}</div>
            <div className="info">
              <div className="title">{g.title}</div>
              <div className="meta">{categoryNames[g.category]} · {g.provider === "originals" ? "A2 Originals" : "Mock Provider"}{g.rtp ? ` · RTP ${g.rtp}%` : ""}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
