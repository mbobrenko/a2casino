"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export type Banner = { id: number; title: string; subtitle: string; cta_text: string; cta_link: string; color: string; emoji: string };

export default function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = banners.length;

  useEffect(() => {
    if (n < 2 || paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 5000);
    return () => clearInterval(t);
  }, [n, paused]);

  if (n === 0) return null;
  const go = (d: number) => setI((x) => (x + d + n) % n);

  return (
    <section className="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="slides" style={{ transform: `translateX(-${(i % n) * 100}%)` }}>
        {banners.map((b) => (
          <div key={b.id} className="slide" style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${b.color} 40%, #0f0d1a), ${b.color})` }}>
            <div className="slide-text">
              <h2>{b.title}</h2>
              <p>{b.subtitle}</p>
              {b.cta_text && <Link href={b.cta_link || "/"} className="btn gold">{b.cta_text}</Link>}
            </div>
            <div className="slide-emoji">{b.emoji}</div>
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          <button className="car-arrow prev" aria-label="Назад" onClick={() => go(-1)}>‹</button>
          <button className="car-arrow next" aria-label="Вперёд" onClick={() => go(1)}>›</button>
          <div className="dots">
            {banners.map((b, k) => (
              <button key={b.id} aria-label={`Баннер ${k + 1}`} className={"dot" + (k === i ? " active" : "")} onClick={() => setI(k)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
