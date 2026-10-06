"use client";
import { useState, type CSSProperties } from "react";
import { artSrc } from "@/lib/gameArt";

/** Small cover thumbnail (bet history, wins ticker, game header). Falls back to the colour + emoji. */
export default function GameThumb({ slug, emoji, color, size = 36, eager }: { slug?: string; emoji?: string; color?: string; size?: number; eager?: boolean }) {
  const [broken, setBroken] = useState(false);
  const src = slug && !broken ? artSrc(slug) : null;
  const w = size, h = Math.round((size * 4) / 3);
  if (src) {
    return <img className="thumb" src={src} alt="" width={w} height={h} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setBroken(true)} />;
  }
  return (
    <span className="thumb thumb-fallback" style={{ width: w, height: h, "--c": color || "#7c5cff", fontSize: size * 0.55 } as CSSProperties}>
      {emoji || "🎮"}
    </span>
  );
}
