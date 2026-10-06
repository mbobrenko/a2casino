"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Game } from "@/lib/api";
import GameTile, { TileSkeleton } from "@/components/GameTile";
import Icon from "@/components/Icons";

/** A titled, horizontally scrolling row of tiles with snap, and arrow buttons on devices with a mouse. */
export default function GameRow({ title, icon, games, studios, size, sub, loading }: {
  title: string; icon: string; games?: Game[]; studios: Record<string, string>; size?: "lg"; sub?: ReactNode; loading?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update, games?.length]);

  if (!loading && (!games || games.length === 0)) return null;
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <section className={"section row-section" + (size ? " " + size : "")}>
      <div className="section-head">
        <h2><span className="h-icon"><Icon name={icon} size={18} /></span>{title}</h2>
        {sub}
        {games && <span className="muted count-pill">{games.length}</span>}
        <div className="row-arrows">
          <button className="row-arrow" aria-label={`Scroll ${title} left`} disabled={edge.start} onClick={() => scroll(-1)}><Icon name="left" /></button>
          <button className="row-arrow" aria-label={`Scroll ${title} right`} disabled={edge.end} onClick={() => scroll(1)}><Icon name="right" /></button>
        </div>
      </div>
      <div className="hrow" ref={ref} onScroll={update}>
        {loading && !games
          ? Array.from({ length: 8 }, (_, i) => <TileSkeleton key={i} size={size} />)
          : games!.map((g) => <GameTile key={g.id} game={g} studio={studios[g.studio]} size={size} />)}
      </div>
    </section>
  );
}
